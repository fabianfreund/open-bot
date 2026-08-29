import { create } from 'zustand';
import { EventStream, OpenBotClient } from '@openbot/client';
import type {
  AgentView,
  Card,
  Message,
  ProjectInfo,
  ServerEvent,
  SkillInfo,
  UpdateAgentRequest,
  UpdateProjectRequest,
} from '@openbot/shared';
import type { Bootstrap, Connection } from '../../shared-ipc.js';
import { notifyIfNewMessage } from '../notify.js';

type LinkStatus = 'connecting' | 'open' | 'closed';

/** What fills the pane next to the bot list. */
export type View = 'chat' | 'settings';

interface State {
  bootstrap?: Bootstrap;
  connection?: Connection;
  client?: OpenBotClient;
  stream?: EventStream;
  link: LinkStatus;
  /** True once we are listening for host changes; set up exactly once. */
  following?: boolean;
  /**
   * Identifies the team we are attached to, or attaching to. Both the main
   * process broadcast and the onboarding screen ask to attach after a team
   * opens; without this they each open a socket and every event arrives twice.
   */
  attachKey?: string;
  agents: AgentView[];
  /** The team as it is on disk: name, goal, folder, settings. */
  project?: ProjectInfo;
  /** Every tool the team has, however it got registered. */
  skills: SkillInfo[];
  view: View;
  activeAgentId?: string;
  conversationId?: string;
  messages: Message[];
  error?: string;

  init(): Promise<void>;
  setView(view: View): void;
  attach(connection: Connection): Promise<void>;
  reset(): Promise<void>;
  leave(): Promise<void>;
  selectAgent(agentId: string): Promise<void>;
  /** Clears the unread badge for whichever chat is open. */
  markRead(): Promise<void>;
  /** Clears the unread badge for one bot without opening their chat. */
  markAgentRead(agentId: string): Promise<void>;
  sendMessage(text: string, files?: File[]): Promise<void>;
  stop(): Promise<void>;
  answerCard(message: Message, card: Card, answer: string): Promise<void>;
  hireBot(input: { name: string; role: string; instructions: string }): Promise<void>;
  changeBot(agentId: string, patch: UpdateAgentRequest): Promise<void>;
  /** Takes a bot off the team. Its folder and its chats stay. */
  retireBot(agentId: string): Promise<void>;
  saveProject(patch: UpdateProjectRequest): Promise<void>;
  setError(message?: string): void;
  handleFailure(err: unknown): void;
}

export const useStore = create<State>((set, get) => ({
  link: 'closed',
  agents: [],
  skills: [],
  view: 'chat',
  messages: [],

  async init() {
    const bootstrap = await window.openbot.bootstrap();
    set({ bootstrap });

    // The main process owns which team is hosted. Follow it rather than
    // holding a connection that has since moved or stopped.
    if (!get().following) {
      set({ following: true });
      window.openbot.onConnection((connection) => {
        if (connection) void get().attach(connection);
        else void get().reset();
      });
    }

    if (bootstrap.connection) await get().attach(bootstrap.connection);
  },

  setView(view) {
    set({ view });
  },

  /** Drops the current connection and returns to the first screen. */
  async reset() {
    get().stream?.close();
    const bootstrap = await window.openbot.bootstrap();
    set({
      bootstrap,
      connection: undefined,
      client: undefined,
      stream: undefined,
      agents: [],
      project: undefined,
      skills: [],
      view: 'chat',
      messages: [],
      activeAgentId: undefined,
      conversationId: undefined,
      link: 'closed',
      attachKey: undefined,
    });
  },

  async attach(connection) {
    const key = `${connection.baseUrl}|${connection.token}`;
    // Already on this team, or already on the way there.
    if (get().attachKey === key) return;

    set({ attachKey: key });
    get().stream?.close();
    const client = new OpenBotClient({ baseUrl: connection.baseUrl, token: connection.token });
    const [agents, project, skills] = await Promise.all([
      client.agents(),
      client.project(),
      client.skills(),
    ]);

    // Something else took over while we were fetching; drop this attempt.
    if (get().attachKey !== key) return;

    const stream = client.stream({
      onEvent: (event) => applyEvent(event, set, get),
      onStatus: (link) => set({ link }),
      onUnauthorized: () => void get().init(),
    });

    set({ connection, client, stream, agents, project, skills, error: undefined });
    const first = agents[0];
    if (first) await get().selectAgent(first.definition.id);
  },

  async leave() {
    get().stream?.close();
    await window.openbot.disconnect();
    set({
      connection: undefined,
      client: undefined,
      stream: undefined,
      agents: [],
      project: undefined,
      skills: [],
      view: 'chat',
      messages: [],
      activeAgentId: undefined,
      conversationId: undefined,
      link: 'closed',
      attachKey: undefined,
    });
    await get().init();
  },

  async selectAgent(agentId) {
    const client = get().client;
    if (!client) return;
    // Opening a chat is how you leave settings.
    set({ activeAgentId: agentId, messages: [], view: 'chat' });
    const conversation = await client.conversationFor(agentId);
    const messages = await client.messages(conversation.id);
    // Guard against a slower fetch landing after the user moved on.
    if (get().activeAgentId !== agentId) return;
    set({ conversationId: conversation.id, messages });
    await get().markRead();
  },

  async markRead() {
    const { client, conversationId, agents, activeAgentId } = get();
    const active = agents.find((a) => a.definition.id === activeAgentId);
    if (!client || !conversationId || !active?.unread) return;
    try {
      await client.markRead(conversationId);
    } catch {
      // Nothing to recover: the badge clears on the next look.
    }
  },

  async markAgentRead(agentId) {
    const { client, agents } = get();
    const agent = agents.find((a) => a.definition.id === agentId);
    if (!client || !agent?.unread) return;
    try {
      const conversation = await client.conversationFor(agentId);
      await client.markRead(conversation.id);
    } catch {
      // The badge clears on the next look.
    }
  },

  async sendMessage(text, files = []) {
    const { client, conversationId } = get();
    if (!client || !conversationId) return;
    if (!text.trim() && files.length === 0) return;
    try {
      const attachments = [];
      for (const file of files) {
        attachments.push(await client.upload(file, file.name || 'file'));
      }
      await client.send(conversationId, text.trim(), attachments);
    } catch (err) {
      get().handleFailure(err);
      throw err;
    }
  },

  async stop() {
    const { client, conversationId } = get();
    if (client && conversationId) await client.abort(conversationId);
  },

  async answerCard(message, card, answer) {
    const { client, conversationId } = get();
    if (!client || !conversationId) return;
    try {
      await client.answerCard(conversationId, message.id, card.id, answer);
    } catch (err) {
      get().handleFailure(err);
    }
  },

  async hireBot(input) {
    const client = get().client;
    if (!client) return;
    const { agent } = await client.createAgent(input);
    await get().selectAgent(agent.id);
  },

  async changeBot(agentId, patch) {
    const client = get().client;
    if (!client) return;
    try {
      // The list catches up from the `agent.updated` event the save emits.
      await client.updateAgent(agentId, patch);
    } catch (err) {
      get().handleFailure(err);
    }
  },

  async retireBot(agentId) {
    const client = get().client;
    if (!client) return;
    try {
      await client.updateAgent(agentId, { archived: true });
    } catch (err) {
      get().handleFailure(err);
      return;
    }
    // Whoever is left takes over the chat pane, so nothing points at a bot
    // that is no longer on the team.
    if (get().activeAgentId === agentId) {
      const next = get().agents.find((a) => a.definition.id !== agentId);
      if (next) {
        const view = get().view;
        await get().selectAgent(next.definition.id);
        set({ view });
      } else {
        set({ activeAgentId: undefined, conversationId: undefined, messages: [] });
      }
    }
  },

  async saveProject(patch) {
    const client = get().client;
    if (!client) return;
    try {
      const project = await client.updateProject(patch);
      set({ project });
    } catch (err) {
      get().handleFailure(err);
    }
  },

  setError(message) {
    set({ error: message });
  },

  handleFailure(err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      // The host is serving a different team now. Catch up instead of
      // showing an error about a request nobody made.
      void get().init();
      return;
    }
    set({ error: (err as Error).message });
  },
}));

type Setter = (partial: Partial<State> | ((state: State) => Partial<State>)) => void;
type Getter = () => State;

/** Applies one server event to the store. */
function applyEvent(event: ServerEvent, set: Setter, get: Getter): void {
  switch (event.type) {
    case 'hello':
      set({ agents: event.agents, project: event.project });
      break;
    case 'project.updated':
      set({ project: event.project });
      break;
    case 'agent.created':
      set((state) => ({ agents: [...state.agents, event.agent] }));
      break;
    case 'agent.updated':
      set((state) => ({
        agents: state.agents.map((a) =>
          a.definition.id === event.agent.definition.id ? event.agent : a,
        ),
      }));
      break;
    case 'agent.removed':
      set((state) => ({ agents: state.agents.filter((a) => a.definition.id !== event.agentId) }));
      break;
    case 'agent.status':
      set((state) => ({
        agents: state.agents.map((a) =>
          a.definition.id === event.agentId
            ? { ...a, status: event.status, statusDetail: event.detail }
            : a,
        ),
      }));
      break;
    case 'conversation.updated': {
      // Channels are colleague-to-colleague. Their preview and unread must
      // not overwrite the person's chat with that bot.
      if (event.conversation.kind === 'dm') {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.definition.id === event.conversation.agentId
              ? {
                  ...a,
                  unread: event.conversation.unread,
                  lastMessageAt: event.conversation.lastMessageAt,
                  lastMessagePreview: event.conversation.lastMessagePreview,
                }
              : a,
          ),
        }));
      }
      // Reading it while looking at it is the same as having read it.
      if (event.conversation.id === get().conversationId && document.hasFocus()) {
        void get().markRead();
      }
      break;
    }
    case 'message.created': {
      notifyIfNewMessage(event.message);
      if (event.message.conversationId !== get().conversationId) break;
      set((state) =>
        state.messages.some((m) => m.id === event.message.id)
          ? state
          : { messages: [...state.messages, event.message] },
      );
      break;
    }
    case 'message.updated': {
      notifyIfNewMessage(event.message);
      if (event.message.conversationId !== get().conversationId) break;
      set((state) => ({
        messages: state.messages.map((m) => (m.id === event.message.id ? event.message : m)),
      }));
      break;
    }
    case 'notice':
      if (event.level === 'error') set({ error: event.text });
      break;
    case 'skills.updated':
      set({ skills: event.skills });
      break;
    default:
      break;
  }
}

import { create } from 'zustand';
import { EventStream, OpenBotClient } from '@openbot/client';
import type { AgentView, Card, Message, ServerEvent } from '@openbot/shared';
import type { Bootstrap, Connection } from '../../shared-ipc.js';

type LinkStatus = 'connecting' | 'open' | 'closed';

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
  activeAgentId?: string;
  conversationId?: string;
  messages: Message[];
  error?: string;

  init(): Promise<void>;
  attach(connection: Connection): Promise<void>;
  reset(): Promise<void>;
  leave(): Promise<void>;
  selectAgent(agentId: string): Promise<void>;
  sendMessage(text: string): Promise<void>;
  stop(): Promise<void>;
  answerCard(message: Message, card: Card, answer: string): Promise<void>;
  hireBot(input: { name: string; role: string; instructions: string }): Promise<void>;
  setError(message?: string): void;
  handleFailure(err: unknown): void;
}

export const useStore = create<State>((set, get) => ({
  link: 'closed',
  agents: [],
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
    const agents = await client.agents();

    // Something else took over while we were fetching; drop this attempt.
    if (get().attachKey !== key) return;

    const stream = client.stream({
      onEvent: (event) => applyEvent(event, set, get),
      onStatus: (link) => set({ link }),
      onUnauthorized: () => void get().init(),
    });

    set({ connection, client, stream, agents, error: undefined });
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
    set({ activeAgentId: agentId, messages: [] });
    const conversation = await client.conversationFor(agentId);
    const messages = await client.messages(conversation.id);
    // Guard against a slower fetch landing after the user moved on.
    if (get().activeAgentId !== agentId) return;
    set({ conversationId: conversation.id, messages });
  },

  async sendMessage(text) {
    const { client, conversationId } = get();
    if (!client || !conversationId || !text.trim()) return;
    try {
      await client.send(conversationId, text.trim());
    } catch (err) {
      get().handleFailure(err);
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
      set({ agents: event.agents });
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
    case 'conversation.updated':
      set((state) => ({
        agents: state.agents.map((a) =>
          a.definition.id === event.conversation.agentId
            ? {
                ...a,
                lastMessageAt: event.conversation.lastMessageAt,
                lastMessagePreview: event.conversation.lastMessagePreview,
              }
            : a,
        ),
      }));
      break;
    case 'message.created': {
      if (event.message.conversationId !== get().conversationId) break;
      set((state) =>
        state.messages.some((m) => m.id === event.message.id)
          ? state
          : { messages: [...state.messages, event.message] },
      );
      break;
    }
    case 'message.updated': {
      if (event.message.conversationId !== get().conversationId) break;
      set((state) => ({
        messages: state.messages.map((m) => (m.id === event.message.id ? event.message : m)),
      }));
      break;
    }
    case 'notice':
      if (event.level === 'error') set({ error: event.text });
      break;
    default:
      break;
  }
}

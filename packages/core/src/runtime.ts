import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  USER_ID,
  dmConversationId,
  type AnswerCardRequest,
  type Card,
  type AgentDefinition,
  type AgentStatus,
  type AgentView,
  type Conversation,
  type CreateAgentRequest,
  type Message,
  type ProjectInfo,
  type SendMessageRequest,
  type SkillInfo,
  type SkillResult,
  type UpdateAgentRequest,
} from '@openbot/shared';
import { EventBus } from './bus.js';
import { createLogger, type Logger } from './logger.js';
import { ProjectStore } from './project/project-store.js';
import { AgentStore } from './agents/agent-store.js';
import { ONBOARDING_AGENT, onboardingGreeting } from './agents/onboarding.js';
import { ConversationStore } from './conversations/conversation-store.js';
import { ProviderRegistry } from './providers/registry.js';
import { CodexProvider } from './providers/codex/codex-provider.js';
import { EchoProvider } from './providers/echo/echo-provider.js';
import { SkillRegistry } from './skills/registry.js';
import { builtinSkills } from './skills/builtin/index.js';
import type { HistoryHit, SkillHost } from './skills/skill.js';
import { TurnRunner } from './turn-runner.js';

/** A bot asking a bot asking a bot… stops here. */
const MAX_DELEGATION_DEPTH = 3;

/** How often quiet chats are checked for having gone cold. */
const SWEEP_MS = 60_000;

export interface RuntimeOptions {
  root: string;
  logger?: Logger;
  /** Absolute path to the stdio MCP bridge. Defaults to the workspace build. */
  bridgePath?: string;
}

interface ActiveTurn {
  controller: AbortController;
  depth: number;
}

/**
 * The whole backend in one object: project state, agents, conversations,
 * providers, skills, and the turn loop. The server is a thin HTTP shell over
 * this, and the Electron app can host it in-process.
 */
export class OpenBotRuntime implements SkillHost {
  readonly bus = new EventBus();
  readonly providers = new ProviderRegistry();
  readonly skills = new SkillRegistry();
  readonly log: Logger;

  #turns = new Map<string, ActiveTurn>();
  #queues = new Map<string, Promise<unknown>>();
  #status = new Map<string, { status: AgentStatus; detail?: string }>();
  #runner: TurnRunner;
  #serverUrl = '';
  #token = '';
  #bridgePath: string;
  #sweeper?: ReturnType<typeof setInterval>;

  private constructor(
    readonly project: ProjectStore,
    readonly agents: AgentStore,
    readonly conversations: ConversationStore,
    options: RuntimeOptions,
  ) {
    this.log = options.logger ?? createLogger('runtime');
    this.#bridgePath = options.bridgePath ?? defaultBridgePath();
    this.#runner = new TurnRunner({
      conversations: this.conversations,
      bus: this.bus,
      onStatus: (agentId, status, detail) => this.#setStatus(agentId, status, detail),
    });
  }

  static async open(options: RuntimeOptions): Promise<OpenBotRuntime> {
    const project = await ProjectStore.load(options.root);
    const agents = new AgentStore(project);
    const conversations = new ConversationStore(project);
    await agents.load();
    await conversations.load();

    const runtime = new OpenBotRuntime(project, agents, conversations, options);
    runtime.providers.register(new CodexProvider());
    runtime.providers.register(new EchoProvider());
    runtime.skills.registerAll(builtinSkills);
    runtime.#token = await project.token();
    await runtime.#endQuietSessions();
    runtime.#sweeper = setInterval(() => void runtime.#endQuietSessions(), SWEEP_MS);
    runtime.#sweeper.unref?.();
    return runtime;
  }

  /** Stops the background work. The project on disk is already up to date. */
  close(): void {
    if (this.#sweeper) clearInterval(this.#sweeper);
    this.#sweeper = undefined;
  }

  // --- identity -----------------------------------------------------------

  get projectRoot(): string {
    return this.project.paths.root;
  }
  get projectName(): string {
    return this.project.file.name;
  }
  get token(): string {
    return this.#token;
  }
  get info(): ProjectInfo {
    return this.project.info;
  }

  /** The server calls this once it knows its own address. */
  setServerUrl(url: string): void {
    this.#serverUrl = url;
  }

  // --- agents -------------------------------------------------------------

  agentViews(): AgentView[] {
    return this.agents.list().map((definition) => this.#view(definition));
  }

  async createAgent(request: CreateAgentRequest): Promise<AgentDefinition> {
    const definition = await this.agents.create(request);
    await this.conversations.dm(definition.id, definition.name);
    this.bus.emit({ type: 'agent.created', agent: this.#view(definition) });
    this.bus.emit({ type: 'project.updated', project: this.project.info });
    return definition;
  }

  async updateAgent(id: string, patch: UpdateAgentRequest): Promise<AgentDefinition> {
    const before = this.agents.get(id);
    const definition = await this.agents.update(id, patch);
    // A provider thread carries the old brief with it, so a rebriefed bot has
    // to start fresh. Its chats are recapped into the new thread.
    if (
      before &&
      (before.instructions !== definition.instructions || before.name !== definition.name)
    ) {
      await this.#forgetThreads(id);
    }
    if (definition.archived) this.bus.emit({ type: 'agent.removed', agentId: id });
    else this.bus.emit({ type: 'agent.updated', agent: this.#view(definition) });
    return definition;
  }

  listSkills(): SkillInfo[] {
    return this.skills.list();
  }

  /**
   * Looks through every chat an agent has been part of, newest first. History
   * outlives any provider thread, so this is what a bot uses when it needs
   * something older than the recap it was given.
   */
  async searchHistory(options: {
    agentId: string;
    query?: string;
    since?: string;
    until?: string;
    limit: number;
  }): Promise<HistoryHit[]> {
    const needle = options.query?.trim().toLowerCase() ?? '';
    const from = options.since ? Date.parse(options.since) : undefined;
    // An end date means the whole of that day, not midnight at the start of it.
    const to = options.until ? Date.parse(options.until) + DAY_MS : undefined;
    const hits: HistoryHit[] = [];

    for (const conversation of this.conversations.list()) {
      if (!conversation.participants.includes(options.agentId)) continue;
      const where = this.#describeConversation(conversation, options.agentId);
      for (const message of await this.conversations.messages(conversation.id)) {
        if (!message.body.trim()) continue;
        const at = Date.parse(message.createdAt);
        if (from !== undefined && at < from) continue;
        if (to !== undefined && at >= to) continue;
        const index = needle ? message.body.toLowerCase().indexOf(needle) : 0;
        if (index === -1) continue;
        hits.push({
          where,
          author: message.author.name,
          at: message.createdAt,
          excerpt: needle ? excerpt(message.body, index) : summarise(message.body),
        });
      }
    }

    return hits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, options.limit);
  }

  listAgents(options?: { includeRetired?: boolean }): AgentDefinition[] {
    return options?.includeRetired ? this.agents.listAll() : this.agents.list();
  }

  getAgent(idOrName: string): AgentDefinition | undefined {
    return this.agents.get(idOrName) ?? this.agents.findByName(idOrName);
  }

  workspaceFor(agentId: string): string {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`No agent ${agentId}`);
    return this.project.paths.agentWorkspace(agent.slug);
  }

  // --- conversations ------------------------------------------------------

  async conversationFor(agentId: string): Promise<Conversation> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`No agent ${agentId}`);
    return this.conversations.dm(agent.id, agent.name);
  }

  async messages(conversationId: string): Promise<Message[]> {
    return this.conversations.messages(conversationId);
  }

  /** Posts the user's message, then runs the agent's reply. */
  async sendUserMessage(conversationId: string, request: SendMessageRequest): Promise<Message> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error(`No conversation ${conversationId}`);

    const message = await this.conversations.append({
      conversationId,
      author: { kind: 'user', id: USER_ID, name: this.project.file.settings.userName },
      body: request.text,
      parts: [],
      cards: [],
      streaming: false,
    });
    this.bus.emit({ type: 'message.created', message });
    this.bus.emit({ type: 'conversation.updated', conversation });

    void this.#enqueue(conversationId, () =>
      this.#runTurn({
        conversationId,
        agentId: conversation.agentId,
        input: { text: request.text, images: request.images },
        depth: 0,
      }),
    );

    return message;
  }

  /** The person opened this chat, so nothing in it is unread any more. */
  async markRead(conversationId: string): Promise<void> {
    const conversation = await this.conversations.markRead(conversationId);
    if (conversation) this.bus.emit({ type: 'conversation.updated', conversation });
  }

  /** Stops whatever the agent in this conversation is doing. */
  abort(conversationId: string): boolean {
    const active = this.#turns.get(conversationId);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  /**
   * Records an answer to an inline card and continues the conversation as if
   * the person had typed it. The card stays in place showing what was chosen.
   */
  async answerCard(conversationId: string, request: AnswerCardRequest): Promise<void> {
    const messages = await this.conversations.messages(conversationId);
    const target = messages.find((m) => m.id === request.messageId);
    const card = target?.cards.find((c) => c.id === request.cardId);
    if (!target || !card) throw new Error('That question is no longer available');
    if (card.answered) return;

    const updated = {
      ...target,
      cards: target.cards.map((c) =>
        c.id === request.cardId ? { ...c, answered: true, answer: request.answer } : c,
      ),
    };
    await this.conversations.replace(updated, true);
    this.bus.emit({ type: 'message.updated', message: updated });

    await this.sendUserMessage(conversationId, { text: request.answer, images: [] });
  }

  /**
   * Gives a brand-new team its first bot, and has it say hello. The greeting is
   * written here rather than generated, so a new project is useful instantly
   * and does not depend on a model call succeeding.
   */
  async ensureOnboarding(): Promise<void> {
    if (this.agents.list().length > 0) return;
    const agent = await this.createAgent(ONBOARDING_AGENT);
    const greeting = onboardingGreeting();
    await this.sendToUser({ from: agent.id, text: greeting.body, cards: greeting.cards });
  }

  // --- skill host ---------------------------------------------------------

  async sendToAgent(options: {
    from: string;
    to: string;
    text: string;
    originConversationId: string;
    wait: boolean;
  }): Promise<string | null> {
    const from = this.agents.get(options.from);
    const to = this.agents.get(options.to);
    if (!from || !to) throw new Error('Unknown agent in delegation');

    const depth = (this.#turns.get(options.originConversationId)?.depth ?? 0) + 1;
    if (depth > MAX_DELEGATION_DEPTH) {
      throw new Error('Too many bots have been asked in a row. Answer with what you have.');
    }

    const channel = await this.conversations.channel(from.id, to.id, `${from.name} ↔ ${to.name}`);
    if (this.#turns.has(channel.id) && options.wait) {
      throw new Error(`${to.name} is already working on something from you. Do not wait.`);
    }

    const request = await this.conversations.append({
      conversationId: channel.id,
      author: { kind: 'agent', id: from.id, name: from.name },
      body: options.text,
      parts: [],
      cards: [],
      streaming: false,
    });
    this.bus.emit({ type: 'message.created', message: request });

    const work = this.#enqueue(channel.id, async () => {
      const outcome = await this.#runTurn({
        conversationId: channel.id,
        agentId: to.id,
        input: { text: options.text, images: [] },
        depth,
      });
      return outcome.message.body;
    });

    if (!options.wait) {
      work
        .then((body) => this.#deliverReply(to, from, options.originConversationId, body, depth))
        .catch((err) => this.log.warn('delegated turn failed', err));
      return null;
    }
    return (await work) as string;
  }

  async sendToUser(options: { from: string; text: string; cards?: Card[] }): Promise<void> {
    const agent = this.agents.get(options.from);
    if (!agent) throw new Error(`No agent ${options.from}`);
    const conversation = await this.conversations.dm(agent.id, agent.name);
    const message = await this.conversations.append({
      conversationId: conversation.id,
      author: { kind: 'agent', id: agent.id, name: agent.name },
      body: options.text,
      parts: [],
      cards: options.cards ?? [],
      streaming: false,
    });
    this.bus.emit({ type: 'message.created', message });
    const counted = await this.conversations.markUnread(conversation.id);
    if (counted) this.bus.emit({ type: 'conversation.updated', conversation: counted });
    this.#setStatus(agent.id, 'waiting-on-user');
  }

  /** Runs a skill on behalf of an agent. Called by the MCP bridge. */
  async invokeSkill(
    skillId: string,
    agentId: string,
    conversationId: string,
    input: unknown,
  ): Promise<SkillResult> {
    const agent = this.agents.get(agentId);
    if (!agent) return { ok: false, content: `No agent ${agentId}` };
    return this.skills.execute(skillId, input, { host: this, agent, conversationId });
  }

  // --- internals ----------------------------------------------------------

  /** How a chat reads to the agent doing the looking. */
  #describeConversation(conversation: Conversation, agentId: string): string {
    if (conversation.kind === 'dm') return 'in your chat';
    const other = conversation.participants.find((id) => id !== agentId && id !== USER_ID);
    const name = other ? this.agents.get(other)?.name : undefined;
    return name ? `with ${name}` : 'with a colleague';
  }

  /**
   * Ends the session in any chat that has gone quiet: the provider thread is
   * dropped, so nothing carries context nobody is using, and the bot shows as
   * offline. Every message is still on disk, and the next one starts a new
   * session with a recap.
   */
  async #endQuietSessions(): Promise<void> {
    const cutoff = Date.now() - this.project.file.settings.sessionMinutes * 60_000;
    const working = new Set(
      [...this.#turns.keys()].map((id) => this.conversations.get(id)?.agentId),
    );

    for (const conversation of this.conversations.list()) {
      if (Object.keys(conversation.providerThreads).length === 0) continue;
      if (this.#turns.has(conversation.id)) continue;
      const last = Date.parse(conversation.lastMessageAt ?? conversation.createdAt);
      if (Number.isNaN(last) || last > cutoff) continue;

      const updated = await this.conversations.patch(conversation.id, { providerThreads: {} });
      this.bus.emit({ type: 'conversation.updated', conversation: updated });
      for (const id of conversation.participants) {
        const agent = this.agents.get(id);
        if (!agent) continue;
        // A bot that is busy elsewhere keeps whatever it is doing.
        if (!working.has(id)) this.#status.delete(id);
        this.bus.emit({ type: 'agent.updated', agent: this.#view(agent) });
      }
    }
  }

  /** Drops one agent's provider threads so its next turn starts clean. */
  async #forgetThreads(agentId: string): Promise<void> {
    for (const conversation of this.conversations.list()) {
      if (!(agentId in conversation.providerThreads)) continue;
      const { [agentId]: _gone, ...rest } = conversation.providerThreads;
      const updated = await this.conversations.patch(conversation.id, { providerThreads: rest });
      this.bus.emit({ type: 'conversation.updated', conversation: updated });
    }
  }

  /**
   * Hands a colleague's answer back to the bot that asked for it, in the chat
   * it asked from. Only that bot speaks there, so a chat with one bot never
   * fills up with messages from bots the person did not open.
   */
  async #deliverReply(
    from: AgentDefinition,
    to: AgentDefinition,
    originConversationId: string,
    body: string,
    depth: number,
  ): Promise<void> {
    const answer = body.trim();
    if (!answer) return;
    const origin = this.conversations.get(originConversationId);
    if (!origin || !origin.participants.includes(to.id)) return;

    await this.#enqueue(originConversationId, () =>
      this.#runTurn({
        conversationId: originConversationId,
        agentId: to.id,
        input: {
          text: `${from.name} answered what you asked them:\n\n${answer}\n\nCarry on. Say what this means for the work, in your own words.`,
          images: [],
        },
        depth,
        inputInHistory: false,
      }),
    );
  }

  async #runTurn(options: {
    conversationId: string;
    agentId: string;
    input: { text: string; images: string[] };
    depth: number;
    /** False when the input was never posted as a message, so nothing is dropped. */
    inputInHistory?: boolean;
  }): Promise<{ message: Message }> {
    const conversation = this.conversations.get(options.conversationId);
    const agent = this.agents.get(options.agentId);
    if (!conversation || !agent) throw new Error('Conversation or agent went away');

    const provider = this.providers.get(agent.provider);
    const controller = new AbortController();
    this.#turns.set(conversation.id, { controller, depth: options.depth });

    try {
      const all = await this.conversations.messages(conversation.id);
      const history = options.inputInHistory === false ? all : all.slice(0, -1);
      const outcome = await this.#runner.run(
        {
          agent,
          conversation,
          provider,
          input: options.input,
          history,
          context: {
            workspaceDir: this.project.paths.agentWorkspace(agent.slug),
            additionalDirs: agent.workspace.shared.map((w) => this.project.paths.workspace(w)),
            projectRoot: this.projectRoot,
            skills: provider.info.supportsSkills ? this.skills.forAgent(agent) : [],
            skillBridge: {
              bridgePath: this.#bridgePath,
              serverUrl: this.#serverUrl,
              token: this.#token,
              agentId: agent.id,
              conversationId: conversation.id,
            },
          },
        },
        controller.signal,
      );

      // A reply the person has not seen yet, so the sidebar can say so.
      if (conversation.kind === 'dm' && outcome.message.body.trim()) {
        const counted = await this.conversations.markUnread(conversation.id);
        if (counted) this.bus.emit({ type: 'conversation.updated', conversation: counted });
      }

      if (outcome.providerThreadId) {
        const updated = await this.conversations.patch(conversation.id, {
          providerThreads: {
            ...conversation.providerThreads,
            [agent.id]: outcome.providerThreadId,
          },
        });
        this.bus.emit({ type: 'conversation.updated', conversation: updated });
      }
      return outcome;
    } finally {
      this.#turns.delete(conversation.id);
    }
  }

  /** One turn at a time per conversation; messages queue rather than collide. */
  #enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.#queues.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  #setStatus(agentId: string, status: AgentStatus, detail?: string): void {
    this.#status.set(agentId, detail === undefined ? { status } : { status, detail });
    this.bus.emit(
      detail === undefined
        ? { type: 'agent.status', agentId, status }
        : { type: 'agent.status', agentId, status, detail },
    );
  }

  #view(definition: AgentDefinition): AgentView {
    const state = this.#status.get(definition.id);
    const conversation = this.conversations.get(dmConversationId(definition.id));
    // Anything but idle is something the bot is doing right now, so it wins.
    // Otherwise presence is simply whether it still holds this chat in mind.
    const busy = state && state.status !== 'idle' ? state.status : undefined;
    const present = Boolean(conversation?.providerThreads[definition.id]);
    return {
      definition,
      status: busy ?? (present ? 'idle' : 'offline'),
      ...(state?.detail ? { statusDetail: state.detail } : {}),
      unread: conversation?.unread ?? 0,
      ...(conversation?.lastMessageAt ? { lastMessageAt: conversation.lastMessageAt } : {}),
      ...(conversation?.lastMessagePreview
        ? { lastMessagePreview: conversation.lastMessagePreview }
        : {}),
    };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** With nothing to match on, the opening of the message is the useful part. */
function summarise(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > 320 ? `${text.slice(0, 320)}…` : text;
}

/** A window around the match, so a hit reads as a sentence, not a fragment. */
function excerpt(body: string, index: number): string {
  const start = Math.max(0, index - 120);
  const text = body
    .slice(start, index + 200)
    .replace(/\s+/g, ' ')
    .trim();
  return `${start > 0 ? '…' : ''}${text}${index + 200 < body.length ? '…' : ''}`;
}

/** Resolves the built MCP bridge that ships alongside core. */
function defaultBridgePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../skills-mcp/dist/index.js');
}

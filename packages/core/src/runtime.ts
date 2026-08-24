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
import type { SkillHost } from './skills/skill.js';
import { TurnRunner } from './turn-runner.js';

/** A bot asking a bot asking a bot… stops here. */
const MAX_DELEGATION_DEPTH = 3;

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
    return runtime;
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
    const definition = await this.agents.update(id, patch);
    if (definition.archived) this.bus.emit({ type: 'agent.removed', agentId: id });
    else this.bus.emit({ type: 'agent.updated', agent: this.#view(definition) });
    return definition;
  }

  listAgents(): AgentDefinition[] {
    return this.agents.list();
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
      await this.#relay(outcome, to, options.originConversationId);
      return outcome.message.body;
    });

    if (!options.wait) {
      work.catch((err) => this.log.warn('delegated turn failed', err));
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

  /**
   * Copies a colleague's answer back into the chat that asked for it, so the
   * user sees "Message from Research" without opening another conversation.
   */
  async #relay(
    outcome: { message: Message },
    from: AgentDefinition,
    originConversationId: string,
  ): Promise<void> {
    if (originConversationId === outcome.message.conversationId) return;
    if (!outcome.message.body.trim()) return;
    const relayed = await this.conversations.append({
      conversationId: originConversationId,
      author: { kind: 'agent', id: from.id, name: from.name },
      body: outcome.message.body,
      parts: [],
      cards: [],
      streaming: false,
      relayedFrom: from.name,
    });
    this.bus.emit({ type: 'message.created', message: relayed });
  }

  async #runTurn(options: {
    conversationId: string;
    agentId: string;
    input: { text: string; images: string[] };
    depth: number;
  }): Promise<{ message: Message }> {
    const conversation = this.conversations.get(options.conversationId);
    const agent = this.agents.get(options.agentId);
    if (!conversation || !agent) throw new Error('Conversation or agent went away');

    const provider = this.providers.get(agent.provider);
    const controller = new AbortController();
    this.#turns.set(conversation.id, { controller, depth: options.depth });

    try {
      const history = (await this.conversations.messages(conversation.id)).slice(0, -1);
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

      if (outcome.providerThreadId) {
        const updated = await this.conversations.patch(conversation.id, {
          providerThreads: { ...conversation.providerThreads, [agent.id]: outcome.providerThreadId },
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
    return {
      definition,
      status: state?.status ?? 'idle',
      ...(state?.detail ? { statusDetail: state.detail } : {}),
      unread: 0,
      ...(conversation?.lastMessageAt ? { lastMessageAt: conversation.lastMessageAt } : {}),
      ...(conversation?.lastMessagePreview
        ? { lastMessagePreview: conversation.lastMessagePreview }
        : {}),
    };
  }
}

/** Resolves the built MCP bridge that ships alongside core. */
function defaultBridgePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../skills-mcp/dist/index.js');
}

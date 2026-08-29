import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  USER_ID,
  dmConversationId,
  MAX_ATTACHMENTS,
  type AnswerCardRequest,
  type Attachment,
  type Card,
  type AgentDefinition,
  type AgentStatus,
  type AgentView,
  type Conversation,
  type CreateAgentRequest,
  type Message,
  type Note,
  type NoteOutcome,
  type NoteQuery,
  type ProjectInfo,
  type SendMessageRequest,
  type SkillInfo,
  type SkillResult,
  type UpdateAgentRequest,
  type UpdateProjectRequest,
} from '@openbot/shared';
import { EventBus } from './bus.js';
import { FileStore } from './files/store.js';
import { turnText, visionPaths } from './files/prompt.js';
import { createLogger, type Logger } from './logger.js';
import { ProjectStore } from './project/project-store.js';
import { writeTeamSetup } from './project/setup.js';
import { AgentStore } from './agents/agent-store.js';
import { ONBOARDING_AGENT, onboardingGreeting } from './agents/onboarding.js';
import { ConversationStore } from './conversations/conversation-store.js';
import { searchHistory } from './history/search.js';
import { importMarkdownNotes } from './memory/import-markdown.js';
import { Librarian } from './memory/librarian.js';
import { NoteStore } from './memory/note-store.js';
import { builtinProviders } from './providers/index.js';
import { ProviderRegistry } from './providers/registry.js';
import { SkillRegistry } from './skills/registry.js';
import { builtinSkills } from './skills/builtin/index.js';
import type { HistoryHit, SkillHost } from './skills/skill.js';
import { ensureTeamTools } from './skills/team/handbook.js';
import { loadTeamTools, TEAM_SOURCE } from './skills/team/load.js';
import { Delegation } from './turns/delegate.js';
import { TurnLoop, type LoopContext } from './turns/loop.js';
import { TurnRunner } from './turns/runner.js';
import { TurnScheduler } from './turns/scheduler.js';
import { SessionSweep, SWEEP_MS } from './turns/sweep.js';

export interface RuntimeOptions {
  root: string;
  logger?: Logger;
  /** Absolute path to the stdio MCP bridge. Defaults to the workspace build. */
  bridgePath?: string;
}

/**
 * The public backend: project state plus a turn loop. Adding a provider or
 * skill is a registry entry; changing how work is scheduled is `turns/`.
 */
export class OpenBotRuntime implements SkillHost {
  readonly bus = new EventBus();
  readonly providers = new ProviderRegistry();
  readonly skills = new SkillRegistry();
  readonly log: Logger;

  #status = new Map<string, { status: AgentStatus; detail?: string }>();
  #notes!: NoteStore;
  #files!: FileStore;
  #librarian!: Librarian;
  #scheduler: TurnScheduler;
  #loop: TurnLoop;
  #delegation: Delegation;
  #sweep: SessionSweep;
  #bridge: LoopContext;
  #token = '';
  #sweeper?: ReturnType<typeof setInterval>;
  #reloadingTools?: Promise<void>;

  private constructor(
    readonly project: ProjectStore,
    readonly agents: AgentStore,
    readonly conversations: ConversationStore,
    options: RuntimeOptions,
  ) {
    this.log = options.logger ?? createLogger('runtime');
    this.#bridge = {
      bridgePath: options.bridgePath ?? defaultBridgePath(),
      serverUrl: '',
      token: '',
    };
    this.#scheduler = new TurnScheduler(this.log);
    const runner = new TurnRunner({
      conversations: this.conversations,
      bus: this.bus,
      onStatus: (agentId, status, detail) => this.#setStatus(agentId, status, detail),
    });
    this.#loop = new TurnLoop({
      scheduler: this.#scheduler,
      runner,
      conversations: this.conversations,
      agents: this.agents,
      providers: this.providers,
      skills: this.skills,
      project: this.project,
      bus: this.bus,
      bridge: this.#bridge,
    });
    this.#delegation = new Delegation({
      scheduler: this.#scheduler,
      loop: this.#loop,
      conversations: this.conversations,
      agents: this.agents,
      bus: this.bus,
      log: this.log,
    });
    this.#sweep = new SessionSweep({
      conversations: this.conversations,
      agents: this.agents,
      bus: this.bus,
      scheduler: this.#scheduler,
      sessionMinutes: () => this.project.file.settings.sessionMinutes,
      view: (definition) => this.#view(definition),
      clearIdleStatus: (agentId) => this.#status.delete(agentId),
      release: (agentId, conversationId) => this.providers.release(agentId, conversationId),
    });
  }

  static async open(options: RuntimeOptions): Promise<OpenBotRuntime> {
    const project = await ProjectStore.load(options.root);
    const agents = new AgentStore(project);
    const conversations = new ConversationStore(project);
    await agents.load();
    await conversations.load();

    const runtime = new OpenBotRuntime(project, agents, conversations, options);
    runtime.#files = await FileStore.open(project.paths);
    runtime.#notes = await NoteStore.open(project.paths.notesDb, project.paths.notesFile);
    runtime.providers.registerAll(builtinProviders());
    runtime.#librarian = new Librarian({
      providers: runtime.providers,
      project,
      notes: runtime.#notes,
      log: runtime.log,
    });
    await importMarkdownNotes(project.paths.memoryDir, runtime.#notes, runtime.log);
    await ensureTeamTools(project.paths.toolsDir);
    runtime.skills.registerAll(builtinSkills);
    await runtime.reloadTools();
    runtime.#token = await project.token();
    runtime.#bridge.token = runtime.#token;
    await runtime.#sweep.run();
    runtime.#sweeper = setInterval(() => void runtime.#sweep.run(), SWEEP_MS);
    runtime.#sweeper.unref?.();
    return runtime;
  }

  async close(): Promise<void> {
    if (this.#sweeper) clearInterval(this.#sweeper);
    this.#sweeper = undefined;
    await this.#scheduler.close();
    this.providers.release();
    this.#notes.close();
  }

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

  /**
   * Saves what the settings page can change about a team. The name and the
   * goal are part of every standing brief, so changing either rewrites the
   * briefs on disk and starts every bot on a fresh thread.
   */
  async updateProject(patch: UpdateProjectRequest): Promise<ProjectInfo> {
    const before = this.project.file;
    const rebrief =
      (patch.name !== undefined && patch.name.trim() !== before.name) ||
      (patch.goal !== undefined && patch.goal.trim() !== before.goal);

    await this.project.update((file) => {
      if (patch.name !== undefined) file.name = patch.name.trim();
      if (patch.goal !== undefined) file.goal = patch.goal.trim();
      if (patch.userName !== undefined) file.settings.userName = patch.userName.trim();
      if (patch.sessionMinutes !== undefined) file.settings.sessionMinutes = patch.sessionMinutes;
    });

    if (rebrief) {
      await this.agents.rewriteInstructions();
      for (const agent of this.agents.list()) await this.#forgetThreads(agent.id);
    }

    this.bus.emit({ type: 'project.updated', project: this.project.info });
    return this.project.info;
  }

  async setupTeam(options: {
    agentId: string;
    goal?: string;
    handbook?: string;
    folders?: string[];
    files?: { path: string; content: string }[];
  }): Promise<{ goal: string; handbook: boolean; folders: string[]; files: string[] }> {
    const written = await writeTeamSetup(this.project.paths, {
      handbook: options.handbook,
      folders: options.folders,
      files: options.files,
    });

    const goalIn = options.goal?.trim();
    const rebrief = Boolean(goalIn) || written.handbook;

    await this.project.update((file) => {
      if (goalIn) file.goal = goalIn;
      for (const folder of written.folders) {
        if (!file.workspaces.includes(folder)) file.workspaces.push(folder);
      }
    });

    const agent = this.agents.get(options.agentId);
    if (agent) {
      const shared = unique([
        ...agent.workspace.shared,
        'main',
        ...written.folders,
        ...parentFolders(written.files),
      ]);
      if (shared.join('\0') !== agent.workspace.shared.join('\0')) {
        await this.agents.update(agent.id, { sharedWorkspaces: shared });
        this.bus.emit({ type: 'agent.updated', agent: this.#view(this.agents.get(agent.id)!) });
      }
    }

    if (rebrief) {
      await this.agents.rewriteInstructions();
      for (const live of this.agents.list()) await this.#forgetThreads(live.id);
    }

    this.bus.emit({ type: 'project.updated', project: this.project.info });
    return {
      goal: this.project.file.goal,
      handbook: written.handbook,
      folders: written.folders,
      files: written.files,
    };
  }

  setServerUrl(url: string): void {
    this.#bridge.serverUrl = url;
  }

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

  async reloadTools(): Promise<void> {
    if (this.#reloadingTools) return this.#reloadingTools;
    this.#reloadingTools = this.#reloadTools();
    try {
      await this.#reloadingTools;
    } finally {
      this.#reloadingTools = undefined;
    }
  }

  async searchHistory(options: {
    agentId: string;
    query?: string;
    since?: string;
    until?: string;
    limit: number;
  }): Promise<HistoryHit[]> {
    return searchHistory({
      ...options,
      conversations: this.conversations.list(),
      loadMessages: (id) => this.conversations.peekMessages(id),
      agentName: (id) => this.agents.get(id)?.name,
    });
  }

  /** The team's shared notes, for anything that wants to read them directly. */
  get notes(): NoteStore {
    return this.#notes;
  }

  async rememberNote(options: { agentId: string; text: string }): Promise<NoteOutcome> {
    const agent = this.agents.get(options.agentId);
    if (!agent) throw new Error(`No agent ${options.agentId}`);
    return this.#librarian.file({ text: options.text, author: agent });
  }

  async recallNotes(query: NoteQuery): Promise<Note[]> {
    return this.#notes.search(query);
  }

  async readNotes(ids: number[]): Promise<Note[]> {
    return this.#notes.getMany(ids);
  }

  async noteTags(): Promise<string[]> {
    return this.#notes.tags();
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
    if (conversation.kind !== 'dm') throw new Error('That chat is not yours to write in.');

    const attachments = await this.#resolveAttachments(request.attachments ?? []);
    const message = await this.conversations.append({
      conversationId,
      author: { kind: 'user', id: USER_ID, name: this.project.file.settings.userName },
      body: request.text ?? '',
      parts: [],
      cards: [],
      attachments,
      streaming: false,
    });
    this.bus.emit({ type: 'message.created', message });
    this.bus.emit({ type: 'conversation.updated', conversation });

    const epoch = this.#scheduler.epoch(conversationId);
    void this.#scheduler.enqueue(conversationId, conversation.agentId, () =>
      this.#loop.run({
        conversationId,
        agentId: conversation.agentId,
        input: {
          text: turnText(request.text ?? '', attachments),
          images: visionPaths(this.project.paths.root, attachments),
        },
        depth: 0,
        epoch,
      }),
    );

    return message;
  }

  async saveFile(input: { name: string; bytes: Uint8Array; mime?: string }): Promise<Attachment> {
    return this.#files.save(input);
  }

  async readFile(rel: string): Promise<{ bytes: Buffer; attachment: Attachment } | null> {
    return this.#files.read(rel);
  }

  async #resolveAttachments(paths: string[]): Promise<Attachment[]> {
    if (paths.length > MAX_ATTACHMENTS) throw new Error('Too many files.');
    const attachments: Attachment[] = [];
    for (const rel of paths) {
      const live = await this.#files.inspect(rel);
      if (!live) throw new Error('That file is not in the team folder.');
      attachments.push(live);
    }
    return attachments;
  }

  async markRead(conversationId: string): Promise<void> {
    const conversation = await this.conversations.markRead(conversationId);
    if (conversation) this.bus.emit({ type: 'conversation.updated', conversation });
  }

  abort(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    return this.#scheduler.abort(conversationId, conversation?.agentId);
  }

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

    await this.sendUserMessage(conversationId, { text: request.answer });
  }

  async ensureOnboarding(): Promise<void> {
    if (this.agents.list().length > 0) return;
    const agent = await this.createAgent(ONBOARDING_AGENT);
    const greeting = onboardingGreeting();
    await this.sendToUser({ from: agent.id, text: greeting.body, cards: greeting.cards });
  }

  sendToAgent(options: {
    from: string;
    to: string;
    text: string;
    originConversationId: string;
    wait: boolean;
  }): Promise<string | null> {
    return this.#delegation.sendToAgent(options);
  }

  async sendToUser(options: {
    from: string;
    text: string;
    cards?: Card[];
    waiting?: boolean;
  }): Promise<void> {
    const agent = this.agents.get(options.from);
    if (!agent) throw new Error(`No agent ${options.from}`);
    // Always this bot's own chat. A helper that needs the person never
    // speaks in the chat that asked it to work.
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
    if (options.waiting !== false) this.#setStatus(agent.id, 'waiting-on-user');
  }

  async invokeSkill(
    skillId: string,
    agentId: string,
    conversationId: string,
    input: unknown,
  ): Promise<SkillResult> {
    const agent = this.agents.get(agentId);
    if (!agent) return { ok: false, content: `No agent ${agentId}` };
    await this.reloadTools();
    return this.skills.execute(skillId, input, { host: this, agent, conversationId });
  }

  async #forgetThreads(agentId: string): Promise<void> {
    this.providers.release(agentId);
    for (const conversation of this.conversations.list()) {
      if (!(agentId in conversation.providerThreads)) continue;
      const { [agentId]: _gone, ...rest } = conversation.providerThreads;
      const updated = await this.conversations.patch(conversation.id, { providerThreads: rest });
      this.bus.emit({ type: 'conversation.updated', conversation: updated });
    }
  }

  #setStatus(agentId: string, status: AgentStatus, detail?: string): void {
    this.#status.set(agentId, detail === undefined ? { status } : { status, detail });
    this.bus.emit(
      detail === undefined
        ? { type: 'agent.status', agentId, status }
        : { type: 'agent.status', agentId, status, detail },
    );
  }

  async #reloadTools(): Promise<void> {
    const before = toolFingerprint(this.skills.list());
    const loaded = await loadTeamTools(this.project.paths.toolsDir);
    this.skills.replaceSource(TEAM_SOURCE, loaded);
    this.agents.useSkills(this.skills.list());
    const after = toolFingerprint(this.skills.list());
    if (before === after) return;
    await this.agents.rewriteInstructions();
    this.bus.emit({ type: 'skills.updated', skills: this.skills.list() });
  }

  #view(definition: AgentDefinition): AgentView {
    const state = this.#status.get(definition.id);
    const conversation = this.conversations.get(dmConversationId(definition.id));
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

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parentFolders(files: string[]): string[] {
  const tops: string[] = [];
  for (const file of files) {
    const top = file.split('/')[0];
    if (top && top !== 'memory') tops.push(top);
  }
  return tops;
}

function toolFingerprint(skills: SkillInfo[]): string {
  return skills
    .filter((skill) => skill.source === TEAM_SOURCE)
    .map((skill) => `${skill.id}\t${skill.title}\t${skill.description}`)
    .sort()
    .join('\n');
}

/** Resolves the built MCP bridge that ships alongside core. */
function defaultBridgePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../skills-mcp/dist/index.js');
}

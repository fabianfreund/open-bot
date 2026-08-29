import type { Message } from '@openbot/shared';
import type { AgentStore } from '../agents/agent-store.js';
import type { EventBus } from '../bus.js';
import type { ConversationStore } from '../conversations/conversation-store.js';
import type { ProjectStore } from '../project/project-store.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { SkillBridgeConfig } from '../providers/provider.js';
import type { SkillRegistry } from '../skills/registry.js';
import type { TurnScheduler } from './scheduler.js';
import { TurnRunner, type TurnOutcome } from './runner.js';

export interface LoopContext {
  bridgePath: string;
  serverUrl: string;
  token: string;
}

export interface LoopDeps {
  scheduler: TurnScheduler;
  runner: TurnRunner;
  conversations: ConversationStore;
  agents: AgentStore;
  providers: ProviderRegistry;
  skills: SkillRegistry;
  project: ProjectStore;
  bus: EventBus;
  bridge: LoopContext;
}

export interface RunTurnOptions {
  conversationId: string;
  agentId: string;
  input: { text: string; images: string[] };
  depth: number;
  epoch: number;
  /** False when the input was never posted as a message, so nothing is dropped. */
  inputInHistory?: boolean;
}

/**
 * One scheduled turn: load history, run the provider, save the thread.
 * Scheduler decides *when*; this decides *what*.
 */
export class TurnLoop {
  constructor(private readonly deps: LoopDeps) {}

  async run(options: RunTurnOptions): Promise<TurnOutcome | { skipped: true }> {
    const { scheduler } = this.deps;
    if (scheduler.cancelled(options.conversationId, options.epoch)) return { skipped: true };

    const conversation = this.deps.conversations.get(options.conversationId);
    const agent = this.deps.agents.get(options.agentId);
    if (!conversation || !agent) throw new Error('Conversation or agent went away');
    if (conversation.kind === 'dm' && options.agentId !== conversation.agentId) {
      throw new Error('A bot cannot write in another bot’s chat.');
    }

    const controller = await scheduler.begin({
      conversationId: conversation.id,
      agentId: agent.id,
      depth: options.depth,
      epoch: options.epoch,
    });
    if (!controller) return { skipped: true };

    try {
      const provider = this.deps.providers.get(agent.provider);
      const all = await this.deps.conversations.messages(conversation.id);
      const history = options.inputInHistory === false ? all : all.slice(0, -1);
      const outcome = await this.deps.runner.run(
        {
          agent,
          conversation,
          provider,
          input: options.input,
          history,
          context: {
            workspaceDir: this.deps.project.paths.agentWorkspace(agent.slug),
            additionalDirs: extraDirs(this.deps.project, agent.workspace.shared),
            projectRoot: this.deps.project.paths.root,
            skills: provider.info.supportsSkills ? this.deps.skills.forAgent(agent) : [],
            skillBridge: this.#bridge(agent.id, conversation.id),
          },
        },
        controller.signal,
      );

      if (conversation.kind === 'dm' && outcome.message.body.trim()) {
        const counted = await this.deps.conversations.markUnread(conversation.id);
        if (counted) this.deps.bus.emit({ type: 'conversation.updated', conversation: counted });
      }

      if (outcome.providerThreadId) {
        const updated = await this.deps.conversations.patch(conversation.id, {
          providerThreads: {
            ...conversation.providerThreads,
            [agent.id]: outcome.providerThreadId,
          },
        });
        this.deps.bus.emit({ type: 'conversation.updated', conversation: updated });
      }
      return outcome;
    } finally {
      scheduler.end(conversation.id);
    }
  }

  #bridge(agentId: string, conversationId: string): SkillBridgeConfig {
    const { bridge } = this.deps;
    return {
      bridgePath: bridge.bridgePath,
      serverUrl: bridge.serverUrl,
      token: bridge.token,
      agentId,
      conversationId,
    };
  }
}

/** Team tools, the inbox, plus any folders this bot was granted. */
function extraDirs(project: ProjectStore, shared: string[]): string[] {
  const dirs = [project.paths.toolsDir, project.paths.inboxDir];
  for (const name of shared) {
    const resolved = project.paths.workspace(name);
    if (!dirs.includes(resolved)) dirs.push(resolved);
  }
  return dirs;
}

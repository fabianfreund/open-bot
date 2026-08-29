import type { AgentDefinition, AgentView } from '@openbot/shared';
import type { AgentStore } from '../agents/agent-store.js';
import type { EventBus } from '../bus.js';
import type { ConversationStore } from '../conversations/conversation-store.js';
import type { TurnScheduler } from './scheduler.js';

/** How often quiet chats are checked for having gone cold. */
export const SWEEP_MS = 60_000;

export interface SweepDeps {
  conversations: ConversationStore;
  agents: AgentStore;
  bus: EventBus;
  scheduler: TurnScheduler;
  sessionMinutes: () => number;
  view(definition: AgentDefinition): AgentView;
  clearIdleStatus(agentId: string): void;
  release(agentId: string, conversationId: string): void;
}

/**
 * Drops the provider thread of any chat that has gone quiet, so nothing
 * carries context nobody is using. Every message stays on disk.
 */
export class SessionSweep {
  constructor(private readonly deps: SweepDeps) {}

  async run(): Promise<void> {
    const cutoff = Date.now() - this.deps.sessionMinutes() * 60_000;
    const working = this.deps.scheduler.workingAgentIds();

    for (const conversation of this.deps.conversations.list()) {
      if (Object.keys(conversation.providerThreads).length === 0) continue;
      if (this.deps.scheduler.hasTurn(conversation.id)) continue;
      const last = Date.parse(conversation.lastMessageAt ?? conversation.createdAt);
      if (Number.isNaN(last) || last > cutoff) continue;

      const updated = await this.deps.conversations.patch(conversation.id, { providerThreads: {} });
      this.deps.bus.emit({ type: 'conversation.updated', conversation: updated });
      for (const id of conversation.participants) {
        this.deps.release(id, conversation.id);
        const agent = this.deps.agents.get(id);
        if (!agent) continue;
        if (!working.has(id)) this.deps.clearIdleStatus(id);
        this.deps.bus.emit({ type: 'agent.updated', agent: this.deps.view(agent) });
      }
    }
  }
}

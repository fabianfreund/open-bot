import type { AgentDefinition } from '@openbot/shared';
import type { Logger } from '../logger.js';
import type { AgentStore } from '../agents/agent-store.js';
import type { EventBus } from '../bus.js';
import type { ConversationStore } from '../conversations/conversation-store.js';
import type { TurnLoop } from './loop.js';
import type { TurnScheduler } from './scheduler.js';

/** A bot asking a bot asking a bot… stops here. */
export const MAX_DELEGATION_DEPTH = 3;

export interface DelegateDeps {
  scheduler: TurnScheduler;
  loop: TurnLoop;
  conversations: ConversationStore;
  agents: AgentStore;
  bus: EventBus;
  log: Logger;
}

/**
 * How one bot asks another. The recipient works in its own chat, so its
 * tool calls show there. The answer comes back to the sender. Nobody
 * writes in a chat that is not theirs.
 */
export class Delegation {
  constructor(private readonly deps: DelegateDeps) {}

  async sendToAgent(options: {
    from: string;
    to: string;
    text: string;
    originConversationId: string;
    wait: boolean;
  }): Promise<string | null> {
    const { scheduler, conversations, agents, bus } = this.deps;
    const from = agents.get(options.from);
    const to = agents.get(options.to);
    if (!from || !to) throw new Error('Unknown agent in delegation');
    if (scheduler.closing) throw new Error('Stopped.');

    const originTurn = scheduler.turn(options.originConversationId);
    if (originTurn?.controller.signal.aborted) throw new Error('Stopped.');

    const depth = (originTurn?.depth ?? 0) + 1;
    if (depth > MAX_DELEGATION_DEPTH) {
      throw new Error('Too many bots have been asked in a row. Answer with what you have.');
    }

    if (options.wait && scheduler.workingAgentIds().has(to.id)) {
      throw new Error(`${to.name} is already working on something from you. Do not wait.`);
    }

    const inbox = await conversations.dm(to.id, to.name);
    const channel = await conversations.channel(from.id, to.id, `${from.name} ↔ ${to.name}`);
    const request = await conversations.append({
      conversationId: channel.id,
      author: { kind: 'agent', id: from.id, name: from.name },
      body: options.text,
      parts: [],
      cards: [],
      streaming: false,
    });
    bus.emit({ type: 'message.created', message: request });

    scheduler.link(inbox.id, options.originConversationId);
    const originEpoch = scheduler.epoch(options.originConversationId);
    const inboxEpoch = scheduler.epoch(inbox.id);

    const work = scheduler.enqueue(inbox.id, to.id, async () => {
      try {
        const outcome = await this.deps.loop.run({
          conversationId: inbox.id,
          agentId: to.id,
          input: { text: colleagueAsk(from.name, options.text), images: [] },
          depth,
          epoch: inboxEpoch,
          inputInHistory: false,
        });
        if ('skipped' in outcome) return '';
        const body = outcome.message.body.trim();
        const error = outcome.message.parts.find((part) => part.kind === 'error');
        const reply = body
          ? body
          : error
            ? `${to.name} could not finish what you asked. ${error.title}`
            : '';
        if (reply) {
          const logged = await conversations.append({
            conversationId: channel.id,
            author: { kind: 'agent', id: to.id, name: to.name },
            body: reply,
            parts: [],
            cards: [],
            streaming: false,
          });
          bus.emit({ type: 'message.created', message: logged });
        }
        return reply;
      } finally {
        scheduler.unlink(inbox.id);
      }
    });

    if (!options.wait) {
      work
        .then((body) =>
          this.#wake(
            to,
            from,
            options.originConversationId,
            body,
            depth,
            originEpoch,
            inbox.id,
            inboxEpoch,
          ),
        )
        .catch((err: unknown) => {
          const detail = err instanceof Error ? err.message : String(err);
          return this.#wake(
            to,
            from,
            options.originConversationId,
            `${to.name} could not finish what you asked. ${detail}`,
            depth,
            originEpoch,
            inbox.id,
            inboxEpoch,
          );
        })
        .catch((err: unknown) => this.deps.log.warn('delegated turn failed', err));
      return null;
    }
    return work;
  }

  /**
   * The asking bot speaks in the chat it asked from. The helper never does.
   */
  async #wake(
    helper: AgentDefinition,
    asker: AgentDefinition,
    originConversationId: string,
    body: string,
    depth: number,
    originEpoch: number,
    inboxId: string,
    inboxEpoch: number,
  ): Promise<void> {
    const { scheduler } = this.deps;
    if (scheduler.cancelled(inboxId, inboxEpoch)) return;
    if (scheduler.cancelled(originConversationId, originEpoch)) return;
    const answer = body.trim();
    if (!answer) return;
    const origin = this.deps.conversations.get(originConversationId);
    if (!origin || !origin.participants.includes(asker.id)) return;
    if (origin.kind === 'dm' && origin.agentId !== asker.id) return;

    await scheduler.enqueue(originConversationId, asker.id, () =>
      this.deps.loop.run({
        conversationId: originConversationId,
        agentId: asker.id,
        input: {
          text: `${helper.name} answered what you asked them:\n\n${answer}\n\nCarry on. Say what this means for the work, in your own words.`,
          images: [],
        },
        depth,
        epoch: originEpoch,
        inputInHistory: false,
      }),
    );
  }
}

function colleagueAsk(fromName: string, text: string): string {
  return `${fromName} asked you:\n\n${text}\n\nDo that work. Answer ${fromName} with the result. If you need the person, ask_user in this chat. This chat is yours; do not write in anyone else's.`;
}

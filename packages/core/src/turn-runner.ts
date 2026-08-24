import {
  MessageSchema,
  USER_ID,
  newId,
  type AgentDefinition,
  type AgentStatus,
  type Conversation,
  type Message,
  type ProviderStreamEvent,
  type TracePart,
} from '@openbot/shared';
import type { ConversationStore } from './conversations/conversation-store.js';
import type { EventBus } from './bus.js';
import type { Provider, ProviderContext, ProviderRunInput } from './providers/provider.js';

/** How often a streaming message is pushed to clients while it grows. */
const STREAM_FLUSH_MS = 120;

export interface TurnDeps {
  conversations: ConversationStore;
  bus: EventBus;
  onStatus(agentId: string, status: AgentStatus, detail?: string): void;
}

export interface TurnRequest {
  agent: AgentDefinition;
  conversation: Conversation;
  provider: Provider;
  input: ProviderRunInput;
  history: Message[];
  context: Omit<
    ProviderContext,
    'emit' | 'signal' | 'agent' | 'conversation' | 'history' | 'providerThreadId'
  >;
}

export interface TurnOutcome {
  message: Message;
  providerThreadId?: string;
}

/**
 * Runs one provider turn and keeps the assistant message in sync with the
 * stream. Everything provider-specific has already been normalised by the
 * provider, so this file never learns what Codex is.
 */
export class TurnRunner {
  constructor(private readonly deps: TurnDeps) {}

  async run(request: TurnRequest, signal: AbortSignal): Promise<TurnOutcome> {
    const { agent, conversation, provider } = request;

    let message = MessageSchema.parse({
      id: newId('msg'),
      conversationId: conversation.id,
      author: { kind: 'agent', id: agent.id, name: agent.name },
      body: '',
      parts: [],
      cards: [],
      createdAt: new Date().toISOString(),
      streaming: true,
    });

    await this.deps.conversations.replace(message, false);
    this.deps.bus.emit({ type: 'message.created', message });
    this.deps.onStatus(agent.id, 'thinking');

    let dirty = false;
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      this.deps.bus.emit({ type: 'message.updated', message });
    };
    const timer = setInterval(flush, STREAM_FLUSH_MS);

    const apply = (event: ProviderStreamEvent) => {
      switch (event.kind) {
        case 'text-final':
          message = { ...message, body: event.text };
          dirty = true;
          break;
        case 'text-delta':
          message = { ...message, body: message.body + event.text };
          dirty = true;
          break;
        case 'trace':
          message = { ...message, parts: upsertPart(message.parts, event, message.body.length) };
          dirty = true;
          break;
        case 'status':
          this.deps.onStatus(agent.id, event.status, event.detail);
          break;
        case 'usage':
          message = {
            ...message,
            usage: { inputTokens: event.inputTokens, outputTokens: event.outputTokens },
          };
          break;
        case 'error':
          message = {
            ...message,
            parts: upsertPart(
              message.parts,
              { id: newId('err'), traceKind: 'error', title: event.message, status: 'failed' },
              message.body.length,
            ),
          };
          dirty = true;
          break;
        default:
          break;
      }
    };

    try {
      const result = await provider.run(request.input, {
        ...request.context,
        agent,
        conversation,
        history: request.history,
        ...(conversation.providerThreads[agent.id]
          ? { providerThreadId: conversation.providerThreads[agent.id] }
          : {}),
        emit: apply,
        signal,
      });

      if (result.finalText.trim()) message = { ...message, body: result.finalText };
      if (result.usage) message = { ...message, usage: result.usage };
      message = { ...message, streaming: false };

      clearInterval(timer);
      await this.deps.conversations.replace(message, true);
      this.deps.bus.emit({ type: 'message.updated', message });
      this.deps.onStatus(agent.id, 'idle');

      return {
        message,
        ...(result.providerThreadId ? { providerThreadId: result.providerThreadId } : {}),
      };
    } catch (err) {
      clearInterval(timer);
      const aborted = signal.aborted;
      message = {
        ...message,
        streaming: false,
        body: message.body || (aborted ? 'Stopped.' : ''),
        parts: aborted
          ? message.parts
          : upsertPart(
              message.parts,
              { id: newId('err'), traceKind: 'error', title: friendlyError(err), status: 'failed' },
              message.body.length,
            ),
      };
      await this.deps.conversations.replace(message, true);
      this.deps.bus.emit({ type: 'message.updated', message });
      this.deps.onStatus(
        agent.id,
        aborted ? 'idle' : 'error',
        aborted ? undefined : friendlyError(err),
      );
      return { message };
    }
  }
}

/** `at` is where the step landed in the text, and is set once, when it starts. */
function upsertPart(
  parts: TracePart[],
  incoming: {
    id: string;
    traceKind: TracePart['kind'];
    title: string;
    detail?: string;
    status: TracePart['status'];
  },
  at: number,
): TracePart[] {
  const index = parts.findIndex((p) => p.id === incoming.id);
  const part: TracePart = {
    id: incoming.id,
    kind: incoming.traceKind,
    title: incoming.title,
    status: incoming.status,
    at: index === -1 ? at : (parts[index]?.at ?? at),
    ...(incoming.detail ? { detail: incoming.detail } : {}),
  };
  if (index === -1) return [...parts, part];
  const next = [...parts];
  next[index] = part;
  return next;
}

/** Provider errors are developer-shaped; the chat is not. */
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/not logged in|unauthor|401/i.test(raw)) return 'Not signed in to Codex. Run `codex login`.';
  if (/Codex is not installed/i.test(raw)) return raw;
  if (/Unable to locate Codex CLI/i.test(raw)) {
    return 'Codex is not installed on this computer. Install it, then run `codex login`.';
  }
  if (/ENOENT|not found/i.test(raw) && /codex/i.test(raw))
    return 'Codex is not installed on this computer.';
  if (/rate limit|429/i.test(raw)) return 'Hit a rate limit. Try again shortly.';
  if (/usage limit|quota/i.test(raw)) return 'Your Codex usage limit is reached.';
  return raw.split('\n')[0]?.slice(0, 300) ?? 'Something went wrong.';
}

export { USER_ID };

import {
  ConversationSchema,
  MessageSchema,
  agentChannelId,
  dmConversationId,
  newId,
  type Conversation,
  type Message,
} from '@openbot/shared';
import type { ProjectStore } from '../project/project-store.js';
import { appendJsonl, readJson, readJsonl, rewriteJsonl, writeJson } from '../storage/json-file.js';

const MAX_PREVIEW = 140;

/**
 * Conversations live in one small JSON file; messages append to a JSONL file
 * per conversation. Appending is cheap, and history survives a crash mid-turn.
 */
export class ConversationStore {
  #conversations = new Map<string, Conversation>();
  #cache = new Map<string, Message[]>();

  constructor(private readonly project: ProjectStore) {}

  async load(): Promise<void> {
    const raw = await readJson<Conversation[]>(this.project.paths.conversationsFile, []);
    this.#conversations.clear();
    for (const item of raw) {
      const parsed = ConversationSchema.safeParse(item);
      if (parsed.success) this.#conversations.set(parsed.data.id, parsed.data);
    }
  }

  list(): Conversation[] {
    return [...this.#conversations.values()];
  }

  get(id: string): Conversation | undefined {
    return this.#conversations.get(id);
  }

  /** The user's chat with one agent. Created on demand. */
  async dm(agentId: string, title: string): Promise<Conversation> {
    return this.#ensure(dmConversationId(agentId), {
      kind: 'dm',
      title,
      participants: ['user', agentId],
      agentId,
    });
  }

  /** A channel between two agents, owned by the recipient (it runs the turns). */
  async channel(from: string, to: string, title: string): Promise<Conversation> {
    return this.#ensure(agentChannelId(from, to), {
      kind: 'channel',
      title,
      participants: [from, to],
      agentId: to,
    });
  }

  async #ensure(
    id: string,
    seed: Pick<Conversation, 'kind' | 'title' | 'participants' | 'agentId'>,
  ): Promise<Conversation> {
    const existing = this.#conversations.get(id);
    if (existing) return existing;
    const conversation = ConversationSchema.parse({
      id,
      createdAt: new Date().toISOString(),
      ...seed,
    });
    this.#conversations.set(id, conversation);
    await this.#persistConversations();
    return conversation;
  }

  async patch(id: string, patch: Partial<Conversation>): Promise<Conversation> {
    const current = this.#conversations.get(id);
    if (!current) throw new Error(`No conversation ${id}`);
    const next = ConversationSchema.parse({ ...current, ...patch });
    this.#conversations.set(id, next);
    await this.#persistConversations();
    return next;
  }

  async messages(conversationId: string): Promise<Message[]> {
    const cached = this.#cache.get(conversationId);
    if (cached) return cached;
    const rows = await readJsonl<unknown>(this.project.paths.messagesFile(conversationId));
    const parsed: Message[] = [];
    for (const row of rows) {
      const result = MessageSchema.safeParse(row);
      if (result.success) parsed.push(result.data);
    }
    this.#cache.set(conversationId, parsed);
    return parsed;
  }

  /** Appends a message and refreshes the conversation's preview line. */
  async append(input: Omit<Message, 'id' | 'createdAt'> & Partial<Pick<Message, 'id' | 'createdAt'>>): Promise<Message> {
    const message = MessageSchema.parse({
      id: input.id ?? newId('msg'),
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input,
    });
    const list = await this.messages(message.conversationId);
    list.push(message);
    await appendJsonl(this.project.paths.messagesFile(message.conversationId), message);
    await this.#touch(message);
    return message;
  }

  /**
   * Replaces a message in place. Streaming messages are written once on
   * completion; only the finalise call rewrites the file.
   */
  async replace(message: Message, persist: boolean): Promise<Message> {
    const list = await this.messages(message.conversationId);
    const index = list.findIndex((m) => m.id === message.id);
    if (index >= 0) list[index] = message;
    else list.push(message);
    if (persist) {
      await rewriteJsonl(this.project.paths.messagesFile(message.conversationId), list);
      await this.#touch(message);
    }
    return message;
  }

  async #touch(message: Message): Promise<void> {
    const conversation = this.#conversations.get(message.conversationId);
    if (!conversation) return;
    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessagePreview = preview(message.body);
    await this.#persistConversations();
  }

  async #persistConversations(): Promise<void> {
    await writeJson(this.project.paths.conversationsFile, [...this.#conversations.values()]);
  }
}

function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_PREVIEW ? `${flat.slice(0, MAX_PREVIEW - 1)}…` : flat;
}

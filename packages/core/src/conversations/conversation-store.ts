import {
  ConversationSchema,
  MessageSchema,
  USER_ID,
  agentChannelId,
  dmConversationId,
  messageText,
  newId,
  type Conversation,
  type Message,
} from '@openbot/shared';
import type { z } from 'zod';

type NewMessage = Omit<z.input<typeof MessageSchema>, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};
import type { ProjectStore } from '../project/project-store.js';
import { appendJsonl, readJson, readJsonl, rewriteJsonl, writeJson } from '../storage/json-file.js';

const MAX_PREVIEW = 140;
/** Live chats stay in memory; older ones drop out so look_back cannot pin everything. */
const MAX_CACHED_CHATS = 40;

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
    if (cached) {
      this.#cache.delete(conversationId);
      this.#cache.set(conversationId, cached);
      return cached;
    }
    const parsed = await this.#readMessages(conversationId);
    this.#remember(conversationId, parsed);
    return parsed;
  }

  /**
   * For searches: use the live cache if this chat is already open, otherwise
   * read from disk without pinning the whole history.
   */
  async peekMessages(conversationId: string): Promise<Message[]> {
    const cached = this.#cache.get(conversationId);
    if (cached) return cached;
    return this.#readMessages(conversationId);
  }

  /** Appends a message and refreshes the conversation's preview line. */
  async append(input: NewMessage): Promise<Message> {
    const message = MessageSchema.parse({
      id: input.id ?? newId('msg'),
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input,
    });
    this.#assertSpeaker(message);
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
    this.#assertSpeaker(message);
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

  /** One more message the person has not seen. Only ever counts the bot's. */
  async markUnread(conversationId: string): Promise<Conversation | undefined> {
    const conversation = this.#conversations.get(conversationId);
    if (!conversation || conversation.kind !== 'dm') return undefined;
    conversation.unread += 1;
    await this.#persistConversations();
    return conversation;
  }

  /** The person is looking at this chat. */
  async markRead(conversationId: string): Promise<Conversation | undefined> {
    const conversation = this.#conversations.get(conversationId);
    if (!conversation || conversation.unread === 0) return conversation;
    conversation.unread = 0;
    await this.#persistConversations();
    return conversation;
  }

  async #touch(message: Message): Promise<void> {
    const conversation = this.#conversations.get(message.conversationId);
    if (!conversation) return;
    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessagePreview = preview(messageText(message));
    await this.#persistConversations();
  }

  /** A DM only ever contains the person and that one bot. */
  #assertSpeaker(message: Message): void {
    const conversation = this.#conversations.get(message.conversationId);
    if (!conversation) throw new Error(`No conversation ${message.conversationId}`);
    if (conversation.kind === 'dm') {
      if (message.author.kind === 'user' && message.author.id === USER_ID) return;
      if (message.author.kind === 'agent' && message.author.id === conversation.agentId) return;
      throw new Error('A bot cannot write in another bot’s chat.');
    }
    if (message.author.kind === 'agent' && conversation.participants.includes(message.author.id)) {
      return;
    }
    throw new Error('A bot cannot write in another bot’s chat.');
  }

  async #persistConversations(): Promise<void> {
    await writeJson(this.project.paths.conversationsFile, [...this.#conversations.values()]);
  }

  async #readMessages(conversationId: string): Promise<Message[]> {
    const rows = await readJsonl<unknown>(this.project.paths.messagesFile(conversationId));
    const parsed: Message[] = [];
    for (const row of rows) {
      const result = MessageSchema.safeParse(row);
      if (result.success) parsed.push(result.data);
    }
    return parsed;
  }

  #remember(conversationId: string, messages: Message[]): void {
    this.#cache.set(conversationId, messages);
    while (this.#cache.size > MAX_CACHED_CHATS) {
      const oldest = this.#cache.keys().next().value;
      if (!oldest || oldest === conversationId) break;
      this.#cache.delete(oldest);
    }
  }
}

function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_PREVIEW ? `${flat.slice(0, MAX_PREVIEW - 1)}…` : flat;
}

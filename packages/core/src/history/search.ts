import { USER_ID, messageText, type Conversation, type Message } from '@openbot/shared';
import type { HistoryHit } from '../skills/skill.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SearchHistoryOptions {
  agentId: string;
  query?: string;
  since?: string;
  until?: string;
  limit: number;
  conversations: Conversation[];
  loadMessages(conversationId: string): Promise<Message[]>;
  agentName(id: string): string | undefined;
}

/**
 * Newest matching messages first. Walks recent chats first and stops once
 * older ones cannot beat the hits already found.
 */
export async function searchHistory(options: SearchHistoryOptions): Promise<HistoryHit[]> {
  const needle = options.query?.trim().toLowerCase() ?? '';
  const from = options.since ? Date.parse(options.since) : undefined;
  const to = options.until ? Date.parse(options.until) + DAY_MS : undefined;

  const conversations = options.conversations
    .filter((conversation) => conversation.participants.includes(options.agentId))
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));

  const hits: HistoryHit[] = [];

  for (const conversation of conversations) {
    const newest = Date.parse(conversation.lastMessageAt ?? conversation.createdAt);
    if (Number.isNaN(newest)) continue;
    if (hits.length >= options.limit) {
      const oldestHit = hits[hits.length - 1];
      if (oldestHit && newest < Date.parse(oldestHit.at)) break;
    }

    const where = describeConversation(conversation, options.agentId, options.agentName);
    const messages = await options.loadMessages(conversation.id);
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (!message) continue;
      const text = messageText(message);
      if (!text) continue;
      const at = Date.parse(message.createdAt);
      if (from !== undefined && at < from) continue;
      if (to !== undefined && at >= to) continue;
      const index = needle ? text.toLowerCase().indexOf(needle) : 0;
      if (index === -1) continue;
      hits.push({
        where,
        author: message.author.name,
        at: message.createdAt,
        excerpt: needle ? excerpt(text, index) : summarise(text),
      });
    }

    hits.sort((a, b) => b.at.localeCompare(a.at));
    if (hits.length > options.limit) hits.length = options.limit;
  }

  return hits;
}

function describeConversation(
  conversation: Conversation,
  agentId: string,
  agentName: (id: string) => string | undefined,
): string {
  if (conversation.kind === 'dm') return 'in your chat';
  const other = conversation.participants.find((id) => id !== agentId && id !== USER_ID);
  const name = other ? agentName(other) : undefined;
  return name ? `with ${name}` : 'with a colleague';
}

function summarise(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > 320 ? `${text.slice(0, 320)}…` : text;
}

function excerpt(body: string, index: number): string {
  const start = Math.max(0, index - 120);
  const text = body
    .slice(start, index + 200)
    .replace(/\s+/g, ' ')
    .trim();
  return `${start > 0 ? '…' : ''}${text}${index + 200 < body.length ? '…' : ''}`;
}

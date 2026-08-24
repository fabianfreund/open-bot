export type ProjectId = string;
export type AgentId = string;
export type ConversationId = string;
export type MessageId = string;
export type TurnId = string;

/** The single human participant. Agents address the user with this id. */
export const USER_ID = 'user' as const;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Small, dependency-free, URL-safe id. Not cryptographically strong, ids are
 * local to a project and never used as secrets.
 */
export function newId(prefix: string, size = 12): string {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length] ?? 'x';
  return `${prefix}_${out}`;
}

/** Turns a display name into a filesystem-safe folder name. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'agent';
}

/** Deterministic conversation id for the user's direct chat with an agent. */
export function dmConversationId(agentId: AgentId): ConversationId {
  return `dm.${agentId}`;
}

/** Deterministic conversation id for an agent-to-agent channel. */
export function agentChannelId(a: AgentId, b: AgentId): ConversationId {
  return `a2a.${[a, b].sort().join('.')}`;
}

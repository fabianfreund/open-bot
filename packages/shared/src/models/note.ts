import { z } from 'zod';

/**
 * One thing the team decided, agreed, or learned. Notes live in a small SQLite
 * file inside the project, not in the provider's context, so a team can build
 * up years of them without any of it costing a turn.
 *
 * `summary` is the whole point: one sentence, so a search can hand back thirty
 * notes for the price of a paragraph. `body` is optional and fetched one note
 * at a time, only when a bot decides it needs the detail.
 */
export const NoteSchema = z.object({
  /** Small integer, so a bot can quote it back to fetch the body. */
  id: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** One sentence. What a bot reads when it is scanning, not reading. */
  summary: z.string().min(1),
  /** The long version, if there is one. Empty when the sentence was enough. */
  body: z.string().default(''),
  tags: z.array(z.string()).default([]),
  /** Display name of the bot that asked for this to be kept. */
  author: z.string(),
  authorId: z.string(),
  /**
   * Set when a later note replaced this one. Superseded notes drop out of
   * search but are never deleted, so a wrong answer can still be traced.
   */
  supersededBy: z.number().int().positive().nullable().default(null),
});
export type Note = z.infer<typeof NoteSchema>;

/** What the librarian produces from an agent's raw text. */
export const NoteDraftSchema = z.object({
  summary: z.string().min(1).max(200),
  body: z.string().default(''),
  tags: z.array(z.string()).max(6).default([]),
});
export type NoteDraft = z.infer<typeof NoteDraftSchema>;

export const NoteQuerySchema = z.object({
  /** Words to look for. Empty means everything in range. */
  text: z.string().default(''),
  /** A note must carry all of these to match. */
  tags: z.array(z.string()).default([]),
  /** Inclusive day bounds, as YYYY-MM-DD. */
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(12),
});
export type NoteQuery = z.infer<typeof NoteQuerySchema>;

/** What happened when a bot asked for something to be remembered. */
export type NoteOutcome =
  | { action: 'kept'; note: Note }
  | { action: 'updated'; note: Note; replaced: number }
  | { action: 'skipped'; reason: string };

/**
 * Tags are matched exactly, so they are normalised once here rather than
 * hopefully at every call site. `Brand Voice` and `brand-voice` are one tag.
 */
export function normaliseTag(input: string): string {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function normaliseTags(input: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of input) {
    const clean = normaliseTag(tag);
    if (clean) seen.add(clean);
  }
  return [...seen].sort();
}

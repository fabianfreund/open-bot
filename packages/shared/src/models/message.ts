import { z } from 'zod';
import { CardSchema } from './card.js';

export const AuthorSchema = z.object({
  kind: z.enum(['user', 'agent', 'system']),
  /** `user`, an agent id, or `system`. */
  id: z.string(),
  name: z.string(),
});
export type Author = z.infer<typeof AuthorSchema>;

/**
 * A structured step from a provider turn: the trace the UI shows above or
 * inside a message ("Ran `ls`", "Edited src/index.ts", "Messaged Bagel Social").
 */
export const TracePartSchema = z.object({
  id: z.string(),
  kind: z.enum(['reasoning', 'command', 'file-change', 'tool', 'web-search', 'todo', 'error']),
  title: z.string(),
  detail: z.string().optional(),
  status: z.enum(['in-progress', 'completed', 'failed']).default('completed'),
  /**
   * How much of the message had been said when this happened, in characters.
   * Lets the chat show a step where it actually occurred, rather than piling
   * every step above the answer.
   */
  at: z.number().default(0),
});
export type TracePart = z.infer<typeof TracePartSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  author: AuthorSchema,
  /** Markdown. */
  body: z.string().default(''),
  parts: z.array(TracePartSchema).default([]),
  /** Interactive blocks rendered under the text. */
  cards: z.array(CardSchema).default([]),
  createdAt: z.string(),
  /** True while the provider is still appending to `body`. */
  streaming: z.boolean().default(false),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

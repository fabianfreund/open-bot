import { z } from 'zod';

/**
 * `dm`     , the user talking to one agent
 * `channel`, one agent talking to another (the user can read along)
 */
export const ConversationKindSchema = z.enum(['dm', 'channel']);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  kind: ConversationKindSchema,
  title: z.string().default(''),
  /** `user` and/or agent ids. */
  participants: z.array(z.string()),
  /**
   * The agent that answers by default. In a channel both participants can
   * answer, so the turn runner is told which agent is replying.
   */
  agentId: z.string(),
  /**
   * Provider-side handles, keyed by agent id (for Codex: the resumable thread).
   * Each agent keeps its own thread even inside a shared channel.
   */
  providerThreads: z.record(z.string(), z.string()).default({}),
  createdAt: z.string(),
  lastMessageAt: z.string().optional(),
  lastMessagePreview: z.string().optional(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

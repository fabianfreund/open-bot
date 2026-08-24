import { z } from 'zod';

/** POST /api/agents. The "hire a bot" payload. Deliberately small. */
export const CreateAgentRequestSchema = z.object({
  name: z.string().min(1),
  role: z.string().default(''),
  instructions: z.string().default(''),
  /** Overrides the deterministic face derived from the agent id. */
  avatarConfig: z.record(z.string(), z.unknown()).optional(),
  color: z.string().optional(),
  provider: z.string().optional(),
  providerOptions: z.record(z.string(), z.unknown()).optional(),
  sharedWorkspaces: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  createdBy: z.string().optional(),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

export const UpdateAgentRequestSchema = CreateAgentRequestSchema.partial().extend({
  archived: z.boolean().optional(),
});
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>;

/** POST /api/conversations/:id/messages */
export const SendMessageRequestSchema = z.object({
  text: z.string().min(1),
  /** Absolute paths to local images the provider can read. */
  images: z.array(z.string()).default([]),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

/** POST /api/conversations/:id/answer. The person answered an inline card. */
export const AnswerCardRequestSchema = z.object({
  messageId: z.string(),
  cardId: z.string(),
  answer: z.string().min(1),
});
export type AnswerCardRequest = z.infer<typeof AnswerCardRequestSchema>;

/** POST /api/skills/:id/invoke. Used by the MCP bridge on an agent's behalf. */
export const InvokeSkillRequestSchema = z.object({
  agentId: z.string(),
  conversationId: z.string().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
});
export type InvokeSkillRequest = z.infer<typeof InvokeSkillRequestSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
  version: z.string(),
  protocol: z.number(),
  projectName: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

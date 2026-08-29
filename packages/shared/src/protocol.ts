import { z } from 'zod';

/** PATCH /api/project. What the settings page can change about a team. */
export const UpdateProjectRequestSchema = z.object({
  name: z.string().min(1).optional(),
  goal: z.string().optional(),
  userName: z.string().min(1).optional(),
  sessionMinutes: z.number().int().min(5).optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

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
  pinned: z.boolean().optional(),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

export const UpdateAgentRequestSchema = CreateAgentRequestSchema.partial().extend({
  archived: z.boolean().optional(),
});
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>;

/** POST /api/conversations/:id/messages */
export const SendMessageRequestSchema = z
  .object({
    text: z.string().default(''),
    /** Project-relative paths of files already saved (usually under `inbox/`). */
    attachments: z.array(z.string()).default([]),
  })
  .refine((value) => value.text.trim().length > 0 || value.attachments.length > 0, {
    message: 'Nothing to send.',
  });
export type SendMessageRequest = z.input<typeof SendMessageRequestSchema>;

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

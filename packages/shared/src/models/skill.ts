import { z } from 'zod';

/** Skill metadata as exposed over the API and to the UI. */
export const SkillInfoSchema = z.object({
  /** Snake-case; becomes the MCP tool name the provider sees. */
  id: z.string(),
  title: z.string(),
  description: z.string(),
  /** JSON Schema for the skill's input. */
  inputSchema: z.record(z.string(), z.unknown()),
  /** Where the tool came from: `builtin` or `team`. */
  source: z.string().default('builtin'),
  /** Skills that change the team or the outside world; surfaced in the UI. */
  sensitive: z.boolean().default(false),
});
export type SkillInfo = z.infer<typeof SkillInfoSchema>;

export const SkillResultSchema = z.object({
  ok: z.boolean(),
  /** Text handed back to the calling agent. */
  content: z.string(),
  /** Optional structured payload for richer providers. */
  data: z.unknown().optional(),
});
export type SkillResult = z.infer<typeof SkillResultSchema>;

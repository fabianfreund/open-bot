import { z } from 'zod';

/**
 * Faces come from `react-nice-avatar`, which derives a deterministic avatar
 * from any string. We store the seed, not the pixels; `config` is only written
 * once someone customises the face by hand.
 */
export const AgentAvatarSchema = z.object({
  seed: z.string().default(''),
  config: z.record(z.string(), z.unknown()).optional(),
  /** Accent colour for status dots, mentions, and the typing indicator. */
  color: z.string().default('#e05b8a'),
});
export type AgentAvatar = z.infer<typeof AgentAvatarSchema>;

/**
 * Where an agent is allowed to work.
 * - `own`   : always its private folder, `agents/<slug>/workspace`
 * - `shared`: additional project-relative folders (e.g. `main`, `subprojects/shop`)
 */
export const AgentWorkspaceSchema = z.object({
  shared: z.array(z.string()).default([]),
  /** Codex sandbox level for this agent's turns. */
  sandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']).default('workspace-write'),
});
export type AgentWorkspace = z.infer<typeof AgentWorkspaceSchema>;

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  /** Folder name under `agents/`. Stable; renaming the agent does not move it. */
  slug: z.string(),
  name: z.string(),
  /** One-line description shown next to the name in the sidebar. */
  role: z.string().default(''),
  /** The agent's system prompt. Written to `agents/<slug>/AGENTS.md` for the provider. */
  instructions: z.string().default(''),
  avatar: AgentAvatarSchema.prefault({}),
  /** Id of a registered provider, e.g. `codex`. */
  provider: z.string().default('codex'),
  /** Provider-specific knobs. Validated by the provider, not here. */
  providerOptions: z.record(z.string(), z.unknown()).default({}),
  workspace: AgentWorkspaceSchema.prefault({}),
  /** Enabled skill ids, or `['*']` for every registered skill. */
  skills: z.array(z.string()).default(['*']),
  /** `user`, or the id of the agent that hired this one. */
  createdBy: z.string().default('user'),
  createdAt: z.string(),
  updatedAt: z.string(),
  archived: z.boolean().default(false),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const AgentDraftSchema = AgentDefinitionSchema.partial({
  id: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
}).extend({ name: z.string().min(1) });
export type AgentDraft = z.input<typeof AgentDraftSchema>;

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'waiting-on-user' | 'error';

/** Runtime view of an agent: its definition plus live state the UI needs. */
export interface AgentView {
  definition: AgentDefinition;
  status: AgentStatus;
  statusDetail?: string;
  unread: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
}

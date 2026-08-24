import { z } from 'zod';
import { PROJECT_FILE_VERSION } from '../constants.js';

export const ProjectSettingsSchema = z.object({
  /** Port the local server listens on. */
  port: z.number().int().min(1).max(65535).default(7788),
  /**
   * Interface to bind. `127.0.0.1` keeps it on-machine; `0.0.0.0` lets a
   * Tailscale peer reach it. See docs/07-networking.md.
   */
  bindHost: z.string().default('127.0.0.1'),
  /** How the human is addressed in prompts and message authorship. */
  userName: z.string().default('You'),
  /**
   * How long a bot keeps a chat in mind after the last message. Once a chat
   * goes quiet the session ends: the provider thread is dropped, the bot shows
   * as offline, and the next message starts a fresh one. Nothing is lost, and
   * long-idle chats stop carrying context nobody is using.
   */
  sessionMinutes: z.number().int().min(5).default(60),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

/** Defaults applied to every newly created agent. */
export const ProjectDefaultsSchema = z.object({
  provider: z.string().default('codex'),
  /**
   * Empty on purpose. With no model named, Codex uses whichever one the person
   * already configured in `~/.codex/config.toml`, which is guaranteed to work
   * on their plan. Naming one here breaks any account that cannot use it.
   */
  providerOptions: z.record(z.string(), z.unknown()).default({}),
  skills: z.array(z.string()).default(['*']),
});
export type ProjectDefaults = z.infer<typeof ProjectDefaultsSchema>;

/** Reference to an agent stored in `agents/<slug>/agent.json`. */
export const AgentRefSchema = z.object({ id: z.string(), slug: z.string() });
export type AgentRef = z.infer<typeof AgentRefSchema>;

/** The contents of `openbot.json`, the source of truth for a project. */
export const ProjectFileSchema = z.object({
  version: z.number().default(PROJECT_FILE_VERSION),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  settings: ProjectSettingsSchema.prefault({}),
  defaults: ProjectDefaultsSchema.prefault({}),
  agents: z.array(AgentRefSchema).default([]),
  /** Project-relative folders agents may be granted access to, beyond their own. */
  workspaces: z.array(z.string()).default(['main']),
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

/** A project as the API exposes it: the manifest plus its absolute location. */
export interface ProjectInfo {
  file: ProjectFile;
  root: string;
}

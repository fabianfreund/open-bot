import type { z } from 'zod';
import type {
  AgentDefinition,
  Card,
  CreateAgentRequest,
  SkillInfo,
  SkillResult,
  UpdateAgentRequest,
} from '@openbot/shared';

/**
 * The slice of the runtime a skill is allowed to touch. Keeping this an
 * interface (rather than the runtime itself) keeps skills testable and stops
 * them reaching into internals.
 */
/** One older message a bot found when it went looking. */
export interface HistoryHit {
  /** Where it was said, in words: "in your chat" or "with Builder". */
  where: string;
  author: string;
  /** ISO timestamp. */
  at: string;
  excerpt: string;
}

export interface SkillHost {
  readonly projectRoot: string;
  readonly projectName: string;
  /** Live colleagues. Pass `includeRetired` to see the ones who have left. */
  listAgents(options?: { includeRetired?: boolean }): AgentDefinition[];
  getAgent(idOrName: string): AgentDefinition | undefined;
  createAgent(request: CreateAgentRequest): Promise<AgentDefinition>;
  /** Changes a bot that already exists: its name, its brief, what it may use. */
  updateAgent(id: string, patch: UpdateAgentRequest): Promise<AgentDefinition>;
  /** Every skill that exists, so a bot can see what it may hand out. */
  listSkills(): SkillInfo[];
  /**
   * Sends a message from one agent to another. The recipient answers in its own
   * turn, and the answer goes back to the sender in `originConversationId`,
   * never to the user as if the recipient had spoken there.
   */
  sendToAgent(options: {
    from: string;
    to: string;
    text: string;
    originConversationId: string;
    wait: boolean;
  }): Promise<string | null>;
  /** Posts a message from an agent into the user's chat with that agent. */
  sendToUser(options: { from: string; text: string; cards?: Card[] }): Promise<void>;
  /** Absolute path to an agent's own workspace. */
  workspaceFor(agentId: string): string;
  /**
   * Searches everything an agent has ever been part of. A provider thread only
   * carries so much, so this is how a bot reaches what it no longer remembers.
   */
  searchHistory(options: {
    agentId: string;
    /** Words to look for. Empty means everything in the date range. */
    query?: string;
    /** Inclusive day bounds, as YYYY-MM-DD. */
    since?: string;
    until?: string;
    limit: number;
  }): Promise<HistoryHit[]>;
}

export interface SkillContext {
  host: SkillHost;
  /** The agent that called the skill. */
  agent: AgentDefinition;
  /** The conversation the call came from. */
  conversationId: string;
}

/**
 * A capability an agent can invoke. Add a file under `skills/builtin/`, export
 * a `Skill`, register it, nothing else changes.
 */
export interface Skill<TInput = unknown> {
  /** Snake-case. Becomes the tool name the model sees. */
  id: string;
  title: string;
  /** Written for the model, in the same plain language the UI uses. */
  description: string;
  input: z.ZodType<TInput>;
  /** Marks skills that change the team or reach the user. */
  sensitive?: boolean;
  run(input: TInput, context: SkillContext): Promise<SkillResult>;
}

export function ok(content: string, data?: unknown): SkillResult {
  return data === undefined ? { ok: true, content } : { ok: true, content, data };
}

export function fail(content: string): SkillResult {
  return { ok: false, content };
}

/**
 * Checks an allow-list before it is saved. A typo here would quietly take away
 * something a bot needs, and nobody would find out until it tried to work.
 */
export function unknownSkills(ids: string[], host: SkillHost): string | null {
  if (ids.includes('*')) return null;
  const known = host.listSkills().map((s) => s.id);
  const missing = ids.filter((id) => !known.includes(id));
  if (missing.length === 0) return null;
  return `No skill called ${missing.join(', ')}. Choose from: ${known.join(', ')}, or "*" for all.`;
}

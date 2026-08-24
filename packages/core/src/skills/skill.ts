import type { z } from 'zod';
import type { AgentDefinition, Card, CreateAgentRequest, SkillResult } from '@openbot/shared';

/**
 * The slice of the runtime a skill is allowed to touch. Keeping this an
 * interface (rather than the runtime itself) keeps skills testable and stops
 * them reaching into internals.
 */
export interface SkillHost {
  readonly projectRoot: string;
  readonly projectName: string;
  listAgents(): AgentDefinition[];
  getAgent(idOrName: string): AgentDefinition | undefined;
  createAgent(request: CreateAgentRequest): Promise<AgentDefinition>;
  /**
   * Sends a message from one agent to another. The recipient answers in its own
   * turn; the reply is relayed back into `originConversationId`.
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

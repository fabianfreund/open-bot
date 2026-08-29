import type {
  AgentDefinition,
  Conversation,
  Message,
  ProviderHealth,
  ProviderInfo,
  ProviderStreamEvent,
  SkillInfo,
} from '@openbot/shared';

/** Everything a provider is handed for one turn. */
export interface ProviderContext {
  agent: AgentDefinition;
  conversation: Conversation;
  /** Absolute path the agent should treat as its working directory. */
  workspaceDir: string;
  /** Extra absolute paths the agent may touch. */
  additionalDirs: string[];
  projectRoot: string;
  /** Skills this agent may call, already filtered by its allow-list. */
  skills: SkillInfo[];
  /** Everything needed for the provider to reach OpenBot's skill endpoint. */
  skillBridge: SkillBridgeConfig;
  /** Prior messages, oldest first, excluding the one being answered. */
  history: Message[];
  /** Provider handle from the last turn, if any (Codex: the thread id). */
  providerThreadId?: string;
  emit(event: ProviderStreamEvent): void;
  signal: AbortSignal;
}

/** How a provider subprocess calls back into OpenBot to run a skill. */
export interface SkillBridgeConfig {
  /** Absolute path to the stdio MCP bridge entrypoint. */
  bridgePath: string;
  /** Base URL of the running OpenBot server. */
  serverUrl: string;
  token: string;
  agentId: string;
  conversationId: string;
}

export interface ProviderRunInput {
  text: string;
  /** Absolute paths to local images. */
  images: string[];
}

export interface ProviderRunResult {
  finalText: string;
  providerThreadId?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * A model backend. Implement this to add Claude, a local model, or a plain
 * HTTP API, nothing else in the app needs to change.
 */
export interface Provider {
  readonly info: ProviderInfo;
  run(input: ProviderRunInput, context: ProviderContext): Promise<ProviderRunResult>;
  /** Reports whether the provider is usable, e.g. whether Codex is signed in. */
  health(): Promise<ProviderHealth>;
  /** Chat-facing text for a thrown error. The runner never learns the backend. */
  mapError?(err: unknown): string;
  /** Drops a cached backend session when a thread is forgotten or the team closes. */
  release?(agentId?: string, conversationId?: string): void;
}

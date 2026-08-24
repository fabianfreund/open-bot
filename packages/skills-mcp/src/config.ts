/**
 * The bridge is launched by the provider, not by a human, so all of its
 * configuration arrives through the environment.
 */
export interface BridgeConfig {
  serverUrl: string;
  token: string;
  agentId: string;
  conversationId: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const missing: string[] = [];
  const need = (key: string): string => {
    const value = env[key];
    if (!value) missing.push(key);
    return value ?? '';
  };

  const config: BridgeConfig = {
    serverUrl: need('OPENBOT_SERVER_URL').replace(/\/$/, ''),
    token: need('OPENBOT_TOKEN'),
    agentId: need('OPENBOT_AGENT_ID'),
    conversationId: need('OPENBOT_CONVERSATION_ID'),
  };

  if (missing.length) {
    throw new Error(`openbot-skills-mcp is missing ${missing.join(', ')}`);
  }
  return config;
}

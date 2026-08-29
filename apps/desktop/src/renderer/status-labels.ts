import type { AgentStatus, AgentView } from '@openbot/shared';

/** Only what the bot is doing right now. Being idle or offline is not news. */
const LABEL: Partial<Record<AgentStatus, string>> = {
  thinking: 'thinking',
  working: 'working',
  'waiting-on-user': 'waiting on you',
  error: 'hit a problem',
};

/**
 * What a bot is up to, in words, or nothing when it is simply there. The
 * provider's own detail wins: "Searched the files" beats "working".
 */
export function activity(agent: AgentView): string | undefined {
  const label = LABEL[agent.status];
  if (!label) return undefined;
  return agent.statusDetail ?? label;
}

/** Statuses that are something happening, rather than a state of being. */
export function busy(status: AgentStatus): boolean {
  return status === 'thinking' || status === 'working';
}

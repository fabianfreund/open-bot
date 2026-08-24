import type { AgentDefinition, Message } from '@openbot/shared';

const RECAP_LIMIT = 12;

/**
 * Codex reads `AGENTS.md` from the working directory, but a new thread also
 * gets the brief inline so behaviour never depends on file discovery.
 */
export function buildBrief(agent: AgentDefinition): string {
  return [
    `You are ${agent.name}${agent.role ? `, ${agent.role}` : ''}.`,
    agent.instructions.trim(),
    'You are chatting with a person who is not a developer. Reply the way a good',
    'colleague would: plain sentences, no jargon, no code unless they asked for code.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Codex keeps thread history itself, so a recap is only needed when a
 * conversation starts a fresh thread over an existing chat log.
 */
export function buildRecap(history: Message[]): string {
  if (history.length === 0) return '';
  const recent = history.slice(-RECAP_LIMIT);
  const lines = recent.map((m) => `${m.author.name}: ${m.body.replace(/\s+/g, ' ').slice(0, 400)}`);
  return ['Earlier in this chat:', ...lines].join('\n');
}

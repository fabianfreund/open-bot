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
 * conversation starts a fresh thread over an existing chat log. It says what
 * it left out, because a bot that knows it is missing something can go and
 * find it rather than guessing.
 */
export function buildRecap(history: Message[]): string {
  if (history.length === 0) return '';
  const recent = history.slice(-RECAP_LIMIT);
  const dropped = history.length - recent.length;
  const lines = recent.map((m) => `${m.author.name}: ${m.body.replace(/\s+/g, ' ').slice(0, 400)}`);
  const header =
    dropped > 0
      ? `The last ${recent.length} of ${history.length} messages in this chat. ${dropped} earlier ones are not here; look_back searches them.`
      : 'Earlier in this chat:';
  return [header, ...lines].join('\n');
}

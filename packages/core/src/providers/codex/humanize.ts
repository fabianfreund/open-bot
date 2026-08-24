import type { ProviderStreamEvent } from '@openbot/shared';

type TraceEvent = Extract<ProviderStreamEvent, { kind: 'trace' }>;
type Status = TraceEvent['status'];

/**
 * Codex reports what it did in developer terms. The people using OpenBot are
 * not developers, so every trace line gets a plain-language title; the raw
 * detail stays available for anyone who wants to expand it.
 */

const COMMAND_PATTERNS: Array<[RegExp, string]> = [
  [/^(ls|find|fd|tree)\b/, 'Looked through the files'],
  [/^(cat|head|tail|sed -n|bat)\b/, 'Read a file'],
  [/^(rg|grep|ag)\b/, 'Searched the files'],
  [/^(mkdir|touch|cp|mv|rm)\b/, 'Reorganised files'],
  [/^(git)\b/, 'Checked version history'],
  [/^(curl|wget)\b/, 'Fetched something from the web'],
  [/^(npm|pnpm|yarn|node|python3?|pytest|make)\b/, 'Ran a build or script'],
];

/** Strips the `bash -lc '…'` wrapper Codex puts around shell commands. */
export function unwrapCommand(command: string): string {
  const match = command.match(/^\w*(?:bash|sh|zsh)\s+-l?c\s+(['"])([\s\S]*)\1$/);
  return (match?.[2] ?? command).trim();
}

export function describeCommand(command: string, status: Status): TraceEvent['title'] {
  const inner = unwrapCommand(command);
  for (const [pattern, label] of COMMAND_PATTERNS) {
    if (pattern.test(inner)) return status === 'failed' ? `${label}, failed` : label;
  }
  return status === 'failed' ? 'Ran a command, failed' : 'Ran a command';
}

export function describeFileChanges(
  changes: Array<{ path: string; kind: 'add' | 'delete' | 'update' }>,
): string {
  if (changes.length === 0) return 'Changed nothing';
  if (changes.length === 1) {
    const only = changes[0]!;
    const name = only.path.split('/').pop() ?? only.path;
    const verb = only.kind === 'add' ? 'Created' : only.kind === 'delete' ? 'Deleted' : 'Updated';
    return `${verb} ${name}`;
  }
  return `Updated ${changes.length} files`;
}

/** Skill calls read as team actions, not tool invocations. */
export function describeSkillCall(tool: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const target = typeof a.to === 'string' ? a.to : undefined;
  switch (tool) {
    case 'list_bots':
      return 'Checked who is on the team';
    case 'hire_bot':
      return typeof a.name === 'string' ? `Hired ${a.name}` : 'Hired a new bot';
    case 'message_bot':
      return target ? `Messaged ${target}` : 'Messaged a colleague';
    case 'ask_user':
      return 'Asked you a question';
    case 'remember':
      return typeof a.title === 'string' ? `Noted "${a.title}"` : 'Wrote a note for the team';
    default:
      return `Used ${tool.replace(/_/g, ' ')}`;
  }
}

export function truncate(text: string, max = 2000): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}\n…` : trimmed;
}

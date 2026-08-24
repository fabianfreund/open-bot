import type { AgentStatus } from '@openbot/shared';

const COLOR: Record<AgentStatus, string> = {
  idle: 'transparent',
  thinking: '#4f8ef7',
  working: '#e0a13a',
  'waiting-on-user': '#2fb673',
  error: '#e0574a',
};

export function StatusDot({ status }: { status: AgentStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      className="size-2 rounded-full"
      style={{ background: COLOR[status] }}
      aria-label={status}
    />
  );
}

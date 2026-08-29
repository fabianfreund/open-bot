import type { AgentStatus } from '@openbot/shared';
import { busy } from '../status-labels.js';
import {
  STATUS_ERROR,
  STATUS_IDLE,
  STATUS_INFO,
  STATUS_OK,
  STATUS_WARN,
} from '../status-colors.js';

/**
 * Green is there and free. Grey is still on the team, but not holding this
 * chat in mind until you say something.
 */
const COLOR: Record<AgentStatus, string> = {
  offline: STATUS_IDLE,
  idle: STATUS_OK,
  thinking: STATUS_INFO,
  working: STATUS_WARN,
  'waiting-on-user': STATUS_OK,
  error: STATUS_ERROR,
};

export function StatusDot({
  status,
  className = 'size-2',
}: {
  status: AgentStatus;
  className?: string;
}) {
  // The colour lives in a variable so the pulse can fade the fill on its own,
  // leaving the ring around it solid.
  return (
    <span
      className={`${className} rounded-full bg-[var(--dot)] ${busy(status) ? 'status-pulse' : ''}`}
      style={{ '--dot': COLOR[status] } as React.CSSProperties}
      aria-label={status}
    />
  );
}

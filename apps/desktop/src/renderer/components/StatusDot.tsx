import type { AgentStatus } from '@openbot/shared';
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
  return (
    <span
      className={`${className} rounded-full`}
      style={{ background: COLOR[status] }}
      aria-label={status}
    />
  );
}

import { useMemo } from 'react';
import NiceAvatar, { genConfig } from 'react-nice-avatar';
import type { AgentDefinition, AgentStatus } from '@openbot/shared';
import { StatusDot } from './StatusDot.js';

interface Props {
  agent: AgentDefinition;
  size?: number;
  /** Shows a dot on the face, the way a chat app shows who is around. */
  status?: AgentStatus;
}

/**
 * A face per bot, derived from its slug so it never changes, and overridable
 * once someone edits it.
 */
export function Avatar({ agent, size = 34, status }: Props) {
  const config = useMemo(
    () =>
      genConfig(
        (agent.avatar.config as Parameters<typeof genConfig>[0]) ?? agent.avatar.seed ?? agent.slug,
      ),
    [agent.avatar.config, agent.avatar.seed, agent.slug],
  );
  return (
    <div style={{ width: size, height: size }} className="relative shrink-0">
      <NiceAvatar style={{ width: size, height: size }} shape="circle" {...config} />
      {status && (
        <StatusDot
          status={status}
          className="absolute right-0 bottom-0 size-[30%] min-h-2 min-w-2 ring-2 ring-[var(--color-sidebar)]"
        />
      )}
    </div>
  );
}

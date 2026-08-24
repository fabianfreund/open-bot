import { useMemo } from 'react';
import NiceAvatar, { genConfig } from 'react-nice-avatar';
import type { AgentDefinition } from '@openbot/shared';

interface Props {
  agent: AgentDefinition;
  size?: number;
}

/**
 * A face per bot, derived from its slug so it never changes, and overridable
 * once someone edits it.
 */
export function Avatar({ agent, size = 34 }: Props) {
  const config = useMemo(
    () => genConfig((agent.avatar.config as Parameters<typeof genConfig>[0]) ?? agent.avatar.seed ?? agent.slug),
    [agent.avatar.config, agent.avatar.seed, agent.slug],
  );
  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <NiceAvatar style={{ width: size, height: size }} shape="circle" {...config} />
    </div>
  );
}

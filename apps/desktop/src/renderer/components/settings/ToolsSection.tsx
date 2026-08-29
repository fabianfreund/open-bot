import type { AgentView, SkillInfo } from '@openbot/shared';
import { useStore } from '../../state/store.js';

/**
 * Everything registered, straight from the server. A tool added to the
 * registry shows up here without anyone touching this file.
 */
export function ToolsSection() {
  const skills = useStore((s) => s.skills);
  const agents = useStore((s) => s.agents);

  return (
    <div className="max-w-[640px]">
      {skills.map((skill) => (
        <div
          key={skill.id}
          className="flex items-baseline justify-between gap-6 border-b border-[var(--color-line)] py-3 last:border-0"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">{skill.title}</span>
            <span className="block text-[12px] text-[var(--color-muted)]">{skill.description}</span>
          </span>
          <span className="shrink-0 text-right text-[12px] text-[var(--color-muted)]">
            {skill.source === 'team' ? 'Team · ' : ''}
            {holders(skill, agents)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Who may use it, counted the way a person would say it. */
function holders(skill: SkillInfo, agents: AgentView[]): string {
  const count = agents.filter(
    (a) => a.definition.skills.includes('*') || a.definition.skills.includes(skill.id),
  ).length;
  if (agents.length > 0 && count === agents.length) return 'Everyone';
  if (count === 0) return 'Nobody';
  return count === 1 ? '1 bot' : `${count} bots`;
}

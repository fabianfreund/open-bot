import { useStore } from '../state/store.js';
import { Avatar } from './Avatar.js';
import { StatusDot } from './StatusDot.js';

interface Props {
  onNewBot(): void;
  onSettings(): void;
}

export function Sidebar({ onNewBot, onSettings }: Props) {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const selectAgent = useStore((s) => s.selectAgent);
  const link = useStore((s) => s.link);

  return (
    <aside className="flex w-[290px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-sidebar)]">
      <header className="drag flex h-14 items-center justify-end pr-3 pl-20">
        <button
          onClick={onNewBot}
          className="no-drag flex size-7 items-center justify-center rounded-md text-lg text-[var(--color-muted)] hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)]"
          title="New bot"
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {agents.map((agent) => {
          const active = agent.definition.id === activeAgentId;
          return (
            <button
              key={agent.definition.id}
              onClick={() => void selectAgent(agent.definition.id)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                active ? 'bg-[var(--color-raised)]' : 'hover:bg-white/4'
              }`}
            >
              <Avatar agent={agent.definition} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{agent.definition.name}</span>
                  <StatusDot status={agent.status} />
                </span>
                <span className="block truncate text-[12px] text-[var(--color-muted)]">
                  {agent.lastMessagePreview || agent.definition.role}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <footer className="flex items-center justify-between border-t border-[var(--color-line)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
          <span
            className="size-1.5 rounded-full"
            style={{ background: link === 'open' ? '#2fb673' : '#e0a13a' }}
          />
          {link === 'open' ? 'Connected' : 'Reconnecting'}
        </span>
        <button
          onClick={onSettings}
          className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          Settings
        </button>
      </footer>
    </aside>
  );
}

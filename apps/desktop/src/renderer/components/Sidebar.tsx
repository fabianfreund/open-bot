import { Plus, Settings } from 'lucide-react';
import type { AgentView } from '@openbot/shared';
import { useStore } from '../state/store.js';
import { Avatar } from './Avatar.js';

const ICON_BUTTON =
  'no-drag flex size-7 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)]';

interface Props {
  onNewBot(): void;
  onSettings(): void;
}

/** Anyone waiting on you comes first; everyone else keeps their order. */
function waiting(agents: AgentView[]): AgentView[] {
  return [...agents].sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0));
}

export function Sidebar({ onNewBot, onSettings }: Props) {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const selectAgent = useStore((s) => s.selectAgent);

  return (
    <aside className="flex w-[290px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-sidebar)]">
      <header className="drag flex h-14 items-center justify-end pr-3 pl-20">
        <button onClick={onNewBot} className={ICON_BUTTON} title="New bot">
          <Plus size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {waiting(agents).map((agent) => {
          const active = agent.definition.id === activeAgentId;
          return (
            <button
              key={agent.definition.id}
              onClick={() => void selectAgent(agent.definition.id)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                active ? 'bg-[var(--color-raised)]' : 'hover:bg-[var(--color-hover)]'
              }`}
            >
              <Avatar agent={agent.definition} status={agent.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {agent.definition.name}
                </span>
                <span className="block truncate text-[12px] text-[var(--color-muted)]">
                  {agent.lastMessagePreview || agent.definition.role}
                </span>
              </span>
              {agent.unread > 0 && (
                <span className="min-w-[18px] rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-center text-[11px] leading-none font-medium text-white">
                  {agent.unread > 99 ? '99+' : agent.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <footer className="flex items-center justify-end border-t border-[var(--color-line)] px-3 py-2">
        <button onClick={onSettings} className={ICON_BUTTON} title="Settings">
          <Settings size={16} />
        </button>
      </footer>
    </aside>
  );
}

import { useState } from 'react';
import { LogOut, Pin, Plus, Settings } from 'lucide-react';
import type { AgentView } from '@openbot/shared';
import { useStore } from '../state/store.js';
import { activity } from '../status-labels.js';
import { Avatar } from './Avatar.js';
import { BotMenu } from './BotMenu.js';
import { ICON_BUTTON } from './controls.js';

interface Props {
  onNewBot(): void;
  onSettings(): void;
}

/** Pinned first, then anyone waiting on you, then everyone else. */
export function orderBots(agents: AgentView[]): AgentView[] {
  return [...agents].sort((a, b) => {
    const pin = Number(b.definition.pinned) - Number(a.definition.pinned);
    if (pin !== 0) return pin;
    return Number(b.unread > 0) - Number(a.unread > 0);
  });
}

export function Sidebar({ onNewBot, onSettings }: Props) {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const selectAgent = useStore((s) => s.selectAgent);
  const changeBot = useStore((s) => s.changeBot);
  const markAgentRead = useStore((s) => s.markAgentRead);
  const view = useStore((s) => s.view);
  const connection = useStore((s) => s.connection);
  const leave = useStore((s) => s.leave);
  const [menu, setMenu] = useState<{ agent: AgentView; x: number; y: number }>();

  return (
    <aside className="flex w-[290px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-sidebar)]">
      <header className="drag flex h-14 items-center justify-end pr-3 pl-20">
        <button onClick={onNewBot} className={ICON_BUTTON} title="New bot">
          <Plus size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {orderBots(agents).map((agent) => {
          const active = view === 'chat' && agent.definition.id === activeAgentId;
          const doing = activity(agent);
          return (
            <button
              key={agent.definition.id}
              onClick={() => void selectAgent(agent.definition.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({
                  agent,
                  x: Math.min(event.clientX, window.innerWidth - 180),
                  y: Math.min(event.clientY, window.innerHeight - 90),
                });
              }}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                active ? 'bg-[var(--color-raised)]' : 'hover:bg-[var(--color-hover)]'
              }`}
            >
              <Avatar agent={agent.definition} status={agent.status} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="min-w-0 truncate text-[13px] font-medium">
                    {agent.definition.name}
                  </span>
                  {agent.definition.pinned && (
                    <Pin size={11} className="shrink-0 text-[var(--color-muted)]" />
                  )}
                </span>
                <span className="block truncate text-[12px] text-[var(--color-muted)]">
                  {doing ?? (agent.lastMessagePreview || agent.definition.role)}
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

      <footer className="flex items-center justify-between border-t border-[var(--color-line)] px-3 py-2">
        <button
          onClick={() => void leave()}
          title={connection?.mode === 'host' ? 'Close team' : 'Disconnect'}
          className={ICON_BUTTON}
        >
          <LogOut size={16} />
        </button>
        <button
          onClick={onSettings}
          title="Settings"
          className={`${ICON_BUTTON} ${
            view === 'settings' ? 'bg-[var(--color-raised)] text-[var(--color-ink)]' : ''
          }`}
        >
          <Settings size={16} />
        </button>
      </footer>

      {menu && (
        <BotMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={[
            {
              label: menu.agent.definition.pinned ? 'Unpin' : 'Pin',
              onSelect: () =>
                void changeBot(menu.agent.definition.id, {
                  pinned: !menu.agent.definition.pinned,
                }),
            },
            ...(menu.agent.unread > 0
              ? [
                  {
                    label: 'Mark as read',
                    onSelect: () => void markAgentRead(menu.agent.definition.id),
                  },
                ]
              : []),
          ]}
        />
      )}
    </aside>
  );
}

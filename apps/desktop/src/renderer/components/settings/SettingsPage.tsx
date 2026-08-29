import { useState } from 'react';
import { SlidersHorizontal, Users, Wrench, X } from 'lucide-react';
import type { Connection } from '../../../shared-ipc.js';
import { useStore } from '../../state/store.js';
import { ICON_BUTTON } from '../controls.js';
import { StatusInfo } from '../StatusInfo.js';
import { ThemeToggle } from '../ThemeToggle.js';
import { BotsSection } from './BotsSection.js';
import { GeneralSection } from './GeneralSection.js';
import { ToolsSection } from './ToolsSection.js';

const SECTIONS = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'bots', label: 'Bots', icon: Users },
  { id: 'tools', label: 'Tools', icon: Wrench },
] as const;

type Section = (typeof SECTIONS)[number]['id'];

/** Settings as a place in the app, in the pane the chat normally fills. */
export function SettingsPage({ connection }: { connection: Connection }) {
  const setView = useStore((s) => s.setView);
  const [section, setSection] = useState<Section>('general');

  return (
    <section className="rise-in flex min-w-0 flex-1 flex-col">
      <header className="drag flex h-14 items-center gap-2.5 border-b border-[var(--color-line)] px-6">
        <span className="text-[13.5px] font-medium">Settings</span>
        <div className="ml-auto flex items-center gap-1.5">
          <StatusInfo />
          <ThemeToggle />
          <button onClick={() => setView('chat')} className={ICON_BUTTON} title="Close">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-[170px] shrink-0 border-r border-[var(--color-line)] p-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                section === id
                  ? 'bg-[var(--color-raised)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)]'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {section === 'general' && <GeneralSection connection={connection} />}
          {section === 'bots' && <BotsSection />}
          {section === 'tools' && <ToolsSection />}
        </div>
      </div>
    </section>
  );
}

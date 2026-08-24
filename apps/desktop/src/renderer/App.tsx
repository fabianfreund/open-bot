import { useEffect, useState } from 'react';
import { ChatPane } from './components/ChatPane.js';
import { NewBotDialog } from './components/NewBotDialog.js';
import { Onboarding } from './components/Onboarding.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { Sidebar } from './components/Sidebar.js';
import { useStore } from './state/store.js';

export function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const connection = useStore((s) => s.connection);
  const error = useStore((s) => s.error);
  const init = useStore((s) => s.init);
  const attach = useStore((s) => s.attach);
  const leave = useStore((s) => s.leave);
  const hireBot = useStore((s) => s.hireBot);
  const setError = useStore((s) => s.setError);

  const [dialog, setDialog] = useState<'new-bot' | 'settings' | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  if (!bootstrap) return <div className="h-full" />;

  if (!connection) {
    return <Onboarding bootstrap={bootstrap} onConnected={(c) => void attach(c)} />;
  }

  return (
    <div className="flex h-full">
      <Sidebar onNewBot={() => setDialog('new-bot')} onSettings={() => setDialog('settings')} />
      <ChatPane />

      {dialog === 'new-bot' && (
        <NewBotDialog onClose={() => setDialog(null)} onCreate={hireBot} />
      )}
      {dialog === 'settings' && (
        <SettingsDialog
          connection={connection}
          onClose={() => setDialog(null)}
          onLeave={() => {
            setDialog(null);
            void leave();
          }}
        />
      )}

      {error && (
        <button
          onClick={() => setError(undefined)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-[#e0574a] px-3 py-2 text-[12px] text-white"
        >
          {error}
        </button>
      )}
    </div>
  );
}

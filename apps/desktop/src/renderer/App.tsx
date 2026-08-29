import { useEffect, useState } from 'react';
import { ChatPane } from './components/ChatPane.js';
import { NewBotDialog } from './components/NewBotDialog.js';
import { Onboarding } from './components/home/Onboarding.js';
import { SettingsPage } from './components/settings/SettingsPage.js';
import { Sidebar } from './components/Sidebar.js';
import { armNotify } from './notify.js';
import { useStore } from './state/store.js';

export function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const connection = useStore((s) => s.connection);
  const error = useStore((s) => s.error);
  const init = useStore((s) => s.init);
  const attach = useStore((s) => s.attach);
  const hireBot = useStore((s) => s.hireBot);
  const setError = useStore((s) => s.setError);
  const markRead = useStore((s) => s.markRead);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const [hiring, setHiring] = useState(false);

  useEffect(() => {
    void init();
    armNotify();
  }, [init]);

  // Coming back to the window counts as reading whatever is on screen.
  useEffect(() => {
    const onFocus = () => void markRead();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [markRead]);

  if (!bootstrap) return <div className="h-full" />;

  if (!connection) {
    return <Onboarding bootstrap={bootstrap} onConnected={(c) => void attach(c)} />;
  }

  return (
    <div className="screen-enter flex h-full">
      <Sidebar
        onNewBot={() => setHiring(true)}
        onSettings={() => setView(view === 'settings' ? 'chat' : 'settings')}
      />
      {view === 'settings' ? <SettingsPage connection={connection} /> : <ChatPane />}

      {hiring && <NewBotDialog onClose={() => setHiring(false)} onCreate={hireBot} />}

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

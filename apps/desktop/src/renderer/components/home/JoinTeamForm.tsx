import { useState } from 'react';
import type { Bootstrap, Connection } from '../../../shared-ipc.js';
import { GHOST, INPUT, PRIMARY } from '../controls.js';

interface Props {
  bootstrap: Bootstrap;
  onBack(): void;
  onSubmit(work: () => Promise<Connection>): Promise<void>;
}

export function JoinTeamForm({ bootstrap, onBack, onSubmit }: Props) {
  const [url, setUrl] = useState(bootstrap.remotes[0]?.url ?? 'http://100.');
  const [token, setToken] = useState(bootstrap.remotes[0]?.token ?? '');

  return (
    <div className="space-y-2">
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="http://100.x.y.z:7788"
        className={INPUT}
      />
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Pairing code"
        className={INPUT}
      />
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} className={GHOST}>
          Back
        </button>
        <button
          disabled={!url.trim() || !token.trim()}
          onClick={() =>
            void onSubmit(() =>
              window.openbot.connectRemote({ url: url.trim(), token: token.trim() }),
            )
          }
          className={`${PRIMARY} flex-1`}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

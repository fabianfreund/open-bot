import { useState } from 'react';
import type { Bootstrap, Connection, FolderInfo } from '../../shared-ipc.js';
import { GHOST, INPUT, PRIMARY } from './NewBotDialog.js';

interface Props {
  bootstrap: Bootstrap;
  onConnected(connection: Connection): void;
}

type Mode = 'start' | 'create' | 'join';

export function Onboarding({ bootstrap, onConnected }: Props) {
  const [mode, setMode] = useState<Mode>('start');
  const [error, setError] = useState<string>();

  const guard = async (work: () => Promise<Connection>) => {
    setError(undefined);
    try {
      onConnected(await work());
    } catch (err) {
      setError((err as Error).message.replace(/^Error invoking remote method '\w+':\s*/, ''));
    }
  };

  return (
    <div className="drag flex h-full items-center justify-center">
      <div className="no-drag w-full max-w-[380px] space-y-4">
        <h1 className="text-center text-[15px] font-medium">OpenBot</h1>

        {mode === 'start' && (
          <div className="space-y-2">
            <button onClick={() => setMode('create')} className={`${PRIMARY} w-full`}>
              New team
            </button>
            <button
              onClick={async () => {
                const picked = await window.openbot.chooseFolder();
                if (picked) await guard(() => window.openbot.openProject(picked));
              }}
              className={`${GHOST} w-full border border-[var(--color-line)]`}
            >
              Open a team
            </button>
            <button onClick={() => setMode('join')} className={`${GHOST} w-full border border-[var(--color-line)]`}>
              Connect to a computer
            </button>
            {bootstrap.recentProjects.length > 0 && (
              <div className="pt-3">
                {bootstrap.recentProjects.map((project) => (
                  <button
                    key={project.root}
                    onClick={() => void guard(() => window.openbot.openProject(project.root))}
                    className="flex w-full items-baseline justify-between rounded-lg px-3 py-2 text-left hover:bg-[var(--color-raised)]"
                  >
                    <span className="text-[13px]">{project.name}</span>
                    <span className="truncate pl-3 text-[11px] text-[var(--color-muted)]">
                      {project.root}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'create' && <CreateForm onBack={() => setMode('start')} onSubmit={guard} />}
        {mode === 'join' && (
          <JoinForm bootstrap={bootstrap} onBack={() => setMode('start')} onSubmit={guard} />
        )}

        {error && <p className="text-center text-[12px] text-[#e0574a]">{error}</p>}
      </div>
    </div>
  );
}

function CreateForm({
  onBack,
  onSubmit,
}: {
  onBack(): void;
  onSubmit(work: () => Promise<Connection>): Promise<void>;
}) {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState<FolderInfo>();

  const root = folder?.root ?? '';
  // Picking a folder that is already a team turns this into an open, rather
  // than dead-ending on "that folder already holds a project".
  const existing = folder?.hasProject === true;
  const blocked = folder !== undefined && !folder.empty && !existing;

  return (
    <div className="space-y-2">
      {!existing && (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          className={INPUT}
        />
      )}
      <button
        onClick={async () => {
          const picked = await window.openbot.chooseFolder();
          if (picked) setFolder(await window.openbot.inspectFolder(picked));
        }}
        className={`${INPUT} truncate text-left ${root ? '' : 'text-[#55555d]'}`}
      >
        {root || 'Choose a folder'}
      </button>
      {existing && (
        <p className="px-1 text-[12px] text-[var(--color-muted)]">{folder?.projectName}</p>
      )}
      {blocked && <p className="px-1 text-[12px] text-[#e0574a]">Folder is not empty</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} className={GHOST}>
          Back
        </button>
        {existing ? (
          <button
            onClick={() => void onSubmit(() => window.openbot.openProject(root))}
            className={`${PRIMARY} flex-1`}
          >
            Open
          </button>
        ) : (
          <button
            disabled={!name.trim() || !root || blocked}
            onClick={() =>
              void onSubmit(() => window.openbot.createProject({ root, name: name.trim() }))
            }
            className={`${PRIMARY} flex-1`}
          >
            Create
          </button>
        )}
      </div>
    </div>
  );
}

function JoinForm({
  bootstrap,
  onBack,
  onSubmit,
}: {
  bootstrap: Bootstrap;
  onBack(): void;
  onSubmit(work: () => Promise<Connection>): Promise<void>;
}) {
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

import { useState } from 'react';
import type { Connection, FolderInfo } from '../../../shared-ipc.js';
import { GHOST, INPUT, PRIMARY } from '../controls.js';

interface Props {
  onBack(): void;
  onSubmit(work: () => Promise<Connection>): Promise<void>;
}

export function CreateTeamForm({ onBack, onSubmit }: Props) {
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

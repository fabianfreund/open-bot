import { useState } from 'react';
import { FolderOpen, Plus, Wifi } from 'lucide-react';
import type { Bootstrap, Connection, RecentProject } from '../../../shared-ipc.js';
import { GHOST, PRIMARY } from '../controls.js';
import { CreateTeamForm } from './CreateTeamForm.js';
import { JoinTeamForm } from './JoinTeamForm.js';
import { TeamBackdrop } from './TeamBackdrop.js';

interface Props {
  bootstrap: Bootstrap;
  onConnected(connection: Connection): void;
}

type Mode = 'start' | 'create' | 'join';

/** Matches `.screen-leave` in styles.css. */
const LEAVE_MS = 320;

export function Onboarding({ bootstrap, onConnected }: Props) {
  const [mode, setMode] = useState<Mode>('start');
  const [error, setError] = useState<string>();
  const [leaving, setLeaving] = useState(false);

  const guard = async (work: () => Promise<Connection>) => {
    setError(undefined);
    try {
      const connection = await work();
      // Let this screen bow out before the team arrives, rather than cutting
      // between the two.
      setLeaving(true);
      setTimeout(() => onConnected(connection), LEAVE_MS);
    } catch (err) {
      setError((err as Error).message.replace(/^Error invoking remote method '\w+':\s*/, ''));
    }
  };

  return (
    <div
      className={`drag relative h-full overflow-hidden ${leaving ? 'screen-leave pointer-events-none' : ''}`}
    >
      <TeamBackdrop />

      <div className="relative flex h-full items-center justify-center p-6">
        <div className="card-in no-drag w-full max-w-[400px] rounded-2xl border border-[var(--color-line)] bg-[var(--color-sidebar)]/85 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <h1 className="mb-5 text-center text-[22px] font-bold tracking-tight">
            <span className="text-[var(--color-accent)]">Open</span>Bot
          </h1>

          {mode === 'start' && (
            <div key="start" className="rise-in space-y-2">
              <button
                onClick={() => setMode('create')}
                className={`${PRIMARY} flex w-full items-center justify-center gap-2`}
              >
                <Plus size={15} />
                New team
              </button>
              <button
                onClick={async () => {
                  const picked = await window.openbot.chooseFolder();
                  if (picked) await guard(() => window.openbot.openProject(picked));
                }}
                className={`${GHOST} flex w-full items-center justify-center gap-2 border border-[var(--color-line)] hover:bg-[var(--color-hover)]`}
              >
                <FolderOpen size={15} />
                Open a team
              </button>
              <button
                onClick={() => setMode('join')}
                className={`${GHOST} flex w-full items-center justify-center gap-2 border border-[var(--color-line)] hover:bg-[var(--color-hover)]`}
              >
                <Wifi size={15} />
                Connect to a computer
              </button>

              {bootstrap.recentProjects.length > 0 && (
                <div className="mt-4 border-t border-[var(--color-line)] pt-3">
                  {bootstrap.recentProjects.map((project) => (
                    <RecentTeam
                      key={project.root}
                      project={project}
                      onOpen={() => void guard(() => window.openbot.openProject(project.root))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'create' && (
            <div key="create" className="rise-in">
              <CreateTeamForm onBack={() => setMode('start')} onSubmit={guard} />
            </div>
          )}
          {mode === 'join' && (
            <div key="join" className="rise-in">
              <JoinTeamForm
                bootstrap={bootstrap}
                onBack={() => setMode('start')}
                onSubmit={guard}
              />
            </div>
          )}

          {error && <p className="pt-3 text-center text-[12px] text-[#e0574a]">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function RecentTeam({ project, onOpen }: { project: RecentProject; onOpen(): void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[var(--color-hover)]"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--color-raised)] text-[11px] font-medium">
        {initials(project.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{project.name}</span>
        <span className="block truncate text-[11px] text-[var(--color-muted)]">{project.root}</span>
      </span>
    </button>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

import { useEffect, useState } from 'react';
import type { Connection } from '../../../shared-ipc.js';
import { useStore } from '../../state/store.js';
import { GHOST } from '../controls.js';
import { Chip } from './Chip.js';
import { Field, Row, TextField } from './Field.js';

/** How long a bot keeps a chat in mind, in minutes. */
const MEMORY_CHOICES = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 480, label: '8 hours' },
];

interface Props {
  connection: Connection;
}

export function GeneralSection({ connection }: Props) {
  const project = useStore((s) => s.project);
  const saveProject = useStore((s) => s.saveProject);
  const leave = useStore((s) => s.leave);
  const [invite, setInvite] = useState<{ url: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (connection.mode === 'host') void window.openbot.shareInvite().then(setInvite);
  }, [connection.mode]);

  if (!project) return null;
  const { file } = project;
  const minutes = file.settings.sessionMinutes;

  return (
    <div className="max-w-[560px] space-y-5">
      <TextField
        label="Team name"
        value={file.name}
        required
        onSave={(name) => void saveProject({ name })}
      />
      <TextField
        label="Goal"
        value={file.goal}
        rows={4}
        placeholder="What this team is here to do."
        onSave={(goal) => void saveProject({ goal })}
      />
      <TextField
        label="Your name"
        value={file.settings.userName}
        required
        onSave={(userName) => void saveProject({ userName })}
      />

      <Field label="Bots keep a chat in mind for">
        <div className="flex flex-wrap gap-1.5">
          {MEMORY_CHOICES.map((choice) => (
            <Chip
              key={choice.minutes}
              label={choice.label}
              on={minutes === choice.minutes}
              onClick={() => void saveProject({ sessionMinutes: choice.minutes })}
            />
          ))}
          {!MEMORY_CHOICES.some((c) => c.minutes === minutes) && (
            <Chip label={`${minutes} minutes`} on onClick={() => undefined} />
          )}
        </div>
      </Field>

      <div className="pt-1">
        <Row label="Mode" value={connection.mode === 'host' ? 'Hosting' : 'Connected'} />
        {connection.root && (
          <Row
            label="Folder"
            value={connection.root}
            onClick={() => void window.openbot.revealProject(connection.root!)}
          />
        )}
        {invite && (
          <>
            <Row label="Address" value={invite.url} />
            <Row
              label="Pairing code"
              value={copied ? 'Copied' : invite.token}
              onClick={() => {
                void navigator.clipboard.writeText(invite.token);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            />
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={() => void leave()} className={GHOST}>
          {connection.mode === 'host' ? 'Close team' : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}

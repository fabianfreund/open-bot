import { useEffect, useState } from 'react';
import type { Connection } from '../../shared-ipc.js';
import { Dialog } from './Dialog.js';
import { GHOST } from './NewBotDialog.js';

interface Props {
  connection: Connection;
  onClose(): void;
  onLeave(): void;
}

export function SettingsDialog({ connection, onClose, onLeave }: Props) {
  const [invite, setInvite] = useState<{ url: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (connection.mode === 'host') void window.openbot.shareInvite().then(setInvite);
  }, [connection.mode]);

  return (
    <Dialog title={connection.projectName} onClose={onClose}>
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
      <div className="flex justify-end pt-1">
        <button onClick={onLeave} className={GHOST}>
          {connection.mode === 'host' ? 'Close team' : 'Disconnect'}
        </button>
      </div>
    </Dialog>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?(): void }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-line)] py-2 last:border-0">
      <span className="text-[12px] text-[var(--color-muted)]">{label}</span>
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`truncate font-mono text-[12px] ${onClick ? 'hover:text-[var(--color-accent)]' : ''}`}
      >
        {value}
      </button>
    </div>
  );
}

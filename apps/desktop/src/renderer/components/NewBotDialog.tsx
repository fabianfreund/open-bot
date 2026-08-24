import { useState } from 'react';
import { Dialog } from './Dialog.js';

interface Props {
  onClose(): void;
  onCreate(input: { name: string; role: string; instructions: string }): Promise<void>;
}

export function NewBotDialog({ onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), role: role.trim(), instructions: instructions.trim() });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="New bot" onClose={onClose}>
      <Field label="Name">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
          placeholder="Research"
        />
      </Field>
      <Field label="What they own">
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={INPUT}
          placeholder="Finds things out and writes them up"
        />
      </Field>
      <Field label="Brief">
        <textarea
          rows={5}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className={`${INPUT} resize-none`}
          placeholder="How they should work, what to avoid, who to ask."
        />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className={GHOST}>
          Cancel
        </button>
        <button onClick={() => void submit()} disabled={!name.trim() || busy} className={PRIMARY}>
          {busy ? 'Hiring…' : 'Hire'}
        </button>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

const INPUT =
  'w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none placeholder:text-[#55555d] focus:border-[var(--color-accent)]';
const PRIMARY =
  'rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-40';
const GHOST =
  'rounded-lg px-3.5 py-2 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)]';

export { INPUT, PRIMARY, GHOST };

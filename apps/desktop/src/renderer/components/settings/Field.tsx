import { useEffect, useState } from 'react';
import { INPUT } from '../controls.js';

/** A labelled slot. Everything in settings is a label and a value. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onSave(value: string): void;
  placeholder?: string;
  /** Rows for a text area. Omit for a single line. */
  rows?: number;
  /** Refuses to save an empty value, for things that must have one. */
  required?: boolean;
}

/**
 * Saves when you look away, so there is no Save button to hunt for. The draft
 * follows the stored value while you are not typing in it, which is what keeps
 * a change made on another device from being overwritten by a stale box.
 */
export function TextField({ label, value, onSave, placeholder, rows, required }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === value.trim()) return;
    if (required && !next) {
      setDraft(value);
      return;
    }
    onSave(next);
  };

  const shared = {
    value: draft,
    placeholder,
    onFocus: () => setEditing(true),
    onBlur: commit,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
  };

  return (
    <Field label={label}>
      {rows ? (
        <textarea {...shared} rows={rows} className={`${INPUT} resize-none`} />
      ) : (
        <input
          {...shared}
          className={INPUT}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </Field>
  );
}

/** A value you can only read, and sometimes act on. */
export function Row({ label, value, onClick }: { label: string; value: string; onClick?(): void }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-line)] py-2.5 last:border-0">
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

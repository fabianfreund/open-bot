import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useStore } from '../state/store.js';

/** Small top-right indicator; hover or click to see what is connected. */
export function StatusInfo() {
  const link = useStore((s) => s.link);
  const agents = useStore((s) => s.agents);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const connected = link === 'open';
  const providers = Array.from(new Set(agents.map((a) => a.definition.provider)));

  return (
    <div
      ref={ref}
      className="no-drag relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Connection status"
        className="flex size-7 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)]"
      >
        <Info size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 pt-2">
          <div className="w-48 rounded-lg border border-[var(--color-line)] bg-[var(--color-sidebar)] p-1.5 shadow-2xl">
            <StatusRow label={connected ? 'Connected' : 'Reconnecting'} ok={connected} />
            {providers.map((provider) => (
              <StatusRow key={provider} label={capitalize(provider)} ok={connected} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-1 text-[12px]">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: ok ? '#2fb673' : '#e0a13a' }} />
      {label}
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

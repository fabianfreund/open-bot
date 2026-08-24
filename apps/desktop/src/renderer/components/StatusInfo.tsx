import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { ProviderHealth } from '@openbot/shared';
import { useStore } from '../state/store.js';
import { STATUS_OK, STATUS_WARN } from '../status-colors.js';

/** Small top-right indicator; hover or click to see what is connected. */
export function StatusInfo() {
  const link = useStore((s) => s.link);
  const client = useStore((s) => s.client);
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Provider health (is Codex actually signed in?) can change while the app
  // sits open, so re-check each time someone looks rather than caching it.
  useEffect(() => {
    if (!open || !client) return;
    let cancelled = false;
    void client.providers().then((res) => {
      if (!cancelled) setHealth(res.health);
    });
    return () => {
      cancelled = true;
    };
  }, [open, client]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const connected = link === 'open';

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
          <div className="w-56 rounded-lg border border-[var(--color-line)] bg-[var(--color-sidebar)] p-1.5 shadow-2xl">
            <StatusRow label={connected ? 'Connected' : 'Reconnecting'} ok={connected} />
            {health.map((provider) => (
              <StatusRow
                key={provider.id}
                label={capitalize(provider.id)}
                detail={provider.detail}
                ok={provider.ok}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, detail, ok }: { label: string; detail?: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2 px-1.5 py-1">
      <span
        className="mt-1.5 size-1.5 shrink-0 rounded-full"
        style={{ background: ok ? STATUS_OK : STATUS_WARN }}
      />
      <span className="min-w-0">
        <span className="block text-[12px]">{label}</span>
        {detail && (
          <span className="block truncate text-[11px] text-[var(--color-muted)]">{detail}</span>
        )}
      </span>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

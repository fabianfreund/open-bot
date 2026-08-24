import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TracePart } from '@openbot/shared';

/**
 * What the bot did, in plain language, above what it said. Collapsed by
 * default, the answer matters more than the steps.
 */
export function TraceList({ parts }: { parts: TracePart[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const visible = parts.filter((p) => p.kind !== 'reasoning');
  if (visible.length === 0) return null;

  return (
    <div className="space-y-0.5 px-1">
      {visible.map((part) => (
        <div key={part.id}>
          <button
            onClick={() => setOpen(open === part.id ? null : part.id)}
            disabled={!part.detail}
            className={`flex items-center gap-1 text-[12px] ${
              part.status === 'failed' ? 'text-[#e0574a]' : 'text-[var(--color-muted)]'
            } ${part.detail ? 'hover:text-[var(--color-ink)]' : ''}`}
          >
            {part.detail ? (
              <ChevronRight
                size={12}
                className={`transition-transform ${open === part.id ? 'rotate-90' : ''}`}
              />
            ) : (
              <span className="mx-[3px] size-1 rounded-full bg-current opacity-60" />
            )}
            {part.title}
            {part.status === 'in-progress' && <span className="opacity-60">…</span>}
          </button>
          {open === part.id && part.detail && (
            <pre className="mt-1 mb-1.5 max-h-64 overflow-auto rounded-md border border-[var(--color-line)] bg-[var(--color-raised)] p-2.5 font-mono text-[11.5px] whitespace-pre-wrap text-[var(--color-ink)]">
              {part.detail}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

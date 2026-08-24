import { useState } from 'react';
import { copyText, isWebTarget, openTarget, revealTarget } from '../open.js';

interface At {
  x: number;
  y: number;
  target: string;
}

/**
 * Right-click on anything openable: the browser, the file system, or the
 * clipboard. Left-click already does the obvious one.
 */
export function useTargetMenu() {
  const [at, setAt] = useState<At | null>(null);

  const openMenu = (event: React.MouseEvent, target: string) => {
    event.preventDefault();
    event.stopPropagation();
    setAt({ x: event.clientX, y: event.clientY, target });
  };

  const menu = at ? <Menu at={at} onClose={() => setAt(null)} /> : null;
  return { openMenu, menu };
}

function Menu({ at, onClose }: { at: At; onClose(): void }) {
  const web = isWebTarget(at.target);
  const items: { label: string; run(): void }[] = [
    { label: web ? 'Open in browser' : 'Open', run: () => openTarget(at.target) },
    ...(web ? [] : [{ label: 'Show in folder', run: () => revealTarget(at.target) }]),
    { label: web ? 'Copy link' : 'Copy path', run: () => copyText(at.target) },
  ];

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={onClose}>
      <div
        style={{ left: Math.min(at.x, window.innerWidth - 180), top: at.y }}
        className="absolute min-w-[160px] rounded-lg border border-[var(--color-line)] bg-[var(--color-sidebar)] py-1 shadow-lg"
      >
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.run();
              onClose();
            }}
            className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--color-raised)]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';

interface Item {
  label: string;
  onSelect(): void;
}

interface Props {
  x: number;
  y: number;
  items: Item[];
  onClose(): void;
}

/** A short right-click menu. Closes on click outside, Escape, or a pick. */
export function BotMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] rounded-lg border border-[var(--color-line)] bg-[var(--color-sidebar)] py-1 shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--color-hover)]"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

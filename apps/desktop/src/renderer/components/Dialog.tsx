import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
}

export function Dialog({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[440px] space-y-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-sidebar)] p-5 shadow-2xl">
        <h2 className="text-[14px] font-medium">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** A tappable on/off pill. Tapping beats typing. */
export function Chip({ label, on, onClick }: { label: string; on: boolean; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12px] ${
        on
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
          : 'border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {label}
    </button>
  );
}

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../state/theme.js';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      onClick={toggle}
      title={isLight ? 'Switch to dark' : 'Switch to light'}
      aria-label="Toggle color theme"
      className="no-drag relative flex h-6 w-11 shrink-0 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] transition-colors"
    >
      <span
        className={`flex size-4.5 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-muted)] shadow-sm transition-transform ${
          isLight ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      >
        {isLight ? <Sun size={11} /> : <Moon size={11} />}
      </span>
    </button>
  );
}

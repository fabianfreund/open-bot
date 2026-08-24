import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'openbot.theme';

function readStored(): Theme | undefined {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : undefined;
}

function readInitial(): Theme {
  return (
    readStored() ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  );
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

// Runs once, on module load, so the right theme is set before the first
// paint rather than flashing dark and switching.
apply(readInitial());

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    apply(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

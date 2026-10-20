import { useState } from 'preact/hooks';

export type Theme = 'dark' | 'light';

// Theme lives in localStorage (not IndexedDB) so index.html can apply it synchronously before first paint.
function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem('theme', t);
    } catch {
      // Storage unavailable; theme still applies for this session.
    }
    setThemeState(t);
  };
  return [theme, setTheme];
}

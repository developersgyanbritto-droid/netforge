'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{ theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void } | null>(null);
const KEY = 'nf-theme';

/** Inline script that applies the theme before first paint (avoids a flash). */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

function readStored(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme | null) ?? 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  const apply = useCallback((t: Theme) => {
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    setResolved(dark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const t = readStored();
    setThemeState(t);
    apply(t);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => readStored() === 'system' && apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [apply]);

  const setTheme = (t: Theme) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage unavailable */
    }
    setThemeState(t);
    apply(t);
  };
  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

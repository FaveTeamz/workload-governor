'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system' | 'high-contrast';

const storageKey = 'wg-theme';
const darkQuery = '(prefers-color-scheme: dark)';
const preferences: ThemePreference[] = ['system', 'light', 'dark', 'high-contrast'];

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return preferences.find((preference) => preference === stored) ?? 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    updatePreference(readPreference());
    const media = window.matchMedia?.(darkQuery);
    if (!media) return;
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const theme = preference === 'system'
    ? systemDark ? 'dark' : 'light'
    : preference === 'high-contrast' ? 'dark' : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');
    if (preference !== 'system') root.classList.add(`theme-${preference}`);
    root.dataset.theme = preference;
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    updatePreference(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Keep the selected preference in memory when storage is unavailable.
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setPreference]);

  return <ThemeContext.Provider value={{ preference, theme, setPreference, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

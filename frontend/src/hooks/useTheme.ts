import { useState, useEffect, useCallback } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "wg-theme";
const DARK_CLASS = "theme-dark";
const LIGHT_CLASS = "theme-light";

/**
 * Reads the initial theme preference in order:
 * 1. Saved localStorage value (user explicit choice)
 * 2. OS prefers-color-scheme
 * 3. Default: "dark"
 */
function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // localStorage may be unavailable in some environments
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return "dark";
}

/** Apply the theme class to <html> so CSS vars cascade everywhere. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add(DARK_CLASS);
    root.classList.remove(LIGHT_CLASS);
  } else {
    root.classList.add(LIGHT_CLASS);
    root.classList.remove(DARK_CLASS);
  }
  root.setAttribute("data-theme", theme);
}

/**
 * Custom hook that manages theme state, persists to localStorage, and
 * applies the theme class to the document root.
 *
 * Issue #14: CSS variables + localStorage + prefers-color-scheme.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply on mount and whenever theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { theme, toggle } as const;
}

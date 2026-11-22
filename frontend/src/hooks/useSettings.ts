/**
 * useSettings — contributor dashboard preferences, persisted to localStorage.
 *
 * Key: `wg_settings_<address>` when a wallet is connected, or
 *      `wg_settings_anonymous` when there is no address yet.
 *
 * Settings take effect immediately:
 *   - theme  → data-theme attribute on <html>
 *   - lang   → lang attribute on <html>
 * All other settings are read by consuming components.
 */

import { useState, useEffect, useCallback } from "react";
import i18n from "../i18n";

// ── Types ────────────────────────────────────────────────────────────────────

export type Theme = "system" | "light" | "dark";
export type Language = "en" | "es";

export interface Settings {
  theme: Theme;
  language: Language;
  /** Org ID string, or empty string for "no default". */
  defaultOrg: string;
  /** Hide issues the contributor has already applied to. */
  hideApplied: boolean;
  /** Opt in to email notifications. */
  emailNotifications: boolean;
}

export interface UseSettingsReturn {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "en",
  defaultOrg: "",
  hideApplied: false,
  emailNotifications: false,
};

// ── Storage helpers ───────────────────────────────────────────────────────────

function storageKey(address: string | null): string {
  return `wg_settings_${address ?? "anonymous"}`;
}

function load(address: string | null): Settings {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function save(address: string | null, settings: Settings): void {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(settings));
  } catch {
    // Silently ignore — storage quota exceeded or private browsing mode.
  }
}

// ── DOM side-effects ──────────────────────────────────────────────────────────

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  if (theme !== "system") {
    root.setAttribute("data-theme", theme);
  }
}

function applyLanguage(lang: Language): void {
  document.documentElement.lang = lang;
  if (i18n.language !== lang) {
    i18n.changeLanguage(lang);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * @param address — wallet address from useWallet; pass null when disconnected.
 *   Settings are scoped per address so each contributor has their own prefs.
 */
export function useSettings(address: string | null): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(() => load(address));

  // When the wallet address changes (connect / disconnect / different account),
  // reload settings for the new context and re-apply DOM effects.
  useEffect(() => {
    const next = load(address);
    setSettings(next);
    applyTheme(next.theme);
    applyLanguage(next.language);
  }, [address]);

  // Apply DOM effects whenever settings change.
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    applyLanguage(settings.language);
  }, [settings.language]);

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        save(address, next);
        return next;
      });
    },
    [address]
  );

  const resetSettings = useCallback(() => {
    const defaults = { ...DEFAULT_SETTINGS };
    save(address, defaults);
    setSettings(defaults);
  }, [address]);

  return { settings, updateSetting, resetSettings };
}

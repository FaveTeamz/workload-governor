/**
 * i18n configuration for WorkloadGovernor frontend.
 *
 * Supported locales (ordered by addition date):
 *   en-US  — English (United States)   — baseline
 *   es     — Spanish                   — added in #538
 *   fr     — French                    — added in #538
 *   pt-BR  — Portuguese (Brazil)       — added in #653
 *
 * Date formatting follows each locale's convention:
 *   en-US  MM/DD/YYYY
 *   es     DD/MM/YYYY
 *   fr     DD/MM/YYYY
 *   pt-BR  DD/MM/YYYY  (thousands separator: ".", decimal separator: ",")
 *
 * Currency: Not used — all values are XLM amounts displayed as plain numbers.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "./locales/en-US.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en-US", label: "English (US)", nativeLabel: "English" },
  { code: "es",    label: "Spanish",      nativeLabel: "Español" },
  { code: "fr",    label: "French",       nativeLabel: "Français" },
  { code: "pt-BR", label: "Portuguese (Brazil)", nativeLabel: "Português (Brasil)" },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/**
 * Format a date string according to the active locale.
 * All values are plain dates — no timezone conversion is applied.
 */
export function formatDate(date: Date | string, locale: SupportedLocale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Format a plain number (e.g. XLM amount) according to the active locale.
 * pt-BR uses "." as thousands separator and "," as decimal separator.
 */
export function formatNumber(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale).format(value);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      "en-US": { translation: enUS },
      es:      { translation: es },
      fr:      { translation: fr },
      "pt-BR": { translation: ptBR },
    },
    lng: typeof window !== "undefined"
      ? (localStorage.getItem("wg_locale") ?? navigator.language ?? "en-US")
      : "en-US",
    fallbackLng: "en-US",
    interpolation: {
      escapeValue: false, // React already escapes output
    },
  });

export default i18n;

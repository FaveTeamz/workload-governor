import { en } from './locales/en'
import { fr } from './locales/fr'
import type { Translations } from './locales/en'

/** localStorage key used to persist the user's chosen locale. */
export const LOCALE_STORAGE_KEY = 'wg:locale'

/** All locales supported by this application. */
export const SUPPORTED_LOCALES = ['en', 'fr'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

const localeMap: Record<SupportedLocale, Translations> = { en, fr }

/**
 * Type guard: returns true only if value is a known supported locale string.
 * Prevents prototype pollution or XSS via a crafted localStorage value.
 */
function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale)
}

/**
 * Reads the persisted locale from localStorage, validates it, then falls
 * back to the browser language and finally to 'en'.
 */
function getInitialLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && isSupportedLocale(stored)) return stored
  } catch {
    // localStorage may be unavailable in sandboxed environments
  }

  // Fall back to the browser's primary language
  const browserLang = navigator.language.split('-')[0]
  return isSupportedLocale(browserLang) ? browserLang : 'en'
}

/**
 * Lightweight i18n singleton.
 *
 * Usage:
 *   import { i18n } from './i18n'
 *   i18n.t.common.connect_wallet   // current translation
 *   i18n.changeLanguage('fr')      // switch + persist to localStorage
 */
class I18n {
  private _locale: SupportedLocale
  private _listeners: Array<(locale: SupportedLocale) => void> = []

  constructor() {
    this._locale = getInitialLocale()
  }

  /** Currently active locale code. */
  get locale(): SupportedLocale {
    return this._locale
  }

  /** Translation map for the current locale. */
  get t(): Translations {
    return localeMap[this._locale]
  }

  /**
   * Switch the active locale, persist the choice to localStorage, and
   * notify all subscribers.  Silently ignores unsupported locale strings.
   */
  changeLanguage(locale: SupportedLocale): void {
    if (!isSupportedLocale(locale)) return
    this._locale = locale
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // localStorage may be unavailable
    }
    this._listeners.forEach((fn) => fn(locale))
  }

  /**
   * Subscribe to locale changes.
   * @returns An unsubscribe function.
   */
  subscribe(fn: (locale: SupportedLocale) => void): () => void {
    this._listeners.push(fn)
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn)
    }
  }
}

export const i18n = new I18n()

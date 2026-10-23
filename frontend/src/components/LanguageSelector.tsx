import { useState, useEffect } from 'react'
import { i18n, SUPPORTED_LOCALES } from '../i18n'
import type { SupportedLocale } from '../i18n'

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'Français',
}

/**
 * A `<select>` that lets users switch the UI language.
 *
 * The selected locale is persisted to localStorage via `i18n.changeLanguage()`
 * and survives page reloads.
 */
export function LanguageSelector() {
  const [locale, setLocale] = useState<SupportedLocale>(i18n.locale)

  useEffect(() => {
    // Keep local state in sync when the locale changes elsewhere
    return i18n.subscribe(setLocale)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SupportedLocale
    i18n.changeLanguage(next)
  }

  return (
    <div className="language-selector">
      <label htmlFor="locale-select" className="language-selector__label">
        {i18n.t.common.language}
      </label>
      <select
        id="locale-select"
        className="language-selector__select"
        value={locale}
        onChange={handleChange}
        aria-label="Select language"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </div>
  )
}

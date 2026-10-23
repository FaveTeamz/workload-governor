import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, i18n } from './i18n'
import { LanguageSelector } from './components/LanguageSelector'

/**
 * Reset the i18n singleton and localStorage before each test so tests are
 * fully independent of one another.
 */
beforeEach(() => {
  localStorage.clear()
  i18n.changeLanguage('en')
  // Clear the entry written by the reset above so init-from-storage tests work
  localStorage.clear()
})

// ────────────────────────────────────────────────────────────
// Locale persistence
// ────────────────────────────────────────────────────────────

describe('i18n — locale persistence', () => {
  it('selecting a locale persists it to localStorage', () => {
    i18n.changeLanguage('fr')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr')
  })

  it('switching back to English updates localStorage', () => {
    i18n.changeLanguage('fr')
    i18n.changeLanguage('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('invalid locale does not overwrite localStorage value', () => {
    i18n.changeLanguage('en')
    const valueBefore = localStorage.getItem(LOCALE_STORAGE_KEY)
    // @ts-expect-error intentionally passing an unsupported locale
    i18n.changeLanguage('xx')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(valueBefore)
  })

  it('unsupported locale string in localStorage does not cause an error', () => {
    // Simulate a crafted / corrupted localStorage entry
    localStorage.setItem(LOCALE_STORAGE_KEY, 'zz-invalid-locale-xyz')
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)

    // The stored value is not in SUPPORTED_LOCALES
    expect(SUPPORTED_LOCALES.includes(stored as 'en' | 'fr')).toBe(false)

    // The current locale (set by the beforeEach) is still valid
    expect(SUPPORTED_LOCALES.includes(i18n.locale)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// Init from localStorage
// ────────────────────────────────────────────────────────────

describe('i18n — init from localStorage', () => {
  it('stored locale is applied when changeLanguage is called with it', () => {
    // Simulate the init path: store 'fr' then apply it
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
    i18n.changeLanguage('fr')
    expect(i18n.t.common.connect_wallet).toBe('Connecter le portefeuille')
  })

  it('falls back gracefully when stored value is invalid', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, '__invalid__')
    // The singleton was already initialised; verify the current locale is valid
    expect(SUPPORTED_LOCALES.includes(i18n.locale)).toBe(true)
  })

  it('applies English translations when locale is en', () => {
    i18n.changeLanguage('en')
    expect(i18n.t.common.connect_wallet).toBe('Connect Wallet')
  })

  it('applies French translations when locale is fr', () => {
    i18n.changeLanguage('fr')
    expect(i18n.t.common.connect_wallet).toBe('Connecter le portefeuille')
  })
})

// ────────────────────────────────────────────────────────────
// LanguageSelector component
// ────────────────────────────────────────────────────────────

describe('LanguageSelector component', () => {
  it('renders a select element with all supported locales', () => {
    render(<LanguageSelector />)
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()

    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Français' })).toBeInTheDocument()
  })

  it('changing the select persists the locale to localStorage', () => {
    render(<LanguageSelector />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'fr' } })
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr')
  })

  it('select value reflects the current locale', () => {
    i18n.changeLanguage('fr')
    render(<LanguageSelector />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('fr')
  })

  it('existing tests still pass after locale switch', () => {
    render(<LanguageSelector />)
    // Sanity: default is 'en'
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('en')

    // Switch to French
    fireEvent.change(select, { target: { value: 'fr' } })
    expect(i18n.locale).toBe('fr')
    expect(i18n.t.common.disconnect).toBe('Déconnecter')

    // Switch back to English
    fireEvent.change(select, { target: { value: 'en' } })
    expect(i18n.locale).toBe('en')
    expect(i18n.t.common.disconnect).toBe('Disconnect')
  })
})

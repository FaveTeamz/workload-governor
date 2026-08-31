/**
 * LanguageSelector — dropdown for switching the active locale.
 *
 * Renders a <select> element listing all supported languages.
 * Persists the selection to localStorage under the key "wg_locale".
 *
 * Accessibility:
 * - Uses a native <select> for full keyboard support out of the box.
 * - Associates label via htmlFor / id pair.
 * - aria-label fallback for icon-only contexts.
 */

import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLocale } from "../i18n";

interface LanguageSelectorProps {
  /** Whether to show the label text inline (false = icon-only mode, still accessible). */
  showLabel?: boolean;
  /** Additional CSS class names. */
  className?: string;
}

export function LanguageSelector({
  showLabel = true,
  className = "",
}: LanguageSelectorProps) {
  const { i18n, t } = useTranslation();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const locale = e.target.value as SupportedLocale;
      i18n.changeLanguage(locale);
      localStorage.setItem("wg_locale", locale);
    },
    [i18n]
  );

  return (
    <div className={`language-selector ${className}`.trim()}>
      {showLabel && (
        <label htmlFor="language-select" className="language-selector__label">
          {t("settings.select_language")}
        </label>
      )}
      <select
        id="language-select"
        value={i18n.language}
        onChange={handleChange}
        aria-label={t("settings.select_language")}
        className="language-selector__select"
      >
        {SUPPORTED_LANGUAGES.map(({ code, nativeLabel }) => (
          <option key={code} value={code}>
            {nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

export default LanguageSelector;

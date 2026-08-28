/**
 * SettingsPage — contributor dashboard preferences at /settings.
 *
 * Requires wallet connection. Unauthenticated visitors are redirected to /.
 * Changes take effect immediately without a page reload.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { UseSettingsReturn } from "../hooks/useSettings";
import type { WalletState } from "../hooks/useWallet";

// Known organisations — in production this list comes from the API.
const KNOWN_ORGS = [
  { id: "stellar-org", label: "Stellar Org" },
  { id: "meridian-dao", label: "Meridian DAO" },
  { id: "soroban-devs", label: "Soroban Devs" },
];

interface Props {
  wallet: WalletState;
  settingsHook: UseSettingsReturn;
}

function truncateAddress(addr: string): string {
  return addr.length > 20 ? `${addr.slice(0, 10)}…${addr.slice(-8)}` : addr;
}

export function SettingsPage({ wallet, settingsHook }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { settings, updateSetting, resetSettings } = settingsHook;

  // Guard: must be connected to access settings.
  useEffect(() => {
    if (!wallet.address) {
      navigate("/", { replace: true });
    }
  }, [wallet.address, navigate]);

  // Don't render until we know the wallet state (avoids flicker on redirect).
  if (!wallet.address) return null;

  function handleReset() {
    resetSettings();
  }

  function handleDisconnect() {
    wallet.disconnect();
    navigate("/", { replace: true });
  }

  function handleLanguageChange(lang: "en" | "es") {
    updateSetting("language", lang);
    i18n.changeLanguage(lang);
  }

  return (
    <main id="main-content" className="settings-page" tabIndex={-1}>
      <div className="settings-container">
        <header className="settings-header">
          <h1>{t("settings.title")}</h1>
          <p className="settings-subtitle">
            {t("settings.subtitle")}
          </p>
        </header>

        {/* ── Account section ─────────────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="account-heading">
          <h2 id="account-heading">{t("settings.account")}</h2>

          <div className="settings-field settings-field--row">
            <div className="settings-field-info">
              <label className="settings-label">{t("settings.connectedWallet")}</label>
              <p className="settings-description">
                {t("settings.connectedWalletDesc")}
              </p>
            </div>
            <div className="settings-account-address">
              <code
                className="address-badge"
                title={wallet.address}
                aria-label={`Connected as ${wallet.address}`}
              >
                {truncateAddress(wallet.address)}
              </code>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleDisconnect}
                aria-label="Disconnect wallet and return to home"
              >
                {t("settings.disconnectButton")}
              </button>
            </div>
          </div>
        </section>

        {/* ── Appearance section ──────────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">{t("settings.appearance")}</h2>

          {/* Theme */}
          <div className="settings-field">
            <label className="settings-label" htmlFor="theme-select">
              {t("settings.theme")}
            </label>
            <p className="settings-description" id="theme-desc">
              {t("settings.themeDesc")}
            </p>
            <div className="settings-radio-group" role="radiogroup" aria-describedby="theme-desc">
              {(["system", "light", "dark"] as const).map((tVal) => (
                <label key={tVal} className="settings-radio-label">
                  <input
                    type="radio"
                    name="theme"
                    value={tVal}
                    checked={settings.theme === tVal}
                    onChange={() => updateSetting("theme", tVal)}
                    aria-label={`Theme: ${tVal}`}
                  />
                  <span className="settings-radio-text">
                    {tVal === "system" ? t("settings.themeSystem") : tVal === "light" ? t("settings.themeLight") : t("settings.themeDark")}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="settings-field">
            <label className="settings-label" htmlFor="language-select">
              {t("settings.language")}
            </label>
            <p className="settings-description">
              {t("settings.languageDesc")}
            </p>
            <select
              id="language-select"
              className="settings-select"
              value={settings.language}
              onChange={(e) =>
                handleLanguageChange(e.target.value as "en" | "es")
              }
              aria-label="Interface language"
            >
              <option value="en">{t("settings.languageOptionEn")}</option>
              <option value="es">{t("settings.languageOptionEs")}</option>
            </select>
          </div>
        </section>

        {/* ── Dashboard section ───────────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="dashboard-heading">
          <h2 id="dashboard-heading">{t("settings.dashboardSection")}</h2>

          {/* Default org */}
          <div className="settings-field">
            <label className="settings-label" htmlFor="default-org-select">
              {t("settings.defaultOrg")}
            </label>
            <p className="settings-description">
              {t("settings.defaultOrgDesc")}
            </p>
            <select
              id="default-org-select"
              className="settings-select"
              value={settings.defaultOrg}
              onChange={(e) => updateSetting("defaultOrg", e.target.value)}
              aria-label="Default organisation"
            >
              <option value="">{t("settings.noDefaultOrg")}</option>
              {KNOWN_ORGS.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.label}
                </option>
              ))}
            </select>
          </div>

          {/* Hide applied issues */}
          <div className="settings-field settings-field--toggle">
            <div className="settings-field-info">
              <label className="settings-label" htmlFor="hide-applied-toggle">
                {t("settings.hideApplied")}
              </label>
              <p className="settings-description">
                {t("settings.hideAppliedDesc")}
              </p>
            </div>
            <button
              id="hide-applied-toggle"
              role="switch"
              aria-checked={settings.hideApplied}
              className={`settings-toggle${settings.hideApplied ? " settings-toggle--on" : ""}`}
              onClick={() => updateSetting("hideApplied", !settings.hideApplied)}
              aria-label={`Hide applied issues: ${settings.hideApplied ? "on" : "off"}`}
            >
              <span className="settings-toggle-thumb" aria-hidden="true" />
              <span className="sr-only">{settings.hideApplied ? "On" : "Off"}</span>
            </button>
          </div>
        </section>

        {/* ── Notifications section ───────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="notifications-heading">
          <h2 id="notifications-heading">{t("settings.notifications")}</h2>

          {/* Email notifications */}
          <div className="settings-field settings-field--toggle">
            <div className="settings-field-info">
              <label className="settings-label" htmlFor="email-notifications-toggle">
                {t("settings.emailNotifications")}
              </label>
              <p className="settings-description">
                {t("settings.emailNotificationsDesc")}
              </p>
            </div>
            <button
              id="email-notifications-toggle"
              role="switch"
              aria-checked={settings.emailNotifications}
              className={`settings-toggle${settings.emailNotifications ? " settings-toggle--on" : ""}`}
              onClick={() =>
                updateSetting("emailNotifications", !settings.emailNotifications)
              }
              aria-label={`Email notifications: ${settings.emailNotifications ? "on" : "off"}`}
            >
              <span className="settings-toggle-thumb" aria-hidden="true" />
              <span className="sr-only">
                {settings.emailNotifications ? "On" : "Off"}
              </span>
            </button>
          </div>
        </section>

        {/* ── Danger zone ─────────────────────────────────────────────────── */}
        <section className="settings-section settings-section--danger" aria-labelledby="reset-heading">
          <h2 id="reset-heading">{t("settings.dangerZone")}</h2>
          <div className="settings-field settings-field--row">
            <div className="settings-field-info">
              <p className="settings-label">{t("settings.resetDefaults")}</p>
              <p className="settings-description">
                {t("settings.resetDefaultsDesc")}
              </p>
            </div>
            <button
              className="btn btn-revoke btn-sm"
              onClick={handleReset}
              aria-label="Reset all settings to defaults"
            >
              {t("settings.resetButton")}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

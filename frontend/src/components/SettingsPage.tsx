/**
 * SettingsPage — contributor dashboard preferences at /settings.
 *
 * Requires wallet connection. Unauthenticated visitors are redirected to /.
 * Changes take effect immediately without a page reload.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

  return (
    <main id="main-content" className="settings-page" tabIndex={-1}>
      <div className="settings-container">
        <header className="settings-header">
          <h1>Settings</h1>
          <p className="settings-subtitle">
            Manage your contributor preferences. Changes apply immediately.
          </p>
        </header>

        {/* ── Account section ─────────────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="account-heading">
          <h2 id="account-heading">Account</h2>

          <div className="settings-field settings-field--row">
            <div className="settings-field-info">
              <label className="settings-label">Connected Wallet</label>
              <p className="settings-description">
                Your Stellar public key. Disconnect to switch accounts.
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
                Disconnect
              </button>
            </div>
          </div>
        </section>

        {/* ── Appearance section ──────────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">Appearance</h2>

          {/* Theme */}
          <div className="settings-field">
            <label className="settings-label" htmlFor="theme-select">
              Theme
            </label>
            <p className="settings-description" id="theme-desc">
              Controls the colour scheme. "System" follows your OS preference.
            </p>
            <div className="settings-radio-group" role="radiogroup" aria-describedby="theme-desc">
              {(["system", "light", "dark"] as const).map((t) => (
                <label key={t} className="settings-radio-label">
                  <input
                    type="radio"
                    name="theme"
                    value={t}
                    checked={settings.theme === t}
                    onChange={() => updateSetting("theme", t)}
                    aria-label={`Theme: ${t}`}
                  />
                  <span className="settings-radio-text">
                    {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="settings-field">
            <label className="settings-label" htmlFor="language-select">
              Language
            </label>
            <p className="settings-description">
              Interface language for labels and messages.
            </p>
            <select
              id="language-select"
              className="settings-select"
              value={settings.language}
              onChange={(e) =>
                updateSetting("language", e.target.value as "en" | "es")
              }
              aria-label="Interface language"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </section>

        {/* ── Dashboard section ───────────────────────────────────────────── */}
        <section className="settings-section" aria-labelledby="dashboard-heading">
          <h2 id="dashboard-heading">Dashboard</h2>

          {/* Default org */}
          <div className="settings-field">
            <label className="settings-label" htmlFor="default-org-select">
              Default Organisation
            </label>
            <p className="settings-description">
              Pre-selects this org in the issue browser on every visit.
            </p>
            <select
              id="default-org-select"
              className="settings-select"
              value={settings.defaultOrg}
              onChange={(e) => updateSetting("defaultOrg", e.target.value)}
              aria-label="Default organisation"
            >
              <option value="">No default — show all orgs</option>
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
                Hide applied issues
              </label>
              <p className="settings-description">
                Removes issues you have already applied to from the browse view.
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
          <h2 id="notifications-heading">Notifications</h2>

          {/* Email notifications */}
          <div className="settings-field settings-field--toggle">
            <div className="settings-field-info">
              <label className="settings-label" htmlFor="email-notifications-toggle">
                Email notifications
              </label>
              <p className="settings-description">
                Receive an email when your application is accepted, assigned, or
                revoked.
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
          <h2 id="reset-heading">Reset</h2>
          <div className="settings-field settings-field--row">
            <div className="settings-field-info">
              <p className="settings-label">Reset to defaults</p>
              <p className="settings-description">
                Restores all settings to their original values. Cannot be undone.
              </p>
            </div>
            <button
              className="btn btn-revoke btn-sm"
              onClick={handleReset}
              aria-label="Reset all settings to defaults"
            >
              Reset defaults
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

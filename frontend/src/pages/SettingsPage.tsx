import { ReplayOnboardingButton } from "../components/OnboardingWizard";

/**
 * User settings page.
 * Accessible via the #/settings hash route.
 */
export function SettingsPage() {
  return (
    <section className="settings-page" aria-labelledby="settings-heading">
      <header className="settings-header">
        <h1 id="settings-heading">Settings</h1>
      </header>

      {/* ── Onboarding ──────────────────────────────────────────────────── */}
      <div className="settings-section" aria-labelledby="onboarding-settings-heading">
        <h2 id="onboarding-settings-heading">Onboarding</h2>
        <p className="settings-description">
          Re-run the onboarding wizard to revisit how to connect your Freighter
          wallet, understand the fairness caps, and find open issues.
        </p>
        <ReplayOnboardingButton />
      </div>

      {/* ── About ───────────────────────────────────────────────────────── */}
      <div className="settings-section" aria-labelledby="about-settings-heading">
        <h2 id="about-settings-heading">About</h2>
        <dl className="settings-list">
          <div className="settings-row">
            <dt>Application</dt>
            <dd>WorkloadGovernor</dd>
          </div>
          <div className="settings-row">
            <dt>Network</dt>
            <dd>Stellar Testnet</dd>
          </div>
          <div className="settings-row">
            <dt>Documentation</dt>
            <dd>
              <a
                href="https://github.com/FaveTeamz/workload-governor"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WorkloadGovernor repository (opens in new tab)"
              >
                GitHub Repository ↗
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export default SettingsPage;

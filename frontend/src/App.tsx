import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { SettingsPage } from "./components/SettingsPage";
import { ToastContainer, useToast } from "./components/Toast";
import { useWallet } from "./hooks/useWallet";
import { useSettings } from "./hooks/useSettings";
import "./app.css";

// Demo data — replace with real API calls
const DEMO_APPS: Application[] = [
  { id: "1", contributor: "GBXXX1ABCDEFGHIJKLMNO12345", org: "stellar-org", issueTitle: "Fix TTL extension bug", appliedDate: "2026-06-20" },
  { id: "2", contributor: "GCYYY2PQRSTUVWXYZABCDE67890", org: "stellar-org", issueTitle: "Add prop tests for assign_issue", appliedDate: "2026-06-21" },
  { id: "3", contributor: "GAZZZ3FGHIJKLMNOPQRST11111", org: "meridian-dao", issueTitle: "Docs: storage design overview", appliedDate: "2026-06-22" },
];

const DEMO_ASGNS: Assignment[] = [
  { id: "a1", contributor: "GBXXX1ABCDEFGHIJKLMNO12345", org: "stellar-org", issueTitle: "Optimize WASM binary size" },
  { id: "a2", contributor: "GDWWW4LMNOPQRSTUVWXYZ22222", org: "meridian-dao", issueTitle: "Integration tests for SDK" },
];

function AppShell() {
  const [applications, setApplications] = useState(DEMO_APPS);
  const [assignments, setAssignments] = useState(DEMO_ASGNS);
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const wallet = useWallet();
  const settingsHook = useSettings(wallet.address);

  async function handleAssign(app: Application) {
    await new Promise((r) => setTimeout(r, 400));
    setApplications((prev) => prev.filter((a) => a.id !== app.id));
    setAssignments((prev) => [
      ...prev,
      { id: app.id, contributor: app.contributor, org: app.org, issueTitle: app.issueTitle },
    ]);
    addToast(`Assigned "${app.issueTitle}" to ${app.contributor.slice(0, 8)}…`, "success");
  }

  async function handleComplete(asgn: Assignment) {
    await new Promise((r) => setTimeout(r, 400));
    setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));
    addToast(`Completed "${asgn.issueTitle}"`, "success");
  }

  async function handleRevoke(asgn: Assignment) {
    await new Promise((r) => setTimeout(r, 400));
    setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));
    addToast(`Revoked "${asgn.issueTitle}"`, "info");
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="app-header" role="banner">
        <span className="app-logo" aria-hidden="true">⚙</span>
        <h1>WorkloadGovernor</h1>

        <nav className="app-nav" aria-label="Main navigation">
          <NavLink
            to="/"
            className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            end
          >
            Dashboard
          </NavLink>
          {wallet.address && (
            <NavLink
              to="/settings"
              className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            >
              Settings
            </NavLink>
          )}
        </nav>

        {!wallet.address ? (
          <button
            className="btn btn-primary btn-sm wallet-btn"
            onClick={wallet.connect}
            disabled={wallet.connecting}
            aria-busy={wallet.connecting}
            aria-label="Connect your Freighter wallet"
          >
            {wallet.connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        ) : (
          <span className="wallet-address" title={wallet.address} aria-label={`Connected as ${wallet.address}`}>
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </span>
        )}

        {wallet.error && (
          <span className="wallet-error" role="alert" aria-live="polite">
            {wallet.error}
          </span>
        )}

        <GetStartedButton />
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <main id="main-content" className="app-main" tabIndex={-1}>
              <MaintainerPanel
                applications={applications}
                assignments={assignments}
                onAssign={handleAssign}
                onComplete={handleComplete}
                onRevoke={handleRevoke}
              />
            </main>
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage wallet={wallet} settingsHook={settingsHook} />
          }
        />
      </Routes>

      <OnboardingWizard />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

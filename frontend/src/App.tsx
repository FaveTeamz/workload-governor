import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { ToastContainer, useToast } from "./components/Toast";
import { ShortcutHelpModal, ShortcutHintButton } from "./components/ShortcutHelpModal";
import { ShortcutHintBanner } from "./components/ShortcutHintBanner";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CapacityBars } from "./components/CapacityBars";
import { useLiveUpdates } from "./hooks/useLiveUpdates";
import { ActivityFeed } from "./components/ActivityFeed";
import { ToastProvider, useToast } from "./components/Toast";
import { useWallet } from "./hooks/useWallet";
import { IssueDetailPage } from "./pages/IssueDetailPage";
import { RegisterOrgPage } from "./pages/RegisterOrgPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrgIssuesPage } from "./pages/OrgIssuesPage";
import { ContributorProfilePage } from "./pages/ContributorProfilePage";
import "./app.css";
import "../app/animations.css";

const DEMO_APPS: Application[] = [
  { id: "1", contributor: "GBXXX1ABCDEFGHIJKLMNO12345", org: "stellar-org", issueTitle: "Fix TTL extension bug", appliedDate: "2026-06-20" },
  { id: "2", contributor: "GCYYY2PQRSTUVWXYZABCDE67890", org: "stellar-org", issueTitle: "Add prop tests for assign_issue", appliedDate: "2026-06-21" },
  { id: "3", contributor: "GAZZZ3FGHIJKLMNOPQRST11111", org: "meridian-dao", issueTitle: "Docs: storage design overview", appliedDate: "2026-06-22" },
];

const DEMO_ASGNS: Assignment[] = [
  { id: "a1", contributor: "GBXXX1ABCDEFGHIJKLMNO12345", org: "stellar-org", issueTitle: "Optimize WASM binary size" },
  { id: "a2", contributor: "GDWWW4LMNOPQRSTUVWXYZ22222", org: "meridian-dao", issueTitle: "Integration tests for SDK" },
];

export default function App() {
  const [applications, setApplications] = useState(DEMO_APPS);
  const [assignments, setAssignments] = useState(DEMO_ASGNS);
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const { liveStatus, globalApplications, orgCounts } = useLiveUpdates();
function HomePage() {
  const [applications, setApplications] = useState<Application[]>(DEMO_APPS);
  const [assignments, setAssignments] = useState<Assignment[]>(DEMO_ASGNS);
  const [loading, setLoading] = useState(true);
  const { add: addToast } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setApplications(DEMO_APPS);
      setAssignments(DEMO_ASGNS);
      setLoading(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  // Shortcut help modal state
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);

  // Keyboard shortcut integration (closes #281)
  useKeyboardShortcuts({
    onHelp:    () => setShortcutModalOpen((prev) => !prev),
    onEscape:  () => setShortcutModalOpen(false),
    onEnter:   (_el) => {
      // Future: open TxConfirmModal for the focused issue card.
      // For now we show a toast as a placeholder until the modal is wired.
      addToast("Apply modal coming soon — press Enter on a focused issue", "info");
    },
    onOrgSelector: () => {
      // Future: focus org selector dropdown when implemented.
      addToast("Org selector: G → O shortcut registered", "info");
    },
  });

  async function handleAssign(app: Application) {
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    setApplications((prev) => prev.filter((item) => item.id !== app.id));
    setAssignments((prev) => [
      ...prev,
      { id: app.id, contributor: app.contributor, org: app.org, issueTitle: app.issueTitle },
    ]);
    addToast(`Assigned "${app.issueTitle}" to ${app.contributor.slice(0, 8)}…`, "success");
  }

  async function handleComplete(asgn: Assignment) {
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    setAssignments((prev) => prev.filter((item) => item.id !== asgn.id));
    addToast(`"${asgn.issueTitle}" marked as complete.`, "success");
  }

  async function handleRevoke(asgn: Assignment) {
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    setAssignments((prev) => prev.filter((item) => item.id !== asgn.id));
    addToast(`Assignment for "${asgn.issueTitle}" revoked.`, "info");
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="app-header" role="banner">
        <span className="app-logo" aria-hidden="true">⚙</span>
        <h1>WorkloadGovernor</h1>
        <span className={`live-indicator live-indicator--${liveStatus}`} role="status" aria-label={`Updates ${liveStatus}`}>
          <span aria-hidden="true" /> {liveStatus === "connected" ? "Live" : liveStatus === "polling" ? "Polling" : "Connecting"}
        </span>
        <GetStartedButton />
        {/* Keyboard shortcut hint button — closes #281 */}
        <ShortcutHintButton onClick={() => setShortcutModalOpen(true)} />
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        <CapacityBars globalApplications={globalApplications} orgCounts={orgCounts} />
        {/* Panel-level boundary for partial recovery — closes #280 */}
        <ErrorBoundary variant="panel" label="Maintainer Panel">
          <MaintainerPanel
            applications={applications}
            assignments={assignments}
            onAssign={handleAssign}
            onComplete={handleComplete}
            onRevoke={handleRevoke}
          />
        </ErrorBoundary>
      </main>

      <OnboardingWizard />
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Keyboard shortcut system — closes #281 */}
      <ShortcutHelpModal
        open={shortcutModalOpen}
        onClose={() => setShortcutModalOpen(false)}
      />
      <ShortcutHintBanner onShowHelp={() => setShortcutModalOpen(true)} />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <header className="app-header" role="banner">
          <span className="app-logo" aria-hidden="true">⚙</span>
          <h1>WorkloadGovernor</h1>
          <GetStartedButton />
        </header>

        <MaintainerPanel
          applications={applications}
          assignments={assignments}
          onAssign={handleAssign}
          onComplete={handleComplete}
          onRevoke={handleRevoke}
        />
        <ActivityFeed apiBase="/api" network="testnet" />
        {loading && <p className="app-main__status">Loading demo data…</p>}
      </main>

      <ErrorBoundary>
        <OnboardingWizard />
      </ErrorBoundary>
    </>
  );
}

export default function App() {
  const wallet = useWallet();
  const { toasts, remove: removeToast } = useToast();
  const isPreviewRoute = window.location.search.includes("preview=1");
  const isProduction = import.meta.env.PROD;

  return (
    <ToastProvider>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <NetworkBanner />

      <NavBar
        walletAddress={wallet.publicKey}
        walletError={wallet.error}
        networkMismatch={wallet.networkMismatch}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
      />

      <Routes>
        <Route path="/dashboard" element={<DashboardPage apiBase="/api" />} />
        <Route path="/orgs/:org_id/issues" element={<OrgIssuesPage apiBase="/api" />} />
        <Route path="/issues/:org_id/:issue_id" element={<IssueDetailPage apiBase="/api" />} />
        <Route path="/admin/register-org" element={<RegisterOrgPage apiBase="/api" />} />
        <Route
          path="/design"
          element={
            isProduction && !isPreviewRoute ? (
              <Navigate to="/" replace />
            ) : (
              <DesignSystemPage />
            )
          }
        />

        {/* Org issue browser with apply/withdraw */}
        <Route
          path="/orgs/:org_id/issues"
          element={<OrgIssuesPage apiBase="/api" />}
        />

        {/* Issue detail view */}
        <Route
          path="/issues/:org_id/:issue_id"
          element={<IssueDetailPage apiBase="/api" />}
        />

        {/* Admin: register new organisation */}
        <Route
          path="/admin/register-org"
          element={<RegisterOrgPage apiBase="/api" />}
        />

        {/* Contributor public profile */}
        <Route
          path="/contributor/:address"
          element={<ContributorProfilePage />}
        />

        {/* Default: home */}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </ToastProvider>
  );
}

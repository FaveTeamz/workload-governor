import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { ActivityFeed } from "./components/ActivityFeed";
import { ToastContainer, useToast } from "./components/Toast";
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

// ---------------------------------------------------------------------------
// Home page (existing layout extracted into its own component)
// ---------------------------------------------------------------------------

function HomePage() {
  const wallet = useWallet();
  const [applications, setApplications] = useState(DEMO_APPS);
  const [assignments, setAssignments] = useState(DEMO_ASGNS);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const navigate = useViewTransition({ targetSelector: "#main-content" });

  /** Switch tabs with a directional view transition */
  function switchView(to: DashboardView) {
    if (to === activeView) return;
    const dir = resolveDirection(activeView, to);
    navigate(() => setActiveView(to), dir);
  }

  // ── Data + loading state for skeletons (#15) ────────────────────────────
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    // Simulate async data fetch; replace with real API call
    const timer = setTimeout(() => {
      setApplications(DEMO_APPS);
      setAssignments(DEMO_ASGNS);
      setLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // ── Transaction handlers with toast feedback (#13) ─────────────────────
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
    await withToast(
      new Promise<void>((r) => setTimeout(r, 400)),
      {
        pending: `Completing "${asgn.issueTitle}"…`,
        success: `"${asgn.issueTitle}" marked as complete.`,
        error: `Failed to complete "${asgn.issueTitle}". Please try again.`,
      },
    );
    setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));
  }

  async function handleRevoke(asgn: Assignment) {
    await withToast(
      new Promise<void>((r) => setTimeout(r, 400)),
      {
        pending: `Revoking "${asgn.issueTitle}"…`,
        success: `Assignment for "${asgn.issueTitle}" revoked.`,
        error: `Failed to revoke "${asgn.issueTitle}". Please try again.`,
      },
    );
    setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));
  }

  return (
    <>
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
      </main>

      {/* Onboarding — isolated so a wizard crash doesn't kill the main panel (#16) */}
      <ErrorBoundary sectionName="Onboarding">
        <OnboardingWizard />
      </ErrorBoundary>

      {/* react-hot-toast container (#13) */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            fontSize: "0.875rem",
          },
          success: {
            iconTheme: {
              primary: "var(--color-complete, #22c55e)",
              secondary: "var(--color-surface)",
            },
          },
          error: {
            iconTheme: {
              primary: "var(--color-revoke, #ef4444)",
              secondary: "var(--color-surface)",
            },
          },
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// App shell — NavBar is shared; routes render below it
// ---------------------------------------------------------------------------

export default function App() {
  const wallet = useWallet();

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <NavBar
        walletAddress={wallet.publicKey}
        walletError={wallet.error}
        networkMismatch={wallet.networkMismatch}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
      />

      <Routes>
        {/* Contributor dashboard */}
        <Route
          path="/dashboard"
          element={<DashboardPage apiBase="/api" />}
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
    </>
  );
}

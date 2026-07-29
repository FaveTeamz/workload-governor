import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PanelRowSkeleton } from "./components/Skeleton";
import { useTheme } from "./hooks/useTheme";
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

/**
 * Wraps a transaction promise with pending → success/error toast transitions
 * using react-hot-toast (issue #13).
 */
async function withToast<T>(
  promise: Promise<T>,
  messages: { pending: string; success: string; error?: string },
): Promise<T> {
  return toast.promise(promise, {
    loading: messages.pending,
    success: messages.success,
    error: (err: unknown) =>
      messages.error ??
      (err instanceof Error ? err.message : "Transaction failed. Please try again."),
  });
}

export default function App() {
  // ── Theme toggle (#14) ──────────────────────────────────────────────────
  const { theme, toggle: toggleTheme } = useTheme();

  // ── Data + simulated loading state for skeletons (#15) ──────────────────
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    // Simulate an async data fetch; replace with real API call
    const timer = setTimeout(() => {
      setApplications(DEMO_APPS);
      setAssignments(DEMO_ASGNS);
      setLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // ── Transaction handlers with toast feedback (#13) ─────────────────────
  async function handleAssign(app: Application) {
    await withToast(
      new Promise<void>((r) => setTimeout(r, 400)),
      {
        pending: `Assigning "${app.issueTitle}"…`,
        success: `Assigned "${app.issueTitle}" to ${app.contributor.slice(0, 8)}…`,
        error: `Failed to assign "${app.issueTitle}". Please try again.`,
      },
    );
    setApplications((prev) => prev.filter((a) => a.id !== app.id));
    setAssignments((prev) => [
      ...prev,
      { id: app.id, contributor: app.contributor, org: app.org, issueTitle: app.issueTitle },
    ]);
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
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="app-header" role="banner">
        <span className="app-logo" aria-hidden="true">⚙</span>
        <h1>WorkloadGovernor</h1>
        <GetStartedButton />
        {/* Theme toggle (#14) */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "☀" : "🌙"}
        </button>
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        {/* Dashboard section — isolated error boundary (#16) */}
        <ErrorBoundary sectionName="Dashboard">
          {/* Skeleton loaders while data is fetching (#15) */}
          {loading ? (
            <div className="maintainer-panel">
              <div className="panel-columns">
                <div className="panel-column">
                  <h2>
                    Pending Applications
                    <span className="count-badge" aria-hidden="true">…</span>
                  </h2>
                  <ul className="panel-list" aria-label="Loading applications">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <PanelRowSkeleton key={i} />
                    ))}
                  </ul>
                </div>
                <div className="panel-column">
                  <h2>
                    Active Assignments
                    <span className="count-badge" aria-hidden="true">…</span>
                  </h2>
                  <ul className="panel-list" aria-label="Loading assignments">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <PanelRowSkeleton key={i} />
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <MaintainerPanel
              applications={applications}
              assignments={assignments}
              onAssign={handleAssign}
              onComplete={handleComplete}
              onRevoke={handleRevoke}
            />
          )}
        </ErrorBoundary>
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

import { useState } from "react";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { ToastContainer, useToast } from "./components/Toast";
import { useViewTransition } from "./useViewTransition";
import "./app.css";
import "../app/animations.css";

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
 * The three top-level dashboard views.
 * Order matters: higher index = "forward" direction relative to lower index.
 */
const VIEWS = ["overview", "applications", "assignments"] as const;
type DashboardView = (typeof VIEWS)[number];

/**
 * Determine transition direction based on tab index change.
 * Moving to a higher-indexed tab = forward, lower = back.
 */
function resolveDirection(
  from: DashboardView,
  to: DashboardView
): "forward" | "back" | "none" {
  const fromIdx = VIEWS.indexOf(from);
  const toIdx = VIEWS.indexOf(to);
  if (toIdx > fromIdx) return "forward";
  if (toIdx < fromIdx) return "back";
  return "none";
}

export default function App() {
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
        <GetStartedButton />
      </header>

      {/* Tab navigation — the primary "routing" surface in this SPA */}
      <nav className="view-tabs" aria-label="Dashboard sections">
        <button
          className={`view-tab${activeView === "overview" ? " active" : ""}`}
          onClick={() => switchView("overview")}
          aria-current={activeView === "overview" ? "page" : undefined}
          aria-controls="main-content"
        >
          Overview
        </button>
        <button
          className={`view-tab${activeView === "applications" ? " active" : ""}`}
          onClick={() => switchView("applications")}
          aria-current={activeView === "applications" ? "page" : undefined}
          aria-controls="main-content"
        >
          Applications
          {applications.length > 0 && (
            <span className="tab-badge" aria-label={`${applications.length} pending`}>
              {applications.length}
            </span>
          )}
        </button>
        <button
          className={`view-tab${activeView === "assignments" ? " active" : ""}`}
          onClick={() => switchView("assignments")}
          aria-current={activeView === "assignments" ? "page" : undefined}
          aria-controls="main-content"
        >
          Assignments
          {assignments.length > 0 && (
            <span className="tab-badge" aria-label={`${assignments.length} active`}>
              {assignments.length}
            </span>
          )}
        </button>
      </nav>

      <main id="main-content" className="app-main dashboard-view" tabIndex={-1}>
        {activeView === "overview" && (
          <section className="view-tab-panel" aria-label="Overview">
            <div className="overview-stats">
              <div className="stat-card">
                <span className="stat-value">{applications.length}</span>
                <span className="stat-label">Pending Applications</span>
                <button
                  className="btn btn-primary btn-sm stat-cta"
                  onClick={() => switchView("applications")}
                  aria-label="Go to Applications view"
                >
                  Review →
                </button>
              </div>
              <div className="stat-card">
                <span className="stat-value">{assignments.length}</span>
                <span className="stat-label">Active Assignments</span>
                <button
                  className="btn btn-secondary btn-sm stat-cta"
                  onClick={() => switchView("assignments")}
                  aria-label="Go to Assignments view"
                >
                  Manage →
                </button>
              </div>
              <div className="stat-card">
                <span className="stat-value">15</span>
                <span className="stat-label">Global App Cap</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">4</span>
                <span className="stat-label">Per-Org Assignment Cap</span>
              </div>
            </div>
          </section>
        )}

        {activeView === "applications" && (
          <section className="view-tab-panel" aria-label="Pending Applications">
            <MaintainerPanel
              applications={applications}
              assignments={[]}
              onAssign={handleAssign}
              onComplete={handleComplete}
              onRevoke={handleRevoke}
              mode="applications"
            />
          </section>
        )}

        {activeView === "assignments" && (
          <section className="view-tab-panel" aria-label="Active Assignments">
            <MaintainerPanel
              applications={[]}
              assignments={assignments}
              onAssign={handleAssign}
              onComplete={handleComplete}
              onRevoke={handleRevoke}
              mode="assignments"
            />
          </section>
        )}
      </main>

      <OnboardingWizard />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

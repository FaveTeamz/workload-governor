import { useState } from "react";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { ToastContainer, useToast } from "./components/Toast";
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

export default function App() {
  const [applications, setApplications] = useState(DEMO_APPS);
  const [assignments, setAssignments] = useState(DEMO_ASGNS);
  const { toasts, add: addToast, update: updateToast, remove: removeToast } = useToast();

  async function handleAssign(app: Application) {
    const toastId = addToast(`Assigning "${app.issueTitle}"…`, "pending");
    try {
      await new Promise((r) => setTimeout(r, 400)); // simulate network
      setApplications((prev) => prev.filter((a) => a.id !== app.id));
      setAssignments((prev) => [
        ...prev,
        { id: app.id, contributor: app.contributor, org: app.org, issueTitle: app.issueTitle },
      ]);
      updateToast(toastId, `Assigned "${app.issueTitle}" to ${app.contributor.slice(0, 8)}…`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to assign issue. Please try again.";
      updateToast(toastId, message, "error");
    }
  }

  async function handleComplete(asgn: Assignment) {
    const toastId = addToast(`Completing "${asgn.issueTitle}"…`, "pending");
    try {
      await new Promise((r) => setTimeout(r, 400));
      setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));
      updateToast(toastId, `Completed "${asgn.issueTitle}"`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete assignment. Please try again.";
      updateToast(toastId, message, "error");
    }
  }

  async function handleRevoke(asgn: Assignment) {
    const toastId = addToast(`Revoking "${asgn.issueTitle}"…`, "pending");
    try {
      await new Promise((r) => setTimeout(r, 400));
      setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));
      updateToast(toastId, `Revoked "${asgn.issueTitle}"`, "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke assignment. Please try again.";
      updateToast(toastId, message, "error");
    }
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

      <main id="main-content" className="app-main" tabIndex={-1}>
        <MaintainerPanel
          applications={applications}
          assignments={assignments}
          onAssign={handleAssign}
          onComplete={handleComplete}
          onRevoke={handleRevoke}
        />
      </main>

      <OnboardingWizard />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

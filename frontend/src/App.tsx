import { useState } from "react";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { ToastContainer, useToast } from "./components/Toast";
import { ShortcutHelpModal, ShortcutHintButton } from "./components/ShortcutHelpModal";
import { ShortcutHintBanner } from "./components/ShortcutHintBanner";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
  const { toasts, add: addToast, remove: removeToast } = useToast();

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
    await new Promise((r) => setTimeout(r, 400)); // simulate network
    setApplications((prev) => prev.filter((a) => a.id !== app.id));
    setAssignments((prev) => [...prev, { id: app.id, contributor: app.contributor, org: app.org, issueTitle: app.issueTitle }]);
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
        {/* Keyboard shortcut hint button — closes #281 */}
        <ShortcutHintButton onClick={() => setShortcutModalOpen(true)} />
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
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
    </>
  );
}

import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { OnboardingWizard, GetStartedButton } from "./components/OnboardingWizard";
import { MaintainerPanel } from "./components/MaintainerPanel";
import type { Application, Assignment } from "./components/MaintainerPanel";
import { ActivityFeed } from "./components/ActivityFeed";
import { ToastProvider, useToast } from "./components/Toast";
import { useWallet } from "./hooks/useWallet";
import { IssueDetailPage } from "./pages/IssueDetailPage";
import { RegisterOrgPage } from "./pages/RegisterOrgPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrgIssuesPage } from "./pages/OrgIssuesPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import NetworkBanner from "../components/NetworkBanner";
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

      <ErrorBoundary>
        <OnboardingWizard />
      </ErrorBoundary>
    </>
  );
}

export default function App() {
  const wallet = useWallet();

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
        <Route path="*" element={<HomePage />} />
      </Routes>
    </ToastProvider>
  );
}

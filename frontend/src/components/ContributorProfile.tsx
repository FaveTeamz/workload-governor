import type { ReactNode } from "react";

export interface ContributorProfileProps {
  walletAddress: string;
  completions: number;
  fairnessScore?: number;
  pendingApplications?: number;
  maxApplications?: number;
  assignments?: number;
  maxAssignments?: number;
  children?: ReactNode;
}

export function getWorkloadAnnouncement(
  pendingApplications?: number,
  maxApplications: number = 15,
  assignments?: number,
  maxAssignments: number = 4,
): string {
  if (pendingApplications !== undefined && assignments !== undefined) {
    return `Workload updated: ${pendingApplications} of ${maxApplications} applications used, ${assignments} of ${maxAssignments} assignments active`;
  }
  if (pendingApplications !== undefined) {
    return `Workload updated: ${pendingApplications} of ${maxApplications} applications used`;
  }
  if (assignments !== undefined) {
    return `Workload updated: ${assignments} of ${maxAssignments} assignments active`;
  }
  return "";
}

export function ContributorProfile({
  walletAddress,
  completions,
  fairnessScore,
  pendingApplications,
  maxApplications = 15,
  assignments,
  maxAssignments = 4,
  children,
}: ContributorProfileProps) {
  const exportDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const announcement = getWorkloadAnnouncement(
    pendingApplications,
    maxApplications,
    assignments,
    maxAssignments,
  );

  return (
    <section className="contributor-profile" aria-label="Contributor profile">
      {/* Screen-reader-only ARIA live region for dynamic workload updates */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="workload-live-region"
        className="sr-only"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announcement}
      </div>

      <div className="contributor-profile__header">
        <h1 className="contributor-profile__title">Contributor Profile</h1>
        <dl className="contributor-profile__stats">
          <div className="contributor-profile__stat">
            <dt>Wallet Address</dt>
            <dd className="contributor-profile__address" title={walletAddress}>
              {walletAddress}
            </dd>
          </div>
          <div className="contributor-profile__stat">
            <dt>Total Completions</dt>
            <dd>{completions}</dd>
          </div>
          {fairnessScore !== undefined && (
            <div className="contributor-profile__stat">
              <dt>Fairness Score</dt>
              <dd>{fairnessScore.toFixed(2)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="contributor-profile__timeline">
        {children}
      </div>

      {/* Only visible when printing */}
      <footer className="print-footer" aria-hidden="true">
        <span>Wallet: {walletAddress}</span>
        <span className="print-footer__sep"> · </span>
        <span>Exported: {exportDate}</span>
        <span className="print-footer__sep"> · </span>
        <span>WorkloadGovernor</span>
      </footer>
    </section>
  );
}
export default ContributorProfile;

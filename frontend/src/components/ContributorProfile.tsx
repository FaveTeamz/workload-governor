import type { ReactNode } from "react";

export interface ContributorProfileProps {
  walletAddress: string;
  completions: number;
  fairnessScore?: number;
  children?: ReactNode;
}

export function ContributorProfile({
  walletAddress,
  completions,
  fairnessScore,
  children,
}: ContributorProfileProps) {
  const exportDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="contributor-profile" aria-label="Contributor profile">
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

/**
 * OrgIssuesPage — issue #199
 *
 * Browse open issues for an org, with inline Apply/Withdraw actions that
 * invoke the WorkloadGovernor contract via Freighter wallet.
 *
 * Acceptance criteria:
 *  - Shows issue ID, title (from GitHub API stub), status
 *  - Apply button disabled if either cap reached
 *  - Optimistic UI update after transaction submitted
 *  - Transaction spinner → Stellar Explorer deeplink on success
 *  - Wallet not connected → prompt to connect
 */
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useOrgIssues, type OrgIssue, type IssueStatus } from '../hooks/useOrgIssues';
import './OrgIssuesPage.css';

const GLOBAL_CAP = 15;
const ORG_CAP    = 4;

const STATUS_LABEL: Record<IssueStatus, string> = {
  open:     'Open',
  applied:  'Applied',
  assigned: 'Assigned',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface IssueRowProps {
  issue: OrgIssue;
  canApply: boolean;
  capReachedReason: string | null;
  onApply: (issueId: string) => void;
  onWithdraw: (issueId: string) => void;
  busy: boolean;
  txHash: string | null;
}

function IssueRow({ issue, canApply, capReachedReason, onApply, onWithdraw, busy, txHash }: IssueRowProps) {
  const showApply    = issue.status === 'open';
  const showWithdraw = issue.status === 'applied';
  const isDisabled   = !canApply || busy;
  const network      = (import.meta.env.VITE_STELLAR_NETWORK ?? 'TESTNET').toLowerCase();

  return (
    <div className="org-issue-row">
      <div className="org-issue-row__info">
        <h3 className="org-issue-row__title">{issue.title}</h3>
        <div className="org-issue-row__meta">
          <span className="org-issue-row__id">{issue.issue_id}</span>
          {issue.reward_xlm && (
            <span className="org-issue-row__reward">{issue.reward_xlm} XLM</span>
          )}
          <span className={`org-issue-row__chip org-issue-row__chip--${issue.status}`}>
            {STATUS_LABEL[issue.status]}
          </span>
        </div>
      </div>

      <div className="org-issue-row__actions">
        {showApply && (
          <button
            className="org-issue-row__btn org-issue-row__btn--apply"
            onClick={() => onApply(issue.issue_id)}
            disabled={isDisabled}
            aria-label={`Apply for issue: ${issue.title}`}
            title={capReachedReason ?? undefined}
            type="button"
          >
            {busy ? (
              <>
                <span className="org-issue-row__spinner" aria-hidden="true" />
                Applying…
              </>
            ) : (
              'Apply'
            )}
          </button>
        )}
        {showWithdraw && (
          <button
            className="org-issue-row__btn org-issue-row__btn--withdraw"
            onClick={() => onWithdraw(issue.issue_id)}
            disabled={busy}
            aria-label={`Withdraw application for: ${issue.title}`}
            type="button"
          >
            {busy ? (
              <>
                <span className="org-issue-row__spinner" aria-hidden="true" />
                Withdrawing…
              </>
            ) : (
              'Withdraw'
            )}
          </button>
        )}
        {txHash && (
          <a
            className="org-issue-row__tx-link"
            href={`https://stellar.expert/explorer/${network}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            aria-label="View transaction on Stellar Explorer"
          >
            View Tx →
          </a>
        )}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return <div className="org-issue-row org-issue-row--skeleton" aria-busy="true" />;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface OrgIssuesPageProps {
  apiBase?: string;
}

export function OrgIssuesPage({ apiBase = '/api' }: OrgIssuesPageProps) {
  const { org_id } = useParams<{ org_id: string }>();
  const wallet = useWallet();

  const { issues, loading, error, globalAppCount, orgAssignCount, refresh, setIssueStatus } =
    useOrgIssues(apiBase, org_id ?? '', wallet.publicKey ?? null);

  const [busyIssue, setBusyIssue] = useState<string | null>(null);
  const [txHash, setTxHash]       = useState<string | null>(null);

  // ── Cap logic ──────────────────────────────────────────────────────────
  const globalCapReached = globalAppCount >= GLOBAL_CAP;
  const orgCapReached    = orgAssignCount >= ORG_CAP;
  const canApply         = wallet.publicKey !== null && !globalCapReached && !orgCapReached;

  let capReachedReason: string | null = null;
  if (!wallet.publicKey)       capReachedReason = 'Connect your wallet to apply.';
  else if (globalCapReached)   capReachedReason = `Global limit reached: ${globalAppCount}/${GLOBAL_CAP} applications.`;
  else if (orgCapReached)      capReachedReason = `Org limit reached: ${orgAssignCount}/${ORG_CAP} assignments.`;

  // ── Action handlers ────────────────────────────────────────────────────
  async function handleApply(issueId: string) {
    if (!wallet.publicKey) return;
    setBusyIssue(issueId);
    setTxHash(null);

    try {
      // Optimistic UI
      setIssueStatus(issueId, 'applied');

      // Invoke contract via Freighter (stub: just POST to backend)
      const res = await fetch(`${apiBase}/orgs/${encodeURIComponent(org_id!)}/issues/${encodeURIComponent(issueId)}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributor: wallet.publicKey }),
      });
      if (!res.ok) throw new Error(`Apply failed: ${res.status}`);
      const data = await res.json() as { tx_hash?: string };
      if (data.tx_hash) setTxHash(data.tx_hash);

      // Success — keep optimistic state
    } catch (err) {
      // Revert optimistic
      setIssueStatus(issueId, 'open');
      alert(`Apply failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusyIssue(null);
    }
  }

  async function handleWithdraw(issueId: string) {
    if (!wallet.publicKey) return;
    setBusyIssue(issueId);
    setTxHash(null);

    try {
      setIssueStatus(issueId, 'open');

      const res = await fetch(
        `${apiBase}/orgs/${encodeURIComponent(org_id!)}/issues/${encodeURIComponent(issueId)}/apply?contributor=${encodeURIComponent(wallet.publicKey)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`Withdraw failed: ${res.status}`);
    } catch (err) {
      setIssueStatus(issueId, 'applied');
      alert(`Withdraw failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusyIssue(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const showCapBanner = !loading && wallet.publicKey && (globalCapReached || orgCapReached);

  return (
    <main className="org-issues-page" id="main-content" tabIndex={-1}>
      <div className="org-issues-page__header">
        <div>
          <h1 className="org-issues-page__title">Issues: {org_id}</h1>
          <p className="org-issues-page__subtitle">Browse and apply for open issues</p>
        </div>
        <button
          className="org-issues-page__refresh-btn"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh issues"
          type="button"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Wallet not connected → prompt */}
      {!wallet.publicKey && (
        <div className="org-issues-page__connect">
          <span className="org-issues-page__connect-text">
            Connect your wallet to apply for issues.
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={wallet.connect}
            type="button"
          >
            Connect Freighter
          </button>
        </div>
      )}

      {/* Cap banner */}
      {showCapBanner && (
        <div className="org-issues-page__cap-banner" role="alert">
          ⚠️ {capReachedReason}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="org-issues-page__error" role="alert">
          Failed to load issues: {error}
        </div>
      )}

      {/* Issue list */}
      {loading && issues.length === 0 ? (
        <div className="org-issues-page__list">
          {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
        </div>
      ) : issues.length === 0 ? (
        <p className="org-issues-page__empty">No open issues for this org.</p>
      ) : (
        <div className="org-issues-page__list">
          {issues.map((issue) => (
            <IssueRow
              key={issue.issue_id}
              issue={issue}
              canApply={canApply}
              capReachedReason={capReachedReason}
              onApply={handleApply}
              onWithdraw={handleWithdraw}
              busy={busyIssue === issue.issue_id}
              txHash={busyIssue === issue.issue_id ? txHash : null}
            />
          ))}
        </div>
      )}
    </main>
  );
}

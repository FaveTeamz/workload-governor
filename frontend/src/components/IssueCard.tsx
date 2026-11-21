import { useState } from "react";

/** Issue status values */
export type IssueStatus = "open" | "applied" | "assigned" | "completed";

export interface IssueCardProps {
  id: string;
  org: string;
  title: string;
  status: IssueStatus;
  /** When true the Apply button is disabled and a tooltip explains the cap. */
  globalCapReached?: boolean;
  onApply?: (id: string) => Promise<void> | void;
  onWithdraw?: (id: string) => Promise<void> | void;
  /** Called when an apply transaction fails — parent should display an error toast */
  onApplyError?: (id: string, error: unknown) => void;
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  open:      "Open",
  applied:   "Applied",
  assigned:  "Assigned",
  completed: "Completed",
};

const CAP_MSG = "You have reached the maximum 15 pending applications";

export function IssueCard({ id, org, title, status, globalCapReached = false, onApply, onWithdraw, onApplyError }: IssueCardProps) {
  const [busy, setBusy] = useState(false);
  /**
   * Optimistic status: set immediately on Apply click so the UI reflects
   * the pending state before the blockchain transaction resolves (3-6 s).
   * Reverted to null on failure — falls back to the `status` prop.
   */
  const [optimisticStatus, setOptimisticStatus] = useState<IssueStatus | null>(null);

  const displayStatus: IssueStatus = optimisticStatus ?? status;

  async function handleApply() {
    // Optimistically show as applied right away
    setOptimisticStatus("applied");
    setBusy(true);
    try {
      await onApply?.(id);
      // Success: keep optimistic state; parent will update the prop on next render
    } catch (err) {
      // Revert optimistic update and notify parent to show toast
      setOptimisticStatus(null);
      onApplyError?.(id, err);
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    setBusy(true);
    try {
      await onWithdraw?.(id);
    } finally {
      setBusy(false);
    }
  }

  const capMsgId = `global-cap-msg-${id}`;
  const applyDisabled = busy || globalCapReached;

  return (
    <article className={`issue-card issue-card--${displayStatus}`} aria-label={`Issue: ${title}`}>
      <div className="issue-card__meta">
        <span className="issue-card__org" aria-label={`Organisation: ${org}`}>{org}</span>
        <span
          className={`issue-card__chip issue-card__chip--${displayStatus}`}
          aria-label={`Status: ${STATUS_LABEL[displayStatus]}`}
          aria-live="polite"
        >
          {STATUS_LABEL[displayStatus]}
        </span>
      </div>

      <h3 className="issue-card__title">{title}</h3>

      <div className="issue-card__actions">
        {displayStatus === "open" && (
          <>
            {globalCapReached && (
              <span id={capMsgId} className="visually-hidden">{CAP_MSG}</span>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => !applyDisabled && handleApply()}
              disabled={applyDisabled}
              aria-busy={busy}
              aria-disabled={globalCapReached || undefined}
              aria-describedby={globalCapReached ? capMsgId : undefined}
              aria-label={`Apply for issue: ${title}`}
              title={globalCapReached ? CAP_MSG : undefined}
            >
              {busy ? "Applying…" : "Apply"}
            </button>
          </>
        )}
        {displayStatus === "applied" && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleWithdraw}
            disabled={busy}
            aria-busy={busy}
            aria-label={`Withdraw application for: ${title}`}
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        )}
        {/* Optimistic pending indicator — shown while the tx is in-flight */}
        {busy && displayStatus === "applied" && !optimisticStatus && (
          <span className="spinner" aria-hidden="true" />
        )}
      </div>
    </article>
  );
}

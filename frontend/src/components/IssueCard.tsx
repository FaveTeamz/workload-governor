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
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  open:      "Open",
  applied:   "Applied",
  assigned:  "Assigned",
  completed: "Completed",
};

const CAP_MSG = "You have reached the maximum 15 pending applications";

export function IssueCard({ id, org, title, status, globalCapReached = false, onApply, onWithdraw }: IssueCardProps) {
  const [busy, setBusy] = useState(false);

  async function handle(action: "apply" | "withdraw") {
    setBusy(true);
    try {
      if (action === "apply") await onApply?.(id);
      else await onWithdraw?.(id);
    } finally {
      setBusy(false);
    }
  }

  const capMsgId = `global-cap-msg-${id}`;
  const applyDisabled = busy || globalCapReached;

  return (
    <article className={`issue-card issue-card--${status}`} aria-label={`Issue: ${title}`}>
      <div className="issue-card__meta">
        <span className="issue-card__org" aria-label={`Organisation: ${org}`}>{org}</span>
        <span className={`issue-card__chip issue-card__chip--${status}`} aria-label={`Status: ${STATUS_LABEL[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <h3 className="issue-card__title">{title}</h3>

      <div className="issue-card__actions">
        {status === "open" && (
          <>
            {globalCapReached && (
              <span id={capMsgId} className="visually-hidden">{CAP_MSG}</span>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => !applyDisabled && handle("apply")}
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
        {status === "applied" && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handle("withdraw")}
            disabled={busy}
            aria-busy={busy}
            aria-label={`Withdraw application for: ${title}`}
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        )}
      </div>
    </article>
  );
}

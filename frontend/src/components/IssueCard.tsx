/**
 * IssueCard — closes #323 (disabled Apply tooltip)
 */
import { useState } from "react";
import { Tooltip } from "./Tooltip";

/** Issue status values */
export type IssueStatus = "open" | "applied" | "assigned" | "completed";

export interface IssueCardProps {
  id: string;
  org: string;
  title: string;
  status: IssueStatus;
  onApply?: (id: string) => Promise<void> | void;
  onWithdraw?: (id: string) => Promise<void> | void;
  /**
   * When provided the Apply button is disabled and the string is shown
   * as a tooltip explaining which cap is blocking the user.
   * Example: "You've reached the global limit of 15 pending applications."
   */
  applyDisabledReason?: string;
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  open:      "Open",
  applied:   "Applied",
  assigned:  "Assigned",
  completed: "Completed",
};

export function IssueCard({
  id, org, title, status, onApply, onWithdraw, applyDisabledReason,
}: IssueCardProps) {
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

  function renderApplyButton() {
    const isDisabledByReason = Boolean(applyDisabledReason);
    const isDisabled = busy || isDisabledByReason;

    const btn = (
      // A <span> wrapper is required because disabled buttons do not fire
      // mouse/focus events in all browsers — the Tooltip needs those.
      <span style={{ display: "inline-block" }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={isDisabledByReason ? undefined : () => handle("apply")}
          disabled={isDisabled}
          aria-busy={busy}
          aria-label={`Apply for issue: ${title}`}
          style={isDisabledByReason ? { pointerEvents: "none" } : undefined}
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </span>
    );

    if (applyDisabledReason) {
      return (
        <Tooltip content={applyDisabledReason} position="top">
          {btn}
        </Tooltip>
      );
    }

    return btn;
  }

  return (
    <article className={`issue-card issue-card--${status}`} aria-label={`Issue: ${title}`}>
      <div className="issue-card__meta">
        <span className="issue-card__org" aria-label={`Organisation: ${org}`}>{org}</span>
        <span
          className={`issue-card__chip issue-card__chip--${status}`}
          aria-label={`Status: ${STATUS_LABEL[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <h3 className="issue-card__title">{title}</h3>

      <div className="issue-card__actions">
        {status === "open" && renderApplyButton()}
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

/**
 * IssueCard — closes #323 (disabled Apply tooltip), #648 (color-blind status)
 *
 * Status chips now use icon + text label so color is never the sole indicator.
 */
import { useState } from "react";
import { Tooltip } from "./Tooltip";
import { Icon, type IconName } from "./Icon";

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
   */
  applyDisabledReason?: string;
}

// ─── Status metadata: icon + label for color-blind accessibility ─────────────

interface StatusMeta {
  icon: IconName;
  label: string;
}

const STATUS_META: Record<IssueStatus, StatusMeta> = {
  open:      { icon: "issue-open",   label: "Open"      },
  applied:   { icon: "info",         label: "Pending"   },
  assigned:  { icon: "assign",       label: "Assigned"  },
  completed: { icon: "check-circle", label: "Completed" },
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
      // <span> wrapper required because disabled buttons don't fire mouse events
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

  const { icon, label } = STATUS_META[status];

  return (
    <article className={`issue-card issue-card--${status}`} aria-label={`Issue: ${title}`}>
      <div className="issue-card__meta">
        <span className="issue-card__org" aria-label={`Organisation: ${org}`}>{org}</span>

        {/* Color-blind-friendly chip: icon + text label */}
        <span
          className={`issue-card__chip issue-card__chip--${status}`}
          aria-label={`Status: ${label}`}
        >
          <Icon name={icon} size="xs" aria-hidden={true} />
          <span>{label}</span>
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

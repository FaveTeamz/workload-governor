/**
 * ApplyButton — Issue #5
 *
 * Wraps useApplyForIssue. Displays:
 *   idle     → "Apply"  (primary button)
 *   submitting → spinner + "Applying…" (disabled)
 *   applied  → "Withdraw" (secondary button, triggers onWithdraw)
 *   error    → "Apply" + inline error message
 *
 * All 11 contract error codes are mapped to user-friendly messages via
 * the hook. An optional `applyDisabledReason` prop shows a tooltip and
 * disables the button (e.g. global cap reached).
 */

import { Tooltip } from "./Tooltip";
import {
  useApplyForIssue,
  type ApplyContractClient,
} from "../hooks/useApplyForIssue";

export interface ApplyButtonProps {
  contributor: string;
  orgId: string;
  issueId: number;
  /** If set, button is disabled and this message shown as a tooltip */
  applyDisabledReason?: string;
  /** Called when user clicks the Withdraw button (post-apply) */
  onWithdraw?: () => void;
  /** Optional injected client (useful in tests) */
  contractClient?: ApplyContractClient;
}

export function ApplyButton({
  contributor,
  orgId,
  issueId,
  applyDisabledReason,
  onWithdraw,
  contractClient,
}: ApplyButtonProps) {
  const { state, errorMessage, apply } = useApplyForIssue({
    contributor,
    orgId,
    issueId,
    contractClient,
  });

  const isSubmitting = state === "submitting";
  const isApplied = state === "applied";
  const isDisabledByReason = Boolean(applyDisabledReason);
  const isDisabled = isSubmitting || isDisabledByReason;

  if (isApplied) {
    return (
      <div className="apply-btn-group">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onWithdraw}
          aria-label={`Withdraw application for issue #${issueId}`}
          data-testid="withdraw-btn"
        >
          Withdraw
        </button>
      </div>
    );
  }

  function renderApplyButton() {
    const btn = (
      <span style={{ display: "inline-block" }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={isDisabledByReason ? undefined : apply}
          disabled={isDisabled}
          aria-busy={isSubmitting}
          aria-label={`Apply for issue #${issueId}`}
          style={isDisabledByReason ? { pointerEvents: "none" } : undefined}
          data-testid="apply-btn"
        >
          {isSubmitting ? (
            <>
              <span
                className="spinner spinner--sm"
                aria-hidden="true"
                role="status"
              />
              Applying…
            </>
          ) : (
            "Apply"
          )}
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
    <div className="apply-btn-group">
      {renderApplyButton()}
      {state === "error" && errorMessage && (
        <p
          className="apply-btn-group__error"
          role="alert"
          aria-live="polite"
          data-testid="apply-error"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

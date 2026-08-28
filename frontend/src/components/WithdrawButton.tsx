/**
 * WithdrawButton — Issue #6
 *
 * "Withdraw" button for a pending application. Shows a confirmation Modal
 * before submitting to prevent accidental withdrawals. Removes the application
 * from the local list on success via onSuccess callback.
 *
 * Acceptance criteria:
 *  ✓  Confirmation modal prevents accidental withdrawals
 *  ✓  Application removed from list after successful withdrawal
 *  ✓  Error states handled and displayed
 */

import { Modal } from "./Modal";
import {
  useWithdrawApplication,
  type WithdrawContractClient,
} from "../hooks/useWithdrawApplication";

export interface WithdrawButtonProps {
  contributor: string;
  orgId: string;
  issueId: number;
  issueTitle?: string;
  /** Called after a successful withdrawal so parent can update its list */
  onSuccess?: () => void;
  /** Optional injected client (useful in tests) */
  contractClient?: WithdrawContractClient;
}

export function WithdrawButton({
  contributor,
  orgId,
  issueId,
  issueTitle,
  onSuccess,
  contractClient,
}: WithdrawButtonProps) {
  const {
    state,
    errorMessage,
    requestWithdraw,
    confirmWithdraw,
    cancelWithdraw,
  } = useWithdrawApplication({
    contributor,
    orgId,
    issueId,
    onSuccess,
    contractClient,
  });

  const isSubmitting = state === "submitting";
  const isConfirming = state === "confirming";
  const isWithdrawn = state === "withdrawn";

  if (isWithdrawn) {
    // Once withdrawn the parent removes this from the list; render nothing
    return null;
  }

  const label = issueTitle ? `"${issueTitle}"` : `issue #${issueId}`;

  return (
    <div className="withdraw-btn-group">
      <button
        className="btn btn-secondary btn-sm"
        onClick={requestWithdraw}
        disabled={isSubmitting}
        aria-label={`Withdraw application for ${label}`}
        data-testid="withdraw-trigger"
      >
        Withdraw
      </button>

      {state === "error" && errorMessage && (
        <p
          className="withdraw-btn-group__error"
          role="alert"
          aria-live="polite"
          data-testid="withdraw-error"
        >
          {errorMessage}
        </p>
      )}

      {/* Confirmation modal */}
      <Modal
        open={isConfirming || isSubmitting}
        title="Confirm withdrawal"
        onClose={isSubmitting ? () => {} : cancelWithdraw}
        footer={
          <div className="withdraw-modal__footer">
            <button
              className="btn btn-ghost btn-sm"
              onClick={cancelWithdraw}
              disabled={isSubmitting}
              aria-label="Cancel withdrawal"
              data-testid="withdraw-cancel"
            >
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={confirmWithdraw}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              aria-label="Confirm withdrawal"
              data-testid="withdraw-confirm"
            >
              {isSubmitting ? (
                <>
                  <span className="spinner spinner--sm" aria-hidden="true" />
                  Withdrawing…
                </>
              ) : (
                "Confirm withdrawal"
              )}
            </button>
          </div>
        }
      >
        <p>
          Are you sure you want to withdraw your application for{" "}
          <strong>{label}</strong>?
        </p>
        <p className="withdraw-modal__note">
          This action cannot be undone. You can re-apply later if the issue is
          still open, subject to capacity limits.
        </p>
      </Modal>
    </div>
  );
}

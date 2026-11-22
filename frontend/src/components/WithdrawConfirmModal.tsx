/**
 * WithdrawConfirmModal — closes #withdraw-confirm
 *
 * A lightweight confirmation dialog for the contributor withdraw-application
 * workflow. Unlike TxConfirmModal it does not display fee/XDR details because
 * withdraw_application charges no fee beyond the base network fee.
 *
 * Usage:
 *   const [pending, setPending] = useState<WithdrawTarget | null>(null);
 *   <WithdrawConfirmModal
 *     target={pending}
 *     loading={busy}
 *     onConfirm={() => runWithdraw(pending)}
 *     onCancel={() => setPending(null)}
 *   />
 */

import { Modal } from './Modal';

export interface WithdrawTarget {
  /** Numeric issue identifier */
  issueId: string;
  /** Human-readable issue title displayed in the dialog body */
  issueTitle: string;
  /** Organisation the issue belongs to */
  orgId: string;
}

export interface WithdrawConfirmModalProps {
  /** The issue targeted for withdrawal. Pass `null` to close the modal. */
  target: WithdrawTarget | null;
  /** When `true` the Confirm button shows a spinner and is disabled. */
  loading?: boolean;
  /** Called when the contributor clicks "Confirm withdrawal". */
  onConfirm: () => void;
  /** Called when the contributor clicks "Cancel" or presses Escape. */
  onCancel: () => void;
}

export function WithdrawConfirmModal({
  target,
  loading = false,
  onConfirm,
  onCancel,
}: WithdrawConfirmModalProps) {
  const open = target !== null;

  // The Modal component always requires children; render an empty fragment when closed
  const body = open ? (
    <div className="withdraw-modal__body" data-testid="withdraw-modal-body">
      <p className="withdraw-modal__text">
        You are about to withdraw your application for:
      </p>
      <p className="withdraw-modal__issue-title">
        <strong data-testid="withdraw-modal-title">{target!.issueTitle}</strong>
      </p>
      <p className="withdraw-modal__org">
        Org: <span data-testid="withdraw-modal-org">{target!.orgId}</span>
      </p>
      <p className="withdraw-modal__note">
        This action will free up one slot in your global application count.
        It cannot be undone — you will need to re-apply if you change your mind.
      </p>
    </div>
  ) : <></>;

  return (
    <Modal
      open={open}
      title="Withdraw application?"
      onClose={onCancel}
      footer={
        <div className="withdraw-modal__footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
            data-testid="withdraw-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            data-testid="withdraw-modal-confirm"
          >
            {loading ? (
              <>
                <span className="withdraw-modal__spinner" aria-hidden="true" />
                Withdrawing…
              </>
            ) : (
              'Confirm withdrawal'
            )}
          </button>
        </div>
      }
    >
      {body}
    </Modal>
  );
}

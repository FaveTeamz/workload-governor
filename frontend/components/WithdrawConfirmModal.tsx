/**
 * WithdrawConfirmModal — closes #539
 *
 * Confirmation dialog for the contributor withdraw-application workflow.
 * Unlike TxConfirmModal it does not display fee/XDR details because
 * withdraw_application charges no fee beyond the base network fee.
 *
 * States:
 *  - closed: target is null
 *  - confirming: target is set, loading is false → shows org/issue + Cancel/Confirm
 *  - loading: loading is true → buttons disabled, spinner text
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

"use client";
import { useRef, useEffect, type KeyboardEvent } from "react";
import "./WithdrawConfirmModal.css";

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

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function WithdrawConfirmModal({
  target,
  loading = false,
  onConfirm,
  onCancel,
}: WithdrawConfirmModalProps) {
  const open = target !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // ── Focus management ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
        first?.focus();
      });
    } else {
      document.body.style.overflow = "";
      previousFocus.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ── Escape key ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  // ── Tab trap ────────────────────────────────────────────────────────────
  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="withdraw-modal-backdrop"
        aria-hidden="true"
        onClick={() => { if (!loading) onCancel(); }}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-modal-title"
        aria-describedby="withdraw-modal-desc"
        onKeyDown={trapFocus}
        className="withdraw-modal"
      >
        {/* Hero */}
        <div className="withdraw-modal__hero">
          <span className="withdraw-modal__icon" aria-hidden="true">⚠️</span>
          <div className="withdraw-modal__hero-text">
            <h2 id="withdraw-modal-title" className="withdraw-modal__action-summary">
              Withdraw application?
            </h2>
            <p id="withdraw-modal-desc" className="withdraw-modal__subtitle">
              This action is irreversible and cannot be undone.
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="withdraw-modal__body">
          <p className="withdraw-modal__text">
            You are about to withdraw your application for:
          </p>
          <dl className="withdraw-modal__info">
            <div className="withdraw-modal__info-item">
              <dt className="withdraw-modal__info-label">Issue</dt>
              <dd
                className="withdraw-modal__info-value"
                data-testid="withdraw-modal-title"
              >
                {target!.issueTitle}
              </dd>
            </div>
            <div className="withdraw-modal__info-item">
              <dt className="withdraw-modal__info-label">Organisation</dt>
              <dd
                className="withdraw-modal__info-value"
                data-testid="withdraw-modal-org"
              >
                {target!.orgId}
              </dd>
            </div>
            <div className="withdraw-modal__info-item">
              <dt className="withdraw-modal__info-label">Issue ID</dt>
              <dd className="withdraw-modal__info-value withdraw-modal__info-value--mono">
                #{target!.issueId}
              </dd>
            </div>
          </dl>
          <p className="withdraw-modal__note">
            Withdrawing frees one slot in your global application count. You
            will need to re-apply if you change your mind, and the slot is
            subject to TTL — it may expire before you can re-apply.
          </p>
        </div>

        {/* Footer */}
        <div className="withdraw-modal__footer">
          <button
            type="button"
            className="withdraw-modal__btn-secondary"
            onClick={onCancel}
            disabled={loading}
            data-testid="withdraw-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="withdraw-modal__btn-danger"
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
              "Confirm withdrawal"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

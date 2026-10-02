"use client";
import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import type { UseTxModal } from "../hooks/useTxModal";
import "./TxConfirmModal.css";

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Props {
  modal: UseTxModal;
}

/** Plain-language icon for the action type */
function actionIcon(action: string, destructive?: boolean): string {
  if (destructive) return "⚠️";
  const lower = action.toLowerCase();
  if (lower.includes("apply"))    return "📝";
  if (lower.includes("assign"))   return "✅";
  if (lower.includes("complete")) return "🎉";
  if (lower.includes("withdraw")) return "↩️";
  if (lower.includes("revoke"))   return "🚫";
  return "🔏";
}

export default function TxConfirmModal({ modal }: Props) {
  const { state, _resolve, _reject, close } = modal;
  const dialogRef      = useRef<HTMLDivElement>(null);
  const previousFocus  = useRef<HTMLElement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isOpen    = state.status !== "idle";
  const isLoading = state.status === "loading";
  const isError   = state.status === "error";

  const details =
    state.status === "confirming" ||
    state.status === "loading"    ||
    state.status === "error"
      ? state.details
      : null;

  const destructive  = details?.destructive ?? false;
  const confirmLabel = details?.confirmLabel ?? "Confirm & Sign";
  const errorMsg     = state.status === "error" ? state.message : "";

  // ── Focus management ────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      if (!previousFocus.current) {
        previousFocus.current = document.activeElement as HTMLElement;
      }
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
        first?.focus();
      });
    } else {
      document.body.style.overflow = "";
      if (previousFocus.current) {
        previousFocus.current.focus();
        previousFocus.current = null;
      }
    }
    return () => {
      document.body.style.overflow = "";
      if (previousFocus.current) {
        previousFocus.current.focus();
        previousFocus.current = null;
      }
    };
  }, [isOpen]);

  // ── Escape key ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        e.preventDefault();
        _reject();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, isLoading, _reject]);

  // ── Tab trap ────────────────────────────────────────────────
  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="txmodal-backdrop"
        data-testid="txmodal-backdrop"
        onClick={() => { if (!isLoading) _reject(); }}
      />

      {/*
        Desktop: centred dialog
        Mobile: bottom sheet (full width, rounded top corners, fixed to bottom)
      */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txmodal-title"
        aria-describedby="txmodal-subtitle"
        onKeyDown={trapFocus}
        className={`txmodal${destructive ? " txmodal--destructive" : ""}`}
        data-testid="txmodal-dialog"
      >
        {/* ── Hero ────────────────────────────────────────────── */}
        <div className="txmodal__hero">
          <span className="txmodal__icon" aria-hidden="true">
            {actionIcon(details?.action ?? "", destructive)}
          </span>
          <div className="txmodal__hero-text">
            <h2 id="txmodal-title" className="txmodal__action-summary">
              {details?.action ?? "Confirm Transaction"}
            </h2>
            <p id="txmodal-subtitle" className="txmodal__subtitle">
              Review carefully before signing with Freighter
            </p>
          </div>
        </div>

        {/* ── Secondary info grid ──────────────────────────────── */}
        {details && (
          <dl className="txmodal__info">
            {details.operation && (
              <div className="txmodal__info-item">
                <dt className="txmodal__info-label">Operation</dt>
                <dd className="txmodal__info-value">{details.operation}</dd>
              </div>
            )}
            {details.parameters && Object.keys(details.parameters).length > 0 && (
              <div className="txmodal__info-item txmodal__info-item--wide">
                <dt className="txmodal__info-label">Parameters</dt>
                <dd className="txmodal__info-value">
                  <dl className="txmodal__parameters">
                    {Object.entries(details.parameters).map(([name, value]) => (
                      <div className="txmodal__parameter" key={name}>
                        <dt>{name}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </dd>
              </div>
            )}
            <div className="txmodal__info-item">
              <dt className="txmodal__info-label">Target</dt>
              <dd className="txmodal__info-value">{details.target}</dd>
            </div>
            <div className="txmodal__info-item">
              <dt className="txmodal__info-label">Est. fee</dt>
              <dd className="txmodal__info-value">{details.fee}</dd>
            </div>
            {details.estimatedTime && (
              <div className="txmodal__info-item">
                <dt className="txmodal__info-label">Confirmation</dt>
                <dd className="txmodal__info-value">{details.estimatedTime}</dd>
              </div>
            )}
            <div className="txmodal__info-item">
              <dt className="txmodal__info-label">Network</dt>
              <dd className="txmodal__info-value">
                <span
                  className={`txmodal__network-badge txmodal__network-badge--${details.network}`}
                >
                  {details.network.toUpperCase()}
                </span>
              </dd>
            </div>
          </dl>
        )}

        {/* ── Collapsible technical details ────────────────────── */}
        {details?.xdr && (
          <div className="txmodal__details">
            <button
              type="button"
              className="txmodal__details-toggle"
              data-testid="txmodal-xdr-toggle"
              aria-expanded={detailsOpen}
              aria-controls="txmodal-xdr"
              onClick={() => setDetailsOpen((v) => !v)}
            >
              Technical details (XDR)
              <span
                className={`txmodal__details-chevron${detailsOpen ? " txmodal__details-chevron--open" : ""}`}
                aria-hidden="true"
              >
                ▼
              </span>
            </button>
            {detailsOpen && (
              <div id="txmodal-xdr" className="txmodal__details-body">
                <pre className="txmodal__xdr" data-testid="txmodal-xdr-content">{details.xdr}</pre>
              </div>
            )}
          </div>
        )}

        {/* ── Error banner ─────────────────────────────────────── */}
        {isError && (
          <p role="alert" className="txmodal__error">
            {errorMsg}
          </p>
        )}

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="txmodal__footer">
          {isError ? (
            <>
              <button
                type="button"
                className="txmodal__btn-secondary"
                data-testid="txmodal-cancel"
                onClick={close}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="txmodal__btn-primary"
                onClick={_resolve}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="txmodal__btn-secondary"
                onClick={_reject}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`txmodal__btn-primary${destructive ? " txmodal__btn-primary--destructive" : ""}`}
                data-testid="txmodal-confirm"
                onClick={_resolve}
                disabled={isLoading}
                aria-busy={isLoading}
              >
                {isLoading && <span className="txmodal__spinner" aria-hidden="true" />}
                {isLoading ? "Signing…" : confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

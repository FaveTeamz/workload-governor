"use client";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import type { UseTxModal } from "../hooks/useTxModal";

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Props {
  modal: UseTxModal & { _resolve: () => void; _reject: () => void };
}

export default function TxConfirmModal({ modal }: Props) {
  const { state, _resolve, _reject, close } = modal;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const isOpen = state.status !== "idle";

  // Save/restore focus, trap focus inside dialog
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      // Focus the first focusable element after paint
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
        first?.focus();
      });
    } else {
      previousFocus.current?.focus();
    }
  }, [isOpen]);

  // Escape key closes / cancels
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && state.status !== "loading") {
        _reject();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, state.status, _reject]);

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

  if (!isOpen) return null;

  const details =
    state.status === "confirming" || state.status === "loading" || state.status === "error"
      ? state.details
      : null;

  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const errorMsg = state.status === "error" ? state.message : "";

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => { if (!isLoading) _reject(); }}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 1100,
          animation: "backdropIn 200ms ease-out both",
        }}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txmodal-title"
        aria-describedby="txmodal-desc"
        onKeyDown={trapFocus}
        className="modal-slide-in"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1101,
          background: "#1c1c1e",
          color: "#f5f5f7",
          borderRadius: 12,
          padding: "28px 32px",
          width: "min(420px, 92vw)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <h2 id="txmodal-title" style={{ margin: "0 0 4px", fontSize: "1.125rem" }}>
          Confirm Transaction
        </h2>
        <p id="txmodal-desc" style={{ margin: "0 0 20px", fontSize: "0.8125rem", color: "#8e8e93" }}>
          Review before signing with Freighter
        </p>

        {details && (
          <dl style={{ margin: "0 0 20px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px" }}>
            <Row label="Action"  value={details.action}  />
            <Row label="Target"  value={details.target}  />
            <Row label="Est. fee" value={details.fee}   />
            <Row label="Network" value={
              <span style={{
                padding: "1px 8px", borderRadius: 99, fontSize: "0.75rem", fontWeight: 700,
                background: details.network === "testnet" ? "#78350f" : "#14532d",
                color: details.network === "testnet" ? "#fde68a" : "#bbf7d0",
              }}>
                {details.network.toUpperCase()}
              </span>
            } />
          </dl>
        )}

        {isError && (
          <p role="alert" style={{
            margin: "0 0 16px", padding: "10px 14px",
            background: "#450a0a", border: "1px solid #7f1d1d",
            borderRadius: 8, fontSize: "0.8125rem", color: "#fca5a5",
          }}>
            {errorMsg}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {isError ? (
            <>
              <SecondaryButton onClick={close}>Dismiss</SecondaryButton>
              <PrimaryButton onClick={_resolve} loading={false}>Retry</PrimaryButton>
            </>
          ) : (
            <>
              <SecondaryButton onClick={_reject} disabled={isLoading}>Cancel</SecondaryButton>
              <PrimaryButton onClick={_resolve} loading={isLoading}>
                {isLoading ? "Signing…" : "Confirm & Sign"}
              </PrimaryButton>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "#8e8e93", fontSize: "0.8125rem", alignSelf: "center" }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500, alignSelf: "center" }}>{value}</dd>
    </>
  );
}

function PrimaryButton({
  onClick, loading, children, disabled,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={loading}
      style={{
        padding: "8px 20px", borderRadius: 8, border: "none",
        background: "#2563eb", color: "#fff",
        fontWeight: 600, fontSize: "0.875rem", cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.75 : 1,
      }}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick, disabled, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 20px", borderRadius: 8,
        border: "1px solid #3a3a3c", background: "transparent",
        color: "#aeaeb2", fontWeight: 600, fontSize: "0.875rem",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

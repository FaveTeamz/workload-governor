"use client";
import { useState, useCallback } from "react";

export interface TxDetails {
  /** Short plain-English action label, e.g. "Apply for issue #42 in stellar-org" */
  action: string;
  /** Canonical target string shown in the secondary section */
  target: string;   // e.g. "org: stellar-org / issue: #42"
  /** Estimated fee, e.g. "0.00001 XLM" */
  fee: string;
  /** "testnet" | "mainnet" */
  network: string;
  /**
   * When true the modal uses a red/destructive colour scheme.
   * Set for revoke and withdraw actions.
   */
  destructive?: boolean;
  /**
   * Raw XDR for advanced users — shown in the collapsible details section.
   */
  xdr?: string;
  /**
   * Estimated confirmation time, e.g. "~5 seconds"
   */
  estimatedTime?: string;
  /**
   * Action-specific label for the confirm button, e.g. "Confirm Application".
   * Falls back to "Confirm & Sign" if omitted.
   */
  confirmLabel?: string;
}

type ModalState =
  | { status: "idle" }
  | { status: "confirming"; details: TxDetails }
  | { status: "loading";    details: TxDetails }
  | { status: "error";      details: TxDetails; message: string };

export interface UseTxModal {
  state: ModalState;
  /** Open the confirmation dialog. Resolves when the user confirms, throws if they cancel. */
  confirm: (details: TxDetails) => Promise<void>;
  /** Call inside your tx handler to move to loading state. */
  setLoading: () => void;
  /** Call on tx failure to show the error state. */
  setError: (message: string) => void;
  /** Reset back to idle (close the modal). */
  close: () => void;
}

export function useTxModal(): UseTxModal {
  const [state, setState] = useState<ModalState>({ status: "idle" });

  // Held across the async gap so the modal buttons can resolve/reject the caller.
  const [resolver, setResolver] = useState<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | null>(null);

  const confirm = useCallback((details: TxDetails) => {
    return new Promise<void>((resolve, reject) => {
      setResolver({ resolve, reject });
      setState({ status: "confirming", details });
    });
  }, []);

  const setLoading = useCallback(() => {
    setState((prev) =>
      prev.status === "confirming" || prev.status === "error"
        ? { status: "loading", details: prev.details }
        : prev
    );
  }, []);

  const setError = useCallback((message: string) => {
    setState((prev) =>
      prev.status === "loading"
        ? { status: "error", details: prev.details, message }
        : prev
    );
  }, []);

  const close = useCallback(() => {
    setState({ status: "idle" });
    setResolver(null);
  }, []);

  // Wired by TxConfirmModal — not part of the public surface but returned for convenience.
  const _resolve = useCallback(() => {
    resolver?.resolve();
    // Don't close here — caller transitions to loading.
  }, [resolver]);

  const _reject = useCallback(() => {
    resolver?.reject(new DOMException("User cancelled", "AbortError"));
    close();
  }, [resolver, close]);

  return { state, confirm, setLoading, setError, close, _resolve, _reject } as UseTxModal & {
    _resolve: () => void;
    _reject: () => void;
  };
}

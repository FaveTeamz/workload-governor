"use client";
import { useState, useCallback } from "react";

export interface TxDetails {
  action: string;
  target: string;   // e.g. "org: stellar-org / issue: #42"
  fee: string;      // e.g. "0.00001 XLM"
  network: string;  // "testnet" | "mainnet"
}

type ModalState =
  | { status: "idle" }
  | { status: "confirming"; details: TxDetails }
  | { status: "loading";    details: TxDetails }
  | { status: "error";      details: TxDetails; message: string };

export interface UseTxModal {
  state: ModalState;
  /** Open the confirmation dialog. Returns true if user confirmed, throws if they cancelled. */
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

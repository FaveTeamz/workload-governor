'use client';
import { useState, useCallback } from 'react';

export interface TxDetails {
  action: string;
  target: string;
  fee: string;
  network: string;
  destructive?: boolean;
  xdr?: string;
  estimatedTime?: string;
  confirmLabel?: string;
}

type ModalState =
  | { status: 'idle' }
  | { status: 'confirming'; details: TxDetails }
  | { status: 'loading';    details: TxDetails }
  | { status: 'error';      details: TxDetails; message: string };

export interface UseTxModal {
  state: ModalState;
  confirm: (details: TxDetails) => Promise<void>;
  setLoading: () => void;
  setError: (message: string) => void;
  close: () => void;
  /** Internal — used by TxConfirmModal to wire confirm button */
  _resolve: () => void;
  /** Internal — used by TxConfirmModal to wire cancel button */
  _reject: () => void;
}

export function useTxModal(): UseTxModal {
  const [state, setState] = useState<ModalState>({ status: 'idle' });
  const [resolver, setResolver] = useState<{ resolve: () => void; reject: (r?: unknown) => void } | null>(null);

  const confirm = useCallback((details: TxDetails) => {
    return new Promise<void>((resolve, reject) => {
      setResolver({ resolve, reject });
      setState({ status: 'confirming', details });
    });
  }, []);

  const setLoading = useCallback(() => {
    setState(prev =>
      prev.status === 'confirming' || prev.status === 'error'
        ? { status: 'loading', details: prev.details }
        : prev
    );
  }, []);

  const setError = useCallback((message: string) => {
    setState(prev =>
      prev.status === 'loading'
        ? { status: 'error', details: prev.details, message }
        : prev
    );
  }, []);

  const close = useCallback(() => {
    setState({ status: 'idle' });
    setResolver(null);
  }, []);

  const _resolve = useCallback(() => { resolver?.resolve(); }, [resolver]);
  const _reject = useCallback(() => {
    resolver?.reject(new DOMException('User cancelled', 'AbortError'));
    close();
  }, [resolver, close]);

  return { state, confirm, setLoading, setError, close, _resolve, _reject };
}

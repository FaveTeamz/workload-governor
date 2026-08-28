/**
 * useWithdraw — encapsulates the contributor withdraw-application workflow.
 *
 * Flow:
 *  1. Caller calls `initiateWithdraw(target)` to open the confirmation modal.
 *  2. User clicks "Confirm withdrawal" → onConfirm() runs:
 *     a. POST /api/transactions/withdraw   → get unsigned XDR
 *     b. Freighter signTransaction(xdr)    → get signed XDR
 *     c. POST /api/transactions/submit     → broadcast
 *  3. On success: onSuccess(issueId) is called for optimistic UI update.
 *  4. On error: toast shown, modal closed.
 */

import { useState, useCallback } from 'react';
import type { WithdrawTarget } from '../components/WithdrawConfirmModal';

export interface UseWithdrawOptions {
  /** Freighter public key of the signed-in contributor. */
  publicKey: string | null;
  /** Base API URL, e.g. "/api". */
  apiBase: string;
  /** Called on successful withdraw so the parent can update UI state. */
  onSuccess: (issueId: string) => void;
  /** Called on any error with a human-readable message. */
  onError: (message: string) => void;
}

export interface UseWithdrawResult {
  /** The issue pending confirmation, or null when dialog is closed. */
  pendingTarget: WithdrawTarget | null;
  /** Whether the withdraw transaction is in-flight. */
  loading: boolean;
  /** Open the confirmation dialog for a given issue. */
  initiateWithdraw: (target: WithdrawTarget) => void;
  /** Confirm handler — wired to the modal's onConfirm prop. */
  handleConfirm: () => void;
  /** Cancel handler — wired to the modal's onCancel prop. */
  handleCancel: () => void;
}

function getFreighter() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).__freighter_api__ ?? null;
}

export function useWithdraw({
  publicKey,
  apiBase,
  onSuccess,
  onError,
}: UseWithdrawOptions): UseWithdrawResult {
  const [pendingTarget, setPendingTarget] = useState<WithdrawTarget | null>(null);
  const [loading, setLoading] = useState(false);

  const initiateWithdraw = useCallback((target: WithdrawTarget) => {
    setPendingTarget(target);
  }, []);

  const handleCancel = useCallback(() => {
    if (!loading) setPendingTarget(null);
  }, [loading]);

  const handleConfirm = useCallback(async () => {
    if (!pendingTarget || !publicKey) return;

    setLoading(true);
    try {
      // ── Step 1: Get sequence number from Horizon ───────────────────────
      const horizonBase =
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_HORIZON_URL) ??
        'https://horizon-testnet.stellar.org';

      const seqRes = await fetch(
        `${horizonBase}/accounts/${encodeURIComponent(publicKey)}`,
      );
      if (!seqRes.ok) {
        throw new Error(`Failed to fetch account sequence: ${seqRes.status}`);
      }
      const accountData = await seqRes.json() as { sequence: string };
      const sequence = accountData.sequence;

      // ── Step 2: Build unsigned withdraw XDR via backend ────────────────
      const buildRes = await fetch(`${apiBase}/transactions/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributor: publicKey,
          org_id: pendingTarget.orgId,
          issue_id: Number(pendingTarget.issueId),
          sequence,
        }),
      });
      if (!buildRes.ok) {
        const errBody = await buildRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? `Build TX failed: ${buildRes.status}`);
      }
      const { xdr } = await buildRes.json() as { xdr: string };

      // ── Step 3: Sign with Freighter ────────────────────────────────────
      const freighter = getFreighter();
      if (!freighter) throw new Error('Freighter extension not found.');

      const network =
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STELLAR_NETWORK) ??
        'TESTNET';

      const { signedTxXdr, error: signErr } = await freighter.signTransaction(xdr, {
        network,
        accountToSign: publicKey,
      });
      if (signErr) throw new Error(`Signing failed: ${signErr}`);

      // ── Step 4: Submit signed XDR ──────────────────────────────────────
      const submitRes = await fetch(`${apiBase}/transactions/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signed_xdr: signedTxXdr }),
      });
      if (!submitRes.ok) {
        const errBody = await submitRes.json().catch(() => ({})) as { error?: string; reason?: string };
        throw new Error(errBody.reason ?? errBody.error ?? `Submit failed: ${submitRes.status}`);
      }

      // ── Step 5: Success ────────────────────────────────────────────────
      onSuccess(pendingTarget.issueId);
      setPendingTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error during withdrawal';
      onError(msg);
      setPendingTarget(null);
    } finally {
      setLoading(false);
    }
  // We use pendingTarget and publicKey via closure but list deps explicitly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget, publicKey, apiBase, onSuccess, onError]);

  return {
    pendingTarget,
    loading,
    initiateWithdraw,
    handleConfirm,
    handleCancel,
  };
}

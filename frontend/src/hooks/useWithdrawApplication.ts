/**
 * useWithdrawApplication — Issue #6
 *
 * Invokes withdraw_application on the contract after user confirms.
 * Returns withdrawal state and mapped error messages.
 */

import { useState, useCallback } from "react";
import { CONTRACT_ERROR_MESSAGES } from "./useApplyForIssue";

function mapContractError(err: unknown): string {
  if (err instanceof Error) {
    const match = err.message.match(/(?:error code[=: ]+)(\d+)/i);
    if (match) {
      const code = parseInt(match[1], 10);
      return CONTRACT_ERROR_MESSAGES[code] ?? `Contract error ${code}.`;
    }
    if (/user rejected|user denied|cancelled/i.test(err.message)) {
      return "Transaction was cancelled.";
    }
    return err.message;
  }
  return "An unexpected error occurred. Please try again.";
}

export type WithdrawState = "idle" | "confirming" | "submitting" | "withdrawn" | "error";

export interface WithdrawContractClient {
  withdraw_application(
    contributor: string,
    orgId: string,
    issueId: number
  ): Promise<void>;
}

export interface UseWithdrawApplicationOptions {
  contributor: string;
  orgId: string;
  issueId: number;
  onSuccess?: () => void;
  contractClient?: WithdrawContractClient;
}

export interface UseWithdrawApplicationResult {
  state: WithdrawState;
  errorMessage: string | null;
  /** Opens the confirmation modal */
  requestWithdraw: () => void;
  /** Confirms and submits the withdrawal */
  confirmWithdraw: () => Promise<void>;
  /** Dismisses the confirmation modal without withdrawing */
  cancelWithdraw: () => void;
  reset: () => void;
}

function getDefaultClient(): WithdrawContractClient | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).__contract_client__;
  return c ?? null;
}

export function useWithdrawApplication({
  contributor,
  orgId,
  issueId,
  onSuccess,
  contractClient,
}: UseWithdrawApplicationOptions): UseWithdrawApplicationResult {
  const [state, setState] = useState<WithdrawState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestWithdraw = useCallback(() => {
    setState("confirming");
    setErrorMessage(null);
  }, []);

  const cancelWithdraw = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
  }, []);

  const confirmWithdraw = useCallback(async () => {
    if (state !== "confirming") return;

    const client = contractClient ?? getDefaultClient();
    if (!client) {
      setErrorMessage("Contract client not available. Make sure your wallet is connected.");
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMessage(null);

    try {
      await client.withdraw_application(contributor, orgId, issueId);
      setState("withdrawn");
      onSuccess?.();
    } catch (err) {
      setErrorMessage(mapContractError(err));
      setState("error");
    }
  }, [state, contributor, orgId, issueId, contractClient, onSuccess]);

  const reset = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
  }, []);

  return {
    state,
    errorMessage,
    requestWithdraw,
    confirmWithdraw,
    cancelWithdraw,
    reset,
  };
}

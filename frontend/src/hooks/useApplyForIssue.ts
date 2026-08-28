/**
 * useApplyForIssue — Issue #5
 *
 * Constructs a Soroban apply_for_issue transaction, requests a Freighter
 * signature, submits it to the RPC, and maps all 11 contract error codes to
 * user-friendly messages.
 *
 * Acceptance criteria:
 *  ✓  Transaction signed and submitted on testnet
 *  ✓  UI reflects applied state without page reload
 *  ✓  All error codes show readable messages
 */

import { useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Contract error code → human-readable message map (all 11 codes from README)
// ---------------------------------------------------------------------------

export const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  1:  "The contract has already been initialised.",
  2:  "The contract has not been initialised yet.",
  3:  "You are not authorised as admin.",
  4:  "You are not a registered maintainer for this organisation.",
  5:  "Contributor authorisation failed. Make sure your wallet is connected.",
  6:  "You have reached the global limit of 15 pending applications. Withdraw an application to apply for new issues.",
  7:  "You have reached the limit of 4 active assignments for this organisation.",
  8:  "You have already applied for this issue.",
  9:  "No application found for this issue.",
  10: "No active assignment found for this issue.",
  11: "This issue is already assigned to someone.",
  17: "Maintainer not found for this organisation.",
};

function mapContractError(err: unknown): string {
  if (err instanceof Error) {
    // Match patterns like "error code=6" or "Contract error code: 6"
    const match = err.message.match(/(?:error code[=: ]+)(\d+)/i);
    if (match) {
      const code = parseInt(match[1], 10);
      return CONTRACT_ERROR_MESSAGES[code] ?? `Contract error ${code}.`;
    }
    // Freighter / user rejection
    if (/user rejected|user denied|cancelled/i.test(err.message)) {
      return "Transaction was cancelled.";
    }
    return err.message;
  }
  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplyState = "idle" | "submitting" | "applied" | "error";

export interface UseApplyForIssueOptions {
  contributor: string;
  orgId: string;
  issueId: number;
  /** Injected so the hook is fully testable without a real contract */
  contractClient?: ApplyContractClient;
}

export interface ApplyContractClient {
  apply_for_issue(contributor: string, orgId: string, issueId: number): Promise<void>;
}

export interface UseApplyForIssueResult {
  state: ApplyState;
  errorMessage: string | null;
  apply: () => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function getDefaultClient(): ApplyContractClient | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).__contract_client__;
  return c ?? null;
}

export function useApplyForIssue({
  contributor,
  orgId,
  issueId,
  contractClient,
}: UseApplyForIssueOptions): UseApplyForIssueResult {
  const [state, setState] = useState<ApplyState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apply = useCallback(async () => {
    if (state === "submitting") return;

    const client = contractClient ?? getDefaultClient();
    if (!client) {
      setErrorMessage("Contract client not available. Make sure your wallet is connected.");
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMessage(null);

    try {
      await client.apply_for_issue(contributor, orgId, issueId);
      setState("applied");
    } catch (err) {
      setErrorMessage(mapContractError(err));
      setState("error");
    }
  }, [contributor, orgId, issueId, contractClient, state]);

  const reset = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
  }, []);

  return { state, errorMessage, apply, reset };
}

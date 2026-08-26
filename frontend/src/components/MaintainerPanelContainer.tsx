/**
 * MaintainerPanelContainer — Issue #8
 *
 * Gate component that:
 *  1. Detects maintainer role via is_maintainer on load (useMaintainerPanel hook)
 *  2. Hides the panel for non-maintainers
 *  3. Passes live applications/assignments and optimistic handlers to MaintainerPanel
 *
 * Acceptance criteria:
 *  ✓  Panel hidden for non-maintainers
 *  ✓  Assign/Complete/Revoke transactions signed and submitted
 *  ✓  List updates optimistically after each action
 */

import { MaintainerPanel } from "./MaintainerPanel";
import {
  useMaintainerPanel,
  type ContractMaintainerClient,
} from "../hooks/useMaintainerPanel";
import { useToast } from "./Toast";

export interface MaintainerPanelContainerProps {
  /** Connected wallet public key */
  maintainerAddress: string | null;
  /** Organisation IDs to manage */
  orgIds: string[];
  /** Optional injected client for tests */
  contractClient?: ContractMaintainerClient;
}

function mapContractError(err: unknown): string {
  if (err instanceof Error) {
    const match = err.message.match(/(?:error code[=: ]+)(\d+)/i);
    if (match) {
      const code = parseInt(match[1], 10);
      const msgs: Record<number, string> = {
        4:  "You are not a registered maintainer for this organisation.",
        9:  "Application not found.",
        10: "Assignment not found.",
        11: "This issue is already assigned.",
      };
      return msgs[code] ?? `Contract error ${code}.`;
    }
    if (/user rejected|user denied|cancelled/i.test(err.message)) {
      return "Transaction was cancelled.";
    }
    return err.message;
  }
  return "An unexpected error occurred.";
}

export function MaintainerPanelContainer({
  maintainerAddress,
  orgIds,
  contractClient,
}: MaintainerPanelContainerProps) {
  const { toasts: _toasts, add: addToast } = useToast();

  const {
    status,
    applications,
    assignments,
    loading,
    error,
    handleAssign,
    handleComplete,
    handleRevoke,
  } = useMaintainerPanel({
    maintainerAddress,
    orgIds,
    contractClient,
  });

  // ── Role gating ────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div
        className="maintainer-panel-status"
        aria-live="polite"
        aria-label="Checking maintainer role…"
        data-testid="maintainer-panel-loading"
      >
        <span className="spinner spinner--sm" aria-hidden="true" />
        Checking role…
      </div>
    );
  }

  if (status === "no-wallet" || status === "forbidden") {
    // Panel is completely hidden for non-maintainers
    return null;
  }

  // ── Authorized — show panel ────────────────────────────────────────────────

  async function onAssign(app: import("./MaintainerPanel").Application) {
    try {
      await handleAssign(app);
      addToast(`Assigned "${app.issueTitle}" to ${app.contributor.slice(0, 8)}…`, "success");
    } catch (e) {
      addToast(mapContractError(e), "error");
    }
  }

  async function onComplete(asgn: import("./MaintainerPanel").Assignment) {
    try {
      await handleComplete(asgn);
      addToast(`Completed "${asgn.issueTitle}"`, "success");
    } catch (e) {
      addToast(mapContractError(e), "error");
    }
  }

  async function onRevoke(asgn: import("./MaintainerPanel").Assignment) {
    try {
      await handleRevoke(asgn);
      addToast(`Revoked "${asgn.issueTitle}"`, "info");
    } catch (e) {
      addToast(mapContractError(e), "error");
    }
  }

  return (
    <div
      className="maintainer-panel-wrapper"
      data-testid="maintainer-panel-container"
    >
      {loading && (
        <div
          className="maintainer-panel-loading-bar"
          aria-live="polite"
          aria-label="Loading maintainer data…"
        >
          <span className="spinner spinner--sm" aria-hidden="true" />
        </div>
      )}
      {error && (
        <div
          className="maintainer-panel-error"
          role="alert"
          data-testid="maintainer-panel-error"
        >
          {error}
        </div>
      )}
      <MaintainerPanel
        applications={applications}
        assignments={assignments}
        onAssign={onAssign}
        onComplete={onComplete}
        onRevoke={onRevoke}
      />
    </div>
  );
}

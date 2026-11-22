/**
 * useMaintainerPanel — Issue #8
 *
 * Detects maintainer role on load via is_maintainer contract call, then
 * fetches live applications and assignments. Exposes assign/complete/revoke
 * handlers that update state optimistically.
 *
 * Acceptance criteria:
 *  ✓  Panel hidden for non-maintainers
 *  ✓  Assign/Complete/Revoke transactions signed and submitted
 *  ✓  List updates optimistically after each action
 */

import { useState, useEffect, useCallback } from "react";
import type { Application, Assignment } from "../components/MaintainerPanel";

// ---------------------------------------------------------------------------
// Role detection
// ---------------------------------------------------------------------------

export type MaintainerStatus =
  | "loading"
  | "authorized"
  | "forbidden"
  | "no-wallet";

export interface ContractMaintainerClient {
  is_maintainer(maintainer: string, orgId: string): Promise<boolean>;
  list_applications(orgId: string): Promise<RawApplicationRow[]>;
  list_assignments(orgId: string): Promise<RawAssignmentRow[]>;
  assign_issue(maintainer: string, contributor: string, orgId: string, issueId: string): Promise<void>;
  complete_assignment(maintainer: string, contributor: string, orgId: string, issueId: string): Promise<void>;
  revoke_assignment(maintainer: string, contributor: string, orgId: string, issueId: string): Promise<void>;
}

export interface RawApplicationRow {
  contributor: string;
  issue_id: string;
  date: string;
  global_count?: number;
  org_count?: number;
}

export interface RawAssignmentRow {
  contributor: string;
  issue_id: string;
  global_count?: number;
  org_count?: number;
}

function getClient(): ContractMaintainerClient | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).__contract_client__ ?? null;
}

function mapApplication(row: RawApplicationRow, org: string): Application {
  return {
    id: `${org}-${row.contributor}-${row.issue_id}`,
    contributor: row.contributor,
    org,
    issueTitle: `Issue #${row.issue_id}`,
    appliedDate: row.date,
    globalCount: row.global_count,
    orgCount: row.org_count,
  };
}

function mapAssignment(row: RawAssignmentRow, org: string): Assignment {
  return {
    id: `${org}-${row.contributor}-${row.issue_id}`,
    contributor: row.contributor,
    org,
    issueTitle: `Issue #${row.issue_id}`,
    globalCount: row.global_count,
    orgCount: row.org_count,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseMaintainerPanelOptions {
  /** The current connected wallet public key */
  maintainerAddress: string | null;
  /** Orgs to load data for */
  orgIds: string[];
  /** Optional injected client for testing */
  contractClient?: ContractMaintainerClient;
}

export interface UseMaintainerPanelResult {
  status: MaintainerStatus;
  applications: Application[];
  assignments: Assignment[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  handleAssign: (app: Application) => Promise<void>;
  handleComplete: (asgn: Assignment) => Promise<void>;
  handleRevoke: (asgn: Assignment) => Promise<void>;
}

export function useMaintainerPanel({
  maintainerAddress,
  orgIds,
  contractClient,
}: UseMaintainerPanelOptions): UseMaintainerPanelResult {
  const [status, setStatus] = useState<MaintainerStatus>("loading");
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = contractClient ?? getClient();

  // ── Role detection ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!maintainerAddress) {
      setStatus("no-wallet");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    async function checkRole() {
      if (!client || !maintainerAddress) {
        if (!cancelled) setStatus("forbidden");
        return;
      }
      try {
        // Check against all provided orgs — authorized if maintainer of any
        const checks = await Promise.all(
          orgIds.map((org) => client!.is_maintainer(maintainerAddress!, org))
        );
        if (!cancelled) {
          setStatus(checks.some(Boolean) ? "authorized" : "forbidden");
        }
      } catch {
        if (!cancelled) setStatus("forbidden");
      }
    }

    checkRole();
    return () => { cancelled = true; };
  }, [maintainerAddress, orgIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live data loading ─────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (status !== "authorized" || !client) return;

    setLoading(true);
    setError(null);

    try {
      const appResults = await Promise.all(
        orgIds.map((org) => client!.list_applications(org).then((rows) =>
          rows.map((r) => mapApplication(r, org))
        ))
      );
      const asgnResults = await Promise.all(
        orgIds.map((org) => client!.list_assignments(org).then((rows) =>
          rows.map((r) => mapAssignment(r, org))
        ))
      );

      setApplications(appResults.flat());
      setAssignments(asgnResults.flat());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [status, orgIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === "authorized") load();
  }, [status, load]);

  // ── Optimistic updates ────────────────────────────────────────────────────

  const handleAssign = useCallback(
    async (app: Application) => {
      if (!client || !maintainerAddress) return;

      // Optimistic remove from applications, add to assignments
      setApplications((prev) => prev.filter((a) => a.id !== app.id));
      const newAsgn: Assignment = {
        id: app.id,
        contributor: app.contributor,
        org: app.org,
        issueTitle: app.issueTitle,
        globalCount: app.globalCount,
        orgCount: app.orgCount,
      };
      setAssignments((prev) => [...prev, newAsgn]);

      try {
        await client.assign_issue(
          maintainerAddress,
          app.contributor,
          app.org,
          app.issueTitle.replace(/^Issue #/, "")
        );
      } catch (e) {
        // Roll back on failure
        setApplications((prev) => [...prev, app]);
        setAssignments((prev) => prev.filter((a) => a.id !== app.id));
        throw e;
      }
    },
    [client, maintainerAddress]
  );

  const handleComplete = useCallback(
    async (asgn: Assignment) => {
      if (!client || !maintainerAddress) return;

      // Optimistic remove
      setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));

      try {
        await client.complete_assignment(
          maintainerAddress,
          asgn.contributor,
          asgn.org,
          asgn.issueTitle.replace(/^Issue #/, "")
        );
      } catch (e) {
        // Roll back on failure
        setAssignments((prev) => [...prev, asgn]);
        throw e;
      }
    },
    [client, maintainerAddress]
  );

  const handleRevoke = useCallback(
    async (asgn: Assignment) => {
      if (!client || !maintainerAddress) return;

      // Optimistic remove
      setAssignments((prev) => prev.filter((a) => a.id !== asgn.id));

      try {
        await client.revoke_assignment(
          maintainerAddress,
          asgn.contributor,
          asgn.org,
          asgn.issueTitle.replace(/^Issue #/, "")
        );
      } catch (e) {
        // Roll back on failure
        setAssignments((prev) => [...prev, asgn]);
        throw e;
      }
    },
    [client, maintainerAddress]
  );

  return {
    status,
    applications,
    assignments,
    loading,
    error,
    reload: load,
    handleAssign,
    handleComplete,
    handleRevoke,
  };
}

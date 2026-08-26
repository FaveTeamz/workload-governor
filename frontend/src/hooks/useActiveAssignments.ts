/**
 * useActiveAssignments — loads active assignments for the connected contributor
 * from the Soroban contract by querying get_org_assignment_count and is_assigned.
 *
 * Issue #7: ActiveAssignmentsDashboard
 */

import { useState, useEffect, useCallback } from "react";

export interface OrgAssignment {
  org: string;
  issueId: string;
  assignedDate: string;
}

export interface OrgGroup {
  org: string;
  assignments: OrgAssignment[];
  /** How many assignments are active (0–4) */
  count: number;
  /** Max assignments per org (always 4) */
  cap: number;
}

export type AssignmentsLoadState = "idle" | "loading" | "loaded" | "error";

export interface UseActiveAssignmentsResult {
  groups: OrgGroup[];
  loadState: AssignmentsLoadState;
  error: string | null;
  reload: () => void;
}

function getContractClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).__contract_client__ ?? null;
}

/**
 * Fetches assignment groups from the contract client.
 * The contract client must expose:
 *   - list_orgs()                     → string[]
 *   - get_org_assignment_count(contributor, org) → number
 *   - list_org_assignments(contributor, org)    → { issue_id: string, date: string }[]
 */
async function fetchGroups(contributor: string): Promise<OrgGroup[]> {
  const client = getContractClient();
  if (!client) return [];

  // Get list of known orgs — fall back to empty array
  const orgs: string[] = typeof client.list_orgs === "function"
    ? await client.list_orgs()
    : [];

  const groups: OrgGroup[] = [];

  for (const org of orgs) {
    const count: number = typeof client.get_org_assignment_count === "function"
      ? await client.get_org_assignment_count(contributor, org)
      : 0;

    const rawAssignments: Array<{ issue_id: string; date?: string }> =
      typeof client.list_org_assignments === "function"
        ? await client.list_org_assignments(contributor, org)
        : [];

    const assignments: OrgAssignment[] = rawAssignments.map((a) => ({
      org,
      issueId: String(a.issue_id),
      assignedDate: a.date ?? new Date().toISOString().slice(0, 10),
    }));

    groups.push({ org, assignments, count, cap: 4 });
  }

  return groups.filter((g) => g.count > 0);
}

export function useActiveAssignments(
  contributor: string | null
): UseActiveAssignmentsResult {
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [loadState, setLoadState] = useState<AssignmentsLoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contributor) {
      setGroups([]);
      setLoadState("idle");
      return;
    }

    setLoadState("loading");
    setError(null);

    try {
      const result = await fetchGroups(contributor);
      setGroups(result);
      setLoadState("loaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assignments");
      setLoadState("error");
    }
  }, [contributor]);

  useEffect(() => {
    load();
  }, [load]);

  return { groups, loadState, error, reload: load };
}

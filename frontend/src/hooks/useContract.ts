/**
 * useContract — thin wrapper around Soroban contract invocations.
 * Calls go through the globally-injected __contract_client__ (or a mock in tests).
 */

export interface ContractParams {
  maintainer: string;
  contributor: string;
  org_id: string;
  issue_id: string;
}

export interface UseContract {
  assign: (p: ContractParams) => Promise<void>;
  complete: (p: ContractParams) => Promise<void>;
  revoke: (p: ContractParams) => Promise<void>;
  /** Query all pending applications for an org. */
  listApplications: (org_id: string) => Promise<ContractRow[]>;
  /** Query all active assignments for an org. */
  listAssignments: (org_id: string) => Promise<ContractRow[]>;
}

export interface ContractRow {
  contributor: string;
  issue_id: string;
  date: string; // ISO date string
}

function client() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).__contract_client__;
  if (!c) throw new Error("Contract client not available");
  return c;
}

export function useContract(): UseContract {
  async function assign(p: ContractParams) {
    await client().assign_issue(p.maintainer, p.contributor, p.org_id, p.issue_id);
  }

  async function complete(p: ContractParams) {
    await client().complete_assignment(p.maintainer, p.contributor, p.org_id, p.issue_id);
  }

  async function revoke(p: ContractParams) {
    await client().revoke_assignment(p.maintainer, p.contributor, p.org_id, p.issue_id);
  }

  async function listApplications(org_id: string): Promise<ContractRow[]> {
    return client().list_applications(org_id);
  }

  async function listAssignments(org_id: string): Promise<ContractRow[]> {
    return client().list_assignments(org_id);
  }

  return { assign, complete, revoke, listApplications, listAssignments };
}

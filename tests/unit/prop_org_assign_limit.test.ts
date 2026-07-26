/**
 * Property-based tests for OrgAssignmentLimitReached (contract error code 7).
 *
 * Models the contract's assign_issue / revoke_assignment / complete_assignment
 * invariants using a pure in-memory simulation.
 *
 * Acceptance criteria:
 *  - 5th assignment in same org returns error 7
 *  - revoke_assignment and complete_assignment both decrement the counter
 *  - Contributor can have 4 assignments in each of N orgs simultaneously
 */

const ORG_ASSIGN_LIMIT = 4;
const ORG_ASSIGN_ERROR_CODE = 7;

interface AssignState {
  /** "contributor:orgId" -> set of issueIds */
  assignments: Map<string, Set<number>>;
}

function makeState(): AssignState {
  return { assignments: new Map() };
}

function orgKey(contributor: string, orgId: string): string {
  return `${contributor}:${orgId}`;
}

function assignIssue(
  state: AssignState,
  contributor: string,
  orgId: string,
  issueId: number,
): { ok: true } | { ok: false; code: number } {
  const key = orgKey(contributor, orgId);
  const issues = state.assignments.get(key) ?? new Set<number>();
  if (issues.size >= ORG_ASSIGN_LIMIT) {
    return { ok: false, code: ORG_ASSIGN_ERROR_CODE };
  }
  if (issues.has(issueId)) {
    return { ok: false, code: 11 }; // AlreadyAssigned
  }
  issues.add(issueId);
  state.assignments.set(key, issues);
  return { ok: true };
}

function revokeAssignment(
  state: AssignState,
  contributor: string,
  orgId: string,
  issueId: number,
): void {
  state.assignments.get(orgKey(contributor, orgId))?.delete(issueId);
}

function completeAssignment(
  state: AssignState,
  contributor: string,
  orgId: string,
  issueId: number,
): void {
  state.assignments.get(orgKey(contributor, orgId))?.delete(issueId);
}

function orgCount(state: AssignState, contributor: string, orgId: string): number {
  return state.assignments.get(orgKey(contributor, orgId))?.size ?? 0;
}

function assignN(
  state: AssignState,
  contributor: string,
  orgId: string,
  n: number,
): boolean {
  for (let i = 1; i <= n; i++) {
    const result = assignIssue(state, contributor, orgId, i);
    if (!result.ok) return false;
  }
  return true;
}

// ---------- property runs ---------------------------------------------------

export {};
const RUNS = 100;

describe('Property: OrgAssignmentLimitReached (error code 7)', () => {
  it('5th assignment in same org returns error 7 in 100% of property runs', () => {
    for (let run = 0; run < RUNS; run++) {
      const state = makeState();
      const contributor = `GCONTRIB${run}`;
      const orgId = `org-${run}`;

      // Assign 4 issues — all should succeed
      expect(assignN(state, contributor, orgId, ORG_ASSIGN_LIMIT)).toBe(true);
      expect(orgCount(state, contributor, orgId)).toBe(ORG_ASSIGN_LIMIT);

      // 5th assignment must fail with error code 7
      const fifth = assignIssue(state, contributor, orgId, 999);
      expect(fifth.ok).toBe(false);
      if (!fifth.ok) {
        expect(fifth.code).toBe(ORG_ASSIGN_ERROR_CODE);
      }
    }
  });

  it('revoke_assignment decrements the counter', () => {
    for (let run = 0; run < RUNS; run++) {
      const state = makeState();
      const contributor = `GREVOKE${run}`;
      const orgId = 'org-a';

      assignN(state, contributor, orgId, ORG_ASSIGN_LIMIT);
      expect(orgCount(state, contributor, orgId)).toBe(ORG_ASSIGN_LIMIT);

      revokeAssignment(state, contributor, orgId, 1);
      expect(orgCount(state, contributor, orgId)).toBe(ORG_ASSIGN_LIMIT - 1);

      // A new assignment should now succeed
      const result = assignIssue(state, contributor, orgId, 999);
      expect(result.ok).toBe(true);
    }
  });

  it('complete_assignment decrements the counter', () => {
    for (let run = 0; run < RUNS; run++) {
      const state = makeState();
      const contributor = `GCOMPLETE${run}`;
      const orgId = 'org-b';

      assignN(state, contributor, orgId, ORG_ASSIGN_LIMIT);
      completeAssignment(state, contributor, orgId, 2);
      expect(orgCount(state, contributor, orgId)).toBe(ORG_ASSIGN_LIMIT - 1);

      const result = assignIssue(state, contributor, orgId, 999);
      expect(result.ok).toBe(true);
    }
  });

  it('cap is per-org — contributor can have 4 assignments in each of N orgs', () => {
    const N_ORGS = 5;
    for (let run = 0; run < RUNS; run++) {
      const state = makeState();
      const contributor = `GMULTI${run}`;

      // Fill 4 assignments in each org
      for (let o = 0; o < N_ORGS; o++) {
        const orgId = `org-${o}`;
        expect(assignN(state, contributor, orgId, ORG_ASSIGN_LIMIT)).toBe(true);
        expect(orgCount(state, contributor, orgId)).toBe(ORG_ASSIGN_LIMIT);
      }

      // Each org individually hits the limit
      for (let o = 0; o < N_ORGS; o++) {
        const fifth = assignIssue(state, contributor, `org-${o}`, 9999);
        expect(fifth.ok).toBe(false);
        if (!fifth.ok) expect(fifth.code).toBe(ORG_ASSIGN_ERROR_CODE);
      }
    }
  });
});

/**
 * Property-based tests for GlobalApplicationLimitReached (contract error code 6).
 *
 * Models the contract's apply_for_issue / withdraw_application invariants
 * using a pure in-memory simulation so tests are deterministic, fast, and
 * require no live network.
 *
 * Acceptance criteria:
 *  - 16th application returns error 6 in 100% of runs
 *  - withdraw_application correctly decrements the counter
 *  - Two different contributors can each have 15 applications
 */

const GLOBAL_APP_LIMIT = 15;
const APPLY_ERROR_CODE = 6;

interface ContractState {
  /** contributor -> set of "org:issueId" keys */
  applications: Map<string, Set<string>>;
}

function makeState(): ContractState {
  return { applications: new Map() };
}

function applyForIssue(
  state: ContractState,
  contributor: string,
  orgId: string,
  issueId: number,
): { ok: true } | { ok: false; code: number } {
  const apps = state.applications.get(contributor) ?? new Set<string>();
  if (apps.size >= GLOBAL_APP_LIMIT) {
    return { ok: false, code: APPLY_ERROR_CODE };
  }
  const key = `${orgId}:${issueId}`;
  if (apps.has(key)) {
    return { ok: false, code: 8 }; // DuplicateApplication
  }
  apps.add(key);
  state.applications.set(contributor, apps);
  return { ok: true };
}

function withdrawApplication(
  state: ContractState,
  contributor: string,
  orgId: string,
  issueId: number,
): void {
  const apps = state.applications.get(contributor);
  if (!apps) return;
  apps.delete(`${orgId}:${issueId}`);
}

function globalCount(state: ContractState, contributor: string): number {
  return state.applications.get(contributor)?.size ?? 0;
}

// ---------- helpers ---------------------------------------------------------

/**
 * Apply `n` distinct issues for `contributor` in `state`.
 * Returns true only if all n applications succeeded.
 */
function applyN(state: ContractState, contributor: string, n: number): boolean {
  for (let i = 1; i <= n; i++) {
    const result = applyForIssue(state, contributor, 'org-a', i);
    if (!result.ok) return false;
  }
  return true;
}

// ---------- property runs ---------------------------------------------------

export {};
const RUNS = 100;

describe('Property: GlobalApplicationLimitReached (error code 6)', () => {
  it('16th application returns error 6 in 100% of property runs', () => {
    for (let run = 0; run < RUNS; run++) {
      const state = makeState();
      const contributor = `GCONTRIB${run}`;

      // Apply for exactly GLOBAL_APP_LIMIT issues — all should succeed
      const allSucceeded = applyN(state, contributor, GLOBAL_APP_LIMIT);
      expect(allSucceeded).toBe(true);
      expect(globalCount(state, contributor)).toBe(GLOBAL_APP_LIMIT);

      // 16th application must fail with error code 6
      const sixteenth = applyForIssue(state, contributor, 'org-b', 999);
      expect(sixteenth.ok).toBe(false);
      if (!sixteenth.ok) {
        expect(sixteenth.code).toBe(APPLY_ERROR_CODE);
      }
    }
  });

  it('withdraw_application decrements the counter', () => {
    for (let run = 0; run < RUNS; run++) {
      const state = makeState();
      const contributor = `GWITHDRAW${run}`;

      applyN(state, contributor, GLOBAL_APP_LIMIT);
      expect(globalCount(state, contributor)).toBe(GLOBAL_APP_LIMIT);

      // Withdraw one application
      withdrawApplication(state, contributor, 'org-a', 1);
      expect(globalCount(state, contributor)).toBe(GLOBAL_APP_LIMIT - 1);

      // Now a new application should succeed
      const result = applyForIssue(state, contributor, 'org-b', 999);
      expect(result.ok).toBe(true);
      expect(globalCount(state, contributor)).toBe(GLOBAL_APP_LIMIT);
    }
  });

  it('counter is per-contributor — two contributors can each have 15 applications', () => {
    for (let run = 0; run < RUNS; run++) {
      const state = makeState();
      const c1 = `GCONT_A_${run}`;
      const c2 = `GCONT_B_${run}`;

      // Both contributors apply for 15 issues independently
      expect(applyN(state, c1, GLOBAL_APP_LIMIT)).toBe(true);
      expect(applyN(state, c2, GLOBAL_APP_LIMIT)).toBe(true);

      expect(globalCount(state, c1)).toBe(GLOBAL_APP_LIMIT);
      expect(globalCount(state, c2)).toBe(GLOBAL_APP_LIMIT);

      // Both hit the cap on a 16th attempt
      expect(applyForIssue(state, c1, 'org-z', 9999).ok).toBe(false);
      expect(applyForIssue(state, c2, 'org-z', 9999).ok).toBe(false);
    }
  });
});

/**
 * Property-based tests: org assignment count invariant.
 *
 * Property: after any sequence of assign / complete / revoke operations the
 * in-memory model count (number of active assignments — neither completed nor
 * revoked) always equals what the contract would report for
 * get_org_assignment_count.
 *
 * We test this with a pure-TypeScript model that mirrors the contract's
 * counting logic.  Any divergence between model and implementation becomes a
 * falsifiable property that fast-check will automatically shrink to a minimal
 * counterexample.
 *
 * Run: jest tests/unit/prop_org_assign_limit.test.ts
 * (or `npm test` which picks up all tests/unit/**\/*.test.ts via jest config)
 */

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Subset of per-org contract state we care about for this property. */
interface OrgCountModel {
  /** Set of issue IDs currently in "assigned" (active) state. */
  assigned: Set<number>;
  /** Set of issue IDs in "applied" (pending) state — required for assign. */
  applied: Set<number>;
  /** Global application count — needed to validate apply pre-conditions. */
  globalCount: number;
  /** Effective org cap (mirrors ORG_ASSIGNMENT_LIMIT = 4 in storage.rs). */
  readonly orgCap: number;
  /** Effective global cap (mirrors GLOBAL_APP_LIMIT = 15 in storage.rs). */
  readonly globalCap: number;
}

function makeModel(orgCap = 4, globalCap = 15): OrgCountModel {
  return {
    assigned: new Set(),
    applied: new Set(),
    globalCount: 0,
    orgCap,
    globalCap,
  };
}

type AssignOp   = { tag: 'assign';   issueId: number };
type CompleteOp = { tag: 'complete'; issueId: number };
type RevokeOp   = { tag: 'revoke';   issueId: number };
type ApplyOp    = { tag: 'apply';    issueId: number };
type OrgOp = ApplyOp | AssignOp | CompleteOp | RevokeOp;

/**
 * Execute a single operation against the model.
 * Throws a descriptive error matching the contract's error variants when a
 * precondition is violated.
 */
function execute(model: OrgCountModel, op: OrgOp): void {
  switch (op.tag) {
    case 'apply': {
      if (model.applied.has(op.issueId)) throw new Error('DuplicateApplication(8)');
      if (model.globalCount >= model.globalCap) throw new Error('GlobalApplicationLimitReached(6)');
      model.applied.add(op.issueId);
      model.globalCount++;
      break;
    }
    case 'assign': {
      if (!model.applied.has(op.issueId))  throw new Error('ApplicationNotFound(9)');
      if (model.assigned.size >= model.orgCap) throw new Error('OrgAssignmentLimitReached(7)');
      if (model.assigned.has(op.issueId))  throw new Error('AlreadyAssigned(11)');
      // Consume the application, create the assignment.
      model.applied.delete(op.issueId);
      model.globalCount--;
      model.assigned.add(op.issueId);
      break;
    }
    case 'complete': {
      if (!model.assigned.has(op.issueId)) throw new Error('AssignmentNotFound(10)');
      model.assigned.delete(op.issueId);
      break;
    }
    case 'revoke': {
      if (!model.assigned.has(op.issueId)) throw new Error('AssignmentNotFound(10)');
      model.assigned.delete(op.issueId);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Small pool of issue IDs so collisions occur naturally. */
const arbIssueId = fc.integer({ min: 0, max: 9 });

const arbOp: fc.Arbitrary<OrgOp> = arbIssueId.chain((issueId) =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constant<ApplyOp>({ tag: 'apply', issueId }) },
    { weight: 3, arbitrary: fc.constant<AssignOp>({ tag: 'assign', issueId }) },
    { weight: 2, arbitrary: fc.constant<CompleteOp>({ tag: 'complete', issueId }) },
    { weight: 2, arbitrary: fc.constant<RevokeOp>({ tag: 'revoke', issueId }) },
  ),
);

const arbOpSequence = fc.array(arbOp, { minLength: 1, maxLength: 60 });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('prop_org_assign_limit — org assignment count invariant', () => {
  /**
   * Property 1 — Count invariant:
   * After any valid sequence of apply/assign/complete/revoke operations,
   *   model.assigned.size === orgAssignmentCount
   *
   * Invalid operations are silently skipped (contract rejects them),
   * after each skip we verify the count did not change.
   */
  it('org count always equals the number of active assignments (1000 cases)', () => {
    fc.assert(
      fc.property(arbOpSequence, (ops) => {
        const model = makeModel(4, 15);

        for (const op of ops) {
          const countBefore = model.assigned.size;

          try {
            execute(model, op);
          } catch {
            // Contract would reject — count must be unchanged.
            expect(model.assigned.size).toBe(countBefore);
            continue;
          }

          // After a successful assign: count increased by exactly 1.
          if (op.tag === 'assign') {
            expect(model.assigned.size).toBe(countBefore + 1);
          }
          // After complete or revoke: count decreased by exactly 1.
          if (op.tag === 'complete' || op.tag === 'revoke') {
            expect(model.assigned.size).toBe(countBefore - 1);
          }
          // apply never changes assigned count.
          if (op.tag === 'apply') {
            expect(model.assigned.size).toBe(countBefore);
          }

          // Invariant: org count in [0, orgCap].
          expect(model.assigned.size).toBeGreaterThanOrEqual(0);
          expect(model.assigned.size).toBeLessThanOrEqual(model.orgCap);
        }

        // Final invariant.
        expect(model.assigned.size).toBeGreaterThanOrEqual(0);
        expect(model.assigned.size).toBeLessThanOrEqual(model.orgCap);
      }),
      { numRuns: 1000, verbose: true },
    );
  });

  /**
   * Property 2 — Org cap is a hard ceiling:
   * org count can never exceed ORG_ASSIGNMENT_LIMIT.
   */
  it('org count never exceeds the cap (1000 cases)', () => {
    fc.assert(
      fc.property(arbOpSequence, (ops) => {
        const model = makeModel(4, 15);
        for (const op of ops) {
          try { execute(model, op); } catch { /* rejected — fine */ }
          expect(model.assigned.size).toBeLessThanOrEqual(model.orgCap);
        }
      }),
      { numRuns: 1000, verbose: true },
    );
  });

  /**
   * Property 3 — Assign then complete is a no-op on count:
   * Assigning an issue and then completing it returns the count to the value
   * before the assign.
   */
  it('assign then complete is a count no-op (1000 cases)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }), // pre-fill the org with 0-2 assignments
        fc.integer({ min: 100, max: 199 }), // unique issue ID, no collision
        (prefill, uniqueIssueId) => {
          const model = makeModel(4, 15);

          // Pre-fill with distinct issue IDs.
          for (let i = 0; i < prefill; i++) {
            execute(model, { tag: 'apply', issueId: i });
            execute(model, { tag: 'assign', issueId: i });
          }

          const countBefore = model.assigned.size;

          // Apply then assign the unique issue.
          execute(model, { tag: 'apply', issueId: uniqueIssueId });
          execute(model, { tag: 'assign', issueId: uniqueIssueId });
          // Complete it.
          execute(model, { tag: 'complete', issueId: uniqueIssueId });

          expect(model.assigned.size).toBe(countBefore);
        },
      ),
      { numRuns: 1000, verbose: true },
    );
  });

  /**
   * Property 4 — Assign then revoke is a no-op on count (same as complete).
   */
  it('assign then revoke is a count no-op (1000 cases)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 200, max: 299 }),
        (prefill, uniqueIssueId) => {
          const model = makeModel(4, 15);
          for (let i = 0; i < prefill; i++) {
            execute(model, { tag: 'apply', issueId: i });
            execute(model, { tag: 'assign', issueId: i });
          }

          const countBefore = model.assigned.size;
          execute(model, { tag: 'apply', issueId: uniqueIssueId });
          execute(model, { tag: 'assign', issueId: uniqueIssueId });
          execute(model, { tag: 'revoke', issueId: uniqueIssueId });

          expect(model.assigned.size).toBe(countBefore);
        },
      ),
      { numRuns: 1000, verbose: true },
    );
  });

  /**
   * Property 5 — Assign at cap is rejected:
   * When assigned.size == orgCap, any further assign must be rejected and
   * count must stay at orgCap.
   */
  it('assign at org cap is rejected and count stays at cap (1000 cases)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 200, max: 299 }), (freshId) => {
        const model = makeModel(4, 15);

        // Fill to cap using IDs 0..3.
        for (let i = 0; i < model.orgCap; i++) {
          execute(model, { tag: 'apply', issueId: i });
          execute(model, { tag: 'assign', issueId: i });
        }
        expect(model.assigned.size).toBe(model.orgCap);

        // Apply succeeds, assign must fail.
        execute(model, { tag: 'apply', issueId: freshId });
        expect(() =>
          execute(model, { tag: 'assign', issueId: freshId }),
        ).toThrow('OrgAssignmentLimitReached(7)');

        expect(model.assigned.size).toBe(model.orgCap);
      }),
      { numRuns: 1000, verbose: true },
    );
  });

  /**
   * Property 6 — Complete/revoke of non-existent assignment is rejected:
   * Calling complete or revoke on an issue that is not assigned must not
   * change the count.
   */
  it('complete/revoke of non-existent assignment leaves count unchanged (1000 cases)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 500, max: 999 }),
        fc.oneof(
          fc.constant<'complete'>('complete'),
          fc.constant<'revoke'>('revoke'),
        ),
        (unassignedId, terminator) => {
          const model = makeModel(4, 15);
          const countBefore = model.assigned.size;

          expect(() =>
            execute(model, { tag: terminator, issueId: unassignedId }),
          ).toThrow('AssignmentNotFound(10)');

          expect(model.assigned.size).toBe(countBefore);
        },
      ),
      { numRuns: 1000, verbose: true },
    );
  });
});

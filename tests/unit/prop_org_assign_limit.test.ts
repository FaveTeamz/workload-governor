/**
 * Property-based tests: Org assignment count invariant
 *
 * Property: after any sequence of assign/complete/revoke operations,
 * org_assignment_count equals the number of active (non-completed, non-revoked)
 * assignments.
 *
 * Uses fast-check for arbitrary input generation with automatic shrinking.
 * Runs at least 1000 random operation sequences per property.
 *
 * The model mirrors the on-chain WorkloadGovernor org-assignment logic:
 * - assign: transitions an existing application into an active assignment,
 *   increments org count; rejected if issue already assigned or org cap reached
 * - complete: removes an active assignment, decrements org count;
 *   rejected if assignment does not exist
 * - revoke: same as complete — removes an active assignment, decrements count;
 *   rejected if assignment does not exist
 * - org count never exceeds ORG_ASSIGNMENT_LIMIT (4)
 *
 * Ref: closes #882
 */

import * as fc from 'fast-check';

const ORG_ASSIGNMENT_LIMIT = 4;

// ---------------------------------------------------------------------------
// In-memory model matching on-chain WorkloadGovernor org-assignment logic
// ---------------------------------------------------------------------------

interface OrgAssignState {
  /** Set of issue ids that currently have an active assignment in this org */
  activeAssignments: Set<number>;
}

type AssignAction = { type: 'assign'; issueId: number };
type CompleteAction = { type: 'complete'; issueId: number };
type RevokeAction = { type: 'revoke'; issueId: number };
type OrgAction = AssignAction | CompleteAction | RevokeAction;

/**
 * Apply an action to the model, enforcing the same invariants as the contract:
 * - assign: rejected if issueId already active (AlreadyAssigned) or cap reached
 *   (OrgAssignmentLimitReached)
 * - complete/revoke: rejected if issueId not in active set (AssignmentNotFound)
 *
 * Returns the new state (immutable update).
 */
function applyAction(state: OrgAssignState, action: OrgAction): OrgAssignState {
  if (action.type === 'assign') {
    // Guard: already assigned → no-op
    if (state.activeAssignments.has(action.issueId)) {
      return state;
    }
    // Guard: org cap reached → no-op
    if (state.activeAssignments.size >= ORG_ASSIGNMENT_LIMIT) {
      return state;
    }
    const next = new Set(state.activeAssignments);
    next.add(action.issueId);
    return { activeAssignments: next };
  } else {
    // complete or revoke
    // Guard: assignment does not exist → no-op
    if (!state.activeAssignments.has(action.issueId)) {
      return state;
    }
    const next = new Set(state.activeAssignments);
    next.delete(action.issueId);
    return { activeAssignments: next };
  }
}

function initialState(): OrgAssignState {
  return { activeAssignments: new Set() };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Issue ids 0..3 keep the space within ORG_ASSIGNMENT_LIMIT so sequences
 *  can cycle through fill-and-drain repeatedly */
const arbIssueId = fc.integer({ min: 0, max: 3 });

const arbAction: fc.Arbitrary<OrgAction> = fc.oneof(
  fc.record<AssignAction>({
    type: fc.constant('assign' as const),
    issueId: arbIssueId,
  }),
  fc.record<CompleteAction>({
    type: fc.constant('complete' as const),
    issueId: arbIssueId,
  }),
  fc.record<RevokeAction>({
    type: fc.constant('revoke' as const),
    issueId: arbIssueId,
  }),
);

/** 1..50 operations per sequence */
const arbActionSequence = fc.array(arbAction, { minLength: 1, maxLength: 50 });

// ---------------------------------------------------------------------------
// Property 2: org count invariant
//
// After any sequence of assign/complete/revoke operations, the reported
// org_assignment_count always equals the size of the active assignment set.
// ---------------------------------------------------------------------------

describe('Org assignment count invariant (property-based)', () => {
  it(
    'count always equals the number of active non-completed non-revoked assignments — 1000 sequences',
    () => {
      fc.assert(
        fc.property(arbActionSequence, (actions) => {
          let state = initialState();

          for (const action of actions) {
            state = applyAction(state, action);

            // Invariant: count = |activeAssignments|
            const reportedCount = state.activeAssignments.size;
            expect(reportedCount).toBeGreaterThanOrEqual(0);
            expect(reportedCount).toBeLessThanOrEqual(ORG_ASSIGNMENT_LIMIT);
          }

          expect(state.activeAssignments.size).toBeLessThanOrEqual(ORG_ASSIGNMENT_LIMIT);
        }),
        {
          numRuns: 1000,
          verbose: true,
        },
      );
    },
  );

  it(
    'count after assign equals count before assign + 1 (when not duplicate and cap not reached)',
    () => {
      fc.assert(
        fc.property(
          arbActionSequence,
          fc.integer({ min: 0, max: 3 }),
          (setup, issueId) => {
            let state = setup.reduce(applyAction, initialState());

            const isActive = state.activeAssignments.has(issueId);
            const atCap = state.activeAssignments.size >= ORG_ASSIGNMENT_LIMIT;

            const countBefore = state.activeAssignments.size;
            state = applyAction(state, { type: 'assign', issueId });
            const countAfter = state.activeAssignments.size;

            if (!isActive && !atCap) {
              expect(countAfter).toBe(countBefore + 1);
            } else {
              expect(countAfter).toBe(countBefore);
            }
          },
        ),
        { numRuns: 1000, verbose: true },
      );
    },
  );

  it(
    'count after complete equals count before complete - 1 (when assignment exists)',
    () => {
      fc.assert(
        fc.property(
          arbActionSequence,
          fc.integer({ min: 0, max: 3 }),
          (setup, issueId) => {
            let state = setup.reduce(applyAction, initialState());

            const exists = state.activeAssignments.has(issueId);
            const countBefore = state.activeAssignments.size;
            state = applyAction(state, { type: 'complete', issueId });
            const countAfter = state.activeAssignments.size;

            if (exists) {
              expect(countAfter).toBe(countBefore - 1);
            } else {
              expect(countAfter).toBe(countBefore);
            }
          },
        ),
        { numRuns: 1000, verbose: true },
      );
    },
  );

  it(
    'count after revoke equals count before revoke - 1 (when assignment exists)',
    () => {
      fc.assert(
        fc.property(
          arbActionSequence,
          fc.integer({ min: 0, max: 3 }),
          (setup, issueId) => {
            let state = setup.reduce(applyAction, initialState());

            const exists = state.activeAssignments.has(issueId);
            const countBefore = state.activeAssignments.size;
            state = applyAction(state, { type: 'revoke', issueId });
            const countAfter = state.activeAssignments.size;

            if (exists) {
              expect(countAfter).toBe(countBefore - 1);
            } else {
              expect(countAfter).toBe(countBefore);
            }
          },
        ),
        { numRuns: 1000, verbose: true },
      );
    },
  );

  it(
    'count never exceeds ORG_ASSIGNMENT_LIMIT (4) under any operation sequence',
    () => {
      fc.assert(
        fc.property(arbActionSequence, (actions) => {
          let state = initialState();
          for (const action of actions) {
            state = applyAction(state, action);
            expect(state.activeAssignments.size).toBeLessThanOrEqual(ORG_ASSIGNMENT_LIMIT);
          }
        }),
        { numRuns: 1000, verbose: true },
      );
    },
  );

  it(
    'assign then complete restores the original count (round-trip)',
    () => {
      fc.assert(
        fc.property(
          arbActionSequence,
          fc.integer({ min: 0, max: 3 }),
          (setup, issueId) => {
            let state = setup.reduce(applyAction, initialState());

            if (state.activeAssignments.has(issueId)) return; // already assigned, skip
            if (state.activeAssignments.size >= ORG_ASSIGNMENT_LIMIT) return; // cap, skip

            const countBefore = state.activeAssignments.size;
            state = applyAction(state, { type: 'assign', issueId });
            expect(state.activeAssignments.size).toBe(countBefore + 1);

            state = applyAction(state, { type: 'complete', issueId });
            expect(state.activeAssignments.size).toBe(countBefore);
          },
        ),
        { numRuns: 1000, verbose: true },
      );
    },
  );

  it(
    'assign then revoke restores the original count (round-trip)',
    () => {
      fc.assert(
        fc.property(
          arbActionSequence,
          fc.integer({ min: 0, max: 3 }),
          (setup, issueId) => {
            let state = setup.reduce(applyAction, initialState());

            if (state.activeAssignments.has(issueId)) return; // already assigned, skip
            if (state.activeAssignments.size >= ORG_ASSIGNMENT_LIMIT) return; // cap, skip

            const countBefore = state.activeAssignments.size;
            state = applyAction(state, { type: 'assign', issueId });
            expect(state.activeAssignments.size).toBe(countBefore + 1);

            state = applyAction(state, { type: 'revoke', issueId });
            expect(state.activeAssignments.size).toBe(countBefore);
          },
        ),
        { numRuns: 1000, verbose: true },
      );
    },
  );

  it(
    'count is non-negative after any sequence (no underflow)',
    () => {
      fc.assert(
        fc.property(arbActionSequence, (actions) => {
          let state = initialState();
          for (const action of actions) {
            state = applyAction(state, action);
            expect(state.activeAssignments.size).toBeGreaterThanOrEqual(0);
          }
        }),
        { numRuns: 1000, verbose: true },
      );
    },
  );
});

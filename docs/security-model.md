# Security Model

## Checks-Effects-Interactions (CEI) Pattern

WorkloadGovernor enforces a strict **Checks → Effects → Interactions** ordering in every
state-changing function. This pattern is a well-established defense against reentrancy and
ensures that all invariants are validated before any storage is mutated, and that external
interactions (event emission) only occur after storage commits are complete.

---

### Why CEI Matters in Soroban Contracts

Soroban supports cross-contract invocations. An event emitted mid-function could, in a
future composition, trigger a callback into the same contract before the current invocation
finishes. CEI ordering eliminates this class of vulnerability by ensuring:

1. **All checks run first** — no storage is touched until every precondition and consistency
   guard passes.
2. **All effects complete next** — storage writes are committed atomically relative to the
   logical operation.
3. **External interactions happen last** — events are emitted only after all writes are final,
   so any observer or callback sees a fully consistent state.

---

### Verified Interaction Ordering

#### `complete_assignment`

```
CHECKS
  require_initialized(env, NotInitialized)
  maintainer.require_auth()
  is_maintainer(maintainer, org_id)           → UnauthorizedMaintainer if false
  has_assignment(org_id, issue_id, contributor) → AssignmentNotFound if false
  get_org_assignment_count(contributor, org_id)
    if count == 0 → CounterInconsistency       ← consistency guard BEFORE any write

EFFECTS
  remove_assignment(org_id, issue_id, contributor)
  if new_count == 0:
    remove_org_assignment_count(contributor, org_id)
  else:
    set_org_assignment_count(contributor, org_id, count - 1)
  bump_instance()

INTERACTIONS
  emit_assignment_completed(maintainer, contributor, org_id, issue_id)
```

**Key property:** The counter consistency check (`count == 0` guard) is performed in the
**CHECK phase**, reading the stored counter and comparing it before `remove_assignment` is
called. If the counter is inconsistent, the function panics without touching storage.

#### `revoke_assignment`

```
CHECKS
  require_initialized(env, NotInitialized)
  maintainer.require_auth()
  is_maintainer(maintainer, org_id)           → UnauthorizedMaintainer if false
  has_assignment(org_id, issue_id, contributor) → AssignmentNotFound if false
  get_org_assignment_count(contributor, org_id)
    if count == 0 → CounterInconsistency       ← consistency guard BEFORE any write

EFFECTS
  remove_assignment(org_id, issue_id, contributor)
  if new_count == 0:
    remove_org_assignment_count(contributor, org_id)
  else:
    set_org_assignment_count(contributor, org_id, count - 1)
  bump_instance()

INTERACTIONS
  emit_assignment_revoked(maintainer, contributor, org_id, issue_id)
```

**Key property (SC-006 fix):** Before SC-006, `revoke_assignment` called `remove_assignment`
*before* reading the counter, which meant a `CounterInconsistency` panic would leave the
assignment entry permanently deleted with no counter to match. The fix moves the counter read
and the `CounterInconsistency` guard into the CHECK phase, before any storage mutation.

---

### SC-006 Regression: Pre-Fix vs Post-Fix

| Phase | Pre-SC-006 (`revoke_assignment`) | Post-SC-006 (`revoke_assignment`) |
|---|---|---|
| Checks | `require_initialized`, `require_auth`, `is_maintainer`, `has_assignment` | `require_initialized`, `require_auth`, `is_maintainer`, `has_assignment`, **`get_org_assignment_count` + zero check** |
| Effects | `remove_assignment` ← *write happened here* | `remove_assignment`, counter update |
| Inconsistency check | Read counter, panic if 0 ← *after the write!* | Moved to checks phase |
| Interactions | `emit_assignment_revoked` | `emit_assignment_revoked` |

**Observable difference:** With the pre-fix code, if storage was in a corrupted state
(assignment exists but counter is 0), calling `revoke_assignment` would:
1. Delete the assignment sentinel (storage write).
2. Read the counter (returns 0).
3. Panic with `CounterInconsistency`.

The assignment was gone — with no counter entry — leaving storage in a **worse** corrupted
state than before. Post-fix, the panic fires before any write, leaving storage untouched.

---

### Counter Atomicity Guarantee

The `org_assignment_count` counter and the `("asgn", org_id, issue_id, contributor)` sentinel
are always kept in sync:

- **`assign_issue`**: counter incremented *and* sentinel written in the same effects phase.
- **`complete_assignment`**: sentinel removed *and* counter decremented in the same effects phase.
- **`revoke_assignment`**: sentinel removed *and* counter decremented in the same effects phase.

Because Soroban's storage operations within a single contract invocation are committed
atomically (the host either applies all writes or none on panic), the counter and sentinel
will never diverge during normal operation.

The `CounterInconsistency` guard exists to detect *externally introduced* corruption (e.g.
post-migration data anomalies or direct storage manipulation in test environments) and reject
any operation that would act on corrupt data.

---

### Test Coverage

The CEI ordering is verified by the following test suite in `src/test.rs`:

| Test | What it verifies |
|---|---|
| `unit_cei_revoke_counter_inconsistency_leaves_assignment_intact` | Regression: revoke panics in CHECK phase; assignment sentinel remains |
| `unit_cei_complete_counter_inconsistency_leaves_assignment_intact` | complete panics in CHECK phase; assignment sentinel remains |
| `unit_cei_complete_effects_precede_event` | All storage writes committed before `assignment_completed` event |
| `unit_cei_revoke_effects_precede_event` | All storage writes committed before `assignment_revoked` event |
| `unit_cei_complete_slot_freed_for_reuse` | Counter decrement is durable; freed slot accepts new assignment |
| `unit_cei_revoke_slot_freed_for_reuse` | Counter decrement is durable; freed slot accepts new assignment |
| `unit_cei_complete_sentinel_and_counter_atomic` | Sentinel and counter removed atomically on complete |
| `unit_cei_revoke_sentinel_and_counter_atomic` | Sentinel and counter removed atomically on revoke |

---

### Auth Ordering

Authentication (`require_auth`) is enforced as the **first** user-supplied input check,
immediately after the initialization guard. This prevents any computation from being
performed on behalf of an unauthorized caller before the call is rejected:

```
require_initialized(env, NotInitialized)   ← contract liveness guard
caller.require_auth()                       ← auth check (second)
role/permission checks                      ← business logic checks
```

This ordering ensures that:
- No storage reads reveal information to unauthenticated callers.
- No CPU budget is consumed on behalf of an impersonator.
- Auth failures produce a clean, uninformative rejection with no side effects.

---

### References

- [OWASP Smart Contract Top 10 — Reentrancy](https://owasp.org/www-project-smart-contract-security-top-10/)
- [Soroban Authorization Model](https://developers.stellar.org/docs/smart-contracts/guides/authorization/)
- SC-006 issue: *Enforce checks-effects-interactions order on complete and revoke handlers*

# ADR-003: Use Temporary Storage for Pending Applications

**Status:** Accepted  
**Date:** 2024-01-22  
**Deciders:** Core team  
**Issue:** [#606](https://github.com/FaveTeamz/workload-governor/issues/606)

---

## Context

Soroban provides three storage tiers:

| Tier | Expiry | Cost model |
|------|--------|------------|
| **Temporary** | Expires when TTL reaches 0 | Cheapest; pays upfront rent for TTL duration |
| **Persistent** | Never expires | More expensive; requires periodic TTL bumping to avoid archival |
| **Instance** | Tied to contract instance | Used for the contract entry itself |

WorkloadGovernor tracks two classes of state:

1. **Pending applications** — contributor `C` has applied to issue `I` in org `O`.
   These are valid only during an AlignmentDrips Wave (approximately 24 hours).

2. **Active assignments** — maintainer has assigned `C` to issue `I` in org `O`.
   These must survive beyond a Wave until a maintainer explicitly completes or
   revokes them.

The question was: which storage tier should each class use?

---

## Decision

- **Pending applications** (global app count + per-issue app sentinel): **Temporary storage** with `APP_TTL_LEDGERS = 17_280` (~24 hours at 5 s/ledger).
- **Active assignments** (org assignment count + assignment sentinel): **Persistent storage**.
- **Admin, maintainer registrations, org caps**: **Persistent storage**.

---

## Reasoning for Temporary Application Storage

### 1. Wave-scoped semantics are free

AlignmentDrips Wave applications are semantically scoped to a Wave. When a Wave
ends, all pending applications should cease to exist. Using temporary storage
makes this automatic — the Soroban host garbage-collects expired entries with
no admin transaction required. The alternative (persistent storage + explicit
cleanup) would require an admin to iterate all active applications at Wave end
and remove them individually, which is expensive and error-prone on Soroban
(storage cannot be iterated; callers must supply the keys).

### 2. Counter consistency is preserved automatically

The global application counter (`("g_apps", contributor)`) and the per-issue
application sentinel (`("app", contributor, org_id, issue_id)`) are set to
the same TTL. When a Wave ends both entries expire together — the counter
does not drift ahead of the sentinels. This is impossible to guarantee with
persistent storage and a manual cleanup step unless the cleanup is atomic.

### 3. Storage cost is lower

Temporary storage is cheaper than persistent storage on Soroban because the
host does not need to budget for indefinite TTL bumping. The per-Wave cost
for 100 contributors each holding 3 applications is approximately 0.04 XLM.
The same data in persistent storage would require periodic `bump_ttl` calls
to prevent archival, multiplying the cost.

### 4. TTL is configurable and extendable

The `extend_application_ttl` function allows anyone (no auth required) to
bump an application's TTL during an active Wave. This handles the edge case
where a review cycle extends beyond the default 24-hour TTL.

---

## Reasoning for Persistent Assignment Storage

Assignments represent contractual obligations between a contributor and a
maintainer. They must survive beyond a single Wave:

- A contributor's work on an issue may span multiple Waves.
- The backend dashboard queries assignment state to display contributor history.
- Persistent storage is never auto-deleted — only explicitly removed via
  `complete_assignment` or `revoke_assignment`.

---

## Consequences

### Positive

- Zero-cost Wave cleanup — no admin cleanup transaction needed.
- Counter consistency guaranteed by shared TTL on both temporary entries.
- Cheapest possible storage cost for Wave-scoped data.

### Negative

- Applications are lost if `extend_application_ttl` is not called during a
  very long review cycle (> 24 hours). Contributors must re-apply.
- The TTL value (`APP_TTL_LEDGERS = 17_280`) is a compile-time constant.
  Changing it requires a contract upgrade.
- Temporary storage cannot be read after expiry, so the backend event indexer
  must cache application state for historical queries.

### Neutral

- The distinction between temporary and persistent storage is documented in
  `docs/storage-design.md` with TTL expiry scenarios.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| Persistent storage for applications | Requires manual Wave-end cleanup; expensive; cleanup transaction is non-atomic |
| Shorter TTL (e.g. 1 hour) | Too aggressive; blocks contributors during normal review cycles |
| Longer TTL (e.g. 7 days) | Increases temporary storage rent proportionally; misaligns with Wave semantics |
| No TTL (manual remove only) | Defeats the benefit of temporary storage; creates persistent orphan entries if contributors disappear |

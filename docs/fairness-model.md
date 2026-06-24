# Fairness Model

## The Problem

Open-source contribution platforms suffer from two related failure modes when
faster or more connected developers can claim tasks without limit:

1. **Application hoarding** – A contributor applies for many issues across orgs,
   blocking others from applying, then sits idle or abandons most of them.
2. **Assignment monopolization** – Within one org, a single contributor holds
   every available active task, starving other contributors.

Both patterns reduce contribution diversity and slow net throughput: tasks
appear claimed but make no progress.

---

## The Solution

WorkloadGovernor enforces two independent caps:

| Cap | Limit | Scope | Storage tier |
|---|---|---|---|
| Global application cap | 15 pending applications | Across all orgs | Temporary |
| Org assignment cap | 4 active assignments | Per org | Persistent |

**Global cap** – checked on every `apply_for_issue` call. Prevents any single
contributor from flooding the application queue across the whole platform.

**Org cap** – checked on every `assign_issue` call. Ensures no contributor
monopolizes a single org's task board.

The caps operate at different lifecycle stages (apply vs assign) and on
different storage keys, so they do not interfere with each other.

---

## Worked Examples

### Scenario 1 — Normal active contributor (caps not reached)

Alice applies for 4 issues in Org A, 3 in Org B, and 2 in Org C: **9 pending
applications** (below 15). Maintainers assign 3 of her Org A applications.
Her global pending count drops to 6; her Org A assignment count is 3 (below 4).
She can still apply for 9 more issues globally and take 1 more assignment in
Org A. Everything works normally.

### Scenario 2 — Global cap blocks an application hoarder

Bob applies for issues aggressively: 5 in Org A, 5 in Org B, 5 in Org C —
exactly **15 pending applications**. When he tries to apply for a 16th issue
anywhere, `apply_for_issue` returns `GlobalApplicationLimitReached` (error 6).
He must withdraw an existing application or wait for one to be assigned before
he can apply again. Other contributors can freely apply for those same issues.

### Scenario 3 — Org cap blocks assignment monopolization

Carol is fast. A maintainer assigns her 4 issues in Org D — her org assignment
count hits **4**. When the maintainer tries to assign her a 5th issue in Org D,
`assign_issue` returns `OrgAssignmentLimitReached` (error 7). The 5th issue
remains unassigned and visible to other contributors. Once Carol completes or is
revoked from one of her 4 assignments, the cap clears and she can receive
another assignment in Org D.

### Scenario 4 — Cross-org contributor stays under both caps

Dave holds 4 active assignments in Org E and 4 in Org F (**8 assignments**,
well within the per-org limit of 4 each). He also has 7 pending applications
across Org G and Org H. His global pending count is 7 (below 15). He can still
apply for 8 more issues and can receive assignments in any org that has not hit
his per-org cap of 4. The caps allow productive multi-org contributors while
still bounding their maximum footprint.

---

## Tradeoffs and Limitations

**Cap values are fixed at compile time.** The limits (15 global, 4 per-org) are
constants in the contract. Adjusting them requires a contract upgrade. There is
no per-org configuration, so orgs with very different velocity profiles (a tiny
org vs a huge one) are governed by the same numbers.

**No time-based pressure.** The caps count entries but do not penalise slow
progress. A contributor who holds 4 assignments in an org but makes no progress
blocks the cap just as much as one who ships quickly. TTL expiry on application
entries mitigates hoarding over time, but active assignments are persistent and
only cleared by maintainer action (`complete_assignment` / `revoke_assignment`).

**Maintainers are the enforcement backstop.** The org assignment cap can only be
relieved by a maintainer. If maintainers are inactive, stale assignments pile
up and block new ones. The contract enforces caps correctly but cannot force
maintainer activity.

**Global cap counts pending applications only.** Active assignments do not count
against the global cap of 15. A contributor could theoretically hold 15 pending
applications *plus* many active assignments simultaneously (up to 4 per org ×
number of orgs). This is intentional — assignments represent committed work,
not speculative claims.

**No contributor-level allow-listing.** All contributors are subject to the same
caps. There is no mechanism to grant a trusted contributor a higher limit without
a contract upgrade.

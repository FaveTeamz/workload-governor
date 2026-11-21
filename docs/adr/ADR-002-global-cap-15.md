# ADR-002: Set the Global Pending Application Cap at 15

**Status:** Accepted  
**Date:** 2024-01-20  
**Deciders:** Core team + AlignmentDrips Wave governance  
**Issue:** [#606](https://github.com/FaveTeamz/workload-governor/issues/606)

---

## Context

WorkloadGovernor enforces a **global application cap**: the maximum number of
pending applications a contributor can hold simultaneously across all
organisations. A cap is necessary to prevent a small group of fast contributors
from monopolising all available work during a Wave.

The team needed to pick a specific number. Too low and productive contributors
are blocked unnecessarily. Too high and the cap provides no meaningful fairness
guarantee.

The key design inputs were:

- Average number of tasks posted per Wave across observed AlignmentDrips Wave
  organisations (roughly 40–80 tasks in a typical Wave).
- Observed application-to-assignment conversion rate (~30–40%).
- Desired maximum fraction of tasks any single contributor should be able to
  hold in pending state (target: ≤ 25% of tasks in a small org of 20 tasks).
- Storage cost: each application entry costs ~65 bytes in temporary storage;
  at 15 entries per contributor the worst-case rent is negligible.

---

## Decision

**Set `GLOBAL_APP_LIMIT = 15`** as the compile-time default.

Allow the admin to override this value at runtime via `set_global_cap` and
`emergency_set_global_cap`, with a hard ceiling of 100 to prevent abuse.

---

## Reasoning

### Fairness model

With 15 pending applications:

- In a Wave with 40 tasks across all orgs, a single contributor holding 15
  applications controls 37.5% of the pipeline. That is the worst case and is
  already higher than ideal, but it is bounded.
- In a Wave with 80 tasks, a contributor with 15 applications holds 18.75% —
  a reasonable upper bound for a highly engaged contributor.
- For the 4-assignment org cap to bind before the global cap, a contributor
  would need to be assigned in at least 4 orgs simultaneously, which is rare.

### Conversion rate buffer

If the application-to-assignment conversion rate is 35%, a contributor with
15 applications expects ~5 assignments on average. The org cap of 4 per org
further constrains the distribution. A global cap of 15 gives contributors
enough pipeline to be productive without creating an outsized bottleneck.

### Industry comparison

Open-source platforms that implement similar caps (GitCoin, Dework) typically
use limits between 10 and 20. 15 sits in the middle of this range.

### Runtime override escape hatch

The admin can raise or lower the cap at runtime without a contract upgrade.
This provides a governance escape hatch: if the Wave is larger than expected
or the 15-cap proves too restrictive in practice, the admin can increase it
via `emergency_set_global_cap` without a redeploy.

---

## Consequences

### Positive

- Hard upper bound on contributor pipeline monopolisation.
- Compile-time constant means the default is baked in and cannot be altered
  by contributors (only the admin).
- Runtime override allows adaptation to real-world conditions without
  contract upgrades.

### Negative

- Some highly productive contributors may occasionally be blocked at 15
  pending applications during a large Wave.
- The cap applies uniformly — it does not distinguish between contributors
  who apply widely (speculative) vs. narrowly (intentional).

### Neutral

- The constant `GLOBAL_APP_LIMIT = 15` is defined in `src/storage.rs` and
  documented in `docs/storage-design.md`. Changing it requires a contract
  upgrade and a MAJOR version bump.

---

## Alternatives Considered

| Value | Reason rejected |
|-------|----------------|
| 5 | Too restrictive; blocks productive contributors in large Waves |
| 10 | Borderline; aligns with some platforms but offers little buffer |
| 20 | Allows a single contributor to hold 50% of pipeline in a 40-task Wave |
| No cap | Defeats the fairness purpose entirely |
| Per-org cap only | Would still allow global monopolisation across many orgs |

# Storage Design — WorkloadGovernor

## Overview

WorkloadGovernor uses three Soroban storage tiers:

| Tier       | Purpose                                      | TTL policy              |
|------------|----------------------------------------------|-------------------------|
| Temporary  | Wave-bounded state (applications, app count) | `APP_TTL_LEDGERS` (~24 h) |
| Persistent | Long-lived state (admin, maintainers, assignments) | No automatic expiry   |
| Instance   | Contract liveness sentinel                   | Bumped on every write   |

---

## Key Prefix Optimisation (implemented in refactor/#1222)

Soroban charges storage rent and transaction fees proportional to the XDR-serialised
byte size of each ledger entry key. Shorter `symbol_short!` prefixes reduce that
overhead for every read and write across the contract's lifetime.

### Before / After comparison

| Category              | Old prefix | Old XDR bytes | New prefix | New XDR bytes | Saving |
|-----------------------|------------|---------------|------------|---------------|--------|
| Global app count      | `"g_apps"` | 10            | `"ga"`     | 6             | ~40 %  |
| Per-issue application | `"app"`    | 7             | `"ap"`     | 6             | ~14 %  |
| Admin address         | `"admin"`  | 9             | `"adm"`    | 7             | ~22 %  |
| Maintainer entry      | `"maint"`  | 9             | `"mn"`     | 6             | ~33 %  |
| Org assignment count  | `"o_asgn"` | 10            | `"oa"`     | 6             | ~40 %  |
| Active assignment     | `"asgn"`   | 8             | `"as"`     | 6             | ~25 %  |

> XDR byte sizes are for the Symbol field only (4-byte length prefix + UTF-8 body).
> Compound keys include additional Address and u32 fields; overall entry size reduction
> is proportionally smaller but cumulative across all ledger operations.

**Average prefix footprint reduction: ~29 %** across all six entry types.

### Collision freedom guarantee

All six prefixes (`"ga"`, `"ap"`, `"adm"`, `"mn"`, `"oa"`, `"as"`) are distinct.
Compound keys differ further by storage tier (temporary vs persistent) and by the
ordering of their additional fields, making cross-category collision mathematically
impossible.

Run `bash scripts/check-key-collisions.sh` to verify collision freedom across
1 000 000 synthetic key combinations.

---

## Full key schema

### Temporary storage

```
("ga",  contributor: Address)                             → u32   (global app count)
("ap",  contributor: Address, org_id: Symbol, issue_id: u32) → bool (application sentinel)
```

### Persistent storage

```
("adm")                                                   → Address  (admin)
("mn",  maintainer: Address, org_id: Symbol)              → bool     (maintainer flag)
("oa",  contributor: Address, org_id: Symbol)             → u32      (org assignment count)
("as",  org_id: Symbol, issue_id: u32, contributor: Address) → bool  (assignment sentinel)
```

### Instance storage

The contract instance entry is managed by `bump_instance()` and uses the SDK default key.

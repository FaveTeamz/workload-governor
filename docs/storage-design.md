# Storage Design

WorkloadGovernor uses three Soroban storage tiers and seven distinct key prefixes to manage contract state.

## Storage Tiers

| Tier | Purpose | Survival |
|---|---|---|
| **Temporary** | Application state scoped to the current Wave | Expires when TTL reaches 0; can be bumped |
| **Persistent** | Admin, maintainer authorisation, assignment state, org caps | Survives until contract is archived |
| **Instance** | Contract instance entry | Bumped on every state-changing call (~30 days) |

## Key Patterns

### 1 — Global Application Count

| Field | Value |
|---|---|
| Tier | Temporary |
| Key type | `(Symbol, Address)` |
| Prefix | `"g_apps"` |
| Value | `u32` |
| TTL | `APP_TTL_LEDGERS` = 17 280 ledgers (~24 h) |

**Purpose:** Tracks how many pending applications a contributor holds across all organisations. Capped at `GLOBAL_APP_LIMIT = 15`.

**Example key:**
```
("g_apps", GBFZB...XK2Q)
```

**Example value:** `3`

When the count drops to zero the entry is removed. On every application submission or TTL-extension call the TTL is refreshed to `APP_TTL_LEDGERS`.

---

### 2 — Per-Issue Application Entry

| Field | Value |
|---|---|
| Tier | Temporary |
| Key type | `(Symbol, Address, Symbol, u32)` |
| Prefix | `"app"` |
| Value | `bool` (always `true`, presence sentinel) |
| TTL | `APP_TTL_LEDGERS` = 17 280 ledgers (~24 h) |

**Purpose:** Records that contributor `C` has applied to issue `I` in org `O`. Reading the key and getting `None` / `false` means no pending application exists.

**Example key:**
```
("app", GBFZB...XK2Q, "stellar-org", 42)
```

**Example value:** `true`

---

### 3 — Admin Address

| Field | Value |
|---|---|
| Tier | Persistent |
| Key type | `Symbol` |
| Prefix | `"admin"` |
| Value | `Address` |

**Purpose:** Stores the single admin `Address` set during `initialize`. Reading `None` is the initialisation guard — it means the contract has not been set up yet.

**Example key:**
```
"admin"
```

**Example value:** `GCEZW...SJ3P` (Stellar address)

---

### 4 — Maintainer Registration

| Field | Value |
|---|---|
| Tier | Persistent |
| Key type | `(Symbol, Address, Symbol)` |
| Prefix | `"maint"` |
| Value | `bool` (always `true`, presence sentinel) |

**Purpose:** Records that address `M` is an authorised maintainer for org `O`. The write is idempotent.

**Example key:**
```
("maint", GABC1...9KLM, "stellar-org")
```

**Example value:** `true`

---

### 5 — Org Assignment Count

| Field | Value |
|---|---|
| Tier | Persistent |
| Key type | `(Symbol, Address, Symbol)` |
| Prefix | `"o_asgn"` |
| Value | `u32` |

**Purpose:** Tracks how many active assignments contributor `C` holds within org `O`. Capped at the effective org cap (default `ORG_ASSIGNMENT_LIMIT = 4`, overridable via `set_org_cap`). Entry is removed when count reaches zero.

**Example key:**
```
("o_asgn", GBFZB...XK2Q, "stellar-org")
```

**Example value:** `2`

---

### 6 — Active Assignment Entry

| Field | Value |
|---|---|
| Tier | Persistent |
| Key type | `(Symbol, Symbol, u32, Address)` |
| Prefix | `"asgn"` |
| Value | `bool` (always `true`, presence sentinel) |

**Purpose:** Records that contributor `C` is actively assigned to issue `I` in org `O`. Key order is `(org_id, issue_id, contributor)` so lookups by issue are efficient.

**Example key:**
```
("asgn", "stellar-org", 42, GBFZB...XK2Q)
```

**Example value:** `true`

---

### 7 — Per-Org Assignment Cap

| Field | Value |
|---|---|
| Tier | Persistent |
| Key type | `(Symbol, Symbol)` |
| Prefix | `"o_cap"` |
| Value | `u32` |

**Purpose:** Stores a per-org override for the assignment cap set by a registered maintainer via `set_org_cap`. When absent callers fall back to `ORG_ASSIGNMENT_LIMIT = 4`. Valid range: `[1, 20]`.

**Example key:**
```
("o_cap", "stellar-org")
```

**Example value:** `8`

---

## TTL Semantics

### Why temporary storage for applications?

Applications are scoped to an AlignmentDrips **Wave** — a time-bounded funding round. When a Wave ends, all pending applications should cease to exist automatically without requiring an explicit cleanup transaction. Temporary storage on Soroban expires when its TTL reaches ledger 0, giving exactly this behaviour for free.

- TTL is set to `APP_TTL_LEDGERS = 17_280` ledgers (≈ 24 hours at 5 s/ledger).
- This constant is designed to match the Wave duration and must satisfy `APP_TTL_MIN ≤ value ≤ APP_TTL_MAX` (platform cap: 535 000 ledgers).
- Anyone can call `extend_application_ttl` to bump an application within a live Wave.
- Both the Global Application Count (key #1) and the per-issue Application Entry (key #2) are temporary — they expire together, keeping the global counter consistent.

### Why persistent storage for assignments and admin?

Assignments represent contractual obligations between a contributor and a maintainer. They must survive beyond a single Wave and must not disappear due to ledger-level TTL expiry. The same reasoning applies to the admin address and maintainer registrations: these are governance records that must be durable. Persistent entries in Soroban remain indefinitely as long as the contract instance itself is alive (bumped every `INSTANCE_TTL_LEDGERS / 2` ledgers).

---

## TTL Expiry Scenarios

This section documents edge-case behaviour when temporary storage entries expire before normal workflow completion.

### Scenario A — Application entry expires before assignment

**Setup:** Contributor `C` applies to issue `I` in org `O`. No one calls `extend_application_ttl`. 17 280 ledgers elapse and the Wave ends.

**What happens at expiry:**

1. The per-issue application entry `("app", C, O, I)` is deleted by the Soroban host when its TTL reaches 0.
2. The global count entry `("g_apps", C)` shares the same TTL — it also expires, resetting the counter to 0 from the host's perspective.
3. `has_applied(C, O, I)` returns `false`.
4. `get_global_application_count(C)` returns `0` (key absent → default).

**Consequences:**

- The contributor is automatically unblocked for the next Wave — no explicit cleanup needed.
- No assignment was created, so no persistent storage is affected.
- There is no `CounterInconsistency` risk because the `"o_asgn"` key (persistent) was never written in this path.

**Code path in `src/storage.rs`:**
```rust
// get_global_app_count returns 0 when key is absent
env.storage().temporary().get(&key).unwrap_or(0)

// has_app_entry returns false when key is absent
env.storage().temporary().get::<_, bool>(&key).unwrap_or(false)
```

**Prevention:** Call `extend_application_ttl(C, O, I)` periodically during an active Wave to keep the application alive.

---

### Scenario B — Global count key absent while per-issue entry is still live

**Setup:** A prior `withdraw_application` decremented the global count to zero and deleted `("g_apps", C)`. The contributor then re-applied, creating a new `("app", C, O, I)` entry but the global count key was not re-created before expiry of the old one. (In practice this cannot happen via normal contract calls, but a migration script could leave this state.)

**What happens at `assign_issue`:**

```rust
// get_global_app_count returns 0 — key absent
let app_count = storage::get_global_app_count(&env, &contributor); // → 0
let new_app_count = app_count.saturating_sub(1); // → 0  (safe, no underflow)
if new_app_count == 0 {
    storage::remove_global_app_count(&env, &contributor); // no-op remove — safe
}
```

**Conclusion:** Safe. `saturating_sub` and no-op removal on a missing key prevent a panic.

---

### Scenario C — Application expires between `apply_for_issue` and `assign_issue`

**Setup:** Contributor applies at ledger L. The maintainer does not assign until ledger L + 18 000 (after TTL = 17 280 has elapsed).

**What happens:**

- `has_app_entry` returns `false` (entry expired).
- `assign_issue` panics with `ApplicationNotFound` (error 9).

**Recovery:** The contributor must re-apply in the new Wave. The maintainer retries `assign_issue` after re-application.

---

### How `CounterInconsistency` (error 13) Can Arise

Error 13 is raised by `revoke_assignment` when an assignment sentinel exists (`has_assignment` returns `true`) but the org assignment counter is `0`. This indicates the counter and sentinel are out of sync.

**Root causes:**

1. **Manual counter zeroing in a migration script** — a script sets `("o_asgn", C, O)` to `0` without also removing the `("asgn", O, I, C)` sentinels.
2. **Incomplete rollback** — a partial rollback resets counters but leaves assignment sentinels in place.
3. **Off-by-one in a custom migration** — a script iterates assignment entries and writes a counter that is lower than the true count of live sentinels.

**Detection:**

```bash
# For each known (contributor, org_id) pair:
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR" --org_id "$ORG_ID"
# If output is 0 but you know an assignment exists, CounterInconsistency is present.

# Programmatic detection via check_consistency() (admin-only read function):
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- check_consistency
# Returns a list of (contributor, org_id) pairs with mismatched state.
```

Refer to `docs/runbooks/incident-response.md` for the full remediation playbook.

---

## Key Collision Proof

All seven prefixes are distinct `symbol_short!` values:

| # | Prefix | Rust literal |
|---|---|---|
| 1 | `g_apps` | `symbol_short!("g_apps")` |
| 2 | `app` | `symbol_short!("app")` |
| 3 | `admin` | `symbol_short!("admin")` |
| 4 | `maint` | `symbol_short!("maint")` |
| 5 | `o_asgn` | `symbol_short!("o_asgn")` |
| 6 | `asgn` | `symbol_short!("asgn")` |
| 7 | `o_cap` | `symbol_short!("o_cap")` |

### Formal Argument

**Claim:** No two distinct logical storage records can produce the same Soroban storage key.

**Proof:**

Soroban serialises every storage key as a `ScVal`. Tuple keys become `ScVal::Vec([elem₀, …])`. The scalar admin key is `ScVal::Symbol("admin")`. Two keys `K₁` and `K₂` collide iff their full `ScVal` byte representations are identical.

*Cross-pattern collision is impossible* because every key begins with a unique prefix byte sequence. A `ScVal::Vec` whose first element is `symbol_short!("x")` cannot equal one whose first element is `symbol_short!("y")` when `"x" ≠ "y"`. A `ScVal::Vec` cannot equal `ScVal::Symbol` because the XDR discriminant byte differs.

Exhaustive check of all C(7, 2) = **21 pairs**:

| Pair | Why no collision |
|------|-----------------|
| 1 vs 2 | `"g_apps"` ≠ `"app"` |
| 1 vs 3 | Vec ≠ Symbol (different `ScVal` variant) |
| 1 vs 4 | `"g_apps"` ≠ `"maint"` |
| 1 vs 5 | `"g_apps"` ≠ `"o_asgn"` |
| 1 vs 6 | `"g_apps"` ≠ `"asgn"` |
| 1 vs 7 | `"g_apps"` ≠ `"o_cap"` |
| 2 vs 3 | Vec ≠ Symbol |
| 2 vs 4 | `"app"` ≠ `"maint"` |
| 2 vs 5 | `"app"` ≠ `"o_asgn"` |
| 2 vs 6 | `"app"` ≠ `"asgn"` |
| 2 vs 7 | `"app"` ≠ `"o_cap"` |
| 3 vs 4 | Symbol ≠ Vec |
| 3 vs 5 | Symbol ≠ Vec |
| 3 vs 6 | Symbol ≠ Vec |
| 3 vs 7 | Symbol ≠ Vec |
| 4 vs 5 | `"maint"` ≠ `"o_asgn"` |
| 4 vs 6 | `"maint"` ≠ `"asgn"` |
| 4 vs 7 | `"maint"` ≠ `"o_cap"` |
| 5 vs 6 | `"o_asgn"` ≠ `"asgn"` |
| 5 vs 7 | `"o_asgn"` ≠ `"o_cap"` |
| 6 vs 7 | `"asgn"` ≠ `"o_cap"` |

*Within-pattern collision is impossible* because the remaining tuple fields uniquely identify the logical record. `Address` values are validated by the host via `require_auth`, preventing impersonation. Distinct logical records within the same category differ in at least one of `(contributor, org_id, issue_id)`. ∎

---

## Storage Migration Playbook

This playbook covers how to safely evolve the storage schema in future contract upgrades.

### Principles

1. **No automatic migration.** Soroban does not run migration hooks on upgrade. Data reshaping must happen via an explicit on-chain migration transaction after the new WASM is deployed.
2. **Additive changes are safe.** New key prefixes are simply absent from existing state; `unwrap_or` defaults handle them transparently.
3. **Breaking changes require a migration transaction.** Renaming a prefix, changing a value type, or removing a key that existing logic reads requires an explicit migration call.
4. **Dry-run first.** Always run the upgrade dry-run CI step (see `docs/runbooks/contract-upgrade.md`) before deploying to testnet or mainnet.

---

### Playbook A — Additive change (new key prefix)

**Example:** Adding `("o_cap", org_id)` (key #7, deployed in v0.2).

**Steps:**

1. Add the new key helper and read/write functions to `src/storage.rs`.
2. Guard the read path with `unwrap_or(<default>)` so existing state without the new key returns a safe default.
3. Update `src/lib.rs` to call the new storage helper.
4. Deploy the new WASM — no migration transaction needed.
5. The new key is written on the first `set_org_cap` call. Until then callers receive the default.

**Verification:**
```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_org_cap --org_id my_org
# Expected: "4"  (default, no key written yet)
```

---

### Playbook B — Key prefix rename (breaking change)

**Example:** Renaming `("o_asgn", contributor, org_id)` to `("oa2", contributor, org_id)`.

**Steps:**

1. In the new WASM keep **both** the old read helper (reads `"o_asgn"`) and the new read helper (reads `"oa2"`) during the migration window.
2. Write a `migrate_asgn_counts(admin, pairs: Vec<(Address, Symbol)>)` contract function that:
   - Reads each count from the old key.
   - Writes it to the new key.
   - Removes the old key.
3. Deploy the new WASM.
4. Call `migrate_asgn_counts` with the full list of affected `(contributor, org_id)` pairs.
5. After confirming all pairs migrated, deploy a follow-up WASM that removes the old read helper.

**Verification:**
```bash
# New key should match the old value
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR" --org_id "$ORG_ID"

# Old key helper (if still exposed) should return 0 — key removed
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count_v1 \
  --contributor "$CONTRIBUTOR" --org_id "$ORG_ID"
# Expected: "0"
```

---

### Playbook C — Value type change (breaking change)

**Example:** Changing assignment counts from `u32` to `u64`.

**Steps:**

1. Introduce a new prefix `"o_asgn2"` for the `u64` values.
2. Write a `migrate_counts_u64(admin, pairs: Vec<(Address, Symbol)>)` function that reads each `u32` count, writes it as `u64` under the new prefix, and removes the old key.
3. Deploy, run migration, verify.
4. In a subsequent WASM rename `"o_asgn2"` back to `"o_asgn"` (another Playbook B migration).

> **Warning:** Never change the value type in-place without a key rename. Soroban will attempt to deserialise old bytes with the new type, which silently produces garbage or panics.

---

### Playbook D — Key removal

**Example:** Removing legacy `("maint", …)` entries superseded by a new role system.

**Steps:**

1. In the transition WASM, read from both old and new keys during a grace period.
2. Write a `cleanup_legacy_maint(admin, entries: Vec<(Address, Symbol)>)` function that removes old keys.
3. After confirming cleanup is complete, ship a final WASM that reads only the new keys.

---

## Storage Budget Analysis

This section estimates the ledger entry storage cost for WorkloadGovernor state in **stroops** (1 XLM = 10 000 000 stroops).

### Soroban Storage Fee Model (Protocol 21+)

Soroban charges **rent** for persistent and temporary storage based on:

- **Entry size in bytes** (XDR-encoded key + value).
- **TTL** — longer TTL = higher upfront rent reservation at write time.
- **Fee rates** — network parameters; approximate current values:
  - Persistent: ~0.01 XLM per 1 KB per 1 M ledgers.
  - Temporary: ~0.001 XLM per 1 KB per 1 M ledgers.

### Estimated Entry Sizes

| Key pattern | Key XDR (bytes) | Value XDR (bytes) | Total |
|-------------|-----------------|-------------------|-------|
| `("g_apps", Address)` | ~50 | 5 | ~55 |
| `("app", Address, Symbol, u32)` | ~60 | 5 | ~65 |
| `"admin"` | 12 | ~48 | ~60 |
| `("maint", Address, Symbol)` | ~55 | 5 | ~60 |
| `("o_asgn", Address, Symbol)` | ~55 | 5 | ~60 |
| `("asgn", Symbol, u32, Address)` | ~58 | 5 | ~63 |
| `("o_cap", Symbol)` | ~30 | 5 | ~35 |

> Address XDR ≈ 36 bytes (32-byte public key + discriminant). Symbol up to 10 bytes. u32 = 4 bytes. Vec wrapper adds ~4 bytes per element.

### Scenario: 1 org, 100 contributors per Wave

Assume 100 contributors each submit 3 applications, 30 are assigned, 30 complete.

| Entry type | Count | Approx size | Temp rent (1 Wave ≈ 17 280 ledgers) |
|------------|-------|-------------|--------------------------------------|
| Global app count | 100 | 5 500 B total | ~0.01 XLM |
| App entry | 300 | 19 500 B total | ~0.03 XLM |
| Org assignment count | 30 | 1 800 B total | ~0.03 XLM/year (persistent) |
| Assignment entry | 30 | 1 890 B total | ~0.03 XLM/year (persistent) |

**Estimated total per Wave:** ~0.04–0.10 XLM for temporary entries. Persistent entries accumulate slowly and are cleaned up when counts hit zero.

### Worst-case: 1 org, 10 000 contributors at global cap

| Entry type | Count | Estimated cost |
|------------|-------|----------------|
| Global app count | 10 000 | ~1 XLM/Wave |
| App entry (15 each) | 150 000 | ~15 XLM/Wave |
| Org assignment count | 10 000 | ~1 XLM/year |
| Assignment entry | 40 000 | ~4 XLM/year |

**Total worst-case:** ~16 XLM/Wave for temporary entries, ~5 XLM/year persistent rent at normal completion rates.

### Recommendations

- Call `complete_assignment` or `revoke_assignment` promptly to free persistent entries and recover rent.
- Do not let the contract instance TTL lapse — bump it regularly or rely on the `bump_instance` call made on every state-changing transaction.
- For orgs with > 5 000 contributors, raise `APP_TTL_LEDGERS` only if the Wave duration requires it — a longer TTL multiplies the temporary rent cost proportionally.
- Monitor the `("o_cap", org_id)` key: each distinct org adds one persistent entry of ~35 bytes (negligible unless there are thousands of orgs).

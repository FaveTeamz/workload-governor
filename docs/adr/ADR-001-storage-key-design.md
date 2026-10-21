# ADR-001 — Soroban Storage Key Design

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-28 |
| Authors | WorkloadGovernor core team |
| Supersedes | — |
| Superseded by | — |
| Related docs | [docs/storage-design.md](../storage-design.md) |

---

## Context

WorkloadGovernor stores several distinct categories of state in Soroban's key-value ledger:

- Whether a contributor has applied to a specific `(org, issue)` pair.
- A contributor's global pending-application count (capped at 15).
- Whether an active assignment exists for a `(org, issue, contributor)` triple.
- A contributor's per-org active-assignment count (capped at 4).
- Admin and maintainer authorisation records.
- Per-org assignment caps.

Soroban stores all values in a single flat key-value namespace. There is no native namespacing, schema enforcement, or uniqueness guarantee beyond the key itself. A poorly designed key schema can cause **silent data corruption** if two different logical entries hash to the same storage slot.

The contract is deployed once and its storage layout is permanent for the life of that deployment. A future upgrade can migrate data but cannot retroactively fix corrupted counters, making the initial key design a high-stakes decision.

---

## Problem Statement

> How should the contract encode its storage keys to guarantee zero collision between the six logical state categories while keeping keys compact and human-readable enough to debug on-chain?

Concrete requirements:

1. **No collisions.** A key that maps to a global app-count entry must never be reachable by an application-entry lookup or any other category.
2. **Compact keys.** Soroban charges rent based on entry size. Longer keys cost more per ledger.
3. **Stable TTL semantics.** Temporary and persistent storage entries must be clearly separated by design so that a TTL bump for one category never accidentally refreshes an unrelated entry.
4. **Debuggable.** On-chain explorers display raw XDR. Keys should be recognisable to a developer reading a ledger dump.

---

## Decision Drivers

- Soroban keys are typed XDR `Val` tuples — any combination of `Symbol`, `Address`, `u32`, and `Bytes` values can form a key.
- `Symbol` values in Soroban are interned strings up to 32 ASCII characters, stored as tagged integers. They are cheaper than `Bytes` for short strings.
- Two tuples are equal only if every element matches in type and value. A `Symbol("app")` and a `Symbol("asgn")` in the first position of a tuple are guaranteed to produce different keys even if subsequent elements are identical.
- Soroban does not support range queries or prefix iteration from inside a contract. The key design must be self-contained.

---

## Alternatives Considered

### Alternative 1 — Single compound key (no prefix)

**Idea:** Concatenate all identifying fields into one `Bytes` key:

```
key = concat(category_tag_byte, contributor_pubkey, org_id_bytes, issue_id_bytes)
```

**Pros:**
- One key type for everything; simpler `get`/`set` call sites.

**Cons:**
- Variable-length `Bytes` keys are more expensive to store and read than `Symbol` tuples.
- Category disambiguation relies on a hand-encoded tag byte — easy to misplace when adding a new category.
- Loses XDR type safety: wrong-width slices silently read garbage instead of failing at compile time.
- Harder to read in on-chain explorers (raw hex, no human-readable field names).

**Decision:** Rejected. The cost and safety downsides outweigh the marginal simplicity gain.

---

### Alternative 2 — `Bytes` prefix instead of `Symbol`

**Idea:** Use a `Bytes(b"g_apps")` value as the first tuple element instead of `Symbol("g_apps")`.

**Pros:**
- Allows prefixes longer than 32 characters.

**Cons:**
- `Bytes` is stored as a heap-allocated XDR byte array; `Symbol` is stored as an interned 60-bit integer (for ≤ 9-char symbols). For short prefixes `Symbol` is **4–8× cheaper** in ledger bytes.
- `Symbol` has compile-time length enforcement (`soroban_sdk::symbol_short!` macro). `Bytes` prefix errors are runtime panics.
- No entry in the contract has a prefix longer than 6 characters, so the 32-char limit is never approached.

**Decision:** Rejected. `Symbol` prefixes are strictly cheaper and safer for keys of this length.

---

### Alternative 3 — Counter-only approach (no per-issue sentinels)

**Idea:** Store only the aggregate counters (`g_apps`, `o_asgn`) and skip the per-`(contributor, org, issue)` sentinels entirely. Derive existence from `count > 0`.

**Pros:**
- Fewer storage entries: `O(contributors × orgs)` instead of `O(contributors × orgs × issues)`.
- Cheaper rent for organisations with many issues.

**Cons:**
- Cannot answer `has_applied(contributor, org, issue)` without a sentinel — the counter alone does not encode *which* issues are applied for.
- `assign_issue` must verify that a specific application exists before converting it. Without a sentinel it would need an external index (off-chain or an additional on-chain structure).
- Opens a double-spend attack: a contributor could `withdraw_application` for issue A while applying for issue B and briefly hold two counters for the same slot if the check is derived from the count alone.
- The fairness invariant `count = Σ(sentinels)` must hold; sentinels are the source of truth.

**Decision:** Rejected. Sentinels are necessary to maintain correctness under concurrent calls.

---

### Alternative 4 — Per-entry only (no aggregated counters)

**Idea:** Remove the aggregate counters (`g_apps`, `o_asgn`). Derive counts by iterating all sentinels.

**Pros:**
- One fewer storage category.

**Cons:**
- Soroban does not support key-prefix iteration from inside a contract. Counting would require passing in all `(org, issue)` pairs from the caller — which shifts validation trust to the caller and enables cap-bypass attacks by passing an incomplete list.
- The `check_consistency` function already exposes a read path that accepts a list of pairs for exactly this use case, confirming that off-chain enumeration is not trustworthy for cap enforcement.

**Decision:** Rejected. Atomic on-chain cap enforcement requires per-category counters.

---

### Alternative 5 — Nested maps (`Map<Address, Map<Symbol, u32>>`)

**Idea:** Use Soroban's `Map` type to build a nested structure: `contributor → org → count`.

**Pros:**
- Reads for a single contributor load one entry rather than scanning many keys.

**Cons:**
- Soroban `Map` entries are stored as a single ledger entry containing the entire map. Writing to any key in a deep map requires reading and re-writing the whole map — `O(N)` cost per update.
- A contributor with 15 open applications across 15 orgs would cause every update to read and write a 15-entry map.
- Map entries cannot have independent TTLs; all entries would share the TTL of the map entry, conflating temporary application state with persistent assignment state.

**Decision:** Rejected. Flat keyed entries are cheaper and enable independent TTL management per logical category.

---

## Decision — Six-Prefix Flat Key Schema

The contract uses **six distinct `Symbol` prefixes** as the first element of every storage key tuple. Each prefix maps one-to-one to a logical category:

| Prefix | Full key shape | Tier | Purpose |
|---|---|---|---|
| `"g_apps"` | `("g_apps", contributor: Address)` | Temporary | Global pending-application counter |
| `"app"` | `("app", contributor: Address, org_id: Symbol, issue_id: u32)` | Temporary | Per-issue application sentinel |
| `"admin"` | `"admin"` (bare `Symbol`) | Persistent | Admin address |
| `"maint"` | `("maint", maintainer: Address, org_id: Symbol)` | Persistent | Maintainer authorisation |
| `"o_asgn"` | `("o_asgn", contributor: Address, org_id: Symbol)` | Persistent | Per-org assignment counter |
| `"asgn"` | `("asgn", org_id: Symbol, issue_id: u32, contributor: Address)` | Persistent | Per-assignment sentinel |

The `"o_cap"` key `("o_cap", org_id)` stores per-org assignment cap overrides in persistent storage and uses the same prefix scheme.

### Collision-freedom proof

For any two entries from different categories, the first element of their key tuples differs (`"g_apps" ≠ "app" ≠ "admin" ≠ "maint" ≠ "o_asgn" ≠ "asgn"`). Soroban XDR equality requires every element to match; therefore two entries from different categories can never share a key. Within the same category, subsequent elements encode the full identifying context, so intra-category collisions are also impossible given unique `(contributor, org, issue)` triples.

### TTL isolation

Temporary entries (`"g_apps"`, `"app"`) expire with the Wave. Persistent entries survive until the contract is archived. Because the tier is determined by the `Env::storage().temporary()` vs `.persistent()` call site — not the key — entries of different tiers with the same key shape would still be stored in different sub-ledgers. The separate prefixes make accidental cross-tier TTL bumping impossible at the source-code level.

---

## Consequences

### Positive

- **Zero collision guarantee** — mathematically provable from the disjoint prefix set.
- **Independent TTL management** — each entry can have its TTL bumped or extended without affecting other categories.
- **Human-readable on-chain** — `Symbol` values appear as strings in XDR explorers, making ledger dumps debuggable.
- **Cheap updates** — each write touches exactly one ledger entry, regardless of how many other entries a contributor or org has.
- **Compile-time safety** — `symbol_short!` macros catch typos at build time.

### Negative / Trade-offs

- **Storage cost scales with issues** — a contributor with 15 applications stores 15 per-issue sentinels plus 1 counter. This is acceptable given Soroban's Wave TTL; entries expire automatically.
- **No cross-category queries** — there is no way to enumerate "all entries for contributor X" without knowing all `(org, issue)` pairs. The `check_consistency` function handles this by accepting the pairs as an argument from a trusted off-chain indexer.
- **Schema is permanent** — changing a prefix in a live deployment would require a migration. Adding a new category is safe (new prefix); renaming existing prefixes requires a data migration runbook.

---

## Compliance Notes

Any future contributor proposing a storage refactor must:

1. Prove the new scheme maintains zero collision across all six (or more) categories.
2. Provide a migration path for existing persistent entries — temporary entries expire naturally.
3. Update `docs/storage-design.md` and add a new ADR superseding this one.

---

## References

- [docs/storage-design.md](../storage-design.md) — current key pattern reference with TTL semantics.
- [Soroban Storage documentation](https://developers.stellar.org/docs/smart-contracts/learn/state-archival) — storage tiers, TTL mechanics, and rent model.
- `src/storage.rs` — implementation of the key construction helpers used by `src/lib.rs`.

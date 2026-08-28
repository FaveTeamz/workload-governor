# Storage Design

This document describes the WorkloadGovernor storage key schema, the two storage tiers used, and a formal proof that no two key types can ever produce the same byte representation.

## Table of Contents

- [Storage Tiers](#storage-tiers)
- [Key Schema](#key-schema)
- [Formal Collision-Free Proof](#formal-collision-free-proof)
  - [Key Structure Definitions](#key-structure-definitions)
  - [Encoding Basis](#encoding-basis)
  - [Pairwise Comparison Table](#pairwise-comparison-table)
  - [Detailed Pairwise Proofs](#detailed-pairwise-proofs)
  - [Conclusion](#conclusion)
- [Adding New Keys Safely](#adding-new-keys-safely)
- [TTL Reference](#ttl-reference)
- [CI Collision Check](#ci-collision-check)
- [See Also](#see-also)

---

## Storage Tiers

WorkloadGovernor uses three Soroban storage tiers:

| Tier | Eviction | Used for |
|---|---|---|
| **Temporary** | Yes — evicted after TTL ledgers without extension | Application entries; global application counts |
| **Persistent** | No automatic eviction (until explicit `extend_ttl`) | Admin; maintainer registrations; assignment entries; org assignment counts |
| **Instance** | Tied to contract instance TTL; bumped every mutating call | Contract instance survival |

Temporary storage entries represent in-flight Wave data. They expire after `APP_TTL_LEDGERS` = 17,280 ledgers (~24 h at 5 s/ledger) without a TTL extension call. Persistent storage entries survive indefinitely as long as the contract instance is alive.

---

## Key Schema

All six key types, their tiers, structures, and value types:

| # | Name | Tier | Key Structure | Value |
|---|---|---|---|---|
| K1 | Global App Count | Temporary | `("g_apps", contributor: Address)` | `u32` |
| K2 | App Entry | Temporary | `("app", contributor: Address, org_id: Symbol, issue_id: u32)` | `bool` |
| K3 | Admin | Persistent | `"admin"` | `Address` |
| K4 | Maintainer | Persistent | `("maint", maintainer: Address, org_id: Symbol)` | `bool` |
| K5 | Org Assignment Count | Persistent | `("o_asgn", contributor: Address, org_id: Symbol)` | `u32` |
| K6 | Assignment Entry | Persistent | `("asgn", org_id: Symbol, issue_id: u32, contributor: Address)` | `bool` |

The prefix symbols — `"g_apps"`, `"app"`, `"admin"`, `"maint"`, `"o_asgn"`, `"asgn"` — are all created with `symbol_short!()` and are represented as packed 6-bit encoded Soroban `Symbol` scalars.

---

## Formal Collision-Free Proof

### Key Structure Definitions

Using type-signature notation:

```
K1 = Tuple2(Symbol("g_apps"), Address)
K2 = Tuple4(Symbol("app"),    Address, Symbol, u32)
K3 = Symbol("admin")                                      ← scalar, not a tuple
K4 = Tuple3(Symbol("maint"),  Address, Symbol)
K5 = Tuple3(Symbol("o_asgn"), Address, Symbol)
K6 = Tuple4(Symbol("asgn"),   Symbol,  u32,   Address)
```

### Encoding Basis

Soroban serializes storage keys using XDR. The relevant XDR properties for this proof are:

1. **Tuple arity is encoded.** A `Tuple2` and a `Tuple3` have different XDR-discriminated `ScVec` lengths. Two keys with different tuple arities produce different byte streams regardless of element values.

2. **Scalar vs tuple is encoded.** A bare `Symbol` scalar (K3) is encoded as an `ScVal::Symbol` discriminant, which is distinct from the `ScVal::Vec` discriminant used for all tuple keys. K3 cannot collide with any tuple key.

3. **Symbol values are encoded as their bit-packed representation.** `"admin"`, `"g_apps"`, `"app"`, `"maint"`, `"o_asgn"`, and `"asgn"` are all distinct 6-bit packed values. Two tuples with the same arity but different leading symbols produce different byte streams.

4. **Element type encoding.** `Address`, `Symbol`, and `u32` have different XDR type discriminants. Even if two tuples share arity and leading symbol, differing element type sequences produce different byte streams.

### Pairwise Comparison Table

There are C(6,2) = **15 pairwise combinations**. Each is shown with the structural reason it cannot collide.

| Pair | K_i | K_j | Collision-free reason |
|---|---|---|---|
| P1 | K1 | K2 | Different arity (2 vs 4) |
| P2 | K1 | K3 | K1 is Tuple, K3 is bare Symbol scalar |
| P3 | K1 | K4 | Different arity (2 vs 3) |
| P4 | K1 | K5 | Different arity (2 vs 3) |
| P5 | K1 | K6 | Different arity (2 vs 4) |
| P6 | K2 | K3 | K2 is Tuple, K3 is bare Symbol scalar |
| P7 | K2 | K4 | Different arity (4 vs 3) |
| P8 | K2 | K5 | Different arity (4 vs 3) |
| P9 | K2 | K6 | Same arity (4) but different leading prefix symbol: `"app"` ≠ `"asgn"` |
| P10 | K3 | K4 | K3 is bare Symbol scalar, K4 is Tuple |
| P11 | K3 | K5 | K3 is bare Symbol scalar, K5 is Tuple |
| P12 | K3 | K6 | K3 is bare Symbol scalar, K6 is Tuple |
| P13 | K4 | K5 | Same arity (3) but different leading prefix symbol: `"maint"` ≠ `"o_asgn"` |
| P14 | K4 | K6 | Different arity (3 vs 4) |
| P15 | K5 | K6 | Different arity (3 vs 4) |

All 15 pairs are structurally distinct. ∎

### Detailed Pairwise Proofs

**P1 — K1 vs K2 (arity 2 vs 4)**

```
K1 = ("g_apps", A)              → XDR Vec[2]: [Symbol("g_apps"), Address(A)]
K2 = ("app",    A, org, issue)  → XDR Vec[4]: [Symbol("app"), ...]
```

XDR `ScVec` encodes the element count as a 32-bit unsigned integer before the elements. A vec of length 2 (`0x00000002`) and a vec of length 4 (`0x00000004`) differ in bytes 0-3. Collision is impossible.

**P2 — K1 vs K3 (tuple vs scalar)**

```
K1 = ("g_apps", A)  → ScVal::Vec discriminant (0x00000006 in XDR enum)
K3 = "admin"        → ScVal::Symbol discriminant (0x0000000e in XDR enum)
```

The outermost XDR discriminant differs. No value substitution for `A` can change the leading discriminant bytes. Collision is impossible.

**P3 — K1 vs K4 (arity 2 vs 3)**

```
K1 = ("g_apps", A)         → XDR Vec[2]
K4 = ("maint",  M, org)    → XDR Vec[3]
```

Arity mismatch in the first 4 bytes of the XDR vec. Collision is impossible.

**P4 — K1 vs K5 (arity 2 vs 3)**

```
K1 = ("g_apps", A)          → XDR Vec[2]
K5 = ("o_asgn", A, org)     → XDR Vec[3]
```

Arity mismatch. Collision is impossible.

**P5 — K1 vs K6 (arity 2 vs 4)**

```
K1 = ("g_apps", A)                → XDR Vec[2]
K6 = ("asgn",  org, issue, A)     → XDR Vec[4]
```

Arity mismatch. Collision is impossible.

**P6 — K2 vs K3 (tuple vs scalar)**

```
K2 = ("app", A, org, issue)  → ScVal::Vec discriminant
K3 = "admin"                  → ScVal::Symbol discriminant
```

Leading XDR discriminant differs. Collision is impossible.

**P7 — K2 vs K4 (arity 4 vs 3)**

```
K2 = ("app",   A, org, issue)  → XDR Vec[4]
K4 = ("maint", M, org)         → XDR Vec[3]
```

Arity mismatch. Collision is impossible.

**P8 — K2 vs K5 (arity 4 vs 3)**

```
K2 = ("app",    A, org, issue)  → XDR Vec[4]
K5 = ("o_asgn", A, org)         → XDR Vec[3]
```

Arity mismatch. Collision is impossible.

**P9 — K2 vs K6 (same arity, different prefix)**

This is the most subtle pair: both are 4-tuples.

```
K2 = ("app",  A,   org, issue)   → Vec[4]: [Symbol("app"),  Address, Symbol, u32]
K6 = ("asgn", org, issue, A)     → Vec[4]: [Symbol("asgn"), Symbol, u32, Address]
```

After the arity bytes, the XDR stream continues with the first element. For K2 that is `Symbol("app")` (6-bit encoding of `[a,p,p]`). For K6 that is `Symbol("asgn")` (6-bit encoding of `[a,s,g,n]`). These produce different byte values at position 4+.

Additionally, the element type sequence differs: K2 is `[Symbol, Address, Symbol, u32]` and K6 is `[Symbol, Symbol, u32, Address]`. Even if the leading symbols were somehow equal, the second element type discriminant would differ. Collision is impossible by both the prefix symbol value and the element type sequence.

**P10 — K3 vs K4 (scalar vs tuple)**

```
K3 = "admin"             → ScVal::Symbol discriminant
K4 = ("maint", M, org)   → ScVal::Vec discriminant
```

Leading XDR discriminant differs. Collision is impossible.

**P11 — K3 vs K5 (scalar vs tuple)**

```
K3 = "admin"              → ScVal::Symbol discriminant
K5 = ("o_asgn", A, org)  → ScVal::Vec discriminant
```

Leading XDR discriminant differs. Collision is impossible.

**P12 — K3 vs K6 (scalar vs tuple)**

```
K3 = "admin"                     → ScVal::Symbol discriminant
K6 = ("asgn", org, issue, A)     → ScVal::Vec discriminant
```

Leading XDR discriminant differs. Collision is impossible.

**P13 — K4 vs K5 (same arity, different prefix)**

Both are 3-tuples — the most likely accidental collision vector when adding new keys.

```
K4 = ("maint",  M, org)   → Vec[3]: [Symbol("maint"),  Address, Symbol]
K5 = ("o_asgn", A, org)   → Vec[3]: [Symbol("o_asgn"), Address, Symbol]
```

After the arity bytes, the XDR stream encodes the first element. `Symbol("maint")` uses the 6-bit packing of `[m,a,i,n,t]` and `Symbol("o_asgn")` uses the 6-bit packing of `[o,_,a,s,g,n]`. These are different bit patterns. Collision is impossible by the prefix symbol value.

**P14 — K4 vs K6 (arity 3 vs 4)**

```
K4 = ("maint", M, org)           → XDR Vec[3]
K6 = ("asgn",  org, issue, A)    → XDR Vec[4]
```

Arity mismatch. Collision is impossible.

**P15 — K5 vs K6 (arity 3 vs 4)**

```
K5 = ("o_asgn", A, org)          → XDR Vec[3]
K6 = ("asgn",   org, issue, A)   → XDR Vec[4]
```

Arity mismatch. Collision is impossible.

### Conclusion

All 15 pairwise combinations are structurally incompatible. The collision-free guarantee holds for:

- All values of `Address` (contributor, maintainer)
- All values of `Symbol` (org_id, 1-9 character Soroban Symbol)
- All values of `u32` (issue_id: 0..2^32-1)

The proof is robust to adversarial input: no choice of address, org, or issue ID can cause any two key types to produce identical XDR byte sequences. ∎

---

## Adding New Keys Safely

When adding a new storage key to the contract, follow this checklist to maintain the collision-free guarantee:

1. **Choose a unique prefix symbol.** The new `symbol_short!()` prefix must not match any of the six existing prefixes: `"g_apps"`, `"app"`, `"admin"`, `"maint"`, `"o_asgn"`, `"asgn"`.

2. **Check tuple arity.** If the new key has the same arity as an existing key, ensure the leading prefix symbol is distinct (as in P9 and P13 above).

3. **Run the CI collision check** (see below) with the new key's test vectors added.

4. **Update this document.** Add the new key to the schema table, add the new pairwise rows to the table (n_new × n_existing new pairs), and provide a proof for each new pair.

---

## TTL Reference

| Constant | Value | Duration |
|---|---|---|
| `APP_TTL_LEDGERS` | 17,280 | ~24 h at 5 s/ledger |
| `APP_TTL_MIN` | 1 | Minimum valid TTL |
| `APP_TTL_MAX` | 535,000 | Soroban platform cap |
| `INSTANCE_TTL_LEDGERS` | 518,400 | ~30 days |

The contract instance TTL is bumped on every state-changing call with a threshold of `INSTANCE_TTL_LEDGERS / 2` and extended to `INSTANCE_TTL_LEDGERS`. This prevents the contract from being archived between operator-level TTL extensions.

---

## CI Collision Check

The script `scripts/check-key-collisions.sh` validates the collision-free guarantee by computing a representative encoded key string for each of the six key types and asserting that all six are unique. Run it in CI or locally:

```bash
bash scripts/check-key-collisions.sh
```

A zero exit code means no collisions were detected. See [scripts/check-key-collisions.sh](../scripts/check-key-collisions.sh) for full details and instructions for adding test vectors when new keys are introduced.

---

## See Also

- [maintainer-guide.md](maintainer-guide.md) — Maintainer operations
- [error-reference.md](error-reference.md) — Error codes and resolution playbooks
- [transaction-lifecycle.md](transaction-lifecycle.md) — Transaction sequence diagrams
- [scripts/check-key-collisions.sh](../scripts/check-key-collisions.sh) — CI collision check script

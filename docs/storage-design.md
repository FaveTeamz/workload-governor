# Storage Design

WorkloadGovernor uses three Soroban storage tiers and six distinct key prefixes to manage contract state.

## Storage Tiers

| Tier | Purpose | Survival |
|---|---|---|
| **Temporary** | Application state scoped to the current Wave | Expires when TTL reaches 0; can be bumped |
| **Persistent** | Admin, maintainer authorisation, assignment state | Survives until contract is archived |
| **Instance** | Contract instance entry | Bumped on every state-changing call (`~30 days`) |

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

**Purpose:** Tracks how many active assignments contributor `C` holds within org `O`. Capped at `ORG_ASSIGNMENT_LIMIT = 4`. Entry is removed when count reaches zero.

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

## Collision-Free Guarantee

All six prefixes are distinct `symbol_short!` values:

| # | Prefix | Rust literal |
|---|---|---|
| 1 | `g_apps` | `symbol_short!("g_apps")` |
| 2 | `app` | `symbol_short!("app")` |
| 3 | `admin` | `symbol_short!("admin")` |
| 4 | `maint` | `symbol_short!("maint")` |
| 5 | `o_asgn` | `symbol_short!("o_asgn")` |
| 6 | `asgn` | `symbol_short!("asgn")` |

**Formal argument:**

Soroban serialises tuple keys as a sequence of `ScVal` elements. Two keys `K₁` and `K₂` can collide only if they serialise to the same byte sequence. Because every key begins with its prefix symbol, a necessary condition for collision is that two keys share the same prefix. Since all six prefix strings (`"g_apps"`, `"app"`, `"admin"`, `"maint"`, `"o_asgn"`, `"asgn"`) are pairwise distinct string literals, no two keys from different categories share a prefix. Within each category, the remaining fields (address, org symbol, issue id) uniquely identify the logical record, so no two distinct logical records within the same category can collide either. Therefore the six key patterns are globally collision-free. ∎

Even if two payload shapes happened to overlap (e.g. a `Symbol` coincidentally equal to an `Address` encoding), the distinct prefix prevents the resulting `ScVal` sequences from being equal.

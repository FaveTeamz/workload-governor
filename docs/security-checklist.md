# WorkloadGovernor Security Checklist

Audited against `src/lib.rs`, `src/storage.rs`, `src/errors.rs`.  
Audit date: 2026-06-25.

---

## Vulnerability Classes

### 1. Authentication Checks

Every state-changing function must call `require_auth()` on the correct principal
before reading or writing storage.

| # | Function | Expected principal | `require_auth` call | Counter-check | Status |
|---|---|---|---|---|---|
| 1 | `initialize` | `admin` arg | `admin.require_auth()` after uniqueness guard | Admin sets own state | **PASS** |
| 2 | `register_maintainer` | stored admin | `stored_admin.require_auth()` | `get_admin().unwrap()` before call | **PASS** |
| 3 | `upgrade` | stored admin | `stored_admin.require_auth()` | `get_admin().unwrap()` before call | **PASS** |
| 4 | `apply_for_issue` | `contributor` arg | `contributor.require_auth()` | Called before any storage writes | **PASS** |
| 5 | `withdraw_application` | `contributor` arg | `contributor.require_auth()` | Called before any storage mutations | **PASS** |
| 6 | `assign_issue` | `maintainer` arg | `maintainer.require_auth()` + `is_maintainer()` guard | Both checks present | **PASS** |
| 7 | `complete_assignment` | `maintainer` arg | `maintainer.require_auth()` + `is_maintainer()` guard | Both checks present | **PASS** |
| 8 | `revoke_assignment` | `maintainer` arg | `maintainer.require_auth()` + `is_maintainer()` guard | Both checks present | **PASS** |
| 9 | `extend_application_ttl` | none (permissionless) | n/a — by design | Documented in doc-comment | **PASS** |
| 10 | `get_global_application_count` | none (read-only) | n/a | No writes | **PASS** |
| 11 | `get_org_assignment_count` | none (read-only) | n/a | No writes | **PASS** |
| 12 | `has_applied` | none (read-only) | n/a | No writes | **PASS** |
| 13 | `is_assigned` | none (read-only) | n/a | No writes | **PASS** |

**Evidence:** `require_auth()` is always called on the stored admin (not the arg) for
`register_maintainer` and `upgrade`, preventing a spoofed-arg attack.
`assign_issue`, `complete_assignment`, and `revoke_assignment` enforce both
`require_auth` on the caller *and* `is_maintainer` storage lookup — two independent
guards must pass.

---

### 2. Integer Overflow / Underflow in Counter Operations

All counter arithmetic uses either a checked increment bounded by a cap, or
`saturating_sub` on decrement.

| # | Counter | Operation | Overflow guard | Underflow guard | Status |
|---|---|---|---|---|---|
| 1 | `g_apps` increment (`apply_for_issue`) | `count + 1` | `count >= GLOBAL_APP_LIMIT (15)` check rejects before increment | n/a | **PASS** |
| 2 | `g_apps` decrement (`withdraw_application`) | `count.saturating_sub(1)` | n/a | `saturating_sub` floors at 0; entry removed when 0 | **PASS** |
| 3 | `g_apps` decrement (`assign_issue`) | `app_count.saturating_sub(1)` | n/a | `saturating_sub` floors at 0; entry removed when 0 | **PASS** |
| 4 | `o_asgn` increment (`assign_issue`) | `asgn_count + 1` | `asgn_count >= ORG_ASSIGNMENT_LIMIT (4)` check rejects before increment | n/a | **PASS** |
| 5 | `o_asgn` decrement (`complete_assignment`) | `asgn_count.saturating_sub(1)` | n/a | `saturating_sub` floors at 0; entry removed when 0 | **PASS** |
| 6 | `o_asgn` decrement (`revoke_assignment`) | `asgn_count.saturating_sub(1)` | n/a | `saturating_sub` floors at 0; entry removed when 0 | **PASS** |

**Evidence:** No raw `+` or `-` is used on counter values. Increments are always
pre-guarded by a cap comparison. Decrements use `saturating_sub`, which is
equivalent to `checked_sub(...).unwrap_or(0)` and cannot wrap.

---

### 3. Replay Attack Possibility

A replay attack is an on-chain re-submission of a previously valid transaction.
Soroban mitigates replays at the host level via sequence numbers on source accounts.
The contract adds application-level guards for every state transition.

| # | Function | State guard preventing replay | Status |
|---|---|---|---|
| 1 | `initialize` | `get_admin().is_some()` → `AlreadyInitialized` if replayed | **PASS** |
| 2 | `register_maintainer` | Idempotent — replaying is safe and has no harmful effect | **PASS** |
| 3 | `upgrade` | No contract-level replay guard needed; host sequence numbers apply | **PASS** |
| 4 | `apply_for_issue` | `has_app_entry` → `DuplicateApplication` if replayed | **PASS** |
| 5 | `withdraw_application` | `has_app_entry` check → `ApplicationNotFound` if entry already removed | **PASS** |
| 6 | `assign_issue` | `has_app_entry` → `ApplicationNotFound`; `has_assignment` → `AlreadyAssigned` | **PASS** |
| 7 | `complete_assignment` | `has_assignment` → `AssignmentNotFound` if replayed after completion | **PASS** |
| 8 | `revoke_assignment` | `has_assignment` → `AssignmentNotFound` if replayed after revocation | **PASS** |
| 9 | `extend_application_ttl` | `has_app_entry` → `ApplicationNotFound` if application gone | **PASS** |
| 10–13 | Read-only queries | No state changes; replaying is harmless | **PASS** |

**Evidence:** Every state transition is gated on the presence of a corresponding
storage entry. The entry is removed atomically during the transition, so any
re-submission of the same transaction will hit a "not found" guard and revert.

---

### 4. Storage Key Predictability

Predictable keys enable storage-level DoS: an attacker who can craft the same key
could pre-occupy or corrupt another contributor's entry. All keys must be scoped to
a full address (not user-controlled numeric IDs alone).

| # | Key tuple | Prefix | Address-scoped? | Collision risk | Status |
|---|---|---|---|---|---|
| 1 | `("g_apps", contributor)` | `"g_apps"` | Yes — `contributor: Address` | None; unique per address | **PASS** |
| 2 | `("app", contributor, org_id, issue_id)` | `"app"` | Yes — `contributor: Address` | None; unique per (addr, org, issue) | **PASS** |
| 3 | `"admin"` | `"admin"` | n/a — singleton | None; only one admin entry | **PASS** |
| 4 | `("maint", maintainer, org_id)` | `"maint"` | Yes — `maintainer: Address` | None; unique per (addr, org) | **PASS** |
| 5 | `("o_asgn", contributor, org_id)` | `"o_asgn"` | Yes — `contributor: Address` | None; unique per (addr, org) | **PASS** |
| 6 | `("asgn", org_id, issue_id, contributor)` | `"asgn"` | Yes — `contributor: Address` | None; unique per (org, issue, addr) | **PASS** |

Cross-prefix collision check: all six `symbol_short!` prefixes are distinct
(`"g_apps"`, `"app"`, `"admin"`, `"maint"`, `"o_asgn"`, `"asgn"`). The `README`
documents a zero-collision guarantee, confirmed by code inspection.

**Evidence:** Every mutable key contains at least one `Address` component that the
host validates via `require_auth`. A third party cannot write to another user's key
without also passing that user's auth check.

---

## Summary

| Vulnerability class | Functions audited | PASS | FAIL |
|---|---|---|---|
| Authentication | 13 / 13 | 13 | 0 |
| Integer overflow / underflow | 6 counter operations | 6 | 0 |
| Replay attacks | 13 / 13 | 13 | 0 |
| Storage key predictability | 6 key patterns | 6 | 0 |

**All items PASS. No follow-up issues required.**

---

## Notes

- `seed_assignment` is compiled only under `#[cfg(any(test, feature = "testutils"))]`
  and is excluded from production WASM. It does not appear in the security surface.
- TTL expiry of temporary entries (`g_apps`, `app`) is not a security vulnerability:
  expired entries return `0` / `false` by default, and the contract re-initialises
  them correctly on the next apply.
- `extend_application_ttl` is intentionally permissionless. The only effect is
  extending the TTL of an existing entry — it cannot create new entries or change
  values, so there is no harmful capability granted to an anonymous caller.

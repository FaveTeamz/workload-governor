//! Storage key helpers and typed read/write wrappers for WorkloadGovernor.
//!
//! Storage tiers:
//!   - **Temporary**  — Wave-bounded TTL entries (applications, global app count)
//!   - **Persistent** — Long-lived entries (admin, maintainers, assignments)
//!   - **Instance**   — Contract instance entry; bumped on every state-changing call
//!                      so the contract itself never gets archived.
//!
//! # Storage key collision-free proof
//!
//! Seven key patterns are used. Each is a tuple whose **first element is a unique
//! `symbol_short!` prefix**. Because the Soroban host serialises the entire tuple
//! (prefix + remaining fields) as a single `ScVal`, two keys can only collide if
//! **every** element in both tuples is identical. The prefix alone therefore
//! partitions the key space — no cross-pattern collision is possible regardless of
//! input values.
//!
//! | # | Pattern | Prefix | Extra fields |
//! |---|---------|--------|--------------|
//! | 1 | `("g_apps", contributor)` | `"g_apps"` | `Address` |
//! | 2 | `("app", contributor, org_id, issue_id)` | `"app"` | `Address`, `Symbol`, `u32` |
//! | 3 | `("app_idx", contributor)` | `"app_idx"` | `Address` |
//! | 4 | `"admin"` (scalar) | `"admin"` | — (singleton) |
//! | 5 | `("maint", maintainer, org_id)` | `"maint"` | `Address`, `Symbol` |
//! | 6 | `("o_asgn", contributor, org_id)` | `"o_asgn"` | `Address`, `Symbol` |
//! | 7 | `("asgn", org_id, issue_id, contributor)` | `"asgn"` | `Symbol`, `u32`, `Address` |
//! | 8 | `("o_cap", org_id)` | `"o_cap"` | `Symbol` |
//!
//! Pairwise uniqueness argument:
//! - **1 vs 2**: `"g_apps"` ≠ `"app"`.
//! - **1 vs 3**: `"g_apps"` ≠ `"app_idx"`.
//! - **1 vs 4**: tuple ≠ scalar — different `ScVal` discriminants.
//! - **1 vs 5**: `"g_apps"` ≠ `"maint"`.
//! - **1 vs 6**: `"g_apps"` ≠ `"o_asgn"`.
//! - **1 vs 7**: `"g_apps"` ≠ `"asgn"`.
//! - **1 vs 8**: `"g_apps"` ≠ `"o_cap"`.
//! - **2 vs 3**: `"app"` ≠ `"app_idx"`.
//! - **2 vs 4**: tuple ≠ scalar.
//! - **2 vs 5**: `"app"` ≠ `"maint"`.
//! - **2 vs 6**: `"app"` ≠ `"o_asgn"`.
//! - **2 vs 7**: `"app"` ≠ `"asgn"`.
//! - **2 vs 8**: `"app"` ≠ `"o_cap"`.
//! - **3 vs 4**: tuple ≠ scalar.
//! - **3 vs 5**: `"app_idx"` ≠ `"maint"`.
//! - **3 vs 6**: `"app_idx"` ≠ `"o_asgn"`.
//! - **3 vs 7**: `"app_idx"` ≠ `"asgn"`.
//! - **3 vs 8**: `"app_idx"` ≠ `"o_cap"`.
//! - **4 vs 5–8**: scalar `"admin"` ≠ any tuple.
//! - **5 vs 6**: `"maint"` ≠ `"o_asgn"`.
//! - **5 vs 7**: `"maint"` ≠ `"asgn"`.
//! - **5 vs 8**: `"maint"` ≠ `"o_cap"`.
//! - **6 vs 7**: `"o_asgn"` ≠ `"asgn"`.
//! - **6 vs 8**: `"o_asgn"` ≠ `"o_cap"`.
//! - **7 vs 8**: `"asgn"` ≠ `"o_cap"`.
//!
//! Within each pattern, uniqueness is guaranteed by the combination of caller-controlled
//! `Address` values (validated by the host via `require_auth`) and the caller-supplied
//! `org_id`/`issue_id` fields — making impersonation impossible at the auth layer.

use soroban_sdk::{panic_with_error, Address, Env, Symbol, Vec, symbol_short};

use crate::errors::ContractError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Ledgers for ~24 h at 5 s/ledger. Set to match the current Wave duration.
/// Must be within [APP_TTL_MIN, APP_TTL_MAX].
pub const APP_TTL_LEDGERS: u32 = 17_280;

/// Minimum valid value for `APP_TTL_LEDGERS`.
pub const APP_TTL_MIN: u32 = 1;

/// Maximum valid value for `APP_TTL_LEDGERS` (Soroban platform cap).
pub const APP_TTL_MAX: u32 = 535_000;

/// Maximum number of pending applications a contributor may hold globally.
/// This constant serves as the default when no persistent override has been set.
pub const GLOBAL_APP_LIMIT: u32 = 15;

/// Default maximum number of active assignments a contributor may hold per org
/// when no per-org cap has been configured via `set_org_cap`.
pub const ORG_ASSIGNMENT_LIMIT: u32 = 4;

/// Minimum value for a per-org assignment cap set via `set_org_cap`.
pub const ORG_CAP_MIN: u32 = 1;

/// Maximum value for a per-org assignment cap set via `set_org_cap`.
pub const ORG_CAP_MAX: u32 = 20;

// ---------------------------------------------------------------------------
// Persistent storage — Global cap override
// ---------------------------------------------------------------------------
// Key: `symbol_short!("g_cap")`
// Value: `u32` (allowed range 0..=100)

fn global_cap_key() -> Symbol {
    symbol_short!("g_cap")
}

/// Returns the currently configured global application cap. If no persistent value
/// exists, returns the compile-time `GLOBAL_APP_LIMIT` default.
pub(crate) fn get_global_cap(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&global_cap_key())
        .unwrap_or(GLOBAL_APP_LIMIT)
}

/// Writes the persistent global application cap value.
pub(crate) fn set_global_cap(env: &Env, cap: u32) {
    env.storage().persistent().set(&global_cap_key(), &cap);
}


/// TTL threshold/extend-to for the contract instance (persistent) entry.
/// ~30 days at 5 s/ledger — keeps the contract alive between operator bumps.
pub const INSTANCE_TTL_LEDGERS: u32 = 518_400;

// ---------------------------------------------------------------------------
// Instance TTL management
// ---------------------------------------------------------------------------

/// Bumps the contract instance TTL on every state-changing call.
/// Prevents the contract from being archived between operator-level TTL extensions.
pub(crate) fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_LEDGERS / 2, INSTANCE_TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Initialization guard
// ---------------------------------------------------------------------------

/// Panics with the given error if the contract has not been initialized yet.
pub(crate) fn require_initialized(env: &Env, error: &ContractError) {
    if get_admin(env).is_none() {
        panic_with_error!(env, *error);
    }
}

// ---------------------------------------------------------------------------
// Temporary storage — Global Application Count
// ---------------------------------------------------------------------------
//
// Key: `(symbol_short!("g_apps"), contributor: Address)`
// Value: `u32`

fn global_app_count_key(contributor: &Address) -> (Symbol, Address) {
    (symbol_short!("g_apps"), contributor.clone())
}

/// Returns the contributor's current global pending-application count (0 if absent/expired).
pub(crate) fn get_global_app_count(env: &Env, contributor: &Address) -> u32 {
    let key = global_app_count_key(contributor);
    env.storage().temporary().get(&key).unwrap_or(0)
}

/// Writes the contributor's global pending-application count.
pub(crate) fn set_global_app_count(env: &Env, contributor: &Address, count: u32) {
    let key = global_app_count_key(contributor);
    env.storage().temporary().set(&key, &count);
}

/// Removes the contributor's global pending-application count entry.
pub(crate) fn remove_global_app_count(env: &Env, contributor: &Address) {
    let key = global_app_count_key(contributor);
    env.storage().temporary().remove(&key);
}

/// Extends the TTL of the contributor's global pending-application count entry.
pub(crate) fn extend_global_app_count_ttl(env: &Env, contributor: &Address) {
    let key = global_app_count_key(contributor);
    env.storage()
        .temporary()
        .extend_ttl(&key, APP_TTL_LEDGERS, APP_TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Temporary storage — Per-Issue Application Entry
// ---------------------------------------------------------------------------
//
// Key: `(symbol_short!("app"), contributor: Address, org_id: Symbol, issue_id: u32)`
// Value: `bool` (presence sentinel — always `true`)

fn app_entry_key(
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) -> (Symbol, Address, Symbol, u32) {
    (
        symbol_short!("app"),
        contributor.clone(),
        org_id.clone(),
        issue_id,
    )
}

/// Returns `true` if a pending application exists for this contributor/org/issue triple.
pub(crate) fn has_app_entry(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) -> bool {
    let key = app_entry_key(contributor, org_id, issue_id);
    env.storage()
        .temporary()
        .get::<_, bool>(&key)
        .unwrap_or(false)
}

/// Writes the application presence sentinel (`true`).
pub(crate) fn set_app_entry(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let key = app_entry_key(contributor, org_id, issue_id);
    env.storage().temporary().set(&key, &true);
}

/// Removes the application entry for this contributor/org/issue triple.
pub(crate) fn remove_app_entry(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let key = app_entry_key(contributor, org_id, issue_id);
    env.storage().temporary().remove(&key);
}

/// Extends the TTL of the per-issue application entry.
pub(crate) fn extend_app_entry_ttl(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let key = app_entry_key(contributor, org_id, issue_id);
    env.storage()
        .temporary()
        .extend_ttl(&key, APP_TTL_LEDGERS, APP_TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Persistent storage — Admin
// ---------------------------------------------------------------------------
//
// Key: `symbol_short!("admin")`
// Value: `Address`

fn admin_key() -> Symbol {
    symbol_short!("admin")
}

/// Returns the stored admin address, or `None` if not yet initialized.
pub(crate) fn get_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&admin_key())
}

/// Writes the admin address to persistent storage.
pub(crate) fn set_admin(env: &Env, admin: &Address) {
    env.storage().persistent().set(&admin_key(), admin);
}

// ---------------------------------------------------------------------------
// Persistent storage — Maintainer Registration
// ---------------------------------------------------------------------------
//
// Key: `(symbol_short!("maint"), maintainer: Address, org_id: Symbol)`
// Value: `bool`

fn maintainer_key(maintainer: &Address, org_id: &Symbol) -> (Symbol, Address, Symbol) {
    (symbol_short!("maint"), maintainer.clone(), org_id.clone())
}

/// Returns `true` if `maintainer` is registered for `org_id`.
pub(crate) fn is_maintainer(env: &Env, maintainer: &Address, org_id: &Symbol) -> bool {
    let key = maintainer_key(maintainer, org_id);
    env.storage()
        .persistent()
        .get::<_, bool>(&key)
        .unwrap_or(false)
}

/// Registers `maintainer` for `org_id` (idempotent).
pub(crate) fn set_maintainer(env: &Env, maintainer: &Address, org_id: &Symbol) {
    let key = maintainer_key(maintainer, org_id);
    env.storage().persistent().set(&key, &true);
}

/// Removes the maintainer registration for `(maintainer, org_id)`.
pub(crate) fn remove_maintainer(env: &Env, maintainer: &Address, org_id: &Symbol) {
    let key = maintainer_key(maintainer, org_id);
    env.storage().persistent().remove(&key);
}

// ---------------------------------------------------------------------------
// Persistent storage — Org Assignment Count
// ---------------------------------------------------------------------------
//
// Key: `(symbol_short!("o_asgn"), contributor: Address, org_id: Symbol)`
// Value: `u32`

fn org_assignment_count_key(contributor: &Address, org_id: &Symbol) -> (Symbol, Address, Symbol) {
    (symbol_short!("o_asgn"), contributor.clone(), org_id.clone())
}

/// Returns the contributor's active assignment count for `org_id` (0 if absent).
pub(crate) fn get_org_assignment_count(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
) -> u32 {
    let key = org_assignment_count_key(contributor, org_id);
    env.storage().persistent().get(&key).unwrap_or(0)
}

/// Writes the contributor's active assignment count for `org_id`.
pub(crate) fn set_org_assignment_count(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    count: u32,
) {
    let key = org_assignment_count_key(contributor, org_id);
    env.storage().persistent().set(&key, &count);
}

/// Removes the org assignment count entry (called when count reaches 0).
pub(crate) fn remove_org_assignment_count(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
) {
    let key = org_assignment_count_key(contributor, org_id);
    env.storage().persistent().remove(&key);
}

// ---------------------------------------------------------------------------
// Persistent storage — Active Assignment Entry
// ---------------------------------------------------------------------------
//
// Key: `(symbol_short!("asgn"), org_id: Symbol, issue_id: u32, contributor: Address)`
// Value: `bool` (presence sentinel — always `true`)

fn assignment_entry_key(
    org_id: &Symbol,
    issue_id: u32,
    contributor: &Address,
) -> (Symbol, Symbol, u32, Address) {
    (
        symbol_short!("asgn"),
        org_id.clone(),
        issue_id,
        contributor.clone(),
    )
}

/// Returns `true` if an active assignment exists for this org/issue/contributor triple.
pub(crate) fn has_assignment(
    env: &Env,
    org_id: &Symbol,
    issue_id: u32,
    contributor: &Address,
) -> bool {
    let key = assignment_entry_key(org_id, issue_id, contributor);
    env.storage()
        .persistent()
        .get::<_, bool>(&key)
        .unwrap_or(false)
}

/// Writes the assignment presence sentinel (`true`).
pub(crate) fn set_assignment(
    env: &Env,
    org_id: &Symbol,
    issue_id: u32,
    contributor: &Address,
) {
    let key = assignment_entry_key(org_id, issue_id, contributor);
    env.storage().persistent().set(&key, &true);
}

/// Removes the active assignment entry.
pub(crate) fn remove_assignment(
    env: &Env,
    org_id: &Symbol,
    issue_id: u32,
    contributor: &Address,
) {
    let key = assignment_entry_key(org_id, issue_id, contributor);
    env.storage().persistent().remove(&key);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Persistent storage — Per-Org Assignment Cap  (Issue #1)
// ---------------------------------------------------------------------------
//
// Key: `(symbol_short!(\"o_cap\"), org_id: Symbol)`
// Value: `u32`
//
// Stores an org-specific override for the assignment cap. When absent, callers
// should fall back to `ORG_ASSIGNMENT_LIMIT`. Added as a new distinct prefix
// "o_cap" — zero collision with existing "o_asgn" prefix.

fn org_cap_key(org_id: &Symbol) -> (Symbol, Symbol) {
    (symbol_short!("o_cap"), org_id.clone())
}

/// Returns the effective assignment cap for `org_id`.
///
/// Returns the stored per-org cap if one has been set, otherwise falls back to
/// `ORG_ASSIGNMENT_LIMIT` (4).
pub(crate) fn get_org_cap(env: &Env, org_id: &Symbol) -> u32 {
    let key = org_cap_key(org_id);
    env.storage()
        .persistent()
        .get::<_, u32>(&key)
        .unwrap_or(ORG_ASSIGNMENT_LIMIT)
}

/// Writes a per-org assignment cap override.
pub(crate) fn set_org_cap(env: &Env, org_id: &Symbol, cap: u32) {
    let key = org_cap_key(org_id);
    env.storage().persistent().set(&key, &cap);
}

// ---------------------------------------------------------------------------
// Temporary storage — Application Index  (Issue #598)
// ---------------------------------------------------------------------------
//
// Key:   `(symbol_short!("app_idx"), contributor: Address)`
// Value: `Vec<(Symbol, u32)>` — list of `(org_id, issue_id)` pairs
// Tier:  Temporary (same TTL as per-issue application entries)
//
// Maintains an enumerable index of all pending applications for a contributor.
// Updated atomically with the per-issue application sentinel on every
// `apply_for_issue` and `withdraw_application` call.
//
// Prefix "app_idx" is distinct from all existing prefixes:
//   "app", "g_apps", "admin", "maint", "o_asgn", "asgn", "o_cap", "g_cap".

fn app_index_key(contributor: &Address) -> (Symbol, Address) {
    (symbol_short!("app_idx"), contributor.clone())
}

/// Returns the contributor's current list of pending (org_id, issue_id) pairs.
///
/// Returns an empty `Vec` if no index entry exists (contributor has no applications,
/// or all applications have expired).
pub(crate) fn get_app_index(env: &Env, contributor: &Address) -> Vec<(Symbol, u32)> {
    let key = app_index_key(contributor);
    env.storage()
        .temporary()
        .get::<_, Vec<(Symbol, u32)>>(&key)
        .unwrap_or_else(|| Vec::new(env))
}

/// Writes the contributor's application index.
pub(crate) fn set_app_index(env: &Env, contributor: &Address, index: &Vec<(Symbol, u32)>) {
    let key = app_index_key(contributor);
    env.storage().temporary().set(&key, index);
}

/// Removes the contributor's application index entry (called when the list becomes empty).
pub(crate) fn remove_app_index(env: &Env, contributor: &Address) {
    let key = app_index_key(contributor);
    env.storage().temporary().remove(&key);
}

/// Extends the TTL of the contributor's application index entry.
pub(crate) fn extend_app_index_ttl(env: &Env, contributor: &Address) {
    let key = app_index_key(contributor);
    env.storage()
        .temporary()
        .extend_ttl(&key, APP_TTL_LEDGERS, APP_TTL_LEDGERS);
}

/// Adds `(org_id, issue_id)` to the contributor's application index.
///
/// The index uses the same TTL as application entries so both expire together.
pub(crate) fn index_add_application(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let mut index = get_app_index(env, contributor);
    index.push_back((org_id.clone(), issue_id));
    set_app_index(env, contributor, &index);
    extend_app_index_ttl(env, contributor);
}

/// Removes `(org_id, issue_id)` from the contributor's application index.
///
/// Removes the index entry entirely when the list becomes empty.
pub(crate) fn index_remove_application(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let old = get_app_index(env, contributor);
    let mut new_index: Vec<(Symbol, u32)> = Vec::new(env);
    for pair in old.iter() {
        let (ref o, i) = pair;
        if !(o == org_id && i == issue_id) {
            new_index.push_back(pair);
        }
    }
    if new_index.is_empty() {
        remove_app_index(env, contributor);
    } else {
        set_app_index(env, contributor, &new_index);
        extend_app_index_ttl(env, contributor);
    }
}

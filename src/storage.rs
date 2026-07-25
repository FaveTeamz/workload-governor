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
//! Six key patterns are used. Each is a tuple whose **first element is a unique
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
//! | 3 | `"admin"` (scalar) | `"admin"` | — (singleton) |
//! | 4 | `("maint", maintainer, org_id)` | `"maint"` | `Address`, `Symbol` |
//! | 5 | `("o_asgn", contributor, org_id)` | `"o_asgn"` | `Address`, `Symbol` |
//! | 6 | `("asgn", org_id, issue_id, contributor)` | `"asgn"` | `Symbol`, `u32`, `Address` |
//!
//! Pairwise uniqueness argument:
//! - **1 vs 2**: `"g_apps"` ≠ `"app"` — different prefix bytes.
//! - **1 vs 3**: tuple ≠ scalar — different `ScVal` discriminants.
//! - **1 vs 4**: `"g_apps"` ≠ `"maint"`.
//! - **1 vs 5**: `"g_apps"` ≠ `"o_asgn"`.
//! - **1 vs 6**: `"g_apps"` ≠ `"asgn"`.
//! - **2 vs 3**: tuple ≠ scalar.
//! - **2 vs 4**: `"app"` ≠ `"maint"`.
//! - **2 vs 5**: `"app"` ≠ `"o_asgn"`.
//! - **2 vs 6**: `"app"` ≠ `"asgn"`.
//! - **3 vs 4–6**: scalar `"admin"` ≠ any tuple.
//! - **4 vs 5**: `"maint"` ≠ `"o_asgn"`.
//! - **4 vs 6**: `"maint"` ≠ `"asgn"`.
//! - **5 vs 6**: `"o_asgn"` ≠ `"asgn"`.
//!
//! Within each pattern, uniqueness is guaranteed by the combination of caller-controlled
//! `Address` values (validated by the host via `require_auth`) and the caller-supplied
//! `org_id`/`issue_id` fields — making impersonation impossible at the auth layer.

use soroban_sdk::{panic_with_error, Address, Env, Symbol, symbol_short};

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
pub const GLOBAL_APP_LIMIT: u32 = 15;

/// Maximum number of active assignments a contributor may hold per org.
pub const ORG_ASSIGNMENT_LIMIT: u32 = 4;

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

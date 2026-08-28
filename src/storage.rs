//! Storage key helpers and typed read/write wrappers for WorkloadGovernor.
//!
//! Storage tiers:
//!   - **Temporary**  — Wave-bounded TTL entries (applications, global app count)
//!   - **Persistent** — Long-lived entries (admin, maintainers, assignments)
//!   - **Instance**   — Contract instance entry; bumped on every state-changing call
//!                      so the contract itself never gets archived.
//!
//! All key prefixes are distinct `symbol_short!` values — zero collision guarantee:
//!   "g_apps", "app", "admin", "maint", "o_asgn", "asgn"
//!   "mig_v2"  (migration flag, #602)
//!   "ms_thr"  (multi-sig threshold, #603)
//!   "ms_sig"  (multi-sig signers, #603)
//!   "prop"    (governance proposal entry, #600)
//!   "vote"    (governance vote entry, #600)
//!   "g_cap"   (dynamic global cap override, #600)

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
pub const GLOBAL_APP_LIMIT: u32 = 15;

/// Maximum number of active assignments a contributor may hold per org.
pub const ORG_ASSIGNMENT_LIMIT: u32 = 4;

/// TTL threshold/extend-to for the contract instance (persistent) entry.
/// ~30 days at 5 s/ledger — keeps the contract alive between operator bumps.
pub const INSTANCE_TTL_LEDGERS: u32 = 518_400;

/// TTL for governance proposals — ~7 days at 5 s/ledger.
pub const PROPOSAL_TTL_LEDGERS: u32 = 120_960;

/// Minimum number of orgs that must have voted for quorum to be met.
pub const PROPOSAL_QUORUM_ORGS: u32 = 3;

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

// ---------------------------------------------------------------------------
// #602 — Persistent storage: Migration flag
// ---------------------------------------------------------------------------
//
// Key: `symbol_short!("mig_v2")`
// Value: `bool` (true once migration has run)

fn migration_v2_flag_key() -> Symbol {
    symbol_short!("mig_v2")
}

/// Returns `true` if the v1→v2 migration has already been executed.
pub(crate) fn is_migration_done(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get::<_, bool>(&migration_v2_flag_key())
        .unwrap_or(false)
}

/// Marks the v1→v2 migration as completed.
pub(crate) fn set_migration_done(env: &Env) {
    env.storage()
        .persistent()
        .set(&migration_v2_flag_key(), &true);
}

// ---------------------------------------------------------------------------
// #602 — v1 org assignment count key (old format for migration)
// ---------------------------------------------------------------------------
//
// v1 key format: `(symbol_short!("o_asgn"), org_id: Symbol, contributor: Address)`
// v2 key format: `(symbol_short!("o_asgn"), contributor: Address, org_id: Symbol)`
//
// The field order was swapped in v2. Migration reads v1 keys and writes v2 keys.

fn org_assignment_count_key_v1(
    contributor: &Address,
    org_id: &Symbol,
) -> (Symbol, Symbol, Address) {
    (symbol_short!("o_asgn"), org_id.clone(), contributor.clone())
}

/// Reads the v1 org assignment count (old key ordering: org_id first, contributor second).
pub(crate) fn get_org_assignment_count_v1(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
) -> Option<u32> {
    let key = org_assignment_count_key_v1(contributor, org_id);
    env.storage().persistent().get(&key)
}

/// Removes the v1 org assignment count key.
pub(crate) fn remove_org_assignment_count_v1(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
) {
    let key = org_assignment_count_key_v1(contributor, org_id);
    env.storage().persistent().remove(&key);
}

// ---------------------------------------------------------------------------
// #603 — Persistent storage: Multi-sig threshold and signers
// ---------------------------------------------------------------------------
//
// Threshold key: `symbol_short!("ms_thr")` → `u32`
// Signers key:   `symbol_short!("ms_sig")` → `Vec<Address>`

fn multisig_threshold_key() -> Symbol {
    symbol_short!("ms_thr")
}

fn multisig_signers_key() -> Symbol {
    symbol_short!("ms_sig")
}

/// Returns the current multi-sig threshold (0 if not configured — single-admin mode).
pub(crate) fn get_multisig_threshold(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get::<_, u32>(&multisig_threshold_key())
        .unwrap_or(0)
}

/// Returns the current multi-sig signer list (empty if not configured).
pub(crate) fn get_multisig_signers(env: &Env) -> Vec<Address> {
    env.storage()
        .persistent()
        .get::<_, Vec<Address>>(&multisig_signers_key())
        .unwrap_or_else(|| Vec::new(env))
}

/// Stores the multi-sig threshold.
pub(crate) fn set_multisig_threshold(env: &Env, threshold: u32) {
    env.storage()
        .persistent()
        .set(&multisig_threshold_key(), &threshold);
}

/// Stores the multi-sig signer list.
pub(crate) fn set_multisig_signers(env: &Env, signers: &Vec<Address>) {
    env.storage()
        .persistent()
        .set(&multisig_signers_key(), signers);
}

// ---------------------------------------------------------------------------
// #600 — Persistent storage: Governance proposals
// ---------------------------------------------------------------------------
//
// Proposal entry key: `(symbol_short!("prop"), proposal_id: u32)` → `GovernanceProposal`
// Vote entry key:     `(symbol_short!("vote"), proposal_id: u32, voter: Address)` → `bool`
// Global cap override:`symbol_short!("g_cap")` → `u32`
// Proposal counter:   `symbol_short!("p_ctr")` → `u32`

use soroban_sdk::contracttype;

/// A governance proposal to change the global application cap.
#[contracttype]
#[derive(Clone)]
pub struct GovernanceProposal {
    /// Address of the maintainer who created the proposal.
    pub proposer: Address,
    /// Proposed new value for the global application cap.
    pub new_global_cap: u32,
    /// Ledger number at which the proposal expires.
    pub expires_at: u32,
    /// Number of approvals received.
    pub yes_votes: u32,
    /// Number of rejections received.
    pub no_votes: u32,
    /// Whether this proposal has been executed.
    pub executed: bool,
}

fn proposal_key(proposal_id: u32) -> (Symbol, u32) {
    (symbol_short!("prop"), proposal_id)
}

fn vote_key(proposal_id: u32, voter: &Address) -> (Symbol, u32, Address) {
    (symbol_short!("vote"), proposal_id, voter.clone())
}

fn proposal_counter_key() -> Symbol {
    symbol_short!("p_ctr")
}

fn global_cap_override_key() -> Symbol {
    symbol_short!("g_cap")
}

/// Returns the next proposal ID and increments the counter.
pub(crate) fn next_proposal_id(env: &Env) -> u32 {
    let key = proposal_counter_key();
    let current: u32 = env.storage().persistent().get(&key).unwrap_or(0);
    let next = current + 1;
    env.storage().persistent().set(&key, &next);
    next
}

/// Returns the proposal with the given ID, or `None` if absent.
pub(crate) fn get_proposal(env: &Env, proposal_id: u32) -> Option<GovernanceProposal> {
    let key = proposal_key(proposal_id);
    env.storage().temporary().get(&key)
}

/// Writes a governance proposal to temporary storage (TTL-limited).
pub(crate) fn set_proposal(env: &Env, proposal_id: u32, proposal: &GovernanceProposal) {
    let key = proposal_key(proposal_id);
    env.storage().temporary().set(&key, proposal);
    env.storage()
        .temporary()
        .extend_ttl(&key, PROPOSAL_TTL_LEDGERS, PROPOSAL_TTL_LEDGERS);
}

/// Returns `true` if the voter has already voted on this proposal.
pub(crate) fn has_voted(env: &Env, proposal_id: u32, voter: &Address) -> bool {
    let key = vote_key(proposal_id, voter);
    env.storage()
        .temporary()
        .get::<_, bool>(&key)
        .unwrap_or(false)
}

/// Records that `voter` has voted on `proposal_id`.
pub(crate) fn set_voted(env: &Env, proposal_id: u32, voter: &Address) {
    let key = vote_key(proposal_id, voter);
    env.storage().temporary().set(&key, &true);
    env.storage()
        .temporary()
        .extend_ttl(&key, PROPOSAL_TTL_LEDGERS, PROPOSAL_TTL_LEDGERS);
}

/// Returns the current effective global application cap (override if set, else GLOBAL_APP_LIMIT).
pub(crate) fn get_effective_global_cap(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get::<_, u32>(&global_cap_override_key())
        .unwrap_or(GLOBAL_APP_LIMIT)
}

/// Writes the new global application cap (set upon governance proposal execution).
pub(crate) fn set_global_cap_override(env: &Env, new_cap: u32) {
    env.storage()
        .persistent()
        .set(&global_cap_override_key(), &new_cap);
}

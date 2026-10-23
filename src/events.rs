//! Event emission helpers for WorkloadGovernor.
//!
//! ## Standardised 3-element topic schema (#829 SC-004)
//!
//! Every event now emits a **3-element** topic tuple so the off-chain indexer
//! (`src/eventIndexer.ts`) can perform efficient RPC topic filtering without
//! needing wildcard scans:
//!
//! ```text
//! topics[0]  Symbol("WG")         — contract namespace discriminant
//! topics[1]  Symbol(<event_name>) — operation identifier
//! topics[2]  Address              — primary entity (contributor, admin, etc.)
//! ```
//!
//! The `data` field carries the remaining event-specific payload.

use soroban_sdk::{symbol_short, Address, Env, Symbol};

// Contract-wide namespace discriminant used as topics[0].
const WG: fn() -> Symbol = || symbol_short!("WG");

/// Emitted by `initialize`.
///
/// topics: `(WG, symbol_short!("init"), admin)`
/// data:   `(admin, ledger_seq)`
pub(crate) fn emit_initialized(env: &Env, admin: &Address) {
    let topics = (WG(), symbol_short!("init"), admin.clone());
    let data = (admin.clone(), env.ledger().sequence());
    env.events().publish(topics, data);
}

/// Emitted by `register_maintainer`.
///
/// topics: `(WG, symbol_short!("maint_reg"), maintainer)`
/// data:   `(admin, org_id)`
pub(crate) fn emit_maintainer_registered(
    env: &Env,
    admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    let topics = (WG(), symbol_short!("maint_reg"), maintainer.clone());
    let data = (admin.clone(), org_id.clone());
    env.events().publish(topics, data);
}

/// Emitted by `deregister_maintainer` (when implemented).
///
/// topics: `(WG, symbol_short!("maint_dreg"), maintainer)`
/// data:   `(admin, org_id)`
pub(crate) fn emit_maintainer_deregistered(
    env: &Env,
    admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    let topics = (WG(), symbol_short!("maint_dreg"), maintainer.clone());
    let data = (admin.clone(), org_id.clone());
    env.events().publish(topics, data);
}

/// Emitted by `apply_for_issue`.
///
/// topics: `(WG, symbol_short!("applied"), contributor)`
/// data:   `(org_id, issue_id)`
pub(crate) fn emit_application_submitted(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (WG(), symbol_short!("applied"), contributor.clone());
    let data = (org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `withdraw_application`.
///
/// topics: `(WG, symbol_short!("withdrew"), contributor)`
/// data:   `(org_id, issue_id)`
pub(crate) fn emit_application_withdrawn(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (WG(), symbol_short!("withdrew"), contributor.clone());
    let data = (org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `assign_issue`.
///
/// topics: `(WG, symbol_short!("assigned"), contributor)`
/// data:   `(maintainer, org_id, issue_id)`
pub(crate) fn emit_issue_assigned(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (WG(), symbol_short!("assigned"), contributor.clone());
    let data = (maintainer.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `complete_assignment`.
///
/// topics: `(WG, symbol_short!("completed"), contributor)`
/// data:   `(maintainer, org_id, issue_id)`
pub(crate) fn emit_assignment_completed(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (WG(), symbol_short!("completed"), contributor.clone());
    let data = (maintainer.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `revoke_assignment`.
///
/// topics: `(WG, symbol_short!("revoked"), contributor)`
/// data:   `(maintainer, org_id, issue_id)`
pub(crate) fn emit_assignment_revoked(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (WG(), symbol_short!("revoked"), contributor.clone());
    let data = (maintainer.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// #602 — Migration event
// ---------------------------------------------------------------------------

/// Emitted by `migrate_v1_to_v2` upon successful completion.
///
/// topics: `(WG, symbol_short!("mig_done"), admin)`
/// data:   `(entries_migrated: u32,)`
pub(crate) fn emit_migration_completed(env: &Env, admin: &Address, entries_migrated: u32) {
    let topics = (WG(), symbol_short!("mig_done"), admin.clone());
    let data = (entries_migrated,);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// #603 — Multi-sig admin event
// ---------------------------------------------------------------------------

/// Emitted by `set_admin_threshold`.
///
/// topics: `(WG, symbol_short!("ms_set"), admin)`
/// data:   `(threshold: u32, signer_count: u32)`
pub(crate) fn emit_admin_threshold_set(env: &Env, admin: &Address, threshold: u32, signer_count: u32) {
    let topics = (WG(), symbol_short!("ms_set"), admin.clone());
    let data = (threshold, signer_count);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// #600 — Governance proposal events
// ---------------------------------------------------------------------------

/// Emitted by `propose_cap_change`.
///
/// topics: `(WG, symbol_short!("cap_prop"), proposer)`
/// data:   `(proposal_id: u32, new_global_cap: u32)`
pub(crate) fn emit_cap_proposed(
    env: &Env,
    proposer: &Address,
    proposal_id: u32,
    new_global_cap: u32,
) {
    let topics = (WG(), symbol_short!("cap_prop"), proposer.clone());
    let data = (proposal_id, new_global_cap);
    env.events().publish(topics, data);
}

/// Emitted by `vote_cap_change`.
///
/// topics: `(WG, symbol_short!("cap_vote"), voter)`
/// data:   `(proposal_id: u32, approve: bool)`
pub(crate) fn emit_cap_voted(env: &Env, voter: &Address, proposal_id: u32, approve: bool) {
    let topics = (WG(), symbol_short!("cap_vote"), voter.clone());
    let data = (proposal_id, approve);
    env.events().publish(topics, data);
}

/// Emitted by `execute_cap_change` upon successful execution.
///
/// topics: `(WG, symbol_short!("cap_exec"), executor)`
/// data:   `(proposal_id: u32, new_global_cap: u32)`
pub(crate) fn emit_cap_changed(
    env: &Env,
    executor: &Address,
    proposal_id: u32,
    new_global_cap: u32,
) {
    let topics = (WG(), symbol_short!("cap_exec"), executor.clone());
    let data = (proposal_id, new_global_cap);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// #828 SC-003 — Admin action nonce event
// ---------------------------------------------------------------------------

/// Emitted after every privileged admin operation to record the consumed nonce.
///
/// topics: `(WG, symbol_short!("adm_act"), admin)`
/// data:   `(nonce: u32,)`
pub(crate) fn emit_admin_action_executed(env: &Env, admin: &Address, nonce: u32) {
    let topics = (WG(), symbol_short!("adm_act"), admin.clone());
    let data = (nonce,);
    env.events().publish(topics, data);
}

//! Event emission helpers for WorkloadGovernor.
//!
//! Each function wraps a single `env.events().publish(topics, data)` call.
//! Topics are a 2-tuple `(event_name: Symbol, primary_actor: Address)`.
//! Data is a value-tuple whose field order matches the requirements exactly.

use soroban_sdk::{symbol_short, Address, Env, Symbol};

/// Emitted by `initialize`.
///
/// topics: `(symbol_short!("init"), admin)`
/// data:   `(admin,)`
pub(crate) fn emit_initialized(env: &Env, admin: &Address) {
    let topics = (symbol_short!("init"), admin.clone());
    let data = (admin.clone(),);
    env.events().publish(topics, data);
}

/// Emitted by `register_maintainer`.
///
/// topics: `(symbol_short!("maint_reg"), admin)`
/// data:   `(maintainer, org_id)`
pub(crate) fn emit_maintainer_registered(
    env: &Env,
    admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    let topics = (symbol_short!("maint_reg"), admin.clone());
    let data = (maintainer.clone(), org_id.clone());
    env.events().publish(topics, data);
}

/// Emitted by `apply_for_issue`.
///
/// topics: `(symbol_short!("app_sub"), contributor)`
/// data:   `(contributor, org_id, issue_id)`
pub(crate) fn emit_application_submitted(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("app_sub"), contributor.clone());
    let data = (contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `withdraw_application`.
///
/// topics: `(symbol_short!("app_wdw"), contributor)`
/// data:   `(contributor, org_id, issue_id)`
pub(crate) fn emit_application_withdrawn(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("app_wdw"), contributor.clone());
    let data = (contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `assign_issue`.
///
/// topics: `(symbol_short!("assigned"), maintainer)`
/// data:   `(maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_issue_assigned(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("assigned"), maintainer.clone());
    let data = (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `complete_assignment`.
///
/// topics: `(symbol_short!("completed"), maintainer)`
/// data:   `(maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_assignment_completed(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("completed"), maintainer.clone());
    let data = (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `revoke_assignment`.
///
/// topics: `(symbol_short!("revoked"), maintainer)`
/// data:   `(maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_assignment_revoked(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("revoked"), maintainer.clone());
    let data = (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// #602 — Migration event
// ---------------------------------------------------------------------------

/// Emitted by `migrate_v1_to_v2` upon successful completion.
///
/// topics: `(symbol_short!("mig_done"), admin)`
/// data:   `(entries_migrated: u32,)`
pub(crate) fn emit_migration_completed(env: &Env, admin: &Address, entries_migrated: u32) {
    let topics = (symbol_short!("mig_done"), admin.clone());
    let data = (entries_migrated,);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// #603 — Multi-sig admin event
// ---------------------------------------------------------------------------

/// Emitted by `set_admin_threshold`.
///
/// topics: `(symbol_short!("ms_set"), admin)`
/// data:   `(threshold: u32, signer_count: u32)`
pub(crate) fn emit_admin_threshold_set(env: &Env, admin: &Address, threshold: u32, signer_count: u32) {
    let topics = (symbol_short!("ms_set"), admin.clone());
    let data = (threshold, signer_count);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// #600 — Governance proposal events
// ---------------------------------------------------------------------------

/// Emitted by `propose_cap_change`.
///
/// topics: `(symbol_short!("cap_prop"), proposer)`
/// data:   `(proposal_id: u32, new_global_cap: u32)`
pub(crate) fn emit_cap_proposed(
    env: &Env,
    proposer: &Address,
    proposal_id: u32,
    new_global_cap: u32,
) {
    let topics = (symbol_short!("cap_prop"), proposer.clone());
    let data = (proposal_id, new_global_cap);
    env.events().publish(topics, data);
}

/// Emitted by `vote_cap_change`.
///
/// topics: `(symbol_short!("cap_vote"), voter)`
/// data:   `(proposal_id: u32, approve: bool)`
pub(crate) fn emit_cap_voted(env: &Env, voter: &Address, proposal_id: u32, approve: bool) {
    let topics = (symbol_short!("cap_vote"), voter.clone());
    let data = (proposal_id, approve);
    env.events().publish(topics, data);
}

/// Emitted by `execute_cap_change` upon successful execution.
///
/// topics: `(symbol_short!("cap_exec"), executor)`
/// data:   `(proposal_id: u32, new_global_cap: u32)`
pub(crate) fn emit_cap_changed(
    env: &Env,
    executor: &Address,
    proposal_id: u32,
    new_global_cap: u32,
) {
    let topics = (symbol_short!("cap_exec"), executor.clone());
    let data = (proposal_id, new_global_cap);
    env.events().publish(topics, data);
}

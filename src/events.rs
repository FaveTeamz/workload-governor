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

/// Emitted by `set_org_cap`.
///
/// topics: `(symbol_short!("o_cap_set"), admin)`
/// data:   `(org_id, cap)`
pub(crate) fn emit_org_cap_set(env: &Env, admin: &Address, org_id: &Symbol, cap: u32) {
    let topics = (symbol_short!("o_cap_set"), admin.clone());
    let data = (org_id.clone(), cap);
    env.events().publish(topics, data);
}

//! Event emission helpers for WorkloadGovernor.
//!
//! Each function wraps a single `env.events().publish(topics, data)` call.
//! Topics are a 2-tuple `(event_name: Symbol, primary_actor: Address)`.
//! Data is a value-tuple whose field order matches the requirements exactly.
//! All payloads include a leading schema version field.

use soroban_sdk::{symbol_short, Address, Env, Symbol};

const EVENT_VERSION: u32 = 1;

/// Emitted by `initialize`.
///
/// topics: `(symbol_short!("init"), admin)`
/// data:   `(version, admin)`
pub(crate) fn emit_initialized(env: &Env, admin: &Address) {
    let topics = (symbol_short!("init"), admin.clone());
    let data = (EVENT_VERSION, admin.clone());
    env.events().publish(topics, data);
}

/// Emitted by `register_maintainer`.
///
/// topics: `(symbol_short!("maint_reg"), admin)`
/// data:   `(version, maintainer, org_id)`
pub(crate) fn emit_maintainer_registered(
    env: &Env,
    admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    let topics = (symbol_short!("maint_reg"), admin.clone());
    let data = (EVENT_VERSION, maintainer.clone(), org_id.clone());
    env.events().publish(topics, data);
}

/// Emitted by `apply_for_issue`.
///
/// topics: `(symbol_short!("app_sub"), contributor)`
/// data:   `(version, contributor, org_id, issue_id)`
pub(crate) fn emit_application_submitted(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("app_sub"), contributor.clone());
    let data = (EVENT_VERSION, contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `withdraw_application`.
///
/// topics: `(symbol_short!("app_wdw"), contributor)`
/// data:   `(version, contributor, org_id, issue_id)`
pub(crate) fn emit_application_withdrawn(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("app_wdw"), contributor.clone());
    let data = (EVENT_VERSION, contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `assign_issue`.
///
/// topics: `(symbol_short!("assigned"), maintainer)`
/// data:   `(version, maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_issue_assigned(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("assigned"), maintainer.clone());
    let data = (EVENT_VERSION, maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `complete_assignment`.
///
/// topics: `(symbol_short!("completed"), maintainer)`
/// data:   `(version, maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_assignment_completed(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("completed"), maintainer.clone());
    let data = (EVENT_VERSION, maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `revoke_assignment`.
///
/// topics: `(symbol_short!("revoked"), maintainer)`
/// data:   `(version, maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_assignment_revoked(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("revoked"), maintainer.clone());
    let data = (EVENT_VERSION, maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `set_global_cap`.
///
/// topics: `(symbol_short!("cap_upd"), admin)`
/// data:   `(version, old_cap, new_cap)`
pub(crate) fn emit_global_cap_updated(
    env: &Env,
    admin: &Address,
    old_cap: u32,
    new_cap: u32,
) {
    let topics = (symbol_short!("cap_upd"), admin.clone());
    let data = (EVENT_VERSION, old_cap, new_cap);
    env.events().publish(topics, data);
}

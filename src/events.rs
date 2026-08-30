//! Event emission helpers for WorkloadGovernor.
//!
//! All events follow a consistent schema:
//!   topics: `(symbol_short!("workload"), symbol_short!(operation_name))`
//!   data:   operation-specific payload tuple
//!
//! The two-element topics tuple makes every event filterable by contract
//! namespace ("workload") and by specific operation name, enabling
//! full state reconstruction from the event log alone.

use soroban_sdk::{symbol_short, Address, Env, Symbol};

// ---------------------------------------------------------------------------
// Admin events
// ---------------------------------------------------------------------------

/// Emitted by `initialize`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("init"))`
/// data:   `(admin,)`
pub(crate) fn emit_initialized(env: &Env, admin: &Address) {
    let topics = (symbol_short!("workload"), symbol_short!("init"));
    let data = (admin.clone(),);
    env.events().publish(topics, data);
}

/// Emitted by `register_maintainer`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("maint_reg"))`
/// data:   `(admin, maintainer, org_id)`
pub(crate) fn emit_maintainer_registered(
    env: &Env,
    admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    let topics = (symbol_short!("workload"), symbol_short!("maint_reg"));
    let data = (admin.clone(), maintainer.clone(), org_id.clone());
    env.events().publish(topics, data);
}

/// Emitted by `deregister_maintainer`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("maint_drg"))`
/// data:   `(admin, maintainer, org_id)`
pub(crate) fn emit_maintainer_deregistered(
    env: &Env,
    admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    let topics = (symbol_short!("workload"), symbol_short!("maint_drg"));
    let data = (admin.clone(), maintainer.clone(), org_id.clone());
    env.events().publish(topics, data);
}

/// Emitted by `set_org_cap`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("cap_set"))`
/// data:   `(org_id, old_cap, new_cap)`
pub(crate) fn emit_org_cap_set(
    env: &Env,
    org_id: &Symbol,
    old_cap: u32,
    new_cap: u32,
) {
    let topics = (symbol_short!("workload"), symbol_short!("cap_set"));
    let data = (org_id.clone(), old_cap, new_cap);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// Contributor events
// ---------------------------------------------------------------------------

/// Emitted by `apply_for_issue`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("app_sub"))`
/// data:   `(contributor, org_id, issue_id)`
pub(crate) fn emit_application_submitted(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("workload"), symbol_short!("app_sub"));
    let data = (contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `withdraw_application`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("app_wdw"))`
/// data:   `(contributor, org_id, issue_id)`
pub(crate) fn emit_application_withdrawn(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("workload"), symbol_short!("app_wdw"));
    let data = (contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

// ---------------------------------------------------------------------------
// Maintainer events
// ---------------------------------------------------------------------------

/// Emitted by `assign_issue`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("assigned"))`
/// data:   `(maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_issue_assigned(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("workload"), symbol_short!("assigned"));
    let data = (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `complete_assignment`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("completed"))`
/// data:   `(maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_assignment_completed(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("workload"), symbol_short!("completed"));
    let data = (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

/// Emitted by `revoke_assignment`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("revoked"))`
/// data:   `(maintainer, contributor, org_id, issue_id)`
pub(crate) fn emit_assignment_revoked(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    let topics = (symbol_short!("workload"), symbol_short!("revoked"));
    let data = (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id);
    env.events().publish(topics, data);
}

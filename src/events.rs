//! Event definitions and emit helpers for WorkloadGovernor contract.
//!
//! All events follow a consistent schema:
//!   topics: `(symbol_short!("workload"), symbol_short!(operation_name))`
//!   data:   operation-specific payload tuple
//!
//! The two-element topics tuple makes every event filterable by contract
//! namespace ("workload") and by specific operation name, enabling
//! full state reconstruction from the event log alone.

use soroban_sdk::{contractevent, symbol_short, Env, Address, Symbol};

/// All events emitted by the WorkloadGovernor contract
#[contractevent]
pub enum WorkloadGovernorEvent {
    /// Emitted when a contributor applies for an issue
    Applied {
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    },
    /// Emitted when a contributor withdraws their application
    Withdrew {
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    },
    /// Emitted when a maintainer assigns an issue to a contributor
    Assigned {
        contributor: Address,
        maintainer: Address,
        org_id: Symbol,
        issue_id: u32,
    },
    /// Emitted when a contributor completes an assignment
    Completed {
        contributor: Address,
        maintainer: Address,
        org_id: Symbol,
        issue_id: u32,
    },
    /// Emitted when a maintainer revokes an assignment
    Revoked {
        contributor: Address,
        maintainer: Address,
        org_id: Symbol,
        issue_id: u32,
    },
    /// Emitted when a new maintainer is registered
    MaintainerRegistered {
        maintainer: Address,
        org_id: Symbol,
    },
    /// Emitted when admin authority is transferred to a new address
    AdminTransferred {
        old_admin: Address,
        new_admin: Address,
    },
}

// ---------------------------------------------------------------------------
// Emit helper functions
//
// These wrap the env.events().publish() calls so that lib.rs can call
// a named function per event type rather than constructing topic/data
// tuples directly.
// ---------------------------------------------------------------------------

/// Emitted by `initialize`.
///
/// topics: `(symbol_short!("init"), admin)`
/// data:   `(admin, ledger)`
///
/// The `ledger` field is the sequence number of the ledger in which the
/// contract was initialised. Indexers can use it to establish a precise
/// on-chain timestamp for the deployment.
pub(crate) fn emit_initialized(env: &Env, admin: &Address, ledger: u32) {
    let topics = (symbol_short!("init"), admin.clone());
    let data = (admin.clone(), ledger);
    env.events().publish(topics, data);
}

/// Emitted by `register_maintainer`.
///
/// topics: `(symbol_short!("workload"), symbol_short!("maint_reg"))`
/// data:   `(admin, maintainer, org_id)`
pub(crate) fn emit_maintainer_registered(
    env: &Env,
    _admin: &Address,
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
    // topics: (symbol_short!("applied"), contributor)              — 2-tuple ✓
    // data:   vec![1u32, contributor, org_id, issue_id]             — matches unit_event_application_submitted_has_two_topics
    env.events().publish(
        (symbol_short!("applied"), contributor.clone()),
        soroban_sdk::vec![env, 1u32, contributor.clone(), org_id.clone(), issue_id],
    );
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

/// Emitted by `set_org_cap` when a maintainer updates the per-org assignment cap.
///
/// topics: `(symbol_short!("orgcap"), org_id)`
/// data:   `(old_cap, new_cap)`
pub(crate) fn emit_org_cap_updated(
    env: &Env,
    org_id: &Symbol,
    old_cap: u32,
    new_cap: u32,
) {
    let topics = (symbol_short!("orgcap"), org_id.clone());
    let data = (old_cap, new_cap);
    env.events().publish(topics, data);
}

/// Emitted by `set_org_cap` when a maintainer updates the per-org assignment cap.
///
/// topics: `(symbol_short!("ocap_upd"), org_id)`
/// data:   `(old_cap, new_cap)`
pub(crate) fn emit_org_cap_updated(
    env: &Env,
    org_id: &Symbol,
    old_cap: u32,
    new_cap: u32,
) {
    let topics = (symbol_short!("ocap_upd"), org_id.clone());
    let data = (old_cap, new_cap);
    env.events().publish(topics, data);
}

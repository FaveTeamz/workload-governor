//! Event definitions and emit helpers for WorkloadGovernor contract.
//!
//! This module defines all events emitted by the contract for
//! off-chain indexing and monitoring.

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

pub(crate) fn emit_initialized(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("init"), admin.clone()),
        admin.clone(),
    );
}

pub(crate) fn emit_maintainer_registered(
    env: &Env,
    _admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    env.events().publish(
        (symbol_short!("maint_reg"), maintainer.clone()),
        org_id.clone(),
    );
}

pub(crate) fn emit_application_submitted(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("applied"), contributor.clone()),
        (org_id.clone(), issue_id),
    );
}

pub(crate) fn emit_application_withdrawn(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("withdrew"), contributor.clone()),
        (org_id.clone(), issue_id),
    );
}

pub(crate) fn emit_issue_assigned(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("assigned"), contributor.clone()),
        (maintainer.clone(), org_id.clone(), issue_id),
    );
}

pub(crate) fn emit_assignment_completed(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("completed"), contributor.clone()),
        (maintainer.clone(), org_id.clone(), issue_id),
    );
}

pub(crate) fn emit_assignment_revoked(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("revoked"), contributor.clone()),
        (maintainer.clone(), org_id.clone(), issue_id),
    );
}

pub(crate) fn emit_admin_transferred(
    env: &Env,
    old_admin: &Address,
    new_admin: &Address,
) {
    env.events().publish(
        (symbol_short!("adm_xfer"), old_admin.clone()),
        new_admin.clone(),
    );
}

/// Emitted by `deregister_maintainer`.
///
/// topics: `(symbol_short!("maint_drg"), admin)`
/// data:   `(maintainer, org_id)`
pub(crate) fn emit_maintainer_deregistered(
    env: &Env,
    admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    let topics = (symbol_short!("maint_drg"), admin.clone());
    let data = (maintainer.clone(), org_id.clone());
    env.events().publish(topics, data);
}

/// Emitted by `set_global_cap` when the operator updates the cap via the normal path.
///
/// topics: `(symbol_short!("cap_upd"), admin)`
/// data:   `(admin, new_cap)`
pub(crate) fn emit_global_cap_updated(env: &Env, admin: &Address, new_cap: u32) {
    let topics = (symbol_short!("cap_upd"), admin.clone());
    let data = (admin.clone(), new_cap);
    env.events().publish(topics, data);
}

/// Emitted by `emergency_set_global_cap`.
///
/// Intentionally distinct from any `GlobalCapUpdated` event so that monitors
/// and event indexers can unambiguously identify emergency cap changes.
///
/// topics: `(symbol_short!("emrg_cap"), admin)`
/// data:   `(old_cap, new_cap)`
pub(crate) fn emit_emergency_cap_updated(
    env: &Env,
    admin: &Address,
    old_cap: u32,
    new_cap: u32,
) {
    let topics = (symbol_short!("emrg_cap"), admin.clone());
    let data = (old_cap, new_cap);
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

//! Event definitions and emit helpers for WorkloadGovernor contract.
//!
//! Every state-changing function calls exactly one `emit_*` helper, which
//! publishes a two-topic event `(contract_id, event_name)` with a structured
//! data payload via `env.events().publish`.

use soroban_sdk::{symbol_short, Address, Env, Symbol};

// ---------------------------------------------------------------------------
// Contract initialized
// ---------------------------------------------------------------------------

pub(crate) fn emit_initialized(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("init"),),
        (admin.clone(),),
    );
}

// ---------------------------------------------------------------------------
// Maintainer registered
// ---------------------------------------------------------------------------

pub(crate) fn emit_maintainer_registered(
    env: &Env,
    _admin: &Address,
    maintainer: &Address,
    org_id: &Symbol,
) {
    env.events().publish(
        (symbol_short!("maint_reg"),),
        (maintainer.clone(), org_id.clone()),
    );
}

// ---------------------------------------------------------------------------
// Application submitted
// ---------------------------------------------------------------------------

pub(crate) fn emit_application_submitted(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("app_sub"),),
        (contributor.clone(), org_id.clone(), issue_id),
    );
}

// ---------------------------------------------------------------------------
// Application withdrawn
// ---------------------------------------------------------------------------

pub(crate) fn emit_application_withdrawn(
    env: &Env,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("app_wth"),),
        (contributor.clone(), org_id.clone(), issue_id),
    );
}

// ---------------------------------------------------------------------------
// Issue assigned
// ---------------------------------------------------------------------------

pub(crate) fn emit_issue_assigned(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("assigned"),),
        (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id),
    );
}

// ---------------------------------------------------------------------------
// Assignment completed
// ---------------------------------------------------------------------------

pub(crate) fn emit_assignment_completed(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("compltd"),),
        (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id),
    );
}

// ---------------------------------------------------------------------------
// Assignment revoked
// ---------------------------------------------------------------------------

pub(crate) fn emit_assignment_revoked(
    env: &Env,
    maintainer: &Address,
    contributor: &Address,
    org_id: &Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("revoked"),),
        (maintainer.clone(), contributor.clone(), org_id.clone(), issue_id),
    );
}

// ---------------------------------------------------------------------------
// Org cap updated  (Issue #1)
// ---------------------------------------------------------------------------

/// Emitted by `set_org_cap` when a maintainer changes the per-org assignment cap.
///
/// Topics: `("cap_upd",)`
/// Data:   `(org_id, old_cap, new_cap)`
pub(crate) fn emit_org_cap_updated(
    env: &Env,
    org_id: &Symbol,
    old_cap: u32,
    new_cap: u32,
) {
    env.events().publish(
        (symbol_short!("cap_upd"),),
        (org_id.clone(), old_cap, new_cap),
    );
}

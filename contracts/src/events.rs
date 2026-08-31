//! Event definitions for the Workload Governor contract

use soroban_sdk::{Address, Env, Symbol};

/// Emit an AssignmentTtlExtended event
pub fn emit_assignment_ttl_extended(
    env: &Env,
    contributor: Address,
    org_id: Symbol,
    issue_id: u32,
) {
    env.events().publish(
        ("AssignmentTtlExtended", "v1"),
        (contributor, org_id, issue_id, env.ledger().timestamp()),
    );
}

/// Emit an ApplicationTtlExtended event
pub fn emit_application_ttl_extended(
    env: &Env,
    contributor: Address,
    org_id: Symbol,
    issue_id: u32,
) {
    env.events().publish(
        ("ApplicationTtlExtended", "v1"),
        (contributor, org_id, issue_id, env.ledger().timestamp()),
    );
}

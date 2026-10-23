//! Event definitions for the Workload Governor contract.
//!
//! ## Standardised 3-element topic schema (#829 SC-004)
//!
//! All events use the same 3-element topic tuple so the off-chain indexer can
//! filter with structured RPC topic queries instead of wildcard scans:
//!
//! ```text
//! topics[0]  Symbol("WG")         — contract namespace discriminant
//! topics[1]  Symbol(<event_name>) — operation identifier
//! topics[2]  Address/Symbol       — primary entity identifier
//! ```

use soroban_sdk::{symbol_short, Address, Env, Symbol};

/// Emit an AssignmentTtlExtended event.
///
/// topics: `(WG, symbol_short!("asgn_ttl"), contributor)`
/// data:   `(org_id, issue_id, timestamp)`
pub fn emit_assignment_ttl_extended(
    env: &Env,
    contributor: Address,
    org_id: Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("WG"), symbol_short!("asgn_ttl"), contributor.clone()),
        (org_id, issue_id, env.ledger().timestamp()),
    );
}

/// Emit an ApplicationTtlExtended event.
///
/// topics: `(WG, symbol_short!("app_ttl"), contributor)`
/// data:   `(org_id, issue_id, timestamp)`
pub fn emit_application_ttl_extended(
    env: &Env,
    contributor: Address,
    org_id: Symbol,
    issue_id: u32,
) {
    env.events().publish(
        (symbol_short!("WG"), symbol_short!("app_ttl"), contributor.clone()),
        (org_id, issue_id, env.ledger().timestamp()),
    );
}

//! Event definitions for WorkloadGovernor contract
//!
//! This module defines all events emitted by the contract for
//! off-chain indexing and monitoring.

use soroban_sdk::{contractevent, Env, String, Address, Symbol};

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
}

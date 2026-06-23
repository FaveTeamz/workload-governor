//! WorkloadGovernor — Soroban smart contract entry point.
//!
//! Enforces fairness caps on developer workloads for the AlignmentDrips Wave platform:
//! - Max 15 pending applications globally per contributor
//! - Max 4 active assignments per org per contributor
//!
//! Build:  cargo build --target wasm32v1-none --release
//! Test:   cargo test --features testutils

#![no_std]

mod errors;
mod events;
mod storage;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, BytesN, Env, Symbol};

use crate::errors::ContractError;
use crate::events;
use crate::storage;

#[contract]
pub struct WorkloadGovernor;

#[contractimpl]
impl WorkloadGovernor {
    // -----------------------------------------------------------------------
    // Admin functions
    // -----------------------------------------------------------------------

    /// Initialises the contract and stores the admin address.
    ///
    /// - Panics with `AlreadyInitialized` if already called.
    /// - Requires authentication from `admin`.
    pub fn initialize(env: Env, admin: Address) {
        if storage::get_admin(&env).is_some() {
            panic_with_error!(env, ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        storage::set_admin(&env, &admin);
        storage::bump_instance(&env);
        events::emit_initialized(&env, &admin);
    }

    /// Registers a maintainer for an organisation (idempotent).
    ///
    /// - Panics with `NotInitialized` if the contract has not been initialised.
    /// - Requires authentication from the stored admin address.
    pub fn register_maintainer(env: Env, admin: Address, maintainer: Address, org_id: Symbol) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::set_maintainer(&env, &maintainer, &org_id);
        storage::bump_instance(&env);
        events::emit_maintainer_registered(&env, &admin, &maintainer, &org_id);
    }

    /// Upgrades the contract WASM (admin-only).
    ///
    /// This is a required production function — it allows the contract to be patched
    /// after deployment without changing the contract address.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // -----------------------------------------------------------------------
    // Contributor functions
    // -----------------------------------------------------------------------

    /// Records a contributor's application for a specific issue.
    ///
    /// Guards (in order): NotInitialized → auth → GlobalApplicationLimitReached → DuplicateApplication
    pub fn apply_for_issue(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        contributor.require_auth();
        let count = storage::get_global_app_count(&env, &contributor);
        if count >= storage::GLOBAL_APP_LIMIT {
            panic_with_error!(env, ContractError::GlobalApplicationLimitReached);
        }
        if storage::has_app_entry(&env, &contributor, &org_id, issue_id) {
            panic_with_error!(env, ContractError::DuplicateApplication);
        }
        storage::set_global_app_count(&env, &contributor, count + 1);
        storage::set_app_entry(&env, &contributor, &org_id, issue_id);
        storage::extend_global_app_count_ttl(&env, &contributor);
        storage::extend_app_entry_ttl(&env, &contributor, &org_id, issue_id);
        storage::bump_instance(&env);
        events::emit_application_submitted(&env, &contributor, &org_id, issue_id);
    }

    /// Withdraws a contributor's pending application for a specific issue.
    ///
    /// Guards (in order): NotInitialized → auth → ApplicationNotFound
    pub fn withdraw_application(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        contributor.require_auth();
        if !storage::has_app_entry(&env, &contributor, &org_id, issue_id) {
            panic_with_error!(env, ContractError::ApplicationNotFound);
        }
        storage::remove_app_entry(&env, &contributor, &org_id, issue_id);
        let count = storage::get_global_app_count(&env, &contributor);
        let new_count = count.saturating_sub(1);
        if new_count == 0 {
            storage::remove_global_app_count(&env, &contributor);
        } else {
            storage::set_global_app_count(&env, &contributor, new_count);
        }
        storage::bump_instance(&env);
        events::emit_application_withdrawn(&env, &contributor, &org_id, issue_id);
    }

    // -----------------------------------------------------------------------
    // Maintainer functions
    // -----------------------------------------------------------------------

    /// Assigns an issue to a contributor (maintainer-only).
    ///
    /// Guards (in order): NotInitialized → auth → UnauthorizedMaintainer →
    ///   ApplicationNotFound → OrgAssignmentLimitReached → AlreadyAssigned
    pub fn assign_issue(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        maintainer.require_auth();
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }
        if !storage::has_app_entry(&env, &contributor, &org_id, issue_id) {
            panic_with_error!(env, ContractError::ApplicationNotFound);
        }
        let asgn_count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        if asgn_count >= storage::ORG_ASSIGNMENT_LIMIT {
            panic_with_error!(env, ContractError::OrgAssignmentLimitReached);
        }
        if storage::has_assignment(&env, &org_id, issue_id, &contributor) {
            panic_with_error!(env, ContractError::AlreadyAssigned);
        }
        // Transition: consume the application, create the assignment
        storage::remove_app_entry(&env, &contributor, &org_id, issue_id);
        let app_count = storage::get_global_app_count(&env, &contributor);
        let new_app_count = app_count.saturating_sub(1);
        if new_app_count == 0 {
            storage::remove_global_app_count(&env, &contributor);
        } else {
            storage::set_global_app_count(&env, &contributor, new_app_count);
        }
        storage::set_org_assignment_count(&env, &contributor, &org_id, asgn_count + 1);
        storage::set_assignment(&env, &org_id, issue_id, &contributor);
        storage::bump_instance(&env);
        events::emit_issue_assigned(&env, &maintainer, &contributor, &org_id, issue_id);
    }

    /// Marks an assignment as completed (maintainer-only).
    ///
    /// Guards (in order): NotInitialized → auth → UnauthorizedMaintainer → AssignmentNotFound
    pub fn complete_assignment(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        maintainer.require_auth();
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }
        if !storage::has_assignment(&env, &org_id, issue_id, &contributor) {
            panic_with_error!(env, ContractError::AssignmentNotFound);
        }
        storage::remove_assignment(&env, &org_id, issue_id, &contributor);
        let asgn_count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        let new_count = asgn_count.saturating_sub(1);
        if new_count == 0 {
            storage::remove_org_assignment_count(&env, &contributor, &org_id);
        } else {
            storage::set_org_assignment_count(&env, &contributor, &org_id, new_count);
        }
        storage::bump_instance(&env);
        events::emit_assignment_completed(&env, &maintainer, &contributor, &org_id, issue_id);
    }

    /// Revokes an active assignment (maintainer-only).
    ///
    /// Guards (in order): NotInitialized → auth → UnauthorizedMaintainer → AssignmentNotFound
    pub fn revoke_assignment(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        maintainer.require_auth();
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }
        if !storage::has_assignment(&env, &org_id, issue_id, &contributor) {
            panic_with_error!(env, ContractError::AssignmentNotFound);
        }
        storage::remove_assignment(&env, &org_id, issue_id, &contributor);
        let asgn_count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        let new_count = asgn_count.saturating_sub(1);
        if new_count == 0 {
            storage::remove_org_assignment_count(&env, &contributor, &org_id);
        } else {
            storage::set_org_assignment_count(&env, &contributor, &org_id, new_count);
        }
        storage::bump_instance(&env);
        events::emit_assignment_revoked(&env, &maintainer, &contributor, &org_id, issue_id);
    }

    // -----------------------------------------------------------------------
    // TTL management
    // -----------------------------------------------------------------------

    /// Extends the TTL of a contributor's pending application entries (permissionless).
    ///
    /// Panics with `ApplicationNotFound` if no pending application exists.
    /// Silently skips the global count TTL if that key is absent.
    pub fn extend_application_ttl(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) {
        if !storage::has_app_entry(&env, &contributor, &org_id, issue_id) {
            panic_with_error!(env, ContractError::ApplicationNotFound);
        }
        storage::extend_app_entry_ttl(&env, &contributor, &org_id, issue_id);
        if storage::get_global_app_count(&env, &contributor) > 0 {
            storage::extend_global_app_count_ttl(&env, &contributor);
        }
    }

    // -----------------------------------------------------------------------
    // Read-only query functions — no storage mutations, no events
    // -----------------------------------------------------------------------

    /// Returns the contributor's current global pending-application count (0 if absent/expired).
    pub fn get_global_application_count(env: Env, contributor: Address) -> u32 {
        storage::get_global_app_count(&env, &contributor)
    }

    /// Returns the contributor's active assignment count for the given org (0 if absent).
    pub fn get_org_assignment_count(env: Env, contributor: Address, org_id: Symbol) -> u32 {
        storage::get_org_assignment_count(&env, &contributor, &org_id)
    }

    /// Returns `true` if the contributor has a pending application for the given issue.
    pub fn has_applied(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) -> bool {
        storage::has_app_entry(&env, &contributor, &org_id, issue_id)
    }

    /// Returns `true` if the contributor is actively assigned to the given issue.
    pub fn is_assigned(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) -> bool {
        storage::has_assignment(&env, &org_id, issue_id, &contributor)
    }

    // -----------------------------------------------------------------------
    // Organization Selector Helper Functions
    // -----------------------------------------------------------------------

    /// Returns the assignment capacity remaining for a contributor in an organization.
    /// 
    /// Returns: `ORG_ASSIGNMENT_LIMIT - current_count` (minimum 0).
    /// Useful for UI display: showing "X/4" where X is the count and 4 is the limit.
    pub fn get_org_assignment_capacity(
        env: Env,
        contributor: Address,
        org_id: Symbol,
    ) -> u32 {
        let current = storage::get_org_assignment_count(&env, &contributor, &org_id);
        storage::ORG_ASSIGNMENT_LIMIT.saturating_sub(current)
    }

    /// Returns the global application capacity remaining for a contributor.
    /// 
    /// Returns: `GLOBAL_APP_LIMIT - current_count` (minimum 0).
    /// Useful for determining if a contributor can apply to more issues globally.
    pub fn get_global_application_capacity(env: Env, contributor: Address) -> u32 {
        let current = storage::get_global_app_count(&env, &contributor);
        storage::GLOBAL_APP_LIMIT.saturating_sub(current)
    }

    /// Checks if a contributor has reached their org assignment limit.
    ///
    /// Returns `true` if the contributor has 4 active assignments in the org.
    pub fn is_org_assignment_limit_reached(
        env: Env,
        contributor: Address,
        org_id: Symbol,
    ) -> bool {
        let count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        count >= storage::ORG_ASSIGNMENT_LIMIT
    }

    /// Checks if a contributor has reached their global application limit.
    ///
    /// Returns `true` if the contributor has 15 pending applications globally.
    pub fn is_global_application_limit_reached(env: Env, contributor: Address) -> bool {
        let count = storage::get_global_app_count(&env, &contributor);
        count >= storage::GLOBAL_APP_LIMIT
    }
}

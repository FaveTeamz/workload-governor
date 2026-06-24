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

    /// One-time contract initialisation. Stores the admin address and emits an
    /// `initialized` event.
    ///
    /// # Who can call
    /// Anyone — but only once. The caller **must** be the intended `admin` address
    /// because `admin.require_auth()` is enforced before any state is written.
    ///
    /// # Arguments
    /// * `admin` – Address that will have admin privileges for the lifetime of the contract.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::AlreadyInitialized`] — if `initialize` has already been called.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet --source <admin-account> \
    ///   -- initialize --admin <ADMIN_ADDRESS>
    /// ```
    pub fn initialize(env: Env, admin: Address) {
        if storage::get_admin(&env).is_some() {
            panic_with_error!(env, ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        storage::set_admin(&env, &admin);
        storage::bump_instance(&env);
        events::emit_initialized(&env, &admin);
    }

    /// Authorises a maintainer to manage issues within a specific organisation.
    /// The operation is idempotent — calling it twice for the same pair is safe.
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `admin`      – Must match the stored admin address (auth enforced).
    /// * `maintainer` – Address to be granted maintainer rights.
    /// * `org_id`     – Organisation symbol the maintainer is authorised for.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]   — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — `admin` auth check fails (enforced by
    ///   `require_auth` on the stored admin, not a direct comparison).
    pub fn register_maintainer(env: Env, admin: Address, maintainer: Address, org_id: Symbol) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::set_maintainer(&env, &maintainer, &org_id);
        storage::bump_instance(&env);
        events::emit_maintainer_registered(&env, &admin, &maintainer, &org_id);
    }

    /// Upgrades the contract WASM to a new hash (admin-only).
    ///
    /// This is the standard Soroban upgrade path. The new WASM must already be
    /// uploaded to the network before calling this function.
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `new_wasm_hash` – 32-byte hash of the uploaded replacement WASM.
    ///
    /// # Returns
    /// `()` on success; the contract is upgraded in-place with no address change.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]   — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // -----------------------------------------------------------------------
    // Contributor functions
    // -----------------------------------------------------------------------

    /// Submits a pending application for a contributor to work on a specific issue.
    ///
    /// Creates two temporary-storage entries (both with [`storage::APP_TTL_LEDGERS`] TTL):
    /// - A global application counter keyed by `contributor`.
    /// - An application sentinel keyed by `(contributor, org_id, issue_id)`.
    ///
    /// # Who can call
    /// The `contributor` address (auth enforced).
    ///
    /// # Arguments
    /// * `contributor` – Address applying for the issue.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]              — contract not yet initialised.
    /// * [`ContractError::UnauthorizedContributor`]     — contributor auth check fails.
    /// * [`ContractError::GlobalApplicationLimitReached`] — contributor already has 15
    ///   pending applications across all organisations.
    /// * [`ContractError::DuplicateApplication`]        — an application for this exact
    ///   `(contributor, org_id, issue_id)` triple already exists.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet --source <contributor-account> \
    ///   -- apply_for_issue \
    ///   --contributor <CONTRIBUTOR_ADDRESS> \
    ///   --org_id my_org --issue_id 42
    /// ```
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

    /// Cancels a contributor's pending application for a specific issue.
    ///
    /// Removes the application sentinel and decrements the global application counter.
    /// If the counter reaches zero the counter entry itself is removed to free storage.
    ///
    /// # Who can call
    /// The `contributor` address (auth enforced).
    ///
    /// # Arguments
    /// * `contributor` – Address whose application is being withdrawn.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]          — contract not yet initialised.
    /// * [`ContractError::UnauthorizedContributor`] — contributor auth check fails.
    /// * [`ContractError::ApplicationNotFound`]     — no pending application exists for
    ///   the `(contributor, org_id, issue_id)` triple.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet --source <contributor-account> \
    ///   -- withdraw_application \
    ///   --contributor <CONTRIBUTOR_ADDRESS> \
    ///   --org_id my_org --issue_id 42
    /// ```
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

    /// Converts a pending application into an active assignment (maintainer-only).
    ///
    /// Atomically:
    /// 1. Removes the contributor's application entry and decrements the global app counter.
    /// 2. Increments the contributor's org-level assignment counter.
    /// 3. Creates the persistent assignment sentinel.
    ///
    /// # Who can call
    /// A maintainer that has been registered for `org_id` via [`WorkloadGovernor::register_maintainer`].
    ///
    /// # Arguments
    /// * `maintainer`  – Registered maintainer address (auth enforced).
    /// * `contributor` – Contributor being assigned.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]          — contract not yet initialised.
    /// * [`ContractError::UnauthorizedMaintainer`]  — caller is not a registered maintainer for `org_id`.
    /// * [`ContractError::ApplicationNotFound`]     — contributor has no pending application for the issue.
    /// * [`ContractError::OrgAssignmentLimitReached`] — contributor already has 4 active assignments in `org_id`.
    /// * [`ContractError::AlreadyAssigned`]         — this issue already has an active assignment for the contributor.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet --source <maintainer-account> \
    ///   -- assign_issue \
    ///   --maintainer <MAINTAINER_ADDRESS> \
    ///   --contributor <CONTRIBUTOR_ADDRESS> \
    ///   --org_id my_org --issue_id 42
    /// ```
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

    /// Marks an active assignment as completed and frees the assignment slot (maintainer-only).
    ///
    /// Removes the assignment sentinel and decrements the contributor's org-level
    /// assignment counter. If the counter reaches zero the counter entry itself is removed.
    ///
    /// # Who can call
    /// A maintainer registered for `org_id`.
    ///
    /// # Arguments
    /// * `maintainer`  – Registered maintainer address (auth enforced).
    /// * `contributor` – Contributor whose assignment is being completed.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]         — contract not yet initialised.
    /// * [`ContractError::UnauthorizedMaintainer`] — caller is not a registered maintainer for `org_id`.
    /// * [`ContractError::AssignmentNotFound`]     — no active assignment exists for the triple.
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

    /// Cancels an active assignment and frees the assignment slot (maintainer-only).
    ///
    /// Semantically identical to [`WorkloadGovernor::complete_assignment`] except the emitted
    /// event is `assignment_revoked` rather than `assignment_completed`. Use this when a
    /// contributor's work is being cancelled rather than accepted.
    ///
    /// # Who can call
    /// A maintainer registered for `org_id`.
    ///
    /// # Arguments
    /// * `maintainer`  – Registered maintainer address (auth enforced).
    /// * `contributor` – Contributor whose assignment is being revoked.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]         — contract not yet initialised.
    /// * [`ContractError::UnauthorizedMaintainer`] — caller is not a registered maintainer for `org_id`.
    /// * [`ContractError::AssignmentNotFound`]     — no active assignment exists for the triple.
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

    /// Resets the TTL of a contributor's pending application entries to the full wave
    /// duration (permissionless — anyone can call this to prevent an application expiring).
    ///
    /// Extends both:
    /// - The per-issue application sentinel entry.
    /// - The global application counter entry (skipped silently if the counter key is absent).
    ///
    /// # Who can call
    /// Anyone — no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Owner of the application.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::ApplicationNotFound`] — no pending application exists; nothing to extend.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet --source <any-account> \
    ///   -- extend_application_ttl \
    ///   --contributor <CONTRIBUTOR_ADDRESS> \
    ///   --org_id my_org --issue_id 42
    /// ```
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

    /// Returns the contributor's current global pending-application count.
    ///
    /// Returns `0` if the contributor has never applied or if all entries have expired.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    ///
    /// # Returns
    /// A `u32` in the range `[0, GLOBAL_APP_LIMIT]` (currently `[0, 15]`).
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- get_global_application_count \
    ///   --contributor <CONTRIBUTOR_ADDRESS>
    /// ```
    pub fn get_global_application_count(env: Env, contributor: Address) -> u32 {
        storage::get_global_app_count(&env, &contributor)
    }

    /// Returns the contributor's active assignment count for the given organisation.
    ///
    /// Returns `0` if the contributor has no active assignments in `org_id`.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    /// * `org_id`      – Organisation to query within.
    ///
    /// # Returns
    /// A `u32` in the range `[0, ORG_ASSIGNMENT_LIMIT]` (currently `[0, 4]`).
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- get_org_assignment_count \
    ///   --contributor <CONTRIBUTOR_ADDRESS> --org_id my_org
    /// ```
    pub fn get_org_assignment_count(env: Env, contributor: Address, org_id: Symbol) -> u32 {
        storage::get_org_assignment_count(&env, &contributor, &org_id)
    }

    /// Returns `true` if the contributor has a pending application for the given issue.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `true` if a pending application exists; `false` if absent or expired.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- has_applied \
    ///   --contributor <CONTRIBUTOR_ADDRESS> --org_id my_org --issue_id 42
    /// ```
    pub fn has_applied(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) -> bool {
        storage::has_app_entry(&env, &contributor, &org_id, issue_id)
    }

    /// Returns `true` if the contributor is actively assigned to the given issue.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    /// * `org_id`      – Organisation the issue belongs to.
    /// * `issue_id`    – Numeric issue identifier.
    ///
    /// # Returns
    /// `true` if an active assignment exists; `false` otherwise.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- is_assigned \
    ///   --contributor <CONTRIBUTOR_ADDRESS> --org_id my_org --issue_id 42
    /// ```
    pub fn is_assigned(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) -> bool {
        storage::has_assignment(&env, &org_id, issue_id, &contributor)
    }

    // -----------------------------------------------------------------------
    // Organization Selector Helper Functions
    // -----------------------------------------------------------------------

    /// Returns the number of additional assignment slots available to a contributor
    /// within an organisation.
    ///
    /// Computed as `ORG_ASSIGNMENT_LIMIT - current_count`, floored at zero.
    /// Useful for UI display: show "X / 4 slots used" where `4 - X` is the capacity.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    /// * `org_id`      – Organisation to query within.
    ///
    /// # Returns
    /// Remaining capacity as a `u32` in `[0, ORG_ASSIGNMENT_LIMIT]`.
    pub fn get_org_assignment_capacity(
        env: Env,
        contributor: Address,
        org_id: Symbol,
    ) -> u32 {
        let current = storage::get_org_assignment_count(&env, &contributor, &org_id);
        storage::ORG_ASSIGNMENT_LIMIT.saturating_sub(current)
    }

    /// Returns the number of additional global applications a contributor may submit.
    ///
    /// Computed as `GLOBAL_APP_LIMIT - current_count`, floored at zero.
    /// Returns `0` when the contributor has reached the cap of 15 pending applications.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    ///
    /// # Returns
    /// Remaining capacity as a `u32` in `[0, GLOBAL_APP_LIMIT]`.
    pub fn get_global_application_capacity(env: Env, contributor: Address) -> u32 {
        let current = storage::get_global_app_count(&env, &contributor);
        storage::GLOBAL_APP_LIMIT.saturating_sub(current)
    }

    /// Returns `true` if the contributor has reached their per-org assignment limit.
    ///
    /// Equivalent to checking `get_org_assignment_count >= 4`.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    /// * `org_id`      – Organisation to check the limit against.
    ///
    /// # Returns
    /// `true` if the contributor has 4 active assignments in `org_id`.
    pub fn is_org_assignment_limit_reached(
        env: Env,
        contributor: Address,
        org_id: Symbol,
    ) -> bool {
        let count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        count >= storage::ORG_ASSIGNMENT_LIMIT
    }

    /// Returns `true` if the contributor has reached their global application limit.
    ///
    /// Equivalent to checking `get_global_application_count >= 15`.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    ///
    /// # Returns
    /// `true` if the contributor has 15 pending applications globally.
    pub fn is_global_application_limit_reached(env: Env, contributor: Address) -> bool {
        let count = storage::get_global_app_count(&env, &contributor);
        count >= storage::GLOBAL_APP_LIMIT
    }
}

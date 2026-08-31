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

// In tests we run on the native host, which has std; expose it explicitly
// since the crate is unconditionally `no_std`.
#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, BytesN, Env, Map, Symbol, Vec,
};

use crate::errors::ContractError;

/// Maximum number of org IDs accepted by [`WorkloadGovernor::get_contributor_snapshot`].
pub const SNAPSHOT_ORG_LIMIT: u32 = 10;

/// A point-in-time snapshot of a contributor's workload state.
///
/// Returned by [`WorkloadGovernor::get_contributor_snapshot`] in a single atomic call,
/// eliminating the need for multiple sequential RPC calls that could observe inconsistent
/// intermediate state.
///
/// # Fields
/// * `global_application_count` — total pending applications across all organisations,
///   equivalent to [`WorkloadGovernor::get_global_application_count`].
/// * `org_assignments` — a map from org ID to active assignment count for each org ID
///   supplied in the `org_ids` parameter.  Orgs with zero assignments are still present
///   in the map with value `0`, so the caller can always expect an entry for every
///   requested org.
#[contracttype]
pub struct ContributorSnapshot {
    pub global_application_count: u32,
    pub org_assignments: Map<Symbol, u32>,
}

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
        let _guard = ReentrancyGuard::acquire(&env);
        if storage::get_admin(&env).is_some() {
            panic_with_error!(env, ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        storage::set_admin(&env, &admin);
        storage::set_global_cap(&env, storage::GLOBAL_APP_LIMIT);
        storage::bump_instance(&env);
        events::emit_initialized(&env, &admin, env.ledger().sequence());
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
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::set_maintainer(&env, &maintainer, &org_id);
        // Update maintainer orgs index (Issue #589)
        let mut orgs = storage::get_maintainer_orgs_index(&env, &maintainer);
        let mut already_indexed = false;
        for existing in orgs.iter() {
            if existing == org_id {
                already_indexed = true;
                break;
            }
        }
        if !already_indexed {
            orgs.push_back(org_id.clone());
            storage::set_maintainer_orgs_index(&env, &maintainer, &orgs);
        }
        storage::bump_instance(&env);
        events::emit_maintainer_registered(&env, &admin, &maintainer, &org_id);
    }

    /// Revokes a maintainer's authorisation for a specific organisation (admin-only).
    ///
    /// Removes the maintainer registration for `(maintainer, org_id)`. After this
    /// call the maintainer can no longer call `assign_issue`, `complete_assignment`,
    /// or `revoke_assignment` for the given organisation. The operation is idempotent —
    /// calling it when the maintainer is already deregistered is a no-op.
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `admin`      – Must match the stored admin address (auth enforced).
    /// * `maintainer` – Address whose maintainer rights are being revoked.
    /// * `org_id`     – Organisation the maintainer is being deregistered from.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]    — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    pub fn deregister_maintainer(env: Env, admin: Address, maintainer: Address, org_id: Symbol) {
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::remove_maintainer(&env, &maintainer, &org_id);
        // Update maintainer orgs index (Issue #589)
        let orgs = storage::get_maintainer_orgs_index(&env, &maintainer);
        let mut new_orgs = soroban_sdk::Vec::new(&env);
        for existing in orgs.iter() {
            if existing != org_id {
                new_orgs.push_back(existing);
            }
        }
        storage::set_maintainer_orgs_index(&env, &maintainer, &new_orgs);
        storage::bump_instance(&env);
        events::emit_maintainer_deregistered(&env, &admin, &maintainer, &org_id);
    }

    /// Sets the per-organisation assignment cap (admin-only).
    ///
    /// Overrides the default [`storage::ORG_ASSIGNMENT_LIMIT`] for a specific org,
    /// allowing different organisations to have different assignment slot limits.
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `admin`   – Must match the stored admin address (auth enforced).
    /// * `org_id`  – Organisation whose cap is being configured.
    /// * `cap`     – New cap value; must be in range [1, 20].
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]    — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    /// * [`ContractError::InvalidCapValue`]   — `cap` is 0 or greater than 20.
    pub fn set_org_cap(env: Env, admin: Address, org_id: Symbol, cap: u32) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        if cap == 0 || cap > 20 {
            panic_with_error!(env, ContractError::InvalidCapValue);
        }
        let old_cap = storage::get_org_cap(&env, &org_id)
            .unwrap_or(storage::ORG_ASSIGNMENT_LIMIT);
        storage::set_org_cap(&env, &org_id, cap);
        storage::bump_instance(&env);
        events::emit_org_cap_set(&env, &org_id, old_cap, cap);
    }

    /// Returns the configured per-org assignment cap (or the default if not set).
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    pub fn get_org_cap(env: Env, org_id: Symbol) -> u32 {
        storage::get_org_cap(&env, &org_id)
            .unwrap_or(storage::ORG_ASSIGNMENT_LIMIT)
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
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Transfers admin authority to a new address (admin-only).
    ///
    /// Replaces the stored admin address with `new_admin`. The old admin can no
    /// longer call admin-gated functions after this call returns.
    ///
    /// # Who can call
    /// The current stored admin address only.
    ///
    /// # Arguments
    /// * `admin`     – Current admin address (auth enforced).
    /// * `new_admin` – Address to grant admin authority to.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]   — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::set_admin(&env, &new_admin);
        storage::bump_instance(&env);
        events::emit_admin_transferred(&env, &admin, &new_admin);
    }

    /// Sets the global application cap via the normal (non-emergency) operator path.
    ///
    /// Emits `GlobalCapUpdated` event. Admin auth is required.
    /// Cap must be in range 0..=100.
    pub fn set_global_cap(env: Env, admin: Address, new_cap: u32) {
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        if new_cap > 100 {
            panic_with_error!(env, ContractError::CapOutOfRange);
        }
        storage::set_global_cap(&env, new_cap);
        storage::bump_instance(&env);
        events::emit_global_cap_updated(&env, &admin, new_cap);
    }

    /// Immediately overrides the global application cap to `new_cap` (admin-only, emergency use).
    ///
    /// Use this function when the default cap of [`storage::GLOBAL_APP_LIMIT`] (15) is too
    /// restrictive during an unusually large Wave and contributors are being blocked.
    /// The new cap takes effect on the **next** `apply_for_issue` call with no migration of
    /// existing application counts.
    ///
    /// Unlike a hypothetical `set_global_cap`, this function emits [`EmergencyCapUpdated`]
    /// rather than `GlobalCapUpdated` so that monitoring systems can detect and alert on
    /// emergency changes independently of routine cap adjustments.
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `admin`   – Must match the stored admin address (auth enforced).
    /// * `new_cap` – New maximum number of pending applications per contributor. Must be
    ///               in the range `[0, 100]`.
    ///
    /// # Returns
    /// `()` on success. The cap is stored persistently; it survives ledger archival and
    /// does not expire.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]   — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    /// * [`ContractError::CapOutOfRange`]    — `new_cap` exceeds 100.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet --source <admin-account> \
    ///   -- emergency_set_global_cap \
    ///   --admin <ADMIN_ADDRESS> \
    ///   --new_cap 25
    /// ```
    pub fn emergency_set_global_cap(env: Env, admin: Address, new_cap: u32) {
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        if new_cap > 100 {
            panic_with_error!(env, ContractError::CapOutOfRange);
        }
        let old_cap = storage::get_global_cap(&env);
        storage::set_global_cap(&env, new_cap);
        storage::bump_instance(&env);
        events::emit_emergency_cap_updated(&env, &admin, old_cap, new_cap);
    }

    /// Pauses all state-changing operations on the contract (admin-only).
    ///
    /// When paused, every state-changing function panics with
    /// [`ContractError::ContractPaused`] (code 15). Read-only query functions
    /// (`get_*`, `has_*`, `is_*`, `check_*`) continue to work normally.
    ///
    /// Use this for emergency incident response to freeze the contract instantly
    /// without requiring a full WASM upgrade (10–30 minutes). Call `unpause` to
    /// resume normal operation once the incident is resolved.
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `admin` – Must match the stored admin address (auth enforced).
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]   — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    pub fn pause(env: Env, admin: Address) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::set_contract_paused(&env, true);
        storage::bump_instance(&env);
        events::emit_contract_paused(&env, &admin);
    }

    /// Resumes normal contract operation after a pause (admin-only).
    ///
    /// Clears the paused flag so that all state-changing functions become
    /// accessible again.
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `admin` – Must match the stored admin address (auth enforced).
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]   — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    pub fn unpause(env: Env, admin: Address) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::set_contract_paused(&env, false);
        storage::bump_instance(&env);
        events::emit_contract_unpaused(&env, &admin);
    }

    /// Returns `true` if the contract is currently paused.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Returns
    /// `true` if paused; `false` if operational.
    pub fn is_paused(env: Env) -> bool {
        storage::is_contract_paused(&env)
    }

    /// Transfers admin authority to a new address (admin-only).
    ///
    /// # Who can call
    /// The stored admin address only.
    ///
    /// # Arguments
    /// * `admin`     – Must match the stored admin address (auth enforced).
    /// * `new_admin` – Address to receive admin privileges.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]   — contract has not been initialised yet.
    /// * [`ContractError::UnauthorizedAdmin`] — admin auth check fails.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();
        storage::set_admin(&env, &new_admin);
        storage::bump_instance(&env);
        events::emit_admin_transferred(&env, &admin, &new_admin);
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
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        contributor.require_auth();
        let count = storage::get_global_app_count(&env, &contributor);
        if count >= storage::get_global_cap(&env) {
            panic_with_error!(env, ContractError::GlobalApplicationLimitReached);
        }
        if storage::has_app_entry(&env, &contributor, &org_id, issue_id) {
            panic_with_error!(env, ContractError::DuplicateApplication);
        }
        storage::set_global_app_count(&env, &contributor, count + 1);
        storage::set_app_entry(&env, &contributor, &org_id, issue_id);
        storage::extend_global_app_count_ttl(&env, &contributor);
        storage::extend_app_entry_ttl(&env, &contributor, &org_id, issue_id);
        storage::index_add_application(&env, &contributor, &org_id, issue_id);
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
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
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
        storage::index_remove_application(&env, &contributor, &org_id, issue_id);
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
    /// * [`ContractError::OrgNotFound`]             — `org_id` has never had a maintainer registered.
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
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        maintainer.require_auth();
        if !storage::is_org_registered(&env, &org_id) {
            panic_with_error!(env, ContractError::OrgNotFound);
        }
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }
        if !storage::has_app_entry(&env, &contributor, &org_id, issue_id) {
            panic_with_error!(env, ContractError::ApplicationNotFound);
        }
        let asgn_count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        let org_cap = storage::get_org_cap(&env, &org_id)
            .unwrap_or(storage::ORG_ASSIGNMENT_LIMIT);
        if asgn_count >= org_cap {
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
        storage::index_remove_application(&env, &contributor, &org_id, issue_id);
        storage::set_org_assignment_count(&env, &contributor, &org_id, asgn_count + 1);
        storage::set_assignment(&env, &org_id, issue_id, &contributor);
        // Debug assertion: counter and sentinel must agree immediately after write.
        #[cfg(debug_assertions)]
        {
            let written = storage::get_org_assignment_count(&env, &contributor, &org_id);
            let sentinel = storage::has_assignment(&env, &org_id, issue_id, &contributor);
            if written == 0 || !sentinel {
                panic_with_error!(env, ContractError::CounterInconsistency);
            }
        }
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
    /// * [`ContractError::OrgNotFound`]            — `org_id` has never had a maintainer registered.
    /// * [`ContractError::UnauthorizedMaintainer`] — caller is not a registered maintainer for `org_id`.
    /// * [`ContractError::AssignmentNotFound`]     — no active assignment exists for the triple.
    pub fn complete_assignment(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        maintainer.require_auth();
        if !storage::is_org_registered(&env, &org_id) {
            panic_with_error!(env, ContractError::OrgNotFound);
        }
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }
        if !storage::has_assignment(&env, &org_id, issue_id, &contributor) {
            panic_with_error!(env, ContractError::AssignmentNotFound);
        }
        // Debug assertion: assignment exists so counter must be ≥ 1.
        // A counter of 0 here indicates storage corruption (CounterInconsistency).
        #[cfg(debug_assertions)]
        {
            let counter = storage::get_org_assignment_count(&env, &contributor, &org_id);
            if counter == 0 {
                panic_with_error!(env, ContractError::CounterInconsistency);
            }
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
    /// * [`ContractError::OrgNotFound`]            — `org_id` has never had a maintainer registered.
    /// * [`ContractError::UnauthorizedMaintainer`] — caller is not a registered maintainer for `org_id`.
    /// * [`ContractError::AssignmentNotFound`]     — no active assignment exists for the triple.
    pub fn revoke_assignment(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        maintainer.require_auth();
        if !storage::is_org_registered(&env, &org_id) {
            panic_with_error!(env, ContractError::OrgNotFound);
        }
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }
        if !storage::has_assignment(&env, &org_id, issue_id, &contributor) {
            panic_with_error!(env, ContractError::AssignmentNotFound);
        }
        storage::remove_assignment(&env, &org_id, issue_id, &contributor);
        let asgn_count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        if asgn_count == 0 {
            panic_with_error!(env, ContractError::CounterInconsistency);
        }
        let new_count = asgn_count - 1;
        if new_count == 0 {
            storage::remove_org_assignment_count(&env, &contributor, &org_id);
        } else {
            storage::set_org_assignment_count(&env, &contributor, &org_id, new_count);
        }
        storage::bump_instance(&env);
        events::emit_assignment_revoked(&env, &maintainer, &contributor, &org_id, issue_id);
    }

    // -----------------------------------------------------------------------
    // Admin diagnostics  (Issue #4)
    // -----------------------------------------------------------------------

    /// Checks a list of `(contributor, org_id)` pairs for `CounterInconsistency`.
    ///
    /// For each pair, reads the org assignment counter. If the counter is `0` but
    /// one or more of the supplied `issue_ids` has a live assignment sentinel for that
    /// pair, the pair is flagged as inconsistent.
    ///
    /// Soroban storage cannot be iterated, so the caller supplies the pairs and issue
    /// IDs to probe — typically derived from an off-chain event index of all
    /// `assign_issue` transactions.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required. Intended for admin diagnostics.
    ///
    /// # Arguments
    /// * `pairs`     – `Vec<(Address, Symbol)>` of `(contributor, org_id)` pairs.
    /// * `issue_ids` – `Vec<u32>` of issue IDs to probe for orphan sentinels per pair.
    ///
    /// # Returns
    /// A `Vec<(Address, Symbol)>` of pairs where a `CounterInconsistency` was detected.
    /// Returns an empty vec when all pairs are consistent.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- check_consistency \
    ///   --pairs '[[{"address":"GAB..."},{"symbol":"my_org"}]]' \
    ///   --issue_ids '[1,2,3]'
    /// ```
    pub fn check_consistency(
        env: Env,
        pairs: Vec<(Address, Symbol)>,
        issue_ids: Vec<u32>,
    ) -> Vec<(Address, Symbol)> {
        let mut inconsistent: Vec<(Address, Symbol)> = Vec::new(&env);
        for pair in pairs.iter() {
            let (ref contributor, ref org_id) = pair;
            let counter = storage::get_org_assignment_count(&env, contributor, org_id);
            if counter == 0 {
                // Counter is 0 — scan issue_ids for an orphan sentinel
                let mut has_orphan = false;
                for issue_id in issue_ids.iter() {
                    if storage::has_assignment(&env, org_id, issue_id, contributor) {
                        has_orphan = true;
                        break;
                    }
                }
                if has_orphan {
                    inconsistent.push_back(pair);
                }
            }
        }
        inconsistent
    }

    // -----------------------------------------------------------------------
    // TTL management
    // -----------------------------------------------------------------------

    /// Sets the per-org assignment cap for an organisation (maintainer-only).
    ///
    /// Overrides the default cap of `4` for the given `org_id`. The cap is stored
    /// persistently under key `("o_cap", org_id)` and takes effect immediately on
    /// the next `assign_issue` call for that org.
    ///
    /// # Who can call
    /// A maintainer that has been registered for `org_id`.
    ///
    /// # Arguments
    /// * `maintainer` – Registered maintainer address (auth enforced).
    /// * `org_id`     – Organisation to configure.
    /// * `new_cap`    – New cap value; must be in range `[1, 20]` inclusive.
    ///
    /// # Returns
    /// `()` on success.
    ///
    /// # Errors
    /// * [`ContractError::NotInitialized`]         — contract not yet initialised.
    /// * [`ContractError::OrgNotFound`]            — `org_id` has never had a maintainer registered.
    /// * [`ContractError::UnauthorizedMaintainer`] — caller not registered for `org_id`.
    /// * [`ContractError::InvalidOrgCap`]          — `new_cap` is 0 or > 20.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet --source <maintainer-account> \
    ///   -- set_org_cap \
    ///   --maintainer <MAINTAINER_ADDRESS> \
    ///   --org_id my_org --new_cap 8
    /// ```
    pub fn set_org_cap(env: Env, maintainer: Address, org_id: Symbol, new_cap: u32) {
        let _guard = ReentrancyGuard::acquire(&env);
        storage::require_initialized(&env, &ContractError::NotInitialized);
        if storage::is_contract_paused(&env) {
            panic_with_error!(env, ContractError::ContractPaused);
        }
        maintainer.require_auth();
        if !storage::is_org_registered(&env, &org_id) {
            panic_with_error!(env, ContractError::OrgNotFound);
        }
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }
        if new_cap < storage::ORG_CAP_MIN || new_cap > storage::ORG_CAP_MAX {
            panic_with_error!(env, ContractError::InvalidOrgCap);
        }
        let old_cap = storage::get_org_cap(&env, &org_id);
        storage::set_org_cap(&env, &org_id, new_cap);
        storage::bump_instance(&env);
        events::emit_org_cap_updated(&env, &org_id, old_cap, new_cap);
    }

    /// Returns the effective assignment cap for the given organisation.
    ///
    /// Returns the per-org cap if one has been set via `set_org_cap`, otherwise
    /// returns the default of `4`.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `org_id` – Organisation to query.
    ///
    /// # Returns
    /// The cap as a `u32` in the range `[1, 20]` (or `4` if no cap is configured).
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- get_org_cap \
    ///   --org_id my_org
    /// ```
    pub fn get_org_cap(env: Env, org_id: Symbol) -> u32 {
        storage::get_org_cap(&env, &org_id)
    }

    // -----------------------------------------------------------------------
    // TTL management
    // -----------------------------------------------------------------------
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
        storage::extend_app_index_ttl(&env, &contributor);
    }

    // -----------------------------------------------------------------------
    // Read-only query functions — no storage mutations, no events
    // -----------------------------------------------------------------------

    /// Returns a complete, atomic snapshot of a contributor's workload state.
    ///
    /// Collects the contributor's global pending-application count and per-org active
    /// assignment counts in a single ledger read, eliminating the inconsistency window
    /// that exists when making multiple separate RPC calls.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    /// * `org_ids`     – List of org symbols to include in `org_assignments`.
    ///   At most [`SNAPSHOT_ORG_LIMIT`] (10) entries are allowed.
    ///   Every requested org is present in the returned map, with value `0` for orgs
    ///   where the contributor has no active assignments.
    ///
    /// # Returns
    /// A [`ContributorSnapshot`] with:
    /// * `global_application_count` – total pending applications (0 if none/expired).
    /// * `org_assignments` – map from each requested org ID to its assignment count.
    ///
    /// # Errors
    /// * [`ContractError::SnapshotOrgLimitExceeded`] — more than 10 org IDs supplied.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- get_contributor_snapshot \
    ///   --contributor <CONTRIBUTOR_ADDRESS> \
    ///   --org_ids '["acme", "beta"]'
    /// ```
    pub fn get_contributor_snapshot(
        env: Env,
        contributor: Address,
        org_ids: Vec<Symbol>,
    ) -> ContributorSnapshot {
        if org_ids.len() > SNAPSHOT_ORG_LIMIT {
            panic_with_error!(env, ContractError::SnapshotOrgLimitExceeded);
        }
        let global_application_count =
            storage::get_global_app_count(&env, &contributor);
        let mut org_assignments: Map<Symbol, u32> = Map::new(&env);
        for org_id in org_ids.iter() {
            let count = storage::get_org_assignment_count(&env, &contributor, &org_id);
            org_assignments.set(org_id, count);
        }
        ContributorSnapshot {
            global_application_count,
            org_assignments,
        }
    }

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

    /// Returns the configured assignment cap for an organisation.
    pub fn get_org_cap(env: Env, org_id: Symbol) -> u32 {
        storage::get_org_cap(&env, &org_id).unwrap_or(storage::ORG_ASSIGNMENT_LIMIT)
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

    /// Returns all pending applications for a contributor as a list of `(org_id, issue_id)` pairs.
    ///
    /// The list is maintained in an application index (`"app_idx"`) updated atomically
    /// on every `apply_for_issue` and `withdraw_application` call. The index uses the
    /// same temporary-storage TTL as application entries, so it expires together with
    /// the application data at Wave end.
    ///
    /// Returns an empty `Vec` when the contributor has no pending applications or when
    /// all application entries have expired.
    ///
    /// # Who can call
    /// Anyone — read-only, no authentication required.
    ///
    /// # Arguments
    /// * `contributor` – Address to query.
    ///
    /// # Returns
    /// A `Vec<(Symbol, u32)>` of `(org_id, issue_id)` pairs in insertion order.
    ///
    /// # Examples
    /// ```text
    /// stellar contract invoke --id <CONTRACT_ID> \
    ///   --network testnet \
    ///   -- get_pending_applications \
    ///   --contributor <CONTRIBUTOR_ADDRESS>
    /// ```
    pub fn get_pending_applications(env: Env, contributor: Address) -> Vec<(Symbol, u32)> {
        storage::get_app_index(&env, &contributor)
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
        storage::get_org_cap(&env, &org_id).saturating_sub(current)
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
        storage::get_global_cap(&env).saturating_sub(current)
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
        count >= storage::get_org_cap(&env, &org_id)
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
    pub fn is_global_app_limit_reached(env: Env, contributor: Address) -> bool {
        let count = storage::get_global_app_count(&env, &contributor);
        count >= storage::get_global_cap(&env)
    }

    /// TEST-ONLY: directly seeds an assignment entry to make `AlreadyAssigned` reachable.
    ///
    /// This bypasses the normal `assign_issue` flow so tests can verify error 11.
    /// Compiled only when the `testutils` feature is active.
    #[cfg(any(test, feature = "testutils"))]
    pub fn seed_assignment(
        env: Env,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        storage::set_assignment(&env, &org_id, issue_id, &contributor);
        let count = storage::get_org_assignment_count(&env, &contributor, &org_id);
        storage::set_org_assignment_count(&env, &contributor, &org_id, count + 1);
    }
}

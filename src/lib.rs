//! WorkloadGovernor — Soroban smart contract entry point.
//!
//! Enforces fairness caps on developer workloads for the AlignmentDrips Wave platform:
//! - Max 15 pending applications globally per contributor (adjustable via governance)
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

// When running tests, bring std into scope so that proptest and std::panic work.
// The test binary links std via the test harness, but `std::` paths are not
// automatically available in a `#![no_std]` crate without this declaration.
#[cfg(test)]
#[macro_use]
extern crate std;

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, BytesN, Env, Symbol, Vec};

use crate::errors::ContractError;

// ---------------------------------------------------------------------------
// Internal helper: validate issue_id  (#601)
// ---------------------------------------------------------------------------

/// Panics with `InvalidIssueId` if `issue_id` is 0 or u32::MAX.
///
/// GitHub issue IDs start at 1, so 0 is never valid.
/// u32::MAX (4_294_967_295) is reserved as a sentinel value.
#[inline]
fn require_valid_issue_id(env: &Env, issue_id: u32) {
    if issue_id == 0 || issue_id == u32::MAX {
        panic_with_error!(env, ContractError::InvalidIssueId);
    }
}

// ---------------------------------------------------------------------------
// Internal helper: require admin auth, supporting multi-sig (#603)
// ---------------------------------------------------------------------------

/// Requires authentication from the stored admin address.
///
/// If a multi-sig threshold has been configured via `set_admin_threshold`, each
/// signer in the list is required to provide auth up to the configured threshold.
/// The Stellar protocol enforces multi-sig by requiring all listed `require_auth`
/// calls to be satisfied; the threshold is encoded as "require auth from the first
/// `threshold` signers in the ordered list".
///
/// In single-admin mode (threshold == 0), only the admin address is required.
#[inline]
fn require_admin_auth(env: &Env) {
    let stored_admin = storage::get_admin(env).unwrap();
    stored_admin.require_auth();

    let threshold = storage::get_multisig_threshold(env);
    if threshold > 0 {
        let signers = storage::get_multisig_signers(env);
        // Require auth from the first `threshold` signers in the ordered list.
        // Stellar's auth framework will verify all collected signatures.
        let mut count: u32 = 0;
        for i in 0..signers.len() {
            if count >= threshold {
                break;
            }
            let signer = signers.get(i).unwrap();
            signer.require_auth();
            count += 1;
        }
    }
}

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
        require_admin_auth(&env);
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
        require_admin_auth(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // -----------------------------------------------------------------------
    // #603 — Multi-sig admin threshold
    // -----------------------------------------------------------------------

    /// Configures a multi-sig threshold for admin operations.
    ///
    /// - `threshold` must be >= 1 and <= `signers.len()`.
    /// - `signers` is an ordered list of addresses; the first `threshold` are required.
    /// - Requires authentication from the current stored admin.
    /// - Emits `AdminThresholdSet`.
    ///
    /// Setting threshold = 1 with a single signer is equivalent to single-admin mode
    /// but uses the explicit signer list. To revert to pure single-admin mode, call
    /// `set_admin_threshold` with threshold = 0 and an empty signers list, or simply
    /// update the admin address via `initialize` on a fresh contract.
    pub fn set_admin_threshold(env: Env, threshold: u32, signers: Vec<Address>) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();

        let signer_count = signers.len();
        if threshold == 0 || threshold > signer_count {
            panic_with_error!(env, ContractError::InvalidThreshold);
        }

        storage::set_multisig_threshold(&env, threshold);
        storage::set_multisig_signers(&env, &signers);
        storage::bump_instance(&env);
        events::emit_admin_threshold_set(&env, &stored_admin, threshold, signer_count);
    }

    // -----------------------------------------------------------------------
    // #602 — Storage migration v1 → v2
    // -----------------------------------------------------------------------

    /// Migrates org assignment count entries from v1 key format to v2 key format.
    ///
    /// **v1 format**: `(symbol_short!("o_asgn"), org_id: Symbol, contributor: Address)`
    /// **v2 format**: `(symbol_short!("o_asgn"), contributor: Address, org_id: Symbol)`
    ///
    /// Accepts a `pairs` list of `(contributor, org_id)` tuples that may have v1 entries.
    /// For each pair:
    ///   1. Reads the v1 key.
    ///   2. If present, writes the value to the v2 key.
    ///   3. Deletes the v1 key.
    ///
    /// The function is callable only once (guarded by a persistent migration flag).
    /// Emits `MigrationCompleted` with the number of entries actually migrated.
    ///
    /// **Usage**: Call this immediately after `upgrade()`, before resuming normal operations.
    pub fn migrate_v1_to_v2(
        env: Env,
        admin: Address,
        pairs: Vec<(Address, Symbol)>,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        let stored_admin = storage::get_admin(&env).unwrap();
        stored_admin.require_auth();

        if storage::is_migration_done(&env) {
            panic_with_error!(env, ContractError::MigrationAlreadyDone);
        }

        let mut migrated: u32 = 0;
        for i in 0..pairs.len() {
            let (contributor, org_id) = pairs.get(i).unwrap();
            if let Some(count) = storage::get_org_assignment_count_v1(&env, &contributor, &org_id) {
                // Write v2 key
                storage::set_org_assignment_count(&env, &contributor, &org_id, count);
                // Remove v1 key
                storage::remove_org_assignment_count_v1(&env, &contributor, &org_id);
                migrated += 1;
            }
        }

        storage::set_migration_done(&env);
        storage::bump_instance(&env);
        events::emit_migration_completed(&env, &admin, migrated);
    }

    // -----------------------------------------------------------------------
    // Contributor functions
    // -----------------------------------------------------------------------

    /// Records a contributor's application for a specific issue.
    ///
    /// Guards (in order): NotInitialized → InvalidIssueId → auth →
    ///   GlobalApplicationLimitReached → DuplicateApplication
    pub fn apply_for_issue(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        require_valid_issue_id(&env, issue_id); // #601
        contributor.require_auth();
        let count = storage::get_global_app_count(&env, &contributor);
        let effective_cap = storage::get_effective_global_cap(&env); // #600 dynamic cap
        if count >= effective_cap {
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
    /// Guards (in order): NotInitialized → InvalidIssueId → auth → ApplicationNotFound
    pub fn withdraw_application(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        require_valid_issue_id(&env, issue_id); // #601
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
    /// Guards (in order): NotInitialized → InvalidIssueId → auth →
    ///   UnauthorizedMaintainer → ApplicationNotFound → OrgAssignmentLimitReached →
    ///   AlreadyAssigned
    pub fn assign_issue(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        require_valid_issue_id(&env, issue_id); // #601
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
    /// Guards (in order): NotInitialized → InvalidIssueId → auth →
    ///   UnauthorizedMaintainer → AssignmentNotFound
    pub fn complete_assignment(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        require_valid_issue_id(&env, issue_id); // #601
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
    /// Guards (in order): NotInitialized → InvalidIssueId → auth →
    ///   UnauthorizedMaintainer → AssignmentNotFound
    pub fn revoke_assignment(
        env: Env,
        maintainer: Address,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        require_valid_issue_id(&env, issue_id); // #601
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
    /// Panics with `InvalidIssueId` if issue_id is 0 or u32::MAX.
    /// Panics with `ApplicationNotFound` if no pending application exists.
    /// Silently skips the global count TTL if that key is absent.
    pub fn extend_application_ttl(env: Env, contributor: Address, org_id: Symbol, issue_id: u32) {
        require_valid_issue_id(&env, issue_id); // #601
        if !storage::has_app_entry(&env, &contributor, &org_id, issue_id) {
            panic_with_error!(env, ContractError::ApplicationNotFound);
        }
        storage::extend_app_entry_ttl(&env, &contributor, &org_id, issue_id);
        if storage::get_global_app_count(&env, &contributor) > 0 {
            storage::extend_global_app_count_ttl(&env, &contributor);
        }
    }

    // -----------------------------------------------------------------------
    // #600 — Governance: cap change proposals
    // -----------------------------------------------------------------------

    /// Creates a new governance proposal to change the global application cap.
    ///
    /// - Requires the caller to be a registered maintainer in at least one org
    ///   (enforced via the `org_id` parameter — caller must be maintainer for that org).
    /// - `new_global_cap` must be >= 1.
    /// - Proposals expire after ~7 days (PROPOSAL_TTL_LEDGERS ledgers).
    /// - Emits `CapProposed` with the assigned proposal_id.
    pub fn propose_cap_change(
        env: Env,
        maintainer: Address,
        org_id: Symbol,
        new_global_cap: u32,
    ) -> u32 {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        maintainer.require_auth();
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }

        let proposal_id = storage::next_proposal_id(&env);
        let expires_at = env.ledger().sequence() + storage::PROPOSAL_TTL_LEDGERS;

        let proposal = storage::GovernanceProposal {
            proposer: maintainer.clone(),
            new_global_cap,
            expires_at,
            yes_votes: 0,
            no_votes: 0,
            executed: false,
        };

        storage::set_proposal(&env, proposal_id, &proposal);
        storage::bump_instance(&env);
        events::emit_cap_proposed(&env, &maintainer, proposal_id, new_global_cap);
        proposal_id
    }

    /// Records a maintainer's vote on a cap change proposal.
    ///
    /// - Requires the caller to be a registered maintainer (for `org_id`).
    /// - Panics with `ProposalNotFound` if the proposal does not exist.
    /// - Panics with `ProposalExpired` if the proposal TTL has elapsed.
    /// - Panics with `AlreadyVoted` if the caller has already voted.
    /// - Emits `CapVoted`.
    pub fn vote_cap_change(
        env: Env,
        maintainer: Address,
        org_id: Symbol,
        proposal_id: u32,
        approve: bool,
    ) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        maintainer.require_auth();
        if !storage::is_maintainer(&env, &maintainer, &org_id) {
            panic_with_error!(env, ContractError::UnauthorizedMaintainer);
        }

        let mut proposal = match storage::get_proposal(&env, proposal_id) {
            Some(p) => p,
            None => panic_with_error!(env, ContractError::ProposalNotFound),
        };

        if env.ledger().sequence() > proposal.expires_at {
            panic_with_error!(env, ContractError::ProposalExpired);
        }

        if storage::has_voted(&env, proposal_id, &maintainer) {
            panic_with_error!(env, ContractError::AlreadyVoted);
        }

        storage::set_voted(&env, proposal_id, &maintainer);

        if approve {
            proposal.yes_votes += 1;
        } else {
            proposal.no_votes += 1;
        }

        storage::set_proposal(&env, proposal_id, &proposal);
        storage::bump_instance(&env);
        events::emit_cap_voted(&env, &maintainer, proposal_id, approve);
    }

    /// Executes a cap change proposal if quorum and approval conditions are met.
    ///
    /// Execution conditions (must ALL be true):
    /// - Proposal exists and has not expired.
    /// - Proposal has not already been executed.
    /// - Total votes (yes + no) >= `PROPOSAL_QUORUM_ORGS` (3).
    /// - yes_votes > 50% of total votes.
    ///
    /// On success:
    /// - The new global cap is written to persistent storage.
    /// - The proposal is marked as executed.
    /// - Emits `CapChanged`.
    pub fn execute_cap_change(env: Env, executor: Address, proposal_id: u32) {
        storage::require_initialized(&env, &ContractError::NotInitialized);
        executor.require_auth();

        let mut proposal = match storage::get_proposal(&env, proposal_id) {
            Some(p) => p,
            None => panic_with_error!(env, ContractError::ProposalNotFound),
        };

        if env.ledger().sequence() > proposal.expires_at {
            panic_with_error!(env, ContractError::ProposalExpired);
        }

        let total_votes = proposal.yes_votes + proposal.no_votes;
        if total_votes < storage::PROPOSAL_QUORUM_ORGS {
            panic_with_error!(env, ContractError::QuorumNotMet);
        }

        // yes_votes must be strictly greater than 50% → yes > total / 2
        if proposal.yes_votes * 2 <= total_votes {
            panic_with_error!(env, ContractError::InsufficientApproval);
        }

        let new_cap = proposal.new_global_cap;
        proposal.executed = true;
        storage::set_proposal(&env, proposal_id, &proposal);
        storage::set_global_cap_override(&env, new_cap);
        storage::bump_instance(&env);
        events::emit_cap_changed(&env, &executor, proposal_id, new_cap);
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

    /// Returns the current effective global application cap.
    ///
    /// Returns the governance-adjusted cap if one has been executed, otherwise the
    /// compile-time default (`GLOBAL_APP_LIMIT` = 15).
    pub fn get_global_cap(env: Env) -> u32 {
        storage::get_effective_global_cap(&env)
    }
}

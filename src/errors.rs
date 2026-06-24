//! ContractError — typed numeric error codes for WorkloadGovernor.
//!
//! Every variant maps to a stable `u32` discriminant that is encoded on-chain.
//! Clients can match against these codes to provide user-friendly error messages.

use soroban_sdk::contracterror;

/// All error conditions that the WorkloadGovernor contract can raise.
///
/// Variants are `#[repr(u32)]` so the discriminant value is part of the public API
/// and **must not change** after mainnet deployment.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    /// `initialize` was called on a contract that has already been initialised.
    /// Discriminant: `1`.
    AlreadyInitialized = 1,

    /// A state-changing function was called before `initialize` completed.
    /// Discriminant: `2`.
    NotInitialized = 2,

    /// The provided admin address did not pass `require_auth`.
    /// Discriminant: `3`.
    UnauthorizedAdmin = 3,

    /// The caller is not a registered maintainer for the requested organisation.
    /// Discriminant: `4`.
    UnauthorizedMaintainer = 4,

    /// The contributor address did not pass `require_auth`.
    /// Discriminant: `5`.
    UnauthorizedContributor = 5,

    /// The contributor already holds [`storage::GLOBAL_APP_LIMIT`] (15) pending applications.
    /// Discriminant: `6`.
    GlobalApplicationLimitReached = 6,

    /// The contributor already holds [`storage::ORG_ASSIGNMENT_LIMIT`] (4) active assignments
    /// in the target organisation.
    /// Discriminant: `7`.
    OrgAssignmentLimitReached = 7,

    /// An application for this `(contributor, org_id, issue_id)` triple already exists.
    /// Discriminant: `8`.
    DuplicateApplication = 8,

    /// No pending application was found for the given `(contributor, org_id, issue_id)` triple.
    /// Discriminant: `9`.
    ApplicationNotFound = 9,

    /// No active assignment was found for the given `(org_id, issue_id, contributor)` triple.
    /// Discriminant: `10`.
    AssignmentNotFound = 10,

    /// An active assignment already exists for this issue and contributor.
    /// Discriminant: `11`.
    AlreadyAssigned = 11,
}

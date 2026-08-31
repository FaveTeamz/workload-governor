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

    /// More than [`crate::SNAPSHOT_ORG_LIMIT`] (10) org IDs were supplied to
    /// `get_contributor_snapshot`.
    /// Discriminant: `12`.
    CapOutOfRange = 12,

    /// The specified maintainer is not registered for the given organisation.
    /// Returned by `deregister_maintainer` when attempting to deregister a maintainer
    /// that was never registered (or was already deregistered).
    /// Discriminant: `17`.
    MaintainerNotFound = 17,

    /// The org/global assignment counter is out of sync with the assignment sentinels.
    /// This should never occur in normal operation; it indicates storage corruption.
    /// Discriminant: `13`.
    CounterInconsistency = 13,

    /// The provided org cap value is outside the permitted range `[ORG_CAP_MIN, ORG_CAP_MAX]`.
    /// Returned by `set_org_cap` when `new_cap` is 0 or > 20.
    /// Discriminant: `14`.
    InvalidOrgCap = 14,

    /// The contract is currently paused. All state-changing operations are blocked.
    /// Discriminant: `15`.
    ContractPaused = 15,
}

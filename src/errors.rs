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

    /// The referenced `org_id` has no registered maintainers and has never been
    /// initialised via `register_maintainer` or `set_org_cap`. Raised by maintainer
    /// functions before the `UnauthorizedMaintainer` check so callers can distinguish
    /// "org doesn't exist" from "you're not authorised for this org".
    /// Discriminant: `12`.
    OrgNotFound = 12,

    /// Detected a mismatch between the org assignment counter and the actual
    /// set of assignment sentinels. Indicates storage corruption or a failed migration.
    /// Discriminant: `13`.
    CounterInconsistency = 13,

    /// The requested global cap value is outside the permitted range `[0, 100]`.
    /// Returned by `emergency_set_global_cap` and `set_global_cap` when `new_cap > 100`.
    /// Discriminant: `14`.
    CapOutOfRange = 14,

    /// The org assignment cap supplied to `set_org_cap` is outside the permitted range
    /// `[ORG_CAP_MIN, ORG_CAP_MAX]`.
    /// Discriminant: `15`.
    InvalidOrgCap = 15,

    /// Detected a mismatch between the org assignment counter and the actual
    /// assignment sentinel entries (storage corruption guard).
    /// Discriminant: `13`.
    CounterInconsistency = 13,

    /// The requested per-org assignment cap is outside the permitted range `[1, 20]`.
    /// Returned by `set_org_cap` when `new_cap` is 0 or > 20.
    /// Discriminant: `14`.
    InvalidOrgCap = 14,

    /// The specified maintainer is not registered for the given organisation.
    /// Returned by `deregister_maintainer` when attempting to deregister a maintainer
    /// that was never registered (or was already deregistered).
    /// Discriminant: `17`.
    MaintainerNotFound = 17,

    /// A counter/sentinel inconsistency was detected in persistent storage.
    ///
    /// Fired by `revoke_assignment` and `complete_assignment` (and their debug
    /// assertions in `assign_issue`) when the assignment sentinel exists but the
    /// org assignment counter is unexpectedly zero (or vice-versa).  This indicates
    /// a storage migration issue or a data-corruption event and should be treated
    /// as a fatal internal error.
    ///
    /// Discriminant: `13`.
    CounterInconsistency = 13,

    /// A re-entrant call was detected: a state-mutating function was entered while
    /// another state-mutating function on this contract was already executing.
    ///
    /// Under Soroban's single-threaded execution model this should never fire in
    /// production.  It exists as a forward-looking guard for when cross-contract
    /// calls are added, and as evidence that the contract explicitly defends against
    /// re-entrancy at a protocol level.
    ///
    /// Discriminant: `14`.
    ReentrancyDetected = 14,

    /// The requested per-org assignment cap is outside the permitted range `[1, 20]`.
    /// Returned by `set_org_cap` when `new_cap == 0 || new_cap > 20`.
    /// Discriminant: `15`.
    InvalidOrgCap = 15,
}

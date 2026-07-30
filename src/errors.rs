//! ContractError — typed numeric error codes for WorkloadGovernor.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized            = 1,
    NotInitialized                = 2,
    UnauthorizedAdmin             = 3,
    UnauthorizedMaintainer        = 4,
    UnauthorizedContributor       = 5,
    GlobalApplicationLimitReached = 6,
    OrgAssignmentLimitReached     = 7,
    DuplicateApplication          = 8,
    ApplicationNotFound           = 9,
    AssignmentNotFound            = 10,
    AlreadyAssigned               = 11,
    InvalidCapValue               = 14,
    BatchTooLarge                 = 15,
}

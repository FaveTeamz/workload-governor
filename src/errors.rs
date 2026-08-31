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

    // #602 — Storage migration
    /// `migrate_v1_to_v2` was already called; migration cannot run twice.
    MigrationAlreadyDone          = 12,

    // #601 — issue_id validation
    /// `issue_id` must be > 0 and < u32::MAX (GitHub IDs start at 1; u32::MAX is reserved).
    InvalidIssueId                = 13,

    // #603 — Multi-sig admin
    /// Threshold must be >= 1 and <= the number of signers.
    InvalidThreshold              = 14,

    // #600 — Governance proposals
    /// No proposal exists with the given proposal_id.
    ProposalNotFound              = 15,
    /// Proposal TTL has elapsed; it can no longer be voted on or executed.
    ProposalExpired               = 16,
    /// Caller has already voted on this proposal.
    AlreadyVoted                  = 17,
    /// Fewer than 3 orgs have voted; quorum is not met.
    QuorumNotMet                  = 18,
    /// Less than 50 % of votes are approvals; proposal is rejected.
    InsufficientApproval          = 19,
}

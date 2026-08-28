# Error Reference

Complete list of error codes for WorkloadGovernor.

| Code | Variant | Trigger |
|---|---|---|
| 1 | `AlreadyInitialized` | `initialize` called twice |
| 2 | `NotInitialized` | State-changing call before `initialize` |
| 3 | `UnauthorizedAdmin` | Wrong admin credentials |
| 4 | `UnauthorizedMaintainer` | Maintainer not registered for org |
| 5 | `UnauthorizedContributor` | Auth failure on contributor call |
| 6 | `GlobalApplicationLimitReached` | Contributor has hit the global cap (default 15, adjustable via governance) |
| 7 | `OrgAssignmentLimitReached` | Contributor has 4 active assignments in org |
| 8 | `DuplicateApplication` | Same (contributor, org, issue) applied twice |
| 9 | `ApplicationNotFound` | Application does not exist |
| 10 | `AssignmentNotFound` | Assignment does not exist |
| 11 | `AlreadyAssigned` | Issue already has an active assignment |
| 12 | `MigrationAlreadyDone` | `migrate_v1_to_v2` called a second time |
| 13 | `InvalidIssueId` | `issue_id` is 0 or u32::MAX — GitHub IDs start at 1; u32::MAX is reserved |
| 14 | `InvalidThreshold` | Multi-sig threshold is 0 or exceeds signer count |
| 15 | `ProposalNotFound` | Governance `proposal_id` does not exist |
| 16 | `ProposalExpired` | Proposal TTL (~7 days) elapsed before execution |
| 17 | `AlreadyVoted` | Maintainer has already voted on this proposal |
| 18 | `QuorumNotMet` | Total votes (yes + no) < 3 at execution time |
| 19 | `InsufficientApproval` | Yes votes are <= 50% of total votes |

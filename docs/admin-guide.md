# Admin Guide

Operational guide for WorkloadGovernor contract administrators.

## Single-Admin Mode (Default)

After `initialize`, the contract is in single-admin mode. The stored admin
address must sign every admin operation:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <admin-account> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id myorg
```

## Multi-Sig Admin Setup (#603)

To require M-of-N signatures for admin operations, call `set_admin_threshold`:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <admin-account> \
  -- set_admin_threshold \
  --threshold 2 \
  --signers '["GSIGNER1ADDRESS", "GSIGNER2ADDRESS", "GSIGNER3ADDRESS"]'
```

### Rules

- `threshold` must be >= 1 and <= `len(signers)`.
- Signers are an **ordered list**. When an admin operation is submitted,
  the first `threshold` signers in the list must each provide `require_auth`.
- The Stellar protocol enforces multi-sig: all required `require_auth` calls
  must be satisfied in a single transaction.
- The admin address itself is always required regardless of threshold.

### 2-of-3 Example

```bash
# Set up 2-of-3: any 2 of [alice, bob, carol] must sign
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \           # alice is the current stored admin
  -- set_admin_threshold \
  --threshold 2 \
  --signers '["GALICE", "GBOB", "GCAROL"]'

# Now register_maintainer requires: stored_admin + alice + bob (first 2 of 3)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --auth GALICE,GBOB \       # both must sign
  --source alice \
  -- register_maintainer \
  --admin GALICE \
  --maintainer GMAINTAINER \
  --org_id acme
```

### Resetting to Single-Admin

To remove multi-sig, call `set_admin_threshold` with threshold=1 and a
single-element signers list containing only the admin address.

## Error Reference

| Code | Variant | Trigger |
|---|---|---|
| 1 | `AlreadyInitialized` | `initialize` called twice |
| 2 | `NotInitialized` | State-changing call before `initialize` |
| 3 | `UnauthorizedAdmin` | Wrong admin credentials |
| 4 | `UnauthorizedMaintainer` | Maintainer not registered for org |
| 5 | `UnauthorizedContributor` | Auth failure on contributor call |
| 6 | `GlobalApplicationLimitReached` | Contributor has hit the global cap |
| 7 | `OrgAssignmentLimitReached` | Contributor has 4 active assignments in org |
| 8 | `DuplicateApplication` | Same (contributor, org, issue) applied twice |
| 9 | `ApplicationNotFound` | Application does not exist |
| 10 | `AssignmentNotFound` | Assignment does not exist |
| 11 | `AlreadyAssigned` | Issue already has an active assignment |
| 12 | `MigrationAlreadyDone` | `migrate_v1_to_v2` called a second time |
| 13 | `InvalidIssueId` | `issue_id` is 0 or u32::MAX |
| 14 | `InvalidThreshold` | Threshold is 0 or exceeds signer count |
| 15 | `ProposalNotFound` | Governance proposal ID does not exist |
| 16 | `ProposalExpired` | Proposal TTL elapsed |
| 17 | `AlreadyVoted` | Maintainer voted twice on same proposal |
| 18 | `QuorumNotMet` | Total votes < 3 at execution time |
| 19 | `InsufficientApproval` | yes votes <= 50% of total votes |

## issue_id Validation (#601)

The contract rejects `issue_id` values of **0** and **u32::MAX** (4 294 967 295)
with error code 13 (`InvalidIssueId`). GitHub issue IDs start at 1, so 0 is
never valid. u32::MAX is reserved as a sentinel value to prevent misuse.

Valid range: `1 <= issue_id <= 4 294 967 294`.

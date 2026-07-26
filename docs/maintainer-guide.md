# Maintainer Guide

This guide covers everything a maintainer needs to manage contributor workloads on the WorkloadGovernor contract.

## Getting Registered

Maintainers are not self-service. An admin must call `register_maintainer` for each org you need access to:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-account> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <YOUR_ADDRESS> \
  --org_id <ORG_ID>
```

Registration is per-org. If you maintain two organizations, the admin must call this once for each. Registration is idempotent — calling it again for the same (maintainer, org) pair is a no-op.

On-chain effect: writes `("maint", maintainer, org_id) → true` to persistent storage.

## Reviewing Applications

Before assigning an issue, confirm a contributor has applied. Use the read-only query — no auth required:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- has_applied \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

Returns `true` if a pending application exists. You can also check how many active assignments a contributor already holds in your org:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_org_assignment_count \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <ORG_ID>
```

## Step-by-Step: Assign an Issue

**Preconditions:** the contributor must have called `apply_for_issue` first, and must have fewer than 4 active assignments in the org.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <your-maintainer-account> \
  -- assign_issue \
  --maintainer <YOUR_ADDRESS> \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

On-chain effect:
1. Removes the pending application entry (`("app", contributor, org_id, issue_id)`).
2. Decrements the contributor's global application count (`("g_apps", contributor)`).
3. Increments the contributor's org assignment count (`("o_asgn", contributor, org_id)`).
4. Writes the assignment entry (`("asgn", org_id, issue_id, contributor) → true`).
5. Emits an `assigned` event.

## Step-by-Step: Complete an Assignment

Call this when the contributor has finished the work and the issue is resolved.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <your-maintainer-account> \
  -- complete_assignment \
  --maintainer <YOUR_ADDRESS> \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

On-chain effect:
1. Removes the assignment entry (`("asgn", org_id, issue_id, contributor)`).
2. Decrements the contributor's org assignment count. Removes the count key entirely if it reaches 0.
3. Emits a `completed` event.

This frees one slot in the contributor's org assignment count, allowing them to be assigned other issues.

## Step-by-Step: Revoke an Assignment

Call this to cancel an active assignment — for example, if the contributor becomes unresponsive or the issue is re-scoped.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <your-maintainer-account> \
  -- revoke_assignment \
  --maintainer <YOUR_ADDRESS> \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

On-chain effect: identical to `complete_assignment` in terms of storage mutations, but emits a `revoked` event instead of `completed`. The contributor's application is not restored — they would need to re-apply if they want to be considered again.

## Error Reference

| Code | Variant | Trigger | Remedy |
|------|---------|---------|--------|
| 2 | `NotInitialized` | Contract has not been initialized yet | Contact the platform admin |
| 4 | `UnauthorizedMaintainer` | Your address is not registered for this org | Ask the admin to call `register_maintainer` for your address and org |
| 9 | `ApplicationNotFound` | Contributor has no pending application for this issue | Verify with `has_applied`; the application may have expired or been withdrawn |
| 10 | `AssignmentNotFound` | No active assignment exists for this contributor/issue | Verify with `is_assigned`; it may have already been completed or revoked |
| 11 | `AlreadyAssigned` | Another contributor is already assigned to this issue | Query `is_assigned` to identify who holds the assignment |
| 7 | `OrgAssignmentLimitReached` | Contributor already has 4 active assignments in this org | Wait for one of their existing assignments to be completed or revoked |

## Guard Order

Every maintainer function checks preconditions in this order before mutating state:

1. Contract is initialized (`NotInitialized`)
2. Maintainer signature verified (`require_auth`)
3. Maintainer is registered for the org (`UnauthorizedMaintainer`)
4. Relevant entry exists — application or assignment (`ApplicationNotFound` / `AssignmentNotFound`)
5. Capacity/uniqueness checks — only on `assign_issue` (`OrgAssignmentLimitReached`, `AlreadyAssigned`)

If any check fails the transaction reverts with no state changes.

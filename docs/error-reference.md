# Error Reference

All errors raised by WorkloadGovernor are variants of `ContractError` — a `#[contracterror]` enum with stable `u32` discriminants. The discriminant is encoded on-chain and returned to callers when a transaction fails.

## Complete Error Table

| Code | Variant | Trigger condition | How to resolve |
|---|---|---|---|
| 1 | `AlreadyInitialized` | `initialize` was called on an already-initialised contract | Do not call `initialize` more than once. Check contract state with `get_global_application_count` or read the admin key before deploying. |
| 2 | `NotInitialized` | Any state-changing function was called before `initialize` completed | Call `initialize` first and confirm the transaction was accepted before invoking other functions. |
| 3 | `UnauthorizedAdmin` | The `admin` argument did not pass `require_auth` — wrong signer or wrong address | Ensure the transaction is signed by the exact admin address stored on-chain. |
| 4 | `UnauthorizedMaintainer` | The caller is not a registered maintainer for the given `org_id` | Have the admin call `register_maintainer` for this address/org pair before calling maintainer-only functions. |
| 5 | `UnauthorizedContributor` | The contributor address did not pass `require_auth` | Ensure the transaction is signed by the contributor whose address is passed in. |
| 6 | `GlobalApplicationLimitReached` | Contributor already holds 15 pending applications across all orgs | Withdraw at least one existing application with `withdraw_application`, then retry. |
| 7 | `OrgAssignmentLimitReached` | Contributor already holds 4 active assignments in the target org | Wait for existing assignments in that org to be completed or revoked, then retry. |
| 8 | `DuplicateApplication` | An application for this `(contributor, org_id, issue_id)` triple already exists | No action needed — the application already exists. To reset it, call `withdraw_application` first. |
| 9 | `ApplicationNotFound` | No pending application found for the given triple | The application may have expired (Wave TTL elapsed) or was never submitted. Re-apply with `apply_for_issue`. |
| 10 | `AssignmentNotFound` | No active assignment found for the given `(org_id, issue_id, contributor)` triple | The assignment does not exist or was already removed. Verify the triple with `is_assigned` before calling. |
| 11 | `AlreadyAssigned` | An active assignment already exists for this issue and contributor | Call `complete_assignment` or `revoke_assignment` to close the existing assignment before re-assigning. |
| 13 | `CounterInconsistency` | The org assignment counter is `0` while the assignment entry still exists — storage was corrupted or manually zeroed by a migration script | Restore the counter to the correct value via a migration script, then retry. |

---

## Example Scenarios

### Code 6 — `GlobalApplicationLimitReached`

Alice submits her 15th application successfully. She then tries to apply for a 16th issue:

```
apply_for_issue(alice, "org-a", 99)
→ ContractError::GlobalApplicationLimitReached (6)
```

**Resolution:** Alice calls `withdraw_application(alice, "org-b", 7)` to free one slot, then retries.

---

### Code 7 — `OrgAssignmentLimitReached`

Bob has 4 active assignments in `"org-x"`. A maintainer tries to assign him a fifth:

```
assign_issue(maintainer, bob, "org-x", 55)
→ ContractError::OrgAssignmentLimitReached (7)
```

**Resolution:** The maintainer calls `complete_assignment` or `revoke_assignment` for one of Bob's existing `"org-x"` assignments.

---

### Code 8 — `DuplicateApplication`

Carol applies for issue 12 in `"org-c"`. She accidentally calls `apply_for_issue` again:

```
apply_for_issue(carol, "org-c", 12)  -- first call succeeds
apply_for_issue(carol, "org-c", 12)  -- second call fails
→ ContractError::DuplicateApplication (8)
```

**Resolution:** No action needed if the intent was to apply once. To restart the application, withdraw it first.

---

### Code 9 — `ApplicationNotFound`

Dave's application for issue 7 expired when the Wave TTL elapsed. A maintainer tries to assign it:

```
assign_issue(maintainer, dave, "org-d", 7)
→ ContractError::ApplicationNotFound (9)
```

**Resolution:** Dave must call `apply_for_issue` again. If within an active Wave, he can also call `extend_application_ttl` proactively to prevent expiry.

---

### Code 10 — `AssignmentNotFound`

A maintainer tries to complete an assignment that was already revoked:

```
complete_assignment(maintainer, eve, "org-e", 3)
→ ContractError::AssignmentNotFound (10)
```

**Resolution:** Verify current state with `is_assigned(eve, "org-e", 3)`. If it returns `false`, the assignment is gone — no further action required.

---

### Code 11 — `AlreadyAssigned`

Issue 20 is already assigned to Frank. A maintainer tries to assign it again (possibly to someone else):

```
assign_issue(maintainer, frank, "org-f", 20)
→ ContractError::AlreadyAssigned (11)
```

**Resolution:** Call `complete_assignment` or `revoke_assignment` for the existing assignment first.

---

### Code 13 — `CounterInconsistency`

A migration script zeroes the org assignment counter for Grace while her assignment entry still exists. A maintainer then tries to revoke it:

```
revoke_assignment(maintainer, grace, "org-g", 5)
→ ContractError::CounterInconsistency (13)
```

**Resolution:** Run a corrective migration to restore the counter to the correct value (equal to the number of active assignment entries for the contributor in that org), then retry.

---

## Errors by Contract Function

| Function | Possible error codes |
|---|---|
| `initialize` | 1, 3 |
| `register_maintainer` | 2, 3 |
| `upgrade` | 2, 3 |
| `apply_for_issue` | 2, 5, 6, 8 |
| `withdraw_application` | 2, 5, 9 |
| `assign_issue` | 2, 4, 9, 7, 11 |
| `complete_assignment` | 2, 4, 10 |
| `revoke_assignment` | 2, 4, 10, 13 |
| `extend_application_ttl` | 9 |
| `get_global_application_count` | — |
| `get_org_assignment_count` | — |
| `has_applied` | — |
| `is_assigned` | — |

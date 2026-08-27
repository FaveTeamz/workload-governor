# Error Reference

All errors raised by WorkloadGovernor are variants of `ContractError` — a `#[contracterror]` enum with stable `u32` discriminants. The discriminant is encoded on-chain and returned to callers when a transaction fails.

## Troubleshooting Flowchart

Start here when a contract call fails. Follow the branch matching the error code returned.

```
Contract call failed?
│
├─ Code 1  AlreadyInitialized      → Was initialize() called twice?          → #error-1-alreadyinitialized
├─ Code 2  NotInitialized          → Was initialize() skipped?               → #error-2-notinitialized
├─ Code 3  UnauthorizedAdmin       → Wrong signer on an admin call?          → #error-3-unauthorizedadmin
├─ Code 4  UnauthorizedMaintainer  → Caller not registered as maintainer?    → #error-4-unauthorizedmaintainer
├─ Code 5  UnauthorizedContributor → Transaction not signed by contributor?  → #error-5-unauthorizedcontributor
├─ Code 6  GlobalApplicationLimitReached → Contributor has 15 applications?  → #error-6-globalapplicationlimitreached
├─ Code 7  OrgAssignmentLimitReached     → Contributor has 4 assignments?    → #error-7-orgassignmentlimitreached
├─ Code 8  DuplicateApplication    → Same issue applied twice?               → #error-8-duplicateapplication
├─ Code 9  ApplicationNotFound     → Application expired or never existed?   → #error-9-applicationnotfound
├─ Code 10 AssignmentNotFound      → Assignment already removed?             → #error-10-assignmentnotfound
├─ Code 11 AlreadyAssigned         → Issue already has active assignment?    → #error-11-alreadyassigned
└─ Code 13 CounterInconsistency    → Storage corruption / bad migration?     → #error-13-counterinconsistency
```

---

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
| 17 | `MaintainerNotFound` | `deregister_maintainer` was called for a `(maintainer, org_id)` pair that is not currently registered | Verify the maintainer is registered before deregistering. Check that the correct address and `org_id` are supplied. |

---

### Error 2 — `NotInitialized`

**Description**

A state-changing function was invoked before `initialize` completed successfully. All functions that mutate state guard themselves with `require_initialized`, which panics with this error if the `"admin"` key is absent from storage.

**Who Encounters This**

- **Admin** — calling `register_maintainer` or `upgrade` before `initialize`.
- **Contributors** — calling `apply_for_issue` or `withdraw_application` on a freshly deployed but not yet initialised contract.
- **Maintainers** — calling `assign_issue`, `complete_assignment`, or `revoke_assignment` before setup is complete.

**Root Cause**

The contract requires an admin address on-chain before any privileged operation can proceed. If `initialize` has not been called, or if its transaction failed to land, the guard fires. Note that `extend_application_ttl` does **not** check `NotInitialized` — it only checks whether the application entry exists.

**Example Scenario**

An integrator deploys the contract but the `initialize` transaction times out. They proceed to call `apply_for_issue`:

```
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source alice-account \
  -- apply_for_issue \
  --contributor GBFZB...XK2Q \
  --org_id rust_foundation --issue_id 1024
→ ContractError::NotInitialized (2)
```

**Resolution Steps**

1. Call `initialize` with the admin address:
   ```
   stellar contract invoke --id CCHKV...3BPQ \
     --network testnet --source admin-account \
     -- initialize --admin GDXYZ...7MNP
   ```
2. Wait for the transaction to be confirmed (check with `stellar transaction status`).
3. Retry the original call.

---

### Error 3 — `UnauthorizedAdmin`

**Description**

An admin-only function (`register_maintainer`, `upgrade`) was called, but the transaction was not signed by the admin address that is stored on-chain. Soroban's `require_auth` enforces this at the VM level — if the stored admin's signature is absent from the transaction's auth entries, the call is rejected.

**Who Encounters This**

- **Admin** — when using the wrong signing key, wrong account alias, or when the admin address has been rotated via an upgrade but the caller is still using the old key.
- **Maintainers or contributors** — if they accidentally call admin-only functions.

**Root Cause**

`register_maintainer` and `upgrade` retrieve the stored admin address and call `stored_admin.require_auth()`. The transaction must include a valid auth entry for that exact address. Passing a different address as the `admin` argument does not matter — auth is checked against the **stored** address, not the argument.

**Example Scenario**

A developer rotates the admin key in their local config but the on-chain contract still holds the old address:

```
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source new-admin-account \
  -- register_maintainer \
  --admin GNEW1...ABCD \
  --maintainer GMAIN...5678 \
  --org_id rust_foundation
→ ContractError::UnauthorizedAdmin (3)
```

**Resolution Steps**

1. Query the stored admin address:
   ```
   stellar contract storage --id CCHKV...3BPQ --network testnet \
     --key '"admin"'
   ```
2. Ensure the `--source` account in your CLI command matches the stored admin address exactly.
3. If the admin key has genuinely been lost, contract governance must be resolved at the infrastructure level — there is no on-chain recovery path without the original key.

---

### Error 4 — `UnauthorizedMaintainer`

**Description**

A maintainer-only function (`assign_issue`, `complete_assignment`, `revoke_assignment`) was invoked by an address that has not been registered as a maintainer for the specified `org_id`. Registration is per `(maintainer, org_id)` pair, so a maintainer registered for `rust_foundation` cannot act on issues in `stellar_core` without a separate registration.

**Who Encounters This**

- **Maintainers** — calling issue management functions before the admin has registered them for the target org, or for the wrong org ID.
- **Contributors or admins** — accidentally calling maintainer-only functions.

**Root Cause**

The contract checks `storage::is_maintainer(&env, &maintainer, &org_id)` after verifying auth. If no persistent entry exists for the `("maint", maintainer, org_id)` key, this guard fires.

**Example Scenario**

A maintainer is registered for `rust_foundation` but tries to assign an issue in `stellar_core`:

```
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source maintainer-account \
  -- assign_issue \
  --maintainer GMAIN...5678 \
  --contributor GBFZB...XK2Q \
  --org_id stellar_core --issue_id 2048
→ ContractError::UnauthorizedMaintainer (4)
```

**Resolution Steps**

1. Have the admin call `register_maintainer` for the correct `(maintainer, org_id)` pair:
   ```
   stellar contract invoke --id CCHKV...3BPQ \
     --network testnet --source admin-account \
     -- register_maintainer \
     --admin GDXYZ...7MNP \
     --maintainer GMAIN...5678 \
     --org_id stellar_core
   ```
2. Confirm registration by checking storage or by retrying the original call.
3. Verify you are using the correct `org_id` symbol — org IDs are case-sensitive Soroban Symbols.

---

### Error 5 — `UnauthorizedContributor`

**Description**

A contributor function (`apply_for_issue`, `withdraw_application`) was called but the transaction was not signed by the contributor address passed as an argument. This prevents one contributor from submitting or withdrawing applications on behalf of another.

**Who Encounters This**

- **Contributors** — when using a wallet that does not hold the key for the address passed as `contributor`, or when a frontend sends the wrong address.
- **Backend services** — if a service attempts to call contributor functions server-side without the contributor's signature.

**Root Cause**

`contributor.require_auth()` is called immediately after initialisation check. Soroban validates the auth entry in the transaction envelope. If no valid signature for `contributor` is present, the call fails.

**Example Scenario**

A frontend builds a transaction with Alice's address but the connected wallet is Bob's:

```
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source bob-account \
  -- apply_for_issue \
  --contributor GBFZB...XK2Q \   # Alice's address
  --org_id rust_foundation --issue_id 512
→ ContractError::UnauthorizedContributor (5)
```

**Resolution Steps**

1. Ensure the `--source` account (signer) matches the `--contributor` argument exactly.
2. In frontend integrations, retrieve the connected wallet's public key first and use it as the `contributor` argument when building the transaction.
3. If using the REST API to build a transaction, confirm the `contributor` field in the request body matches the wallet that will sign.

---

### Error 6 — `GlobalApplicationLimitReached`

**Description**

A contributor attempted to submit a new application but already holds the maximum of 15 pending applications across all organisations. The global cap is a hard limit enforced by the contract to prevent a single contributor from reserving too many issues simultaneously.

**Who Encounters This**

- **Contributors** — when they already have 15 active pending applications and try to apply for another issue.
- **Frontend / integrators** — if the UI does not proactively check `get_global_application_count` before allowing the apply action.

**Root Cause**

`apply_for_issue` reads the `("g_apps", contributor)` temporary counter. If `count >= GLOBAL_APP_LIMIT` (15), the call panics before writing anything. The check fires even if some applications are in different orgs.

**Example Scenario**

Alice has submitted 15 applications across several orgs. She tries to apply for a 16th:

```
# Alice already has 15 pending applications
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source alice-account \
  -- apply_for_issue \
  --contributor GBFZB...XK2Q \
  --org_id rust_foundation --issue_id 999
→ ContractError::GlobalApplicationLimitReached (6)
```

**Resolution Steps**

1. Query Alice's current count:
   ```
   stellar contract invoke --id CCHKV...3BPQ --network testnet \
     -- get_global_application_count --contributor GBFZB...XK2Q
   ```
2. Withdraw one or more applications that are no longer needed:
   ```
   stellar contract invoke --id CCHKV...3BPQ \
     --network testnet --source alice-account \
     -- withdraw_application \
     --contributor GBFZB...XK2Q \
     --org_id stellar_core --issue_id 301
   ```
3. Retry `apply_for_issue` once the count drops below 15.
4. In the UI, display the current count (`get_global_application_count`) and disable the apply button when `count >= 15`.

---

### Error 7 — `OrgAssignmentLimitReached`

**Description**

A maintainer tried to assign an issue to a contributor who already holds 4 active assignments within the same organisation. The per-org cap prevents one contributor from monopolising all issues in a single org.

**Who Encounters This**

- **Maintainers** — when trying to assign a fifth issue to a contributor in the same org.
- **Integrators** — if the dashboard does not display current org assignment counts before attempting assignment.

**Root Cause**

`assign_issue` reads the `("o_asgn", contributor, org_id)` persistent counter. If `asgn_count >= ORG_ASSIGNMENT_LIMIT` (4) the call panics. This is checked before the `AlreadyAssigned` guard, so even if the specific issue is not yet assigned, the limit check takes priority.

**Example Scenario**

Bob has 4 active assignments in `rust_foundation`. A maintainer tries to give him a fifth:

```
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source maintainer-account \
  -- assign_issue \
  --maintainer GMAIN...5678 \
  --contributor GBOB1...2345 \
  --org_id rust_foundation --issue_id 777
→ ContractError::OrgAssignmentLimitReached (7)
```

**Resolution Steps**

1. Query Bob's current org assignment count:
   ```
   stellar contract invoke --id CCHKV...3BPQ --network testnet \
     -- get_org_assignment_count \
     --contributor GBOB1...2345 --org_id rust_foundation
   ```
2. Complete or revoke one of Bob's existing assignments to free a slot:
   ```
   stellar contract invoke --id CCHKV...3BPQ \
     --network testnet --source maintainer-account \
     -- complete_assignment \
     --maintainer GMAIN...5678 \
     --contributor GBOB1...2345 \
     --org_id rust_foundation --issue_id 502
   ```
3. Retry the `assign_issue` call.
4. In the UI, show `get_org_assignment_count` for the contributor and disable the assign action when the count reaches 4.

---

### Error 8 — `DuplicateApplication`

**Description**

A contributor called `apply_for_issue` for a `(contributor, org_id, issue_id)` triple that already has an active application entry in temporary storage. The contract treats this as an idempotent no-op guard rather than silently succeeding, so integrators must handle this error gracefully.

**Who Encounters This**

- **Contributors** — double-clicking an apply button, or retrying a transaction that already landed.
- **Integrators** — if the frontend doesn't check `has_applied` before submitting the transaction.

**Root Cause**

`apply_for_issue` calls `storage::has_app_entry` after the global limit check. If an entry already exists for the triple, `DuplicateApplication` is raised before any state is modified. The global counter is **not** incremented.

**Example Scenario**

Carol's browser submits the apply transaction and a network glitch causes the frontend to retry:

```
# First call — lands successfully
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source carol-account \
  -- apply_for_issue \
  --contributor GCAROL...9012 \
  --org_id stellar_core --issue_id 128

# Retry — fails
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source carol-account \
  -- apply_for_issue \
  --contributor GCAROL...9012 \
  --org_id stellar_core --issue_id 128
→ ContractError::DuplicateApplication (8)
```

**Resolution Steps**

1. This is not an error condition — the application already exists. Treat `DuplicateApplication` as a success equivalent in retry logic.
2. Verify the application exists:
   ```
   stellar contract invoke --id CCHKV...3BPQ --network testnet \
     -- has_applied \
     --contributor GCAROL...9012 \
     --org_id stellar_core --issue_id 128
   ```
3. If the application needs to be reset (e.g. the contributor wants to re-apply after a change), call `withdraw_application` first, then reapply.
4. In frontend code, check `has_applied` before building the apply transaction to avoid unnecessary failures.

---

### Error 9 — `ApplicationNotFound`

**Description**

A function that requires a pending application (`assign_issue`, `withdraw_application`, `extend_application_ttl`) could not find an application entry for the specified `(contributor, org_id, issue_id)` triple. The entry either never existed, was already withdrawn, or expired when the Wave TTL elapsed.

**Who Encounters This**

- **Contributors** — calling `withdraw_application` on an expired or already-withdrawn application.
- **Maintainers** — calling `assign_issue` on an issue whose application expired before they acted.
- **Anyone** — calling `extend_application_ttl` on a non-existent application.

**Root Cause**

Application entries are stored in **temporary** storage with a Wave TTL. When the TTL expires the Stellar network automatically removes the entry. If `has_app_entry` returns false, this error is raised. Note that `extend_application_ttl` does **not** check `NotInitialized` — it only checks for the entry's existence.

**Example Scenario**

Dave's application for issue 7 expired when the Wave ended. A maintainer tries to assign it:

```
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source maintainer-account \
  -- assign_issue \
  --maintainer GMAIN...5678 \
  --contributor GDAVE1...3456 \
  --org_id rust_foundation --issue_id 7
→ ContractError::ApplicationNotFound (9)
```

**Resolution Steps**

1. Check whether the application still exists:
   ```
   stellar contract invoke --id CCHKV...3BPQ --network testnet \
     -- has_applied \
     --contributor GDAVE1...3456 \
     --org_id rust_foundation --issue_id 7
   ```
2. If the application expired, the contributor must re-apply:
   ```
   stellar contract invoke --id CCHKV...3BPQ \
     --network testnet --source dave-account \
     -- apply_for_issue \
     --contributor GDAVE1...3456 \
     --org_id rust_foundation --issue_id 7
   ```
3. To prevent future expiry, the contributor (or anyone) can call `extend_application_ttl` before the Wave ends:
   ```
   stellar contract invoke --id CCHKV...3BPQ \
     --network testnet --source any-account \
     -- extend_application_ttl \
     --contributor GDAVE1...3456 \
     --org_id rust_foundation --issue_id 7
   ```

---

### Error 10 — `AssignmentNotFound`

**Description**

A function that requires an active assignment (`complete_assignment`, `revoke_assignment`) could not find an assignment entry for the specified `(org_id, issue_id, contributor)` triple. The assignment was either never created or has already been completed/revoked.

**Who Encounters This**

- **Maintainers** — calling `complete_assignment` or `revoke_assignment` on an assignment that was already closed, or on the wrong triple (e.g. wrong `issue_id`).
- **Automation scripts** — if they do not check `is_assigned` before attempting to close an assignment.

**Root Cause**

`complete_assignment` and `revoke_assignment` call `storage::has_assignment` after the maintainer auth check. Assignments are stored in **persistent** storage, so they do not expire — if the entry is absent, it was deliberately removed by a prior call.

**Example Scenario**

A maintainer accidentally calls `complete_assignment` twice on the same issue:

```
# First call — succeeds, removes the assignment entry
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source maintainer-account \
  -- complete_assignment \
  --maintainer GMAIN...5678 \
  --contributor GBFZB...XK2Q \
  --org_id stellar_core --issue_id 42

# Second call — fails
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source maintainer-account \
  -- complete_assignment \
  --maintainer GMAIN...5678 \
  --contributor GBFZB...XK2Q \
  --org_id stellar_core --issue_id 42
→ ContractError::AssignmentNotFound (10)
```

**Resolution Steps**

1. Verify current assignment state:
   ```
   stellar contract invoke --id CCHKV...3BPQ --network testnet \
     -- is_assigned \
     --contributor GBFZB...XK2Q \
     --org_id stellar_core --issue_id 42
   ```
2. If `is_assigned` returns `false`, the assignment is already closed — treat the original `AssignmentNotFound` as a success equivalent in idempotent retry logic.
3. Double-check the `issue_id` and `org_id` values — a typo in either will produce this error even when the assignment genuinely exists under the correct triple.

---

### Error 11 — `AlreadyAssigned`

**Description**

A maintainer called `assign_issue` but an active assignment already exists for the `(org_id, issue_id, contributor)` triple. The contract does not allow duplicate assignment entries.

**Who Encounters This**

- **Maintainers** — calling `assign_issue` a second time for the same (issue, contributor) combination, or when two maintainers race to assign the same issue.

**Root Cause**

`assign_issue` checks `storage::has_assignment` after the org limit check. If an entry already exists, `AlreadyAssigned` is raised. This guard fires even when the existing assignment is for the same contributor (i.e. you cannot reassign the same contributor to the same issue).

**Example Scenario**

Issue 20 in `stellar_core` is already assigned to Frank. A maintainer tries to assign it again:

```
stellar contract invoke --id CCHKV...3BPQ \
  --network testnet --source maintainer-account \
  -- assign_issue \
  --maintainer GMAIN...5678 \
  --contributor GFRANK...6789 \
  --org_id stellar_core --issue_id 20
→ ContractError::AlreadyAssigned (11)
```

**Resolution Steps**

1. Verify the current assignment:
   ```
   stellar contract invoke --id CCHKV...3BPQ --network testnet \
     -- is_assigned \
     --contributor GFRANK...6789 \
     --org_id stellar_core --issue_id 20
   ```
2. If the assignment is already active and correct, no further action is needed.
3. To reassign the issue (e.g. to a different contributor), first close the existing assignment:
   ```
   stellar contract invoke --id CCHKV...3BPQ \
     --network testnet --source maintainer-account \
     -- revoke_assignment \
     --maintainer GMAIN...5678 \
     --contributor GFRANK...6789 \
     --org_id stellar_core --issue_id 20
   ```
   Then call `assign_issue` for the new contributor (who must have a pending application first).

---

### Error 13 — `CounterInconsistency`

| Function | Possible error codes |
|---|---|
| `initialize` | 1, 3 |
| `register_maintainer` | 2, 3 |
| `deregister_maintainer` | 2, 3, 17 |
| `upgrade` | 2, 3 |
| `apply_for_issue` | 2, 5, 6, 8 |
| `withdraw_application` | 2, 5, 9 |
| `assign_issue` | 2, 4, 9, 7, 11 |
| `complete_assignment` | 2, 4, 10 |
| `revoke_assignment` | 2, 4, 10 |
| `extend_application_ttl` | 9 |
| `get_global_application_count` | — |
| `get_org_assignment_count` | — |
| `has_applied` | — |
| `is_assigned` | — |

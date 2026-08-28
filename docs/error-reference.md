# Error Reference

Complete reference for all 11 WorkloadGovernor error codes. Each entry includes the concrete trigger scenario, numbered resolution steps, and prevention guidance.

## Table of Contents

- [Error 1 — AlreadyInitialized](#error-1--alreadyinitialized)
- [Error 2 — NotInitialized](#error-2--notinitialized)
- [Error 3 — UnauthorizedAdmin](#error-3--unauthorizedadmin)
- [Error 4 — UnauthorizedMaintainer](#error-4--unauthorizedmaintainer)
- [Error 5 — UnauthorizedContributor](#error-5--unauthorizedcontributor)
- [Error 6 — GlobalApplicationLimitReached](#error-6--globalapplicationlimitreached)
- [Error 7 — OrgAssignmentLimitReached](#error-7--orgassignmentlimitreached)
- [Error 8 — DuplicateApplication](#error-8--duplicateapplication)
- [Error 9 — ApplicationNotFound](#error-9--applicationnotfound)
- [Error 10 — AssignmentNotFound](#error-10--assignmentnotfound)
- [Error 11 — AlreadyAssigned](#error-11--alreadyassigned)

---

## Error 1 — AlreadyInitialized

**Numeric code:** `1`  
**Soroban SDK type:** `ContractError::AlreadyInitialized`  
**Function:** `initialize`

### When it occurs

`initialize` has already been called once and stored an admin address. A second call to `initialize` — regardless of whether the same or a different admin address is passed — panics immediately with this error.

**Example scenario:**
```bash
# First call — succeeds
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $ADMIN -- initialize --admin $ADMIN

# Second call — panics with AlreadyInitialized
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $ADMIN -- initialize --admin $ADMIN
# Error: HostError: Value(ContractError(1))
```

### Resolution steps

1. Confirm the contract is already initialized by checking whether other state-changing calls (e.g., `register_maintainer`) succeed without a `NotInitialized` error.
2. If the contract is initialized with the wrong admin address, there is no in-contract fix — the contract does not expose an `update_admin` function.
3. If admin key rotation is needed, deploy a new contract instance and migrate state, or upgrade the WASM with a version that includes admin rotation.
4. If you are writing a deployment script, guard the `initialize` call: check whether `get_global_application_count` or any other read-only call returns without `NotInitialized`, which implies initialization already occurred.

### Prevention

- Call `initialize` exactly once in your deployment script.
- In automation, wrap the call in an idempotency check:
  ```bash
  # Attempt initialize; ignore AlreadyInitialized, fail on anything else
  stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
    --source $ADMIN -- initialize --admin $ADMIN 2>&1 \
    | grep -qv "ContractError(1)" || echo "Already initialized, continuing"
  ```

---

## Error 2 — NotInitialized

**Numeric code:** `2`  
**Soroban SDK type:** `ContractError::NotInitialized`  
**Functions:** All state-changing functions except `initialize`

### When it occurs

Any state-changing function is called before `initialize` has been executed. The contract checks for the presence of the admin key in persistent storage on every mutating call; if absent, this error fires immediately.

**Example scenario:**
```bash
# Contract has never been initialized
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $CONTRIBUTOR \
  -- apply_for_issue \
  --contributor $CONTRIBUTOR --org_id acme_org --issue_id 1
# Error: HostError: Value(ContractError(2))
```

### Resolution steps

1. Verify the contract has not been initialized by checking whether a known-good call (e.g., `has_applied`) returns silently or with `NotInitialized`.
2. Call `initialize` with the correct admin address:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $ADMIN -- initialize --admin $ADMIN
   ```
3. Retry the original call that failed.

### Prevention

- Always run `initialize` as the very first step after deployment.
- In integration test setups, call `initialize` in the test harness setup phase before exercising any other function.
- See [ORG_MANAGEMENT_GUIDE.md — Contract Initialization](ORG_MANAGEMENT_GUIDE.md#contract-initialization) for the full deployment sequence.

---

## Error 3 — UnauthorizedAdmin

**Numeric code:** `3`  
**Soroban SDK type:** `ContractError::UnauthorizedAdmin`  
**Functions:** `register_maintainer`, `upgrade`

### When it occurs

The address supplied as `admin` in the function call does not match the address stored during `initialize`, or the caller fails the Soroban authorization check for that address. The stored admin address must sign the transaction (or authorization must be mocked in tests).

**Example scenario:**
```bash
# $WRONG_ADMIN is not the registered admin
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $WRONG_ADMIN \
  -- register_maintainer \
  --admin $WRONG_ADMIN --maintainer $MAINTAINER --org_id acme_org
# Error: HostError: Value(ContractError(3))
```

### Resolution steps

1. Identify the correct admin address — it is the address passed to `initialize` during deployment.
2. Ensure the transaction is signed by (or the `--source` flag is set to) the correct admin account.
3. If the admin key has been lost or compromised, there is no in-contract admin rotation. Options:
   a. Deploy a new contract instance with a fresh admin, then migrate maintainers and re-initialize.
   b. Upgrade the WASM with a version that includes key rotation (if upgrade capability is still accessible).
4. In tests, verify `env.mock_all_auths()` is active, or that the correct address is returned by the mock auth mechanism.

### Prevention

- Store the admin address in a secure secrets manager at deployment time.
- Test admin operations with the exact address that was used in `initialize`.
- Document the admin address in your deployment runbook.

---

## Error 4 — UnauthorizedMaintainer

**Numeric code:** `4`  
**Soroban SDK type:** `ContractError::UnauthorizedMaintainer`  
**Functions:** `assign_issue`, `complete_assignment`, `revoke_assignment`

### When it occurs

The caller's address is not registered as a maintainer for the specified `org_id`. Registration is checked by looking up the `("maint", maintainer, org_id)` key in persistent storage.

**Example scenario:**
```bash
# $STRANGER was never registered as a maintainer for acme_org
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $STRANGER \
  -- assign_issue \
  --maintainer $STRANGER --contributor $CONTRIBUTOR \
  --org_id acme_org --issue_id 42
# Error: HostError: Value(ContractError(4))
```

### Resolution steps

1. Confirm which `org_id` you are acting on — `org_id` values are case-sensitive Symbols. `AcmeOrg` and `acme_org` are different.
2. Ask the admin to register you for the correct org:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $ADMIN \
     -- register_maintainer \
     --admin $ADMIN --maintainer $MAINTAINER --org_id acme_org
   ```
3. Once registered, retry the original operation.
4. If you believe you are already registered, double-check the `org_id` symbol spelling in your command versus what was used during registration.

### Prevention

- Keep a record of which `org_id` values you are registered for.
- The `register_maintainer` call is idempotent — re-registering an already-registered pair is safe.
- See [maintainer-guide.md — Multi-Org Management](maintainer-guide.md#multi-org-management) for guidance on tracking multi-org registrations.

---

## Error 5 — UnauthorizedContributor

**Numeric code:** `5`  
**Soroban SDK type:** `ContractError::UnauthorizedContributor`  
**Functions:** `apply_for_issue`, `withdraw_application`

### When it occurs

The contributor address in the call did not sign the transaction. Soroban's `require_auth()` call on the `contributor` address fails because the transaction signatures do not include a valid signature from that address.

**Example scenario:**
```bash
# Transaction signed by $OTHER_ACCOUNT, not by $CONTRIBUTOR
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $OTHER_ACCOUNT \
  -- apply_for_issue \
  --contributor $CONTRIBUTOR --org_id acme_org --issue_id 1
# Error: auth failure / HostError: Value(ContractError(5))
```

> **Note:** In practice this surfaces as a Soroban auth error before the ContractError numeric code is returned, depending on the RPC version. The semantic meaning is the same.

### Resolution steps

1. Ensure the `--source` flag in the CLI command matches the `--contributor` address in the function arguments.
2. If using a multi-sig or policy-based authorization scheme, confirm the auth entry for the contributor's address is included in the transaction envelope.
3. If using a backend service to submit transactions on behalf of contributors, ensure the contributor's signature is collected and injected before submission.

### Prevention

- Always sign contributor calls with the contributor's own keypair.
- In your backend, implement a signature collection flow before submitting `apply_for_issue` or `withdraw_application` transactions.

---

## Error 6 — GlobalApplicationLimitReached

**Numeric code:** `6`  
**Soroban SDK type:** `ContractError::GlobalApplicationLimitReached`  
**Function:** `apply_for_issue`

### When it occurs

The contributor already has 15 pending applications across all organizations. The global count is tracked in temporary storage under `("g_apps", contributor)`. When the count is ≥ 15, no new application can be submitted.

**Example scenario:**
```bash
# Contributor already has 15 pending applications
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $CONTRIBUTOR \
  -- apply_for_issue \
  --contributor $CONTRIBUTOR --org_id new_org --issue_id 99
# Error: HostError: Value(ContractError(6))

# Check current count
stellar contract invoke --id $CONTRACT_ID --network testnet \
  -- get_global_application_count --contributor $CONTRIBUTOR
# → 15
```

### Resolution steps

1. Query the current global application count:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- get_global_application_count --contributor $CONTRIBUTOR
   ```
2. Identify pending applications the contributor no longer needs and withdraw them:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $CONTRIBUTOR \
     -- withdraw_application \
     --contributor $CONTRIBUTOR --org_id <ORG> --issue_id <ISSUE>
   ```
3. Alternatively, wait for a maintainer to assign one of the pending applications — assignment consumes the application and decrements the global count.
4. Once the count is < 15, the new application will succeed.

### Prevention

- Build a dashboard that shows contributors their current global application count before they attempt to apply.
- Encourage contributors to withdraw stale applications they no longer intend to pursue.
- The TTL for pending applications is 17,280 ledgers (~24 h). Applications that expire are automatically removed from temporary storage, freeing slots — but the `g_apps` counter is not decremented by TTL expiry alone. Encourage explicit withdrawal over relying on TTL cleanup.

---

## Error 7 — OrgAssignmentLimitReached

**Numeric code:** `7`  
**Soroban SDK type:** `ContractError::OrgAssignmentLimitReached`  
**Function:** `assign_issue`

### When it occurs

The contributor already has 4 active assignments within the specified `org_id`. The org-level count is checked before creating a new assignment. Note: this cap is per-org; a contributor can have up to 4 assignments in every org they work in.

**Example scenario:**
```bash
# Contributor already has 4 assignments in acme_org
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $MAINTAINER \
  -- assign_issue \
  --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
  --org_id acme_org --issue_id 50
# Error: HostError: Value(ContractError(7))

# Check org assignment count
stellar contract invoke --id $CONTRACT_ID --network testnet \
  -- get_org_assignment_count --contributor $CONTRIBUTOR --org_id acme_org
# → 4
```

### Resolution steps

1. Query the contributor's current assignment count in the org:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- get_org_assignment_count --contributor $CONTRIBUTOR --org_id acme_org
   ```
2. Complete or revoke one of the contributor's existing assignments in that org:
   ```bash
   # Complete a finished assignment
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $MAINTAINER \
     -- complete_assignment \
     --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
     --org_id acme_org --issue_id <EXISTING_ISSUE>

   # Or revoke a stalled assignment
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $MAINTAINER \
     -- revoke_assignment \
     --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
     --org_id acme_org --issue_id <EXISTING_ISSUE>
   ```
3. Once the org count is < 4, retry the assignment.

### Prevention

- Before calling `assign_issue`, check `get_org_assignment_count` to confirm the contributor has capacity.
- Monitor org assignment counts on your backend and surface warnings to maintainers when a contributor approaches the cap.
- See [maintainer-guide.md — Understanding Per-Org vs Global Limits](maintainer-guide.md#understanding-per-org-vs-global-limits) for a detailed explanation of how the two cap types interact.

---

## Error 8 — DuplicateApplication

**Numeric code:** `8`  
**Soroban SDK type:** `ContractError::DuplicateApplication`  
**Function:** `apply_for_issue`

### When it occurs

The contributor attempts to apply for an issue they already have a pending application for. The application entry key `("app", contributor, org_id, issue_id)` already exists in temporary storage.

**Example scenario:**
```bash
# First application — succeeds
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $CONTRIBUTOR \
  -- apply_for_issue \
  --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42

# Second application for the same (contributor, org, issue) — fails
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $CONTRIBUTOR \
  -- apply_for_issue \
  --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
# Error: HostError: Value(ContractError(8))
```

### Resolution steps

1. Check whether the application already exists:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- has_applied \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
   # → true (application already present)
   ```
2. If the application already exists and the contributor wants to keep it, no action is needed — the existing application is still valid.
3. If the contributor wants to cancel the existing application and resubmit (e.g., for a TTL refresh), withdraw first then reapply:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $CONTRIBUTOR \
     -- withdraw_application \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42

   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $CONTRIBUTOR \
     -- apply_for_issue \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
   ```
4. To simply extend the TTL without resubmitting, use the permissionless TTL extension function instead:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- extend_application_ttl \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
   ```

### Prevention

- In your frontend, call `has_applied` before showing the "Apply" button, and disable it if `true`.
- Use `extend_application_ttl` to refresh application TTLs rather than withdraw-then-reapply.

---

## Error 9 — ApplicationNotFound

**Numeric code:** `9`  
**Soroban SDK type:** `ContractError::ApplicationNotFound`  
**Functions:** `withdraw_application`, `assign_issue`, `extend_application_ttl`

### When it occurs

An operation that requires a pending application (withdraw, assign, or TTL extension) is called for a `(contributor, org_id, issue_id)` triple that has no matching application entry. This can happen because:
- The application was never submitted
- The application's TTL expired (temporary storage; ~24 h)
- The application was already withdrawn
- The application was already assigned (it is consumed during assignment)

**Example scenario — TTL expiry:**
```bash
# Application submitted, but not refreshed within ~24 h
# After expiry, a maintainer tries to assign it
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $MAINTAINER \
  -- assign_issue \
  --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
  --org_id acme_org --issue_id 42
# Error: HostError: Value(ContractError(9))
# (Application expired from temporary storage)
```

**Example scenario — never applied:**
```bash
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $MAINTAINER \
  -- assign_issue \
  --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
  --org_id acme_org --issue_id 999
# Error: HostError: Value(ContractError(9))
```

### Resolution steps

1. Verify the application state:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- has_applied \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
   # → false (not present)
   ```
2. If the application expired, the contributor must resubmit:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $CONTRIBUTOR \
     -- apply_for_issue \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
   ```
3. If the application was already assigned (`has_applied` = false, `is_assigned` = true), no action is needed — the issue is already being worked on.
4. If withdrawing a non-existent application (e.g., script idempotency), check `has_applied` first and skip the withdraw call if it returns `false`.

### Prevention

- Before calling `withdraw_application` or `assign_issue`, call `has_applied` to confirm the application exists.
- Set up a bot or cron job that calls `extend_application_ttl` on active applications before they approach the ~24 h expiry window.
- The TTL is 17,280 ledgers at ~5 s/ledger. Monitor application age and trigger TTL extensions proactively.
- See [transaction-lifecycle.md](transaction-lifecycle.md) for the TTL extension sequence diagram.

---

## Error 10 — AssignmentNotFound

**Numeric code:** `10`  
**Soroban SDK type:** `ContractError::AssignmentNotFound`  
**Functions:** `complete_assignment`, `revoke_assignment`

### When it occurs

A `complete_assignment` or `revoke_assignment` call references a `(org_id, issue_id, contributor)` triple that has no active assignment entry in persistent storage.

**Example scenario:**
```bash
# No assignment exists for this triple
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $MAINTAINER \
  -- complete_assignment \
  --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
  --org_id acme_org --issue_id 42
# Error: HostError: Value(ContractError(10))
```

### Resolution steps

1. Verify the assignment exists:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- is_assigned \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
   # → false
   ```
2. If `is_assigned` returns `false`, the assignment was already completed or revoked — no further action is needed.
3. If you believe the assignment should exist, check whether the issue ID or org ID in your command has a typo.
4. In automation scripts, wrap complete/revoke calls with an `is_assigned` guard:
   ```bash
   ASSIGNED=$(stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- is_assigned --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42)
   if [ "$ASSIGNED" = "true" ]; then
     stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
       --source $MAINTAINER \
       -- complete_assignment \
       --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
       --org_id acme_org --issue_id 42
   fi
   ```

### Prevention

- Always call `is_assigned` before `complete_assignment` or `revoke_assignment` in scripts to make them idempotent.
- Track assignment state in your backend — listen for the `completed` and `revoked` Soroban events to keep local state in sync.

---

## Error 11 — AlreadyAssigned

**Numeric code:** `11`  
**Soroban SDK type:** `ContractError::AlreadyAssigned`  
**Function:** `assign_issue`

### When it occurs

A maintainer attempts to assign an issue that already has an active assignment in the same org. The `("asgn", org_id, issue_id, contributor)` key already exists. Note that the assignment key includes the contributor address — so in theory two different contributors could be assigned the same issue. In practice the guard fires when the exact same `(org_id, issue_id, contributor)` triple already exists as an active assignment.

**Example scenario:**
```bash
# Issue 42 already assigned to $CONTRIBUTOR in acme_org
# Attempting to assign again (e.g., from a retry or race condition)
stellar contract invoke --id $CONTRACT_ID --network testnet \
  --source $MAINTAINER \
  -- assign_issue \
  --maintainer $MAINTAINER --contributor $CONTRIBUTOR \
  --org_id acme_org --issue_id 42
# Error: HostError: Value(ContractError(11))
```

### Resolution steps

1. Check the assignment state first:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     -- is_assigned \
     --contributor $CONTRIBUTOR --org_id acme_org --issue_id 42
   # → true (already assigned — this is why assign_issue failed)
   ```
2. If the assignment already exists and is correct, no action is needed.
3. If you want to reassign to a different contributor, you must first revoke the existing assignment:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $MAINTAINER \
     -- revoke_assignment \
     --maintainer $MAINTAINER --contributor $ORIGINAL_CONTRIBUTOR \
     --org_id acme_org --issue_id 42

   # New contributor must have applied first
   stellar contract invoke --id $CONTRACT_ID --network $NETWORK \
     --source $MAINTAINER \
     -- assign_issue \
     --maintainer $MAINTAINER --contributor $NEW_CONTRIBUTOR \
     --org_id acme_org --issue_id 42
   ```

### Prevention

- Call `is_assigned` before `assign_issue` to guard against double-assignment in scripts and backends.
- In your backend, maintain an assignment state cache synced from Soroban events (`assigned`, `completed`, `revoked`) to avoid redundant on-chain calls.

---

## Quick Reference Table

| Code | Variant | Function(s) | Primary cause |
|---|---|---|---|
| 1 | `AlreadyInitialized` | `initialize` | Called more than once |
| 2 | `NotInitialized` | All state-changing functions | `initialize` not yet called |
| 3 | `UnauthorizedAdmin` | `register_maintainer`, `upgrade` | Wrong admin credentials |
| 4 | `UnauthorizedMaintainer` | `assign_issue`, `complete_assignment`, `revoke_assignment` | Not registered for org |
| 5 | `UnauthorizedContributor` | `apply_for_issue`, `withdraw_application` | Auth failure |
| 6 | `GlobalApplicationLimitReached` | `apply_for_issue` | 15 pending applications |
| 7 | `OrgAssignmentLimitReached` | `assign_issue` | 4 active assignments in org |
| 8 | `DuplicateApplication` | `apply_for_issue` | Already applied for this issue |
| 9 | `ApplicationNotFound` | `withdraw_application`, `assign_issue`, `extend_application_ttl` | No matching pending application |
| 10 | `AssignmentNotFound` | `complete_assignment`, `revoke_assignment` | No matching active assignment |
| 11 | `AlreadyAssigned` | `assign_issue` | Assignment already exists |

## See Also

- [maintainer-guide.md](maintainer-guide.md) — Maintainer operations and multi-org management
- [ORG_MANAGEMENT_GUIDE.md](ORG_MANAGEMENT_GUIDE.md) — Organization setup and admin operations
- [transaction-lifecycle.md](transaction-lifecycle.md) — Sequence diagrams including error paths

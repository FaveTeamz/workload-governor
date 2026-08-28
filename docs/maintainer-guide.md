# Maintainer Guide

This guide covers everything a maintainer needs to operate WorkloadGovernor: registering for organizations, managing issue assignments, and working across multiple organizations simultaneously.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Single-Org Operations](#single-org-operations)
  - [Getting Registered](#getting-registered)
  - [Assigning Issues](#assigning-issues)
  - [Completing Assignments](#completing-assignments)
  - [Revoking Assignments](#revoking-assignments)
- [Multi-Org Management](#multi-org-management)
  - [How Multi-Org Registration Works](#how-multi-org-registration-works)
  - [Registering for Multiple Organizations](#registering-for-multiple-organizations)
  - [Understanding Per-Org vs Global Limits](#understanding-per-org-vs-global-limits)
  - [Managing Assignments Across Orgs](#managing-assignments-across-orgs)
  - [Deregistering from a Single Org Without Affecting Others](#deregistering-from-a-single-org-without-affecting-others)
  - [Example: Full Cross-Org Workflow](#example-full-cross-org-workflow)
  - [Multi-Org Operational Checklist](#multi-org-operational-checklist)
- [CLI Reference](#cli-reference)
- [Error Quick-Reference](#error-quick-reference)
- [See Also](#see-also)

---

## Prerequisites

- Stellar CLI installed and configured (`stellar --version`)
- A funded account on the target network (testnet or mainnet)
- The contract ID for the deployed WorkloadGovernor instance
- Your maintainer address registered by the admin for at least one `org_id`

Set these environment variables to simplify the CLI examples throughout this guide:

```bash
export CONTRACT_ID="CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
export NETWORK="testnet"          # or "mainnet"
export MAINTAINER="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

---

## Single-Org Operations

### Getting Registered

A maintainer cannot self-register. Registration is admin-only. Contact the contract admin and ask them to run:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source <admin-account> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer "$MAINTAINER" \
  --org_id acme_org
```

Registration is **idempotent** — calling it a second time for the same maintainer and org is safe and does nothing.

### Assigning Issues

Once registered, you can convert a contributor's pending application into an active assignment:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$MAINTAINER" \
  -- assign_issue \
  --maintainer "$MAINTAINER" \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme_org \
  --issue_id 42
```

Guards checked before assignment proceeds (in order):
1. Contract must be initialized
2. `maintainer` must authenticate
3. `maintainer` must be registered for `org_id`
4. Contributor must have a pending application for this `(org_id, issue_id)`
5. Contributor must not already hold 4 active assignments in this org
6. The issue must not already be assigned to someone else in this org

### Completing Assignments

Mark an assignment done when the contributor's work is merged or accepted:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$MAINTAINER" \
  -- complete_assignment \
  --maintainer "$MAINTAINER" \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme_org \
  --issue_id 42
```

Completing an assignment decrements the contributor's org assignment count, freeing a slot for their next assignment in that org.

### Revoking Assignments

Revoke an active assignment when a contributor cannot complete the work:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$MAINTAINER" \
  -- revoke_assignment \
  --maintainer "$MAINTAINER" \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme_org \
  --issue_id 42
```

Revocation has the same mechanical effect as completion: the assignment is removed and the contributor's org assignment count is decremented. The distinction is semantic — revocation signals incomplete work.

> **Note:** Revoke does **not** restore the contributor's pending application. The application was consumed when the assignment was created. The contributor must re-apply if they want to pick the issue up again.

---

## Multi-Org Management

### How Multi-Org Registration Works

Maintainer registration in WorkloadGovernor is scoped to `(maintainer_address, org_id)` pairs. Each registration is a separate persistent storage entry:

```
Key: ("maint", maintainer_address, org_id)  →  bool
```

There is no concept of a global maintainer role. Being registered for `org_a` gives you zero permissions in `org_b`. The admin must explicitly register you for each organization you need to manage.

This design means:
- **No cross-org authority leakage** — a rogue registration in one org cannot affect another
- **Isolated revocation** — removing access to one org leaves all others intact
- **Auditable scope** — each authorization is a distinct, inspectable on-chain entry

### Registering for Multiple Organizations

Ask the admin to run one `register_maintainer` call per organization. These can be batched in a script:

```bash
# Register the same maintainer for three orgs
for ORG in acme_org beta_inc gamma_dao; do
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source <admin-account> \
    -- register_maintainer \
    --admin <ADMIN_ADDRESS> \
    --maintainer "$MAINTAINER" \
    --org_id "$ORG"
  echo "Registered $MAINTAINER for $ORG"
done
```

Verify your registrations are active by trying an operation — there is no `is_maintainer` read function exposed in the public API, so the easiest check is a dry-run `assign_issue` call that you know should succeed given an existing application.

### Understanding Per-Org vs Global Limits

WorkloadGovernor enforces two independent cap types. As a multi-org maintainer you need to understand both:

| Limit | Scope | Value | Who it affects |
|---|---|---|---|
| Global application cap | Across all orgs | 15 pending applications | Contributors |
| Org assignment cap | Per org per contributor | 4 active assignments | Contributors per org |

**What this means for you as a maintainer:**

The caps constrain contributors, not maintainers directly. However, they determine when your `assign_issue` calls will succeed or fail.

- **Global application cap (15):** A contributor can have at most 15 pending applications summed across every org. If a contributor has applied to 15 issues spread across your 3 orgs, they cannot apply to any more until some applications are withdrawn or assigned. You will see `ApplicationNotFound` if you try to assign an issue the contributor never applied for.

- **Org assignment cap (4):** A contributor can hold at most 4 *active* assignments within a single org. The cap is **per-org** — filling the cap in `acme_org` has no effect on the contributor's capacity in `beta_inc`. This is intentional: it prevents one org from monopolizing a contributor while allowing healthy multi-org participation.

**Practical example:**

Contributor `GXXX` has:
- 2 active assignments in `acme_org`  (capacity: 2 more)
- 4 active assignments in `beta_inc`  (cap reached)
- 1 active assignment in `gamma_dao`  (capacity: 3 more)

You, as a maintainer for all three orgs, can:
- ✅ `assign_issue` in `acme_org` (2 slots free)
- ❌ `assign_issue` in `beta_inc` → `OrgAssignmentLimitReached` (error 7)
- ✅ `assign_issue` in `gamma_dao` (3 slots free)

To unblock `beta_inc`, complete or revoke one of the contributor's 4 assignments there.

### Managing Assignments Across Orgs

When you manage multiple orgs, keep track of each contributor's org-level assignment count. Use the read-only query functions before attempting assignment:

```bash
# Check contributor's assignment count in a specific org
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- get_org_assignment_count \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme_org

# Check contributor's global pending application count
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- get_global_application_count \
  --contributor <CONTRIBUTOR_ADDRESS>

# Verify a specific application exists before assigning
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- has_applied \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme_org \
  --issue_id 42

# Verify an assignment exists before completing/revoking
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- is_assigned \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme_org \
  --issue_id 42
```

A useful pattern before any mutating call is to check `has_applied` and `get_org_assignment_count` first. This avoids paying transaction fees for calls that will revert.

### Deregistering from a Single Org Without Affecting Others

There is no on-chain `deregister_maintainer` function. Deregistration must be handled at the application layer — the admin can stop using your address for a given org, but the on-chain registration key remains. This is a read-cost-only storage entry and does not affect other orgs.

If you need to be fully deregistered from all orgs (e.g., key rotation, end of engagement), the admin must track which orgs you were registered for and document the off-chain removal. Future contract upgrades may introduce explicit deregistration.

In the meantime:
- Your registration in `acme_org` is completely independent of your registration in `beta_inc`
- Losing admin trust / access in one org context does not change your capability in others
- If your key is compromised, notify the admin immediately and document all orgs you were registered for so they can migrate to a new maintainer address

### Example: Full Cross-Org Workflow

This example walks through a complete multi-org scenario: one maintainer managing two orgs, one contributor working across both.

**Setup (admin runs these):**

```bash
export ADMIN="GADMIN..."
export MAINTAINER="GMAINT..."
export CONTRIBUTOR="GCONTRIB..."

# Register maintainer for both orgs
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$ADMIN" \
  -- register_maintainer \
  --admin "$ADMIN" --maintainer "$MAINTAINER" --org_id project_alpha

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$ADMIN" \
  -- register_maintainer \
  --admin "$ADMIN" --maintainer "$MAINTAINER" --org_id project_beta
```

**Contributor applies to issues in both orgs:**

```bash
# Apply in project_alpha
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$CONTRIBUTOR" \
  -- apply_for_issue \
  --contributor "$CONTRIBUTOR" --org_id project_alpha --issue_id 101

# Apply in project_beta
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$CONTRIBUTOR" \
  -- apply_for_issue \
  --contributor "$CONTRIBUTOR" --org_id project_beta --issue_id 202

# Global count is now 2
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count --contributor "$CONTRIBUTOR"
# → 2
```

**Maintainer assigns issues in both orgs:**

```bash
# Assign issue 101 in project_alpha
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$MAINTAINER" \
  -- assign_issue \
  --maintainer "$MAINTAINER" --contributor "$CONTRIBUTOR" \
  --org_id project_alpha --issue_id 101

# Assign issue 202 in project_beta
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$MAINTAINER" \
  -- assign_issue \
  --maintainer "$MAINTAINER" --contributor "$CONTRIBUTOR" \
  --org_id project_beta --issue_id 202

# Verify per-org counts (each is 1, independent)
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count --contributor "$CONTRIBUTOR" --org_id project_alpha
# → 1

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count --contributor "$CONTRIBUTOR" --org_id project_beta
# → 1
```

**Complete work in one org, revoke in another:**

```bash
# project_alpha: work merged — complete
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$MAINTAINER" \
  -- complete_assignment \
  --maintainer "$MAINTAINER" --contributor "$CONTRIBUTOR" \
  --org_id project_alpha --issue_id 101

# project_beta: contributor dropped the task — revoke
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source "$MAINTAINER" \
  -- revoke_assignment \
  --maintainer "$MAINTAINER" --contributor "$CONTRIBUTOR" \
  --org_id project_beta --issue_id 202

# Both org counts return to 0
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count --contributor "$CONTRIBUTOR" --org_id project_alpha
# → 0

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count --contributor "$CONTRIBUTOR" --org_id project_beta
# → 0
```

### Multi-Org Operational Checklist

Use this checklist when onboarding or operating as a multi-org maintainer:

- [ ] Confirm admin has run `register_maintainer` for each org you need to manage
- [ ] Store your `org_id` symbols exactly as registered (they are case-sensitive Soroban `Symbol` values, max 9 characters, lowercase recommended)
- [ ] Before assigning, verify `has_applied` returns `true`
- [ ] Before assigning, verify `get_org_assignment_count` < 4
- [ ] After assigning, confirm `is_assigned` returns `true`
- [ ] Track completions and revocations to keep org counts accurate
- [ ] If you need access revoked from one org, notify the admin with the exact `org_id` — other orgs are unaffected
- [ ] For key rotation: notify admin to re-register under the new address for all affected orgs

---

## CLI Reference

| Operation | Function | Auth |
|---|---|---|
| Register maintainer | `register_maintainer` | Admin |
| Assign issue | `assign_issue` | Maintainer |
| Complete assignment | `complete_assignment` | Maintainer |
| Revoke assignment | `revoke_assignment` | Maintainer |
| Check application exists | `has_applied` | Anyone |
| Check assignment exists | `is_assigned` | Anyone |
| Query org assignment count | `get_org_assignment_count` | Anyone |
| Query global application count | `get_global_application_count` | Anyone |

---

## Error Quick-Reference

| Code | Variant | When you see it | Fix |
|---|---|---|---|
| 2 | `NotInitialized` | Contract not yet initialized | Admin must call `initialize` first |
| 4 | `UnauthorizedMaintainer` | Your address not registered for this org | Ask admin to run `register_maintainer` |
| 7 | `OrgAssignmentLimitReached` | Contributor already has 4 active assignments in this org | Complete or revoke one of their existing assignments |
| 9 | `ApplicationNotFound` | Contributor hasn't applied, or TTL expired | Contributor must re-apply |
| 10 | `AssignmentNotFound` | Assignment doesn't exist for this triple | Verify `is_assigned` before calling complete/revoke |
| 11 | `AlreadyAssigned` | Another assignment exists for this issue in this org | Resolve the existing assignment first |

See [error-reference.md](error-reference.md) for full resolution playbooks on all 11 error codes.

---

## See Also

- [ORG_MANAGEMENT_GUIDE.md](ORG_MANAGEMENT_GUIDE.md) — Organization-level setup and admin operations
- [error-reference.md](error-reference.md) — Full error code reference with resolution playbooks
- [storage-design.md](storage-design.md) — Storage key design and collision-free proof
- [transaction-lifecycle.md](transaction-lifecycle.md) — Sequence diagrams for all transaction flows

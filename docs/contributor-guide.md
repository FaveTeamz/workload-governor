# Contributor Guide — CLI Workflow

This guide walks non-Stellar developers through the complete workflow of applying
for an issue using only the **Stellar CLI** — no web frontend required. Follow it
from top to bottom on your first contribution; bookmark it for later reference.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Set Up a Testnet Account](#2-set-up-a-testnet-account)
3. [Find the Contract ID](#3-find-the-contract-id)
4. [Check Your Cap Availability](#4-check-your-cap-availability)
5. [Apply for an Issue](#5-apply-for-an-issue)
6. [Check Application Status](#6-check-application-status)
7. [Extend an Application TTL](#7-extend-an-application-ttl)
8. [Withdraw an Application](#8-withdraw-an-application)
9. [Common Errors](#9-common-errors)
10. [Fairness Model Quick Reference](#10-fairness-model-quick-reference)

---

## 1. Prerequisites

### Install Rust and the wasm32v1-none target

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
```

### Install the Stellar CLI

The Stellar CLI (`stellar`) is the primary tool for interacting with Soroban
contracts on the Stellar network.

```bash
cargo install stellar-cli --features opt --locked
```

Verify the installation:

```bash
stellar --version
# Example: stellar 21.x.x
```

> **macOS / Linux:** The `cargo install` approach works on all platforms. If you
> prefer a pre-built binary, see the
> [Stellar CLI releases page](https://github.com/stellar/stellar-cli/releases).

### Required tools

| Tool | Minimum version | Purpose |
|------|----------------|---------|
| Rust | stable | Build toolchain |
| stellar-cli | 21.0 | Contract invocation |
| curl | any | Friendbot funding |

---

## 2. Set Up a Testnet Account

All commands in this guide target **testnet** — a free sandbox with no real
XLM at stake.

### Generate a new keypair

```bash
stellar keys generate --global my-contributor-key --network testnet
```

This creates a key stored in `~/.config/stellar/identity/my-contributor-key.toml`.

Display your public address:

```bash
stellar keys address my-contributor-key
# Output: GABCDEF... (your Stellar address)
export CONTRIBUTOR_ADDRESS=$(stellar keys address my-contributor-key)
echo $CONTRIBUTOR_ADDRESS
```

### Fund with Friendbot

Testnet accounts need XLM to pay transaction fees. Friendbot issues free testnet
XLM:

```bash
curl "https://friendbot.stellar.org/?addr=$CONTRIBUTOR_ADDRESS"
```

Expected response: a JSON object with `"successful": true` inside a
`result_codes` or `result` field. Verify the account is funded:

```bash
stellar account show $CONTRIBUTOR_ADDRESS --network testnet
```

You should see a non-zero XLM balance.

> **Note:** Friendbot is only available on testnet. Never use real XLM or
> mainnet accounts for experimentation.

---

## 3. Find the Contract ID

The WorkloadGovernor contract ID for testnet is stored in
[`config/contracts.json`](../config/contracts.json):

```bash
cat config/contracts.json
```

Or set it explicitly from the project README / deployment notes:

```bash
export CONTRACT_ID=<CONTRACT_ID_FROM_CONTRACTS_JSON>
```

All subsequent commands use `$CONTRACT_ID`. Confirm it resolves:

```bash
echo $CONTRACT_ID
# Should print a C... or GA... style contract address
```

## Understanding the transaction lifecycle

Every action you take in the UI — applying, withdrawing, etc. — goes through a
7-stage pipeline: XDR construction, Freighter signing, network submission,
ledger consensus, confirmation polling, event indexing, and UI update. The
total round-trip takes 15 – 72 seconds.

If Freighter reports success but the UI doesn't update, the most common causes
are event indexer lag (up to 10 s) and frontend polling not firing after the
transaction confirmed.

See [docs/transaction-lifecycle.md](./transaction-lifecycle.md) for:
- A full timing diagram of all 7 stages
- Failure modes and debug commands for each stage
- A stuck-transaction debugging checklist

## Screenshot note

## 4. Check Your Cap Availability

Before applying, check how many slots you have left under the two fairness caps.

### Global application capacity

The platform allows a maximum of **15 pending applications** across all
organisations. Check how many slots remain:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_capacity \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

Expected output: a number from `0` to `15`. If this returns `0`, you must
withdraw an existing application before applying for a new one.

### Global application count (raw)

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_count \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

Returns the number of pending applications you currently hold.

### Org assignment capacity

Per-organisation cap is **4 active assignments**. Check remaining slots:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_org_assignment_capacity \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID>
```

Replace `<ORG_ID>` with the organisation symbol shown on the issue (e.g.
`"rust_libs"`, `"wave_tools"`). The org ID is a short symbol — no spaces,
lowercase, up to 9 characters.

### Check whether the global cap is already hit

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- global_app_limit_reached \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

Returns `true` if you are at the limit; `false` otherwise.

---

## 5. Apply for an Issue

### Identify the issue

Each issue has:

- an `org_id` — the organisation symbol (e.g. `"rust_libs"`)
- an `issue_id` — a numeric identifier (e.g. `42`)

Both are shown on the issue board or in the org's README.

### Submit the application

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source my-contributor-key \
  -- apply_for_issue \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

**Example** — applying for issue 42 in org `rust_libs`:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source my-contributor-key \
  -- apply_for_issue \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs \
  --issue_id 42
```

Expected output on success: `null`

The Stellar CLI will prompt you to confirm the transaction fee before
broadcasting. Type `y` and press Enter.

> **Important:** The `--source` flag must be the key whose address matches
> `--contributor`. The contract enforces `contributor.require_auth()` — signing
> with a different key will return `UnauthorizedContributor` (error 5).

---

## 6. Check Application Status

### Verify a specific application exists

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- has_applied \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

Returns `true` if the application is pending; `false` if it does not exist or
has expired.

### Check assignment status (after maintainer action)

Once a maintainer converts your application to an assignment:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- is_assigned \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

Returns `true` if you have been assigned the issue.

### Check your org assignment count

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID>
```

Returns the number of active assignments you hold in that org.

---

## 7. Extend an Application TTL

Applications use temporary storage with a TTL of approximately **24 hours**
(17,280 ledgers at 5 s/ledger). If your application is close to expiring during
a long review cycle, anyone can extend it — no authentication required:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- extend_application_ttl \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

Expected output: `null`

> Call this periodically (once per ~12 hours) if you expect a slow review cycle.
> If the TTL expires, the application entry is removed and you will need to
> re-apply.

---

## 8. Withdraw an Application

If you change your mind, withdraw the application to free a slot for other
contributors and reclaim your global application capacity:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source my-contributor-key \
  -- withdraw_application \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

Expected output: `null`

After withdrawal, confirm the count decreased:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_count \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

---

## 9. Common Errors

The contract returns a numeric error code embedded in the transaction failure
message. Look for `ContractError(N)` or `Error(Contract, #N)` in the CLI output.

### All 13 error codes

| Code | Variant | What triggered it | How to fix |
|------|---------|------------------|-----------|
| 1 | `AlreadyInitialized` | `initialize` called twice | Do not call `initialize` more than once. Contact a platform admin if you need the contract redeployed. |
| 2 | `NotInitialized` | Any state-changing call before the contract was initialized | The contract has not been set up. Contact a platform admin to run `initialize`. |
| 3 | `UnauthorizedAdmin` | Admin function called without the stored admin signing | You are not the admin. Admin-only operations (`register_maintainer`, `upgrade`, `transfer_admin`) require the admin's key. |
| 4 | `UnauthorizedMaintainer` | Maintainer function called by an unregistered address | Only registered maintainers can call `assign_issue`, `complete_assignment`, or `revoke_assignment`. Ask the admin to register your address with `register_maintainer`. |
| 5 | `UnauthorizedContributor` | `--source` does not match `--contributor` | The `--source` key must belong to the same address passed as `--contributor`. Re-run with the correct `--source`. |
| 6 | `GlobalApplicationLimitReached` | You already hold 15 pending applications | Withdraw at least one application with `withdraw_application`, then retry. |
| 7 | `OrgAssignmentLimitReached` | You already hold 4 active assignments in this org | A maintainer must complete or revoke one of your existing assignments in this org before you can receive another. |
| 8 | `DuplicateApplication` | You already applied for this exact `(org_id, issue_id)` | The application already exists. Check status with `has_applied`. To reset it, withdraw first. |
| 9 | `ApplicationNotFound` | The application does not exist or its TTL expired | Re-apply with `apply_for_issue`. If your application recently expired, call `extend_application_ttl` next time before it expires. |
| 10 | `AssignmentNotFound` | The assignment does not exist | Verify with `is_assigned` before calling `complete_assignment` or `revoke_assignment`. |
| 11 | `AlreadyAssigned` | An active assignment already exists for this issue | The issue is already assigned. The existing assignment must be completed or revoked first. |
| 12 | _(reserved)_ | Not used in this contract version | — |
| 13 | `CounterInconsistency` | Internal counter is 0 but the assignment entry still exists | This indicates storage corruption (usually from a migration script). Contact the platform admin to run a corrective migration. |

### Diagnosing errors from the CLI

The Stellar CLI outputs errors in this form:

```
error: transaction simulation failed: HostError: Error(Contract, #6)
```

The number after `#` is the error code. Look up the code in the table above.

For more detail, add `--verbose` to any `stellar contract invoke` call:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source my-contributor-key \
  --verbose \
  -- apply_for_issue \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

### Error 5 — step-by-step fix

The most common contributor error is a mismatch between `--source` and
`--contributor`:

```bash
# WRONG — different keys
stellar contract invoke ... --source some-other-key \
  -- apply_for_issue --contributor "$CONTRIBUTOR_ADDRESS" ...
# → Error(Contract, #5) UnauthorizedContributor

# CORRECT — same identity
stellar contract invoke ... --source my-contributor-key \
  -- apply_for_issue --contributor "$CONTRIBUTOR_ADDRESS" ...
# → null
```

### Error 6 — freeing a slot

```bash
# List your current application count
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count --contributor "$CONTRIBUTOR_ADDRESS"
# → 15

# Withdraw one application
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source my-contributor-key \
  -- withdraw_application \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID_OF_EXISTING_APP> \
  --issue_id <ISSUE_ID_OF_EXISTING_APP>
# → null

# Now apply for the new issue
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source my-contributor-key \
  -- apply_for_issue \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <NEW_ORG_ID> \
  --issue_id <NEW_ISSUE_ID>
# → null
```

---

## 10. Fairness Model Quick Reference

| Cap | Limit | Scope | Reset mechanism |
|-----|-------|-------|----------------|
| Global application cap | 15 | All orgs combined | Withdraw a pending application, or wait for one to be assigned |
| Org assignment cap | 4 | Per org | Maintainer calls `complete_assignment` or `revoke_assignment` |

Applications live in **temporary storage** (TTL ≈ 24 h). Assignments live in
**persistent storage** (no expiry — only cleared by maintainer action).

For a full explanation of the fairness invariants and threat model, see
[docs/fairness-model.md](fairness-model.md).

---

## Complete Worked Example

The following example shows a full contribution workflow from scratch on testnet:

```bash
# 1. One-time setup
stellar keys generate --global alice --network testnet
export ALICE=$(stellar keys address alice)
curl "https://friendbot.stellar.org/?addr=$ALICE"
export CONTRACT_ID=<CONTRACT_ID>

# 2. Check remaining capacity
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_capacity --contributor "$ALICE"
# → 15 (fresh account, no applications yet)

# 3. Apply for issue 42 in org rust_libs
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source alice \
  -- apply_for_issue \
  --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → null

# 4. Confirm application is recorded
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- has_applied --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → true

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count --contributor "$ALICE"
# → 1

# 5. Extend TTL before it expires (optional, do this periodically)
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- extend_application_ttl \
  --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → null

# 6. (After maintainer assigns) — verify assignment
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- is_assigned --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → true (once assigned)

# 7. (If you change your mind before assignment) — withdraw
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source alice \
  -- withdraw_application \
  --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → null

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count --contributor "$ALICE"
# → 0
```

---

## Frontend Alternative

If you prefer a web interface, the WorkloadGovernor frontend is available at the
platform URL. Install [Freighter](https://www.freighter.app), connect your
Stellar account, and use the issue board to apply, track, and withdraw
applications without typing CLI commands.

---

## Further Reading

- [docs/fairness-model.md](fairness-model.md) — formal invariants and gaming analysis
- [docs/error-reference.md](error-reference.md) — complete error code reference with examples
- [docs/api-reference.md](api-reference.md) — REST API reference for backend integration
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute code to this repository
- [Stellar Documentation](https://developers.stellar.org/docs/smart-contracts) — Soroban contract docs

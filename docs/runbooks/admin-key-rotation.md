# Runbook: Admin Key Rotation

Transfers admin authority from the current keypair to a new one using the
two-step `propose_admin` / `accept_admin` contract functions.

- **Step 1 (`propose_admin`)**: the current admin nominates a new admin address
  and signs the transaction. The proposal is stored on-chain; the current admin
  retains all privileges until Step 2 is complete.
- **Step 2 (`accept_admin`)**: the new admin signs a separate transaction to
  accept the proposal. On confirmation, the old admin loses all on-chain authority
  atomically.

Estimated time: 20–40 minutes for a prepared operator. The two-step design
eliminates the race window of single-step rotation: the old key remains active
until the new key explicitly proves ownership.

---

## Background

The `propose_admin` / `accept_admin` functions (added in contract v0.3.0) implement
a secure two-step admin transfer. Their security properties are:

- **Dual authorisation**: the current admin must sign `propose_admin`; the new
  admin must sign `accept_admin`. A compromised old key alone cannot complete a
  transfer to an attacker address (Step 2 still requires the new key), and a
  stolen new key alone cannot claim authority without a prior `propose_admin` from
  the current admin.
- **Old admin stays active**: the current admin retains full authority between
  Steps 1 and 2, including the ability to overwrite the proposal by calling
  `propose_admin` again with a corrected address.
- **Atomic completion**: on-chain confirmation of `accept_admin` makes the new
  admin active in the same ledger. There is no cooldown or time-lock.
- **Events emitted**:
  - `AdminTransferProposed { current_admin, new_admin }` on `propose_admin`
  - `AdminTransferred { old_admin, new_admin }` on `accept_admin`

For why the contract uses this pattern instead of a one-step `set_admin`, a
multisig guardian, or a timelock, see
[ADR-006: Two-Step Admin Transfer](../adr/ADR-006-two-step-admin-transfer.md).

---

## Error Codes

| Code | Variant | When raised |
|------|---------|-------------|
| 2 | `NotInitialized` | Called before `initialize` |
| 3 | `UnauthorizedAdmin` | Wrong caller on `propose_admin`, or `new_admin` mismatch on `accept_admin` |
| 15 | `NoPendingAdminTransfer` | `accept_admin` called with no active proposal |

---

## Prerequisites

Confirm every item before starting:

- [ ] Current admin keypair (`OLD_ADMIN_SECRET`) is accessible and the source
      account is funded with XLM for fees.
- [ ] You have authority to generate or retrieve the replacement keypair.
- [ ] Contract ID and target network (testnet / mainnet) are known.
- [ ] You have AWS CLI access with write permissions to Secrets Manager in the
      production account (Phases 5–6).
- [ ] You have ECS access to restart the backend service (Phase 6).
- [ ] An incident ticket or change-management record is open (production
      rotations only).

## Zero-Downtime Rollover Checklist

To ensure zero downtime during key rollover across backend API and event indexer services:

- [ ] **Dual-Key Compatibility Mode**: Pre-deploy backend services configured to recognize both `OLD_ADMIN_KEY` and `NEW_ADMIN_KEY` as valid callers.
- [ ] **On-Chain Proposal Execution**: Execute `propose_admin` on-chain using current admin keypair.
- [ ] **On-Chain Acceptance Confirmation**: Execute `accept_admin` on-chain using new admin keypair; wait for ledger confirmation.
- [ ] **Secrets Manager Update**: Update `STELLAR_ADMIN_SECRET` in AWS Secrets Manager / Vault to the new keypair with automated version staging.
- [ ] **Rolling Service Restart**: Trigger zero-downtime rolling restart (Kubernetes Deployment rollout) of backend and indexer workloads.
- [ ] **Health & Metric Probes**: Verify all HTTP `/health` and `/ready` probes return 200 OK.
- [ ] **Audit Trail Verification**: Verify `AdminTransferred` event is ingested into PostgreSQL database and emitted to audit log.
- [ ] **Decommission Old Key**: Revoke and archive `OLD_ADMIN_SECRET` from active configuration stores.

---

## Pre-Flight Checks

Run these before executing the rotation. Any unexpected result is a reason to
halt and investigate.

### 1. Verify the current admin is recognised on-chain

```bash
# This call is admin-gated; if it fails the key is already wrong — stop.
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$OLD_ADMIN_KEY" \
  -- register_maintainer \
  --admin "$OLD_ADMIN_ADDRESS" \
  --maintainer "$OLD_ADMIN_ADDRESS" \
  --org_id preflight_check
# Expected: null
```

### 2. Confirm the new admin account is funded

```bash
stellar account show "$NEW_ADMIN_ADDRESS" --network "$NETWORK"
# Expected: account exists with non-zero XLM balance
```

### 3. Check for an existing pending proposal

```bash
# If a previous rotation attempt left a pending proposal, investigate before
# proceeding. The pending admin key is stored at storage key "p_admin".
# A new propose_admin call will overwrite any existing proposal.
```

### 4. Check for in-flight transactions

Review recent activity on both accounts in the Stellar explorer before
proceeding. Do not rotate during a high-traffic wave window.

---

## Phase 1 — Generate a Fresh Admin Keypair

```bash
export NEW_ADMIN_KEY=new-admin-$(date +%Y%m%d)   # name in stellar CLI keystore

stellar keys generate --global "$NEW_ADMIN_KEY" --network "$NETWORK"
export NEW_ADMIN_ADDRESS=$(stellar keys address "$NEW_ADMIN_KEY")
echo "New admin address: $NEW_ADMIN_ADDRESS"
```

Fund the new account before the transfer:

```bash
# Testnet — Friendbot
curl -s "https://friendbot.stellar.org/?addr=$NEW_ADMIN_ADDRESS" | jq .

# Mainnet — transfer a small XLM balance (minimum 1 XLM for fees)
# stellar payment send --amount 2 --asset XLM \
#   --destination "$NEW_ADMIN_ADDRESS" \
#   --source "$FUNDING_KEY" --network mainnet
```

### Step 2 — Propose the transfer (current admin signs)

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$OLD_ADMIN_KEY" \
  -- propose_admin \
  --current_admin "$OLD_ADMIN_ADDRESS" \
  --new_admin "$NEW_ADMIN_ADDRESS"
# Expected: null
# Event emitted: AdminTransferProposed { current_admin, new_admin }
```

Record the transaction hash. The proposal is now stored on-chain. The current
admin retains all privileges.

> **Note:** If you provided the wrong `new_admin` address, call `propose_admin`
> again with the correct address. The previous proposal will be overwritten.

### Step 3 — Verify the proposal is recorded

```bash
# Confirm the pending admin is stored by attempting an accept with a dummy address.
# This should fail with NoPendingAdminTransfer (error 15) if no proposal exists,
# or with UnauthorizedAdmin (error 3) if the proposal is present but the address
# does not match — confirming the proposal was written.
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- accept_admin \
  --new_admin "GDUMMYADDRESS000000000000000000000000000000000000000000000" 2>&1 || true
# Expected: Error(Contract, #3) UnauthorizedAdmin  ← proposal exists
# If you see: Error(Contract, #15) NoPendingAdminTransfer ← proposal missing, re-run Step 2
```

### Step 4 — Accept the transfer (new admin signs)

This step must be performed by the operator holding the **new** admin key.

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$NEW_ADMIN_KEY" \
  -- accept_admin \
  --new_admin "$NEW_ADMIN_ADDRESS"
# Expected: null
# Event emitted: AdminTransferred { old_admin, new_admin }
```

The new admin is now active. The old admin has no on-chain authority from this
ledger forward.

### Step 5 — Verify the new admin is active

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$NEW_ADMIN_KEY" \
  -- register_maintainer \
  --admin "$NEW_ADMIN_ADDRESS" \
  --maintainer "$NEW_ADMIN_ADDRESS" \
  --org_id rotation_verify
# Expected: null
```

### Step 6 — Confirm the old admin is rejected

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$OLD_ADMIN_KEY" \
  -- register_maintainer \
  --admin "$OLD_ADMIN_ADDRESS" \
  --maintainer "$OLD_ADMIN_ADDRESS" \
  --org_id should_fail
# Expected: Error(Contract, #3) UnauthorizedAdmin
# This error CONFIRMS the rotation succeeded.
```

**Do not proceed to Phase 5 until Phase 4 returns `UnauthorizedAdmin`.**

---

## Phase 5 — Update AWS Secrets Manager

Secrets are stored as individual secrets under the naming convention
`<service_name>-<VAR_NAME>` (e.g. `workload-governor-ADMIN_SECRET`). Update
the admin secret and revoke access to the old value.

### 5a. Write the new admin secret

```bash
export AWS_REGION=us-east-1          # adjust to your deployment region
export SERVICE_NAME=workload-governor

# Write new secret value (the stellar CLI-format secret key)
NEW_ADMIN_SECRET_VALUE=$(stellar keys export "$NEW_ADMIN_KEY" --network "$NETWORK")

aws secretsmanager put-secret-value \
  --region "$AWS_REGION" \
  --secret-id "${SERVICE_NAME}-ADMIN_SECRET" \
  --secret-string "$NEW_ADMIN_SECRET_VALUE"

echo "Secret updated."
```

### Step 7 — Rotate the secret in the secrets manager

Immediately after on-chain confirmation of Step 4:

```bash
aws secretsmanager describe-secret \
  --region "$AWS_REGION" \
  --secret-id "${SERVICE_NAME}-ADMIN_SECRET" \
  --query 'LastChangedDate'
# Expected: timestamp within the last few minutes
```

### 5c. Revoke access to the old admin secret

1. If the old secret value is a versioned string in the same secret, deprecate
   the previous version:

   ```bash
   OLD_VERSION_ID=$(aws secretsmanager list-secret-version-ids \
     --region "$AWS_REGION" \
     --secret-id "${SERVICE_NAME}-ADMIN_SECRET" \
     --query 'Versions[?contains(VersionStages, `AWSPREVIOUS`)].VersionId' \
     --output text)

### Step 8 — Update the `.github/workflows/contract-ci.yml` secret reference

2. Update any CI/CD pipelines that reference `CI_ADMIN_SECRET`:
   - Go to **Settings → Secrets and variables → Actions** in the GitHub repo.
   - Update `CI_ADMIN_SECRET` with the new admin's secret key.
   - Trigger a CI run to confirm the pipeline still passes.

3. If the old private key was stored offline (HSM, 1Password, etc.), revoke or
   delete it from that store and document the deletion in the incident ticket.

---

## Phase 6 — Backend Restart and Health Verification

The backend ECS service injects secrets at task launch via `valueFrom`. To pick
up the new `ADMIN_SECRET` without downtime, force a rolling replacement of the
running tasks.

### 6a. Identify the ECS cluster and service

```bash
export ECS_CLUSTER=workload-governor-production    # adjust as needed
export ECS_SERVICE=workload-governor-backend

aws ecs describe-services \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'
```

### 6b. Force a new deployment (rolling restart)

```bash
aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment
echo "Rolling restart initiated."
```

### 6c. Wait for stability

```bash
aws ecs wait services-stable \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE"
echo "Service stable."
```

This command blocks until all running tasks are on the new revision. Default
timeout is 10 minutes (ECS CLI); if it times out see Troubleshooting below.

### 6d. Verify backend health

- [ ] `register_maintainer` succeeds with the new admin key.
- [ ] `register_maintainer` fails with `UnauthorizedAdmin` using the old admin key.
- [ ] `AdminTransferred` event is visible in the transaction explorer.
- [ ] `AdminTransferProposed` event from Step 2 is also visible.
- [ ] Old admin secret has been revoked in the secrets manager.
- [ ] CI pipeline passes with the updated secret.
- [ ] Change-management record is updated and closed.

---

## Rollback

The two-step design provides a narrow recovery window:

1. **If Step 2 (`propose_admin`) failed before submission**: no on-chain change
   occurred. Retry with the corrected parameters.
2. **If Step 2 succeeded but Step 4 (`accept_admin`) has not been called yet**:
   the old admin is still active. You can overwrite the proposal by calling
   `propose_admin` again with a different `new_admin` address. This invalidates
   the previous proposal.
3. **If Step 4 succeeded**: the old admin has no authority. Rollback options:
   - Call `propose_admin` from the **new** admin, then `accept_admin` from the
     old admin keypair to reverse the transfer — but only if you still hold the
     old admin private key.
   - If the new admin key is lost immediately after Step 4, there is no on-chain
     rollback path without the new admin key.

> **Recovery tip**: Always generate and secure the new keypair _before_ starting
> Step 2. Keeping the old keypair accessible until Step 4 is confirmed gives you
> the overwrite option if anything goes wrong between Steps 2 and 4.

---

## Multi-Sig Recommendation for Production

For production deployments, do not store admin authority in a single keypair.

**Option A — Stellar multisig (threshold signing):**

```bash
# Add a second signer with weight 1 to the admin account
stellar account signer-add \
  --account "$OLD_ADMIN_ADDRESS" \
  --signer "$SIGNER_2_ADDRESS" \
  --weight 1 \
  --network mainnet \
  --source "$OLD_ADMIN_KEY"

# Require 2-of-N for medium and high threshold operations
stellar account threshold-set \
  --account "$OLD_ADMIN_ADDRESS" \
  --low 1 --med 2 --high 2 \
  --network mainnet \
  --source "$OLD_ADMIN_KEY"
```

**Option B — Hardware Security Module:**

Store the admin private key in a YubiKey, AWS CloudHSM, or equivalent. Signing
requires physical access or quorum approval, eliminating remote key theft.

**Option C — Multi-party computation wallet:**

Use Fireblocks, Fordefi, or similar MPC wallet to distribute key material. No
single party ever holds the full private key.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Error(Contract, #3) UnauthorizedAdmin` on `propose_admin` | Old admin key not signing | Pass `--source "$OLD_ADMIN_KEY"` and confirm the address matches the stored admin |
| `Error(Contract, #3) UnauthorizedAdmin` on `accept_admin` | `--new_admin` does not match the pending proposal | Check the address used in `propose_admin`; re-run `propose_admin` if needed |
| `Error(Contract, #15) NoPendingAdminTransfer` | `accept_admin` called before `propose_admin` | Run Step 2 (`propose_admin`) first |
| `Error(Contract, #2) NotInitialized` | Contract was not initialised | Run `initialize` first |
| `transaction failed: insufficient balance` | New admin account not funded | Fund the new account with Friendbot (testnet) or XLM transfer (mainnet) before proceeding |
| Old admin still passes auth after Step 4 | Step 4 transaction is still pending / not confirmed | Wait for ledger confirmation, then re-run Step 6 |

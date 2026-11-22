# Runbook: Admin Key Rotation

Transfers admin authority from the current keypair to a new one and updates all
dependent secrets and backend services. Use this runbook for both emergency
rotations (suspected key compromise) and scheduled 90-day key hygiene.

Estimated time: 30–45 minutes for a prepared operator.

**On-chain mechanism:** `transfer_admin` atomically replaces the stored admin
address in a single transaction. Both the current admin and the new admin must
sign — a compromised old key alone cannot hijack authority, and the new key
alone cannot pull authority to itself.

For the automated Phase 1–4 script, see
[`scripts/rotate-admin-key.sh`](../../scripts/rotate-admin-key.sh).

---

## Background

The `transfer_admin` contract function (available from contract v0.2.0):

- **Dual authorisation**: both `current_admin` and `new_admin` must sign the
  same transaction. Neither party can complete the transfer unilaterally.
- **Atomic replacement**: the new admin is active in the next ledger. There is
  no pending state or cooldown.
- **Audit event**: emits `AdminTransferred { old_admin, new_admin }` so
  off-chain monitors can detect unexpected rotations.

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

### 3. Check for in-flight transactions

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

---

## Phase 2 — Execute `transfer_admin` (dual-signature)

Both the old admin and the new admin must authorise the transaction.

**Option A — Sequential signing (recommended for production):**

```bash
export NETWORK=testnet         # or mainnet
export CONTRACT_ID=<CONTRACT_ID>
export OLD_ADMIN_KEY=<old-stellar-cli-identity-name>
export OLD_ADMIN_ADDRESS=$(stellar keys address "$OLD_ADMIN_KEY")

stellar tx new invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- transfer_admin \
  --current_admin "$OLD_ADMIN_ADDRESS" \
  --new_admin     "$NEW_ADMIN_ADDRESS" \
  | stellar tx sign --sign-with-key "$OLD_ADMIN_KEY" \
  | stellar tx sign --sign-with-key "$NEW_ADMIN_KEY" \
  | stellar tx send
# Expected: transaction hash + null return value
```

**Option B — Single invocation (testnet / both keys on the same machine):**

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$OLD_ADMIN_KEY" \
  -- transfer_admin \
  --current_admin "$OLD_ADMIN_ADDRESS" \
  --new_admin     "$NEW_ADMIN_ADDRESS"
# The CLI satisfies both require_auth calls via auth simulation when
# both identities are present locally.
```

> **Important**: On mainnet, always use Option A. It produces an explicit second
> signature from the incoming admin and leaves a verifiable audit trail in the
> transaction envelope.

---

## Phase 3 — Verify the New Admin on Chain

```bash
# New admin: register a canary maintainer (idempotent, safe to repeat)
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

---

## Phase 4 — Confirm the Old Admin Is Rejected

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

> If the secret `${SERVICE_NAME}-ADMIN_SECRET` does not yet exist, create it
> first:
>
> ```bash
> aws secretsmanager create-secret \
>   --region "$AWS_REGION" \
>   --name "${SERVICE_NAME}-ADMIN_SECRET" \
>   --description "WorkloadGovernor admin keypair secret key" \
>   --secret-string "$NEW_ADMIN_SECRET_VALUE"
> ```

### 5b. Verify the write succeeded

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

   # Remove all staging labels from the previous version
   if [[ -n "$OLD_VERSION_ID" ]]; then
     aws secretsmanager update-secret-version-stage \
       --region "$AWS_REGION" \
       --secret-id "${SERVICE_NAME}-ADMIN_SECRET" \
       --version-stage AWSPREVIOUS \
       --remove-from-version-id "$OLD_VERSION_ID"
   fi
   ```

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

```bash
# Replace with your actual health endpoint
HEALTH_URL="${HEALTH_URL:-https://api.workload-governor.example.com/api/health}"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "ERROR: health check returned $HTTP_STATUS" >&2
  exit 1
fi
echo "Health check passed: $HTTP_STATUS"
```

Also verify the Horizon network connectivity sub-check:

```bash
curl -s "$HEALTH_URL/network" | jq .status
# Expected: "ok"
```

---

## Verification Checklist

After completing all phases, confirm every item:

- [ ] `register_maintainer` succeeds with the new admin key (Phase 3).
- [ ] `register_maintainer` fails with `UnauthorizedAdmin` using the old admin
      key (Phase 4).
- [ ] `AdminTransferred` event visible in the Stellar explorer for the contract.
- [ ] AWS Secrets Manager shows a recent `LastChangedDate` for
      `${SERVICE_NAME}-ADMIN_SECRET`.
- [ ] Old version staging labels removed from the secret.
- [ ] All ECS tasks running on the new task definition revision.
- [ ] `GET /api/health` returns `200` from the backend.
- [ ] `GET /api/health/network` returns `{ "status": "ok" }`.
- [ ] CI pipeline passes with the updated `CI_ADMIN_SECRET`.
- [ ] Change-management record updated and closed.

---

## Rollback

`transfer_admin` is **irreversible by design** — once confirmed, the old admin
has no on-chain authority.

| Scenario | Recovery path |
|----------|--------------|
| Phase 2 transaction failed before submission | No on-chain change. Retry with corrected parameters. |
| Phase 2 succeeded but new key is immediately lost | Use whatever access you have to the new key (even briefly) to call `transfer_admin` again to a recovery key. |
| Phase 5 write failed | Re-run Phase 5. The on-chain rotation is complete regardless — the backend will fail auth until the secret is updated. |
| Phase 6 health check failing after restart | Verify the task definition references the correct secret ARN; check ECS task logs in CloudWatch for secret injection errors. Roll back the ECS service to the previous task definition revision if needed: `aws ecs update-service --task-definition <PREV_ARN> ...` |
| No new admin key and no recovery key | No rollback path without a contract upgrade. Contact the team to initiate an emergency contract upgrade that sets a new admin via the `initialize` replacement path. |

> **Prevention**: generate and fund the new keypair, and confirm the account
> exists on-chain, before initiating the transfer.

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

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error(Contract, #3) UnauthorizedAdmin` on `transfer_admin` | Old admin key not signing | Confirm `--source "$OLD_ADMIN_KEY"` and that the address matches the stored admin |
| `Error(Contract, #2) NotInitialized` | Contract was not initialised | Run `initialize` first |
| `HostError: auth` / auth simulation failure on new admin | New admin did not countersign | Use Option A (explicit dual signing with `stellar tx sign`) |
| `transaction failed: insufficient balance` | New admin account not funded | Fund with Friendbot (testnet) or XLM transfer (mainnet) |
| Old admin still passes auth after Phase 2 | Transaction not yet confirmed | Wait for ledger confirmation (~5 s) then re-run Phase 4 |
| `aws ecs wait services-stable` times out | Tasks not reaching RUNNING state | Check ECS task logs in CloudWatch for secret injection failures or OOM |
| `GET /api/health` returns non-200 | Backend misconfigured or still restarting | Re-run 6c wait; if still failing, check task definition and secret ARNs |
| `CI_ADMIN_SECRET` CI job fails after update | Old jobs cached the old secret | Re-run the failing job; GitHub re-reads secrets on each workflow run |

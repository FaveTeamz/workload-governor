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

---

## Error Codes

| Code | Variant | When raised |
|------|---------|-------------|
| 2 | `NotInitialized` | Called before `initialize` |
| 3 | `UnauthorizedAdmin` | Wrong caller on `propose_admin`, or `new_admin` mismatch on `accept_admin` |
| 15 | `NoPendingAdminTransfer` | `accept_admin` called with no active proposal |

---

## Prerequisites

Before starting, confirm every item:

- [ ] Current admin keypair (`OLD_ADMIN_SECRET`) is accessible and the source
      account is funded with XLM for fees.
- [ ] New admin keypair is **already generated** and the account is funded on
      the target network.
- [ ] Both keypairs are available in the Stellar CLI identity store (or as
      environment variables).
- [ ] Contract ID is known.
- [ ] Network (testnet / mainnet) is identified.
- [ ] You have read-write access to the secrets manager (vault, AWS Secrets
      Manager, etc.) where the admin secret is stored.
- [ ] Incident ticket or change-management record is open (production only).

---

## Pre-Flight Checks

Run these queries **before** executing the rotation. Any unexpected result is a
reason to halt and investigate.

### 1. Verify the current admin is stored correctly

```bash
# Attempt an admin-gated read as the current admin.
# If this fails, the key is already wrong — do not proceed.
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$OLD_ADMIN_KEY" \
  -- register_maintainer \
  --admin "$OLD_ADMIN_ADDRESS" \
  --maintainer "$OLD_ADMIN_ADDRESS" \
  --org_id preflight_check
# Expected: null (idempotent registration succeeds)
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

Review recent activity on the contract and both accounts before proceeding.

---

## Execution Steps

### Step 0 — Set environment variables

```bash
export NETWORK=testnet         # or mainnet
export CONTRACT_ID=<CONTRACT_ID>
export OLD_ADMIN_KEY=old-admin-identity   # stellar keys name
export OLD_ADMIN_ADDRESS=$(stellar keys address "$OLD_ADMIN_KEY")
export NEW_ADMIN_KEY=new-admin-identity
export NEW_ADMIN_ADDRESS=$(stellar keys address "$NEW_ADMIN_KEY")

echo "Rotating from: $OLD_ADMIN_ADDRESS"
echo "Rotating to:   $NEW_ADMIN_ADDRESS"
```

### Step 1 — Generate and fund the new admin keypair (if not yet done)

```bash
stellar keys generate --global "$NEW_ADMIN_KEY" --network "$NETWORK"

# Testnet: fund with Friendbot
curl "https://friendbot.stellar.org/?addr=$NEW_ADMIN_ADDRESS"

# Mainnet: transfer a small XLM balance to cover fees (minimum 1 XLM)
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
# Expected: error — Error(Contract, #3) UnauthorizedAdmin
# This error is CORRECT and confirms the rotation succeeded.
```

### Step 7 — Rotate the secret in the secrets manager

Immediately after on-chain confirmation of Step 4:

1. Store the new admin secret in your vault / AWS Secrets Manager.
2. Revoke access to the old admin secret for all principals.
3. Delete or archive the old admin secret (do not leave it accessible).
4. Update any CI/CD pipelines that reference `CI_ADMIN_SECRET`.

### Step 8 — Update the `.github/workflows/contract-ci.yml` secret reference

If the CI pipeline uses the admin key for testnet smoke tests:

1. Go to **Settings → Secrets and variables → Actions** in the GitHub repo.
2. Update `CI_ADMIN_SECRET` with the new admin's secret key.
3. Trigger a CI run to confirm the pipeline still passes.

---

## Verification Checklist

After completing all steps, confirm:

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

For high-value production deployments, do not store admin authority in a single
keypair. Instead:

### Option A — Stellar multisig

Add multiple signers to the admin Stellar account with a threshold of 2-of-3
or 3-of-5:

```bash
# Add a second signer to the admin account with weight 1
stellar account signer-add \
  --account "$ADMIN_ADDRESS" \
  --signer "$SIGNER_2_ADDRESS" \
  --weight 1 \
  --network mainnet \
  --source "$ADMIN_KEY"

# Set thresholds: low=1, med=2, high=2
stellar account threshold-set \
  --account "$ADMIN_ADDRESS" \
  --low 1 --med 2 --high 2 \
  --network mainnet \
  --source "$ADMIN_KEY"
```

Any transaction signed by the admin account now requires ≥2 of the registered
signers, preventing single-key compromise.

### Option B — Hardware Security Module (HSM)

Store the admin private key in an HSM (YubiKey, AWS CloudHSM, or similar).
Signing operations require physical access or quorum approval, eliminating
remote key theft.

### Option C — Multi-party computation (MPC)

Use an MPC wallet (e.g. Fireblocks, Fordefi) to distribute key material across
multiple parties. No single party ever holds the full key.

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

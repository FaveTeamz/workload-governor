# Runbook: Admin Key Rotation

Transfers admin authority from the current keypair to a new one using the
`transfer_admin` contract function. **Both** the current and new admin must
countersign the transaction.

Estimated time: 15–30 minutes for a prepared operator. The old admin key
loses all privileges atomically in a single on-chain transaction.

---

## Background

The `transfer_admin` function (added in contract v0.2.0) atomically replaces
the stored admin address. Its security properties are:

- **Dual authorisation**: both `current_admin` and `new_admin` must sign. A
  compromised old key alone cannot transfer to an attacker address, and a
  stolen new key alone cannot claim authority.
- **Immediate effect**: on-chain confirmation makes the new admin active in the
  next ledger. No cooldown or time-lock.
- **Event emitted**: `AdminTransferred { old_admin, new_admin }` is published
  so off-chain monitors can detect unexpected rotations.

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

### 3. Check for in-flight transactions

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

### Step 2 — Execute `transfer_admin` (dual-signature)

The Stellar CLI signs with `--source`. Because both the old and new admin must
authorise, use `--auth-with-source-account` for the second signer or prepare a
pre-authorised envelope.

**Option A — Sequential signing with `stellar tx`** (recommended for production):

```bash
# Build the transaction unsigned
stellar tx new invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- transfer_admin \
  --current_admin "$OLD_ADMIN_ADDRESS" \
  --new_admin "$NEW_ADMIN_ADDRESS" \
  | stellar tx sign --sign-with-key "$OLD_ADMIN_KEY" \
  | stellar tx sign --sign-with-key "$NEW_ADMIN_KEY" \
  | stellar tx send
# Expected: transaction hash + null return value
```

**Option B — Single invocation (testnet / when both keys are on same machine)**:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$OLD_ADMIN_KEY" \
  -- transfer_admin \
  --current_admin "$OLD_ADMIN_ADDRESS" \
  --new_admin "$NEW_ADMIN_ADDRESS"
# Both accounts are mocked in simulation; on mainnet use Option A.
```

> **Note:** In the Stellar CLI, `--source` signs as the fee-payer and also
> provides the first signature. When invoking `transfer_admin`, the contract's
> `new_admin.require_auth()` call will be satisfied by the CLI's auth simulation
> if both addresses are available locally, or by a pre-authorised entry in the
> transaction envelope. Use Option A for production to get an explicit second
> signature from the incoming admin.

### Step 3 — Verify the new admin is active

```bash
# New admin registers a test maintainer (idempotent, safe to call)
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

### Step 4 — Confirm the old admin is rejected

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

### Step 5 — Rotate the secret in the secrets manager

Immediately after on-chain confirmation:

1. Store the new admin secret in your vault / AWS Secrets Manager.
2. Revoke access to the old admin secret for all principals.
3. Delete or archive the old admin secret (do not leave it accessible).
4. Update any CI/CD pipelines that reference `CI_ADMIN_SECRET`.

### Step 6 — Update the `.github/workflows/contract-ci.yml` secret reference

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
- [ ] Old admin secret has been revoked in the secrets manager.
- [ ] CI pipeline passes with the updated secret.
- [ ] Change-management record is updated and closed.

---

## Rollback

`transfer_admin` is **irreversible in itself** — once committed, the old admin
has no on-chain authority. Rollback options:

1. **If Step 2 failed before submission**: no on-chain change occurred. Retry
   with the corrected parameters.
2. **If the new admin key is lost immediately after transfer**: call
   `transfer_admin` again from the new admin key to a recovery key (if you
   hold the new admin key even briefly). This is why generating and securing
   the new keypair before starting is a prerequisite.
3. **No other rollback path exists without the new admin key.**

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
| `Error(Contract, #3) UnauthorizedAdmin` on `transfer_admin` | Old admin key not signing | Pass `--source "$OLD_ADMIN_KEY"` and confirm the address matches the stored admin |
| `Error(Contract, #2) NotInitialized` | Contract was not initialised | Run `initialize` first |
| `HostError: auth` or auth simulation failure on new admin | New admin did not countersign | Use Option A (explicit dual signing with `stellar tx sign`) |
| `transaction failed: insufficient balance` | New admin account not funded | Fund the new account with Friendbot (testnet) or XLM transfer (mainnet) before proceeding |
| Old admin still passes auth after Step 2 | Step 2 transaction is still pending / not confirmed | Wait for ledger confirmation, then re-run Step 4 |

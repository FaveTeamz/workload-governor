# Runbook: Contract Upgrade

Upgrades the WorkloadGovernor WASM in-place on Stellar without changing the contract address.

## Prerequisites

- Stellar CLI installed and configured (`stellar --version`)
- Admin keypair available (`ADMIN_SECRET` in environment or `--source` flag)
- Contract ID (`CONTRACT_ID`) of the deployed instance

---

## Steps

### 1. Build and optimise the new WASM

```bash
stellar contract build
# Expected output: Compiling workload_governor ...
#                  Finished release [optimized] target(s) in Xs

stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm
# Expected output: Reading contract from target/wasm32v1-none/release/workload_governor.wasm
#                  Contract size is Nk bytes
#                  Saved contract to target/wasm32v1-none/release/workload_governor.optimized.wasm
```

### 2. Upload the WASM to the network

```bash
stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network testnet \
  --source "$ADMIN_SECRET"
# Expected output: <32-byte hex WASM hash>
# Save this value as NEW_WASM_HASH
export NEW_WASM_HASH=<output from above>
```

### 3. Invoke `upgrade` on the contract

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "$NEW_WASM_HASH"
# Expected output: null
# A non-null error means the upgrade was rejected — see Troubleshooting.
```

### 4. Verify the upgrade

```bash
# Read-only call — returns admin address; will panic if contract is broken
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_count \
  --contributor "$ADMIN_SECRET"
# Expected output: "0" (or existing count)
```

---

## Rollback

If the new WASM is defective, re-upload the previous artifact and call `upgrade` again with its hash. All storage state is preserved between upgrades.

```bash
stellar contract upload \
  --wasm path/to/previous.optimized.wasm \
  --network testnet \
  --source "$ADMIN_SECRET"
# Use the returned hash as NEW_WASM_HASH in step 3 above
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `NotInitialized` (error 2) | Contract was never initialised | Run `initialize` first |
| `UnauthorizedAdmin` (error 3) | Wrong signing key | Use the keypair that called `initialize` |
| `HostError: upload failed` | WASM too large or malformed | Re-run `stellar contract optimize` |


---

## Automated CI Pipeline

The manual steps above are wrapped in a dedicated GitHub Actions workflow that runs on every merge to `main`.

**Workflow file:** [`.github/workflows/contract-deploy-testnet.yml`](../../.github/workflows/contract-deploy-testnet.yml)

### Pipeline stages

```
push to main
    │
    ▼
[build-wasm]         Builds workload_governor.wasm (wasm32v1-none)
    │
    ▼
[optimize-wasm]      Runs stellar contract optimize → .optimized.wasm
    │
    ▼
[deploy-testnet]     Deploys/upgrades on testnet, runs full smoke suite
    │
    ▼  (manual workflow_dispatch with target=mainnet only)
[deploy-mainnet]     Requires human approval via GitHub environment gate
```

### Required GitHub secrets

Configure these under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `TESTNET_ADMIN_SECRET` | Ed25519 secret key for the testnet admin account |
| `TESTNET_CONTRACT_ID` | Deployed contract address on testnet (leave blank for first deploy) |
| `MAINNET_ADMIN_SECRET` | Ed25519 secret key for the mainnet admin account |
| `MAINNET_CONTRACT_ID` | Deployed contract address on mainnet (leave blank for first deploy) |
| `SLACK_WEBHOOK_URL` | Incoming webhook URL for the `#devops` channel |

### Configuring the mainnet approval gate

1. Go to **Settings → Environments** in the repository.
2. Create an environment named `mainnet`.
3. Under **Deployment protection rules**, add **Required reviewers** — select the maintainers who must approve before a mainnet deploy runs.
4. Optionally set a **Wait timer** (e.g. 5 minutes) to allow cancellation.

The `testnet` environment can also be created (with no required reviewers) to group the testnet deployment secrets separately from mainnet.

### Triggering a manual deployment

**Testnet (automatic on push to main):** No action needed — every merge triggers a testnet deploy.

**Testnet (manual):**
1. Go to **Actions → Contract Deploy — Testnet & Mainnet → Run workflow**.
2. Select `testnet` as the target.
3. Click **Run workflow**.

**Mainnet:**
1. Go to **Actions → Contract Deploy — Testnet & Mainnet → Run workflow**.
2. Select `mainnet` as the target.
3. Click **Run workflow**.
4. When the `deploy-testnet` job completes, the `deploy-mainnet` job pauses for reviewer approval.
5. A reviewer approves (or rejects) in the GitHub Actions UI.

### Smoke tests

The testnet deploy job runs two layers of smoke tests:

1. **Targeted test** — calls `get_global_application_count` with the CI admin address and asserts a numeric result.
2. **Full suite** — runs `tests/smoke/testnet-smoke.sh` which exercises all 13 contract functions end-to-end.

### Slack notifications

Deployment success and failure are posted to the `#devops` Slack channel via the `SLACK_WEBHOOK_URL` secret. If the secret is not configured, the notification step is silently skipped.

### Rollback after a failed mainnet deploy

See the [rollback runbook](../../docs/rollback-runbook.md) for full steps. The short version:

```bash
# Re-upload previous WASM and upgrade back
stellar contract upload \
  --wasm path/to/previous.optimized.wasm \
  --network mainnet \
  --source "$MAINNET_ADMIN_SECRET"
# → <previous-wasm-hash>

stellar contract invoke \
  --id "$MAINNET_CONTRACT_ID" \
  --network mainnet \
  --source "$MAINNET_ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "<previous-wasm-hash>"
```

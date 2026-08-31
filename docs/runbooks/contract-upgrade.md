# Runbook: Contract Upgrade

Upgrades the WorkloadGovernor WASM in-place on Stellar without changing the contract address.

## Prerequisites

- Stellar CLI installed and configured (`stellar --version`)
- Admin keypair available (`ADMIN_SECRET` in environment or `--source` flag)
- Contract ID (`CONTRACT_ID`) of the deployed instance
- CI dry-run has passed (see step 0 below)

---

## Step 0 — Dry-run Validation (required before every upgrade)

Before any real upgrade, the CI pipeline automatically runs a dry-run validation on every PR and push that touches `src/lib.rs`. This step:

- Builds and optimizes the WASM.
- Checks that the optimized WASM is **≤ 60 KB** (fails CI if exceeded).
- Deploys the new WASM to a local Stellar sandbox.
- Runs the full `cargo test --features testutils` suite against the new WASM.
- Fails CI if any test fails.

**You must not proceed with a real upgrade until the `upgrade-dryrun` CI job has passed for the commit you intend to deploy.**

### Running the dry-run locally

```bash
# 1. Build and optimize
cargo build --target wasm32v1-none --release
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --wasm-out target/wasm32v1-none/release/workload_governor.optimized.wasm

# 2. Check WASM size
wc -c target/wasm32v1-none/release/workload_governor.optimized.wasm
# Expected: < 61440 bytes (60 KB)

# 3. Start a local sandbox
stellar network start local --protocol-version 21 --limits testnet &
sleep 10

# 4. Configure and fund a test key
stellar network add local \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"
stellar keys generate dryrun-admin --no-fund
curl -s "http://localhost:8000/friendbot?addr=$(stellar keys address dryrun-admin)" > /dev/null

# 5. Deploy to sandbox
CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network local \
  --source dryrun-admin)
echo "Sandbox contract: $CONTRACT_ID"

# 6. Initialize
stellar contract invoke \
  --id "$CONTRACT_ID" --network local --source dryrun-admin \
  -- initialize --admin "$(stellar keys address dryrun-admin)"

# 7. Run all tests
cargo test --features testutils
# Expected: test result: ok. N passed; 0 failed
```

If all tests pass and the WASM is within size, proceed to step 1.

---

## Step 1 — Build and Optimise the New WASM

```bash
stellar contract build
# Expected: Compiling workload_governor ...
#           Finished release [optimized] target(s) in Xs

stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm
# Expected: Contract size is Nk bytes
#           Saved contract to ...workload_governor.optimized.wasm
```

Verify the size is within the 60 KB CI limit:
```bash
wc -c target/wasm32v1-none/release/workload_governor.optimized.wasm
# Must be < 61440 bytes
```

---

## Step 2 — Upload the WASM to the Network

```bash
stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network testnet \
  --source "$ADMIN_SECRET"
# Expected output: <32-byte hex WASM hash>
export NEW_WASM_HASH=<output from above>
```

---

## Step 3 — Invoke `upgrade` on the Contract

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

---

## Step 4 — Verify the Upgrade

```bash
# Confirm contract responds correctly after upgrade
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_count \
  --contributor "$ADMIN_SECRET"
# Expected output: "0" (or existing count)

# Confirm WASM hash changed
stellar contract info \
  --id "$CONTRACT_ID" \
  --network testnet
# The wasm_hash field should match $NEW_WASM_HASH
```

---

## Step 5 — Post-upgrade Smoke Tests

```bash
bash tests/smoke/testnet-smoke.sh
# All assertions must pass.
```

---

## Rollback Procedure

If the new WASM is defective after deployment, re-upload the previous artifact and call `upgrade` again with its hash. **All storage state is preserved between upgrades** — rolling back the WASM does not touch storage.

```bash
# Re-upload the previous WASM
stellar contract upload \
  --wasm path/to/previous.optimized.wasm \
  --network testnet \
  --source "$ADMIN_SECRET"
export PREV_WASM_HASH=<output>

# Invoke upgrade with previous hash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "$PREV_WASM_HASH"
# Expected: null

# Verify rollback
stellar contract info --id "$CONTRACT_ID" --network testnet
# wasm_hash should match $PREV_WASM_HASH
```

> **Tip:** Always retain the previous `.optimized.wasm` artifact (available as a GitHub Actions artifact for 90 days). Tag the last-known-good WASM hash in `config/contracts.json` before every upgrade.

### Storage-incompatible rollback

If the new WASM introduced breaking storage schema changes that have already been written on-chain, a simple WASM rollback is insufficient. Follow the migration playbook in `docs/storage-design.md` (Playbook B or C) to reverse the schema change before rolling back the WASM.

---

## WASM Size Budget

| Build | Limit | Action if exceeded |
|-------|-------|-------------------|
| Optimized WASM | 60 KB (CI gate) | Profile with `twiggy` or `wasm-opt`, remove dead code |
| Optimized WASM | 64 KB (Stellar network hard limit) | Contract will be rejected at upload |

To profile WASM size:
```bash
cargo install twiggy
twiggy top target/wasm32v1-none/release/workload_governor.wasm
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `NotInitialized` (error 2) | Contract was never initialised | Run `initialize` first |
| `UnauthorizedAdmin` (error 3) | Wrong signing key | Use the keypair that called `initialize` |
| `HostError: upload failed` | WASM too large or malformed | Re-run `stellar contract optimize`; check size |
| CI `upgrade-dryrun` fails on size | WASM exceeds 60 KB | Profile with `twiggy`, reduce code size |
| CI `upgrade-dryrun` fails on tests | New WASM broke a test | Fix the failing test before deploying |

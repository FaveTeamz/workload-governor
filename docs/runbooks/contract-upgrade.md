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

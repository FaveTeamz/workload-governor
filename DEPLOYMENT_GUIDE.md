# WorkloadGovernor Deployment & Upgrade Guide

This guide covers building, deploying, and upgrading the `workload-governor` smart contract on Stellar/Soroban networks.

## Prerequisites

- **Stellar CLI**: Install or update to the latest supported version:
  ```bash
  cargo install --locked stellar-cli --features opt
  ```
- **Rust & WASM Target**:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- Configured identity / admin secret key and network RPC URL.

## 1. Building the Contract

Build the optimized WASM contract binary:

```bash
stellar contract build
```

This generates the release artifact at `target/wasm32-unknown-unknown/release/workload_governor.wasm`.

## 2. Bytecode Verification

Before uploading any binary to testnet or mainnet, calculate and verify its cryptographic hash:

```bash
sha256sum target/wasm32-unknown-unknown/release/workload_governor.wasm
```

Verify that this matches the expected release checksum if deploying from an official release build.

## 3. Initial Deployment

1. **Install / Upload the contract WASM:**
   ```bash
   WASM_HASH=$(stellar contract install \
     --wasm target/wasm32-unknown-unknown/release/workload_governor.wasm \
     --network testnet \
     --source <admin-identity>)
   echo "Uploaded WASM Hash: $WASM_HASH"
   ```

2. **Deploy the contract instance:**
   ```bash
   CONTRACT_ID=$(stellar contract deploy \
     --wasm-hash "$WASM_HASH" \
     --network testnet \
     --source <admin-identity>)
   echo "Deployed Contract ID: $CONTRACT_ID"
   ```

3. **Initialize the contract:**
   ```bash
   stellar contract invoke \
     --id "$CONTRACT_ID" \
     --network testnet \
     --source <admin-identity> \
     -- init \
     --admin <ADMIN_ADDRESS> \
     --max_assignments 5
   ```

## 4. Contract Upgrades & Storage Migrations

For in-place upgrades of the contract code and executing data schema migrations, follow the step-by-step procedures outlined in the dedicated runbook:

- 📖 **[Contract Upgrade Runbook](docs/runbooks/contract-upgrade.md)**: Detailed guidance on WASM hash verification, `upgrade` invocation, atomicity, storage key migration (`migrate_v1_to_v2`), and rollback procedures.

## 5. Post-Deployment Verification

Verify contract functionality and connectivity:

```bash
# Check admin/limits
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_max_assignments_per_contributor
```

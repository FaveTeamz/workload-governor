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

## 3. Atomic Initialization

Do not deploy a WorkloadGovernor instance and initialize it in separate
transactions. Between those transactions, any account could call the public
`initialize` entry point first and claim admin control. `initialize` is guarded
against a second call, but that does not protect an uninitialized instance.

Use one of these atomic patterns:

### Factory contract

Deploy a trusted factory contract first. Its authenticated
`deploy_and_initialize(wasm_hash, salt, admin)` entry point must:

1. Require authorization from the intended admin.
2. Deploy the WorkloadGovernor instance with the supplied WASM hash and salt.
3. Invoke `initialize(admin)` on the new instance before returning its ID.

The factory deployment and nested initialization run within one transaction.
If initialization fails, the transaction rolls back and the new instance is
not left available for another caller to claim. A client invoking the factory
must authorize the complete nested call tree.

Example invocation shape (the factory must implement this interface):

```bash
CONTRACT_ID=$(stellar contract invoke \
  --id <FACTORY_CONTRACT_ID> \
  --network testnet \
  --source <admin-identity> \
  -- deploy_and_initialize \
  --wasm_hash "$WASM_HASH" \
  --salt <UNIQUE_32_BYTE_SALT> \
  --admin <ADMIN_ADDRESS>)
```

### Contract constructor

Alternatively, build the admin assignment into a Soroban contract constructor
supported by the deployed SDK and network protocol. The constructor must
validate/authenticate the intended admin and persist it as part of instance
creation; do not leave a separate first-caller-wins `initialize` call enabled.
The current WorkloadGovernor WASM does not implement a constructor, so use a
factory for the current contract.

The contract includes a unit test, `unit_error_already_initialized`, asserting
that a second `initialize` call fails. This protects initialized instances but
is not a substitute for atomic deployment and initialization.

## 4. Initial Deployment

1. **Install / Upload the contract WASM:**
   ```bash
   WASM_HASH=$(stellar contract install \
     --wasm target/wasm32-unknown-unknown/release/workload_governor.wasm \
     --network testnet \
     --source <admin-identity>)
   echo "Uploaded WASM Hash: $WASM_HASH"
   ```

2. **Deploy and initialize atomically** using the factory procedure above. Do
  not use `stellar contract deploy` followed by a separate `initialize`
  invocation for a production instance.

## 5. Contract Upgrades & Storage Migrations

For in-place upgrades of the contract code and executing data schema migrations, follow the step-by-step procedures outlined in the dedicated runbook:

- 📖 **[Contract Upgrade Runbook](docs/runbooks/contract-upgrade.md)**: Detailed guidance on WASM hash verification, `upgrade` invocation, atomicity, storage key migration (`migrate_v1_to_v2`), and rollback procedures.

## 6. Post-Deployment Verification

Verify contract functionality and connectivity:

```bash
# Check the global application cap
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_cap
```

# Deployment Runbook

Step-by-step guide for building, deploying, and initializing WorkloadGovernor
on Stellar mainnet. Every command is copy-pasteable; replace angle-bracket
placeholders with real values.

---

## Prerequisites

- Rust stable toolchain with `wasm32v1-none` target
- Stellar CLI (`stellar-cli`) ≥ 21
- A funded mainnet account for the deployer (`<DEPLOYER_ACCOUNT>`)
- A funded mainnet account to be the admin (`<ADMIN_ADDRESS>`)
- At least one maintainer address per org ready (`<MAINTAINER_ADDRESS>`)

---

## Step 1 — Build and Optimise the WASM

```bash
# Add the required target if not already present
rustup target add wasm32v1-none

# Build the release WASM
cargo build --target wasm32v1-none --release

# Optimise (mandatory before mainnet; reduces size and fees)
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

# Verify the optimised artifact exists
ls -lh target/wasm32v1-none/release/workload_governor.optimized.wasm
```

Expected output: a `.optimized.wasm` file under 64 KB.

---

## Step 2 — Fund the Deployer Account on Mainnet

The deployer account must hold enough XLM to cover:

- Contract upload fees (proportional to WASM size)
- Contract deployment fees
- Initialization transaction fee

```bash
# Check current balance
stellar account show \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT>

# If funding from another account:
stellar tx send \
  --network mainnet \
  --source <FUNDING_ACCOUNT> \
  --destination <DEPLOYER_ACCOUNT> \
  --amount 10
```

Minimum recommended balance: **5 XLM** on top of the base reserve.

---

## Step 3 — Deploy the Contract and Capture the Contract ID

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT>
```

The CLI prints the contract ID. Save it immediately:

```bash
export CONTRACT_ID=<OUTPUT_CONTRACT_ID>
echo "CONTRACT_ID=$CONTRACT_ID" >> .env.mainnet
```

Verify the contract is on-chain:

```bash
stellar contract info \
  --id "$CONTRACT_ID" \
  --network mainnet
```

---

## Step 4 — Initialize with the Admin Address

`initialize` can only be called once. If it fails the contract is unusable and
a new deployment is required (see Rollback).

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT> \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

Verify initialization succeeded:

```bash
# Should return the admin address without error
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT> \
  -- get_global_application_count \
  --contributor <ADMIN_ADDRESS>
```

Expected result: `0` (not an error).

---

## Step 5 — Register First Maintainers

Repeat for each (maintainer, org) pair.

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>
```

---

## Step 6 — Verify Each Step with Contract Invocations

```bash
# 6a. Confirm admin is set (error 2 = NotInitialized means Step 4 failed)
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- get_global_application_count \
  --contributor <ADMIN_ADDRESS>

# 6b. Confirm maintainer registration
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- get_org_assignment_count \
  --contributor <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>

# 6c. Test apply_for_issue end-to-end with a canary account
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <CANARY_CONTRIBUTOR> \
  -- apply_for_issue \
  --contributor <CANARY_CONTRIBUTOR> \
  --org_id <ORG_ID> \
  --issue_id 1

# Confirm it was recorded
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <CANARY_CONTRIBUTOR> \
  -- has_applied \
  --contributor <CANARY_CONTRIBUTOR> \
  --org_id <ORG_ID> \
  --issue_id 1
# Expected: true

# 6d. Withdraw the canary application
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <CANARY_CONTRIBUTOR> \
  -- withdraw_application \
  --contributor <CANARY_CONTRIBUTOR> \
  --org_id <ORG_ID> \
  --issue_id 1
```

---

## Rollback: What to Do if Initialization Fails

### Partial failure: deploy succeeded, initialize failed

The contract WASM is uploaded but the storage is blank. The contract will
return error `2` (`NotInitialized`) on any state-changing call.

Options:

1. **Retry initialization** — if the transaction failed due to a transient
   network error, simply re-run the Step 4 command. The `AlreadyInitialized`
   guard (error `1`) will prevent a double-init.

2. **Redeploy** — if the admin address was wrong or the call cannot be retried:

   ```bash
   # Deploy a fresh instance
   stellar contract deploy \
     --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
     --network mainnet \
     --source <DEPLOYER_ACCOUNT>

   export CONTRACT_ID=<NEW_CONTRACT_ID>

   # Update all client configs to point to the new contract ID
   # Then initialize the new instance
   stellar contract invoke \
     --id "$CONTRACT_ID" \
     --network mainnet \
     --source <DEPLOYER_ACCOUNT> \
     -- initialize \
     --admin <ADMIN_ADDRESS>
   ```

3. **Update .env** — after any redeployment, update `CONTRACT_ID` in every
   environment config (`.env.mainnet`, backend ECS task definition,
   Terraform variables) and redeploy the backend.

### Partial failure: maintainer registration failed

Registration is idempotent in outcome — a second call for the same
`(maintainer, org_id)` pair simply overwrites with the same value. Re-run
Step 5 safely.

### Contract upgrade path

If a logic bug requires a fix after deployment, use the `upgrade` function
(admin only) to swap the WASM hash without changing the contract ID:

```bash
# 1. Build and optimise the new WASM (Step 1)
# 2. Upload the WASM to get its hash
stellar contract install \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source <ADMIN_ADDRESS>
# Save the printed wasm_hash

# 3. Invoke upgrade
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- upgrade \
  --new_wasm_hash <WASM_HASH>
```

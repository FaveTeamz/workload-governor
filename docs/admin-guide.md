# Admin Guide

Procedures for deploying, initializing, and maintaining the WorkloadGovernor contract. The admin address is the single privileged actor for all governance operations.

---

## Admin Key Management

The admin is a Stellar account whose address is stored persistently in the contract after `initialize`. All admin operations require a signature from that exact key.

**Best practices:**

- Use a dedicated Stellar account solely for admin duties — never a personal or contributor account.
- Store the admin secret key in a hardware wallet or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault). Never commit it to version control.
- Rotate the admin key only via a contract upgrade (there is no `set_admin` function); plan key custody carefully before deploying.
- Keep the admin account funded with enough XLM to submit transactions (minimum base reserve + ~1 XLM buffer for fees).
- Record the admin address in a secure, access-controlled location shared only with authorized personnel.
- On testnet, use `stellar keys generate` to create an isolated test admin; never reuse testnet keys on mainnet.

---

## Step 1 — Build and Optimize the WASM

```bash
rustup target add wasm32v1-none

cargo build --target wasm32v1-none --release

stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

ls -lh target/wasm32v1-none/release/workload_governor.optimized.wasm
```

The optimized artifact should be under 64 KB.

---

## Step 2 — Deploy the Contract

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT>
```

Save the printed contract ID immediately:

```bash
export CONTRACT_ID=<OUTPUT_CONTRACT_ID>
echo "CONTRACT_ID=$CONTRACT_ID" >> .env.mainnet
```

The deployer account only needs to cover upload and deployment fees; it does not need to be the admin.

---

## Step 3 — Initialize the Contract

`initialize` can only be called once. The transaction must be signed by `<ADMIN_ADDRESS>`.

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

Verify it succeeded (expected result: `0`):

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- get_global_application_count \
  --contributor <ADMIN_ADDRESS>
```

If you receive error `1` (`AlreadyInitialized`), initialization already ran — do not retry. If you receive error `2` (`NotInitialized`), the transaction failed; retry Step 3.

---

## Step 4 — Register the First Maintainer

Repeat for each `(maintainer, org_id)` pair. Registration is idempotent — re-running is safe.

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

Verify the maintainer can be used by checking org assignment count (expected: `0`):

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- get_org_assignment_count \
  --contributor <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>
```

---

## Upgrade Process

Use `upgrade` to swap the contract WASM without changing the contract ID or any stored state. The admin key is required.

**1. Build and optimize the new WASM** (Step 1 above).

**2. Upload the WASM to the network and capture its hash:**

```bash
stellar contract install \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source <ADMIN_ADDRESS>
# Prints: <WASM_HASH>
```

**3. Invoke the upgrade:**

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- upgrade \
  --new_wasm_hash <WASM_HASH>
```

**4. Verify the upgrade:** run a read-only query (e.g., `get_global_application_count`) to confirm the contract responds without error.

Notes:
- All persistent storage (admin, maintainers, assignments) is preserved across upgrades.
- Temporary storage (pending applications) is also unaffected.
- If the `upgrade` transaction fails with error `3` (`UnauthorizedAdmin`), confirm the transaction is signed by the stored admin address, not the deployer.

---

## Emergency Procedures

### Admin key compromised or lost

There is no on-chain admin rotation. If the admin key is compromised:

1. Immediately audit recent admin transactions on-chain for unauthorized calls.
2. Deploy a new contract instance (Steps 1–4 above) with a new admin key.
3. Notify maintainers and update all client configurations (`CONTRACT_ID` in `.env.mainnet`, backend task definitions, Terraform variables) to point to the new contract.
4. Revoke access to the compromised key in your secrets manager and rotate any related credentials.

### Contract initialization failed

If `initialize` failed (error `2` on subsequent calls):

- **Transient failure:** re-run the Step 3 command. The `AlreadyInitialized` guard prevents double-initialization.
- **Wrong admin address supplied:** deploy a new contract instance and initialize with the correct address. The partially-deployed instance with blank state can be abandoned.

### Stuck or incorrect maintainer

Maintainer registration (`register_maintainer`) is currently append-only — there is no `deregister_maintainer` function. To remove a maintainer's access, upgrade the contract to a version that includes a deregistration function, or deploy a fresh instance and re-register only the intended maintainers.

### Mass application expiry (Wave end)

Temporary application entries expire automatically at Wave TTL (`APP_TTL_LEDGERS = 17 280 ledgers ≈ 24 h`). No admin action is required. If applications must be preserved beyond that window, contributors or platform tooling should call `extend_application_ttl` before expiry.

### Unresponsive contract (network issue)

If the Stellar network is degraded:

1. Check network status at [https://dashboard.stellar.org](https://dashboard.stellar.org).
2. Do not retry transactions in a tight loop — duplicate submissions can cause unexpected state if the network recovers mid-retry.
3. Use `stellar tx status <TX_HASH>` to check whether a previously submitted transaction was included.

---

## Reference

| Document | Description |
|---|---|
| [deployment-runbook.md](deployment-runbook.md) | Full mainnet deployment steps with verification commands |
| [error-reference.md](error-reference.md) | All 11 error codes with causes and resolutions |
| [storage-design.md](storage-design.md) | Storage key patterns and TTL semantics |

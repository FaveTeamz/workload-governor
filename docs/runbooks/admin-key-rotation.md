# Runbook: Admin Key Rotation

Transfers admin authority to a new keypair using a two-step procedure: upgrade the contract to a version that accepts a new admin, then reinitialise. Because the current contract has no `transfer_admin` function, key rotation requires a contract upgrade.

## Prerequisites

- Current admin keypair (`OLD_ADMIN_SECRET`)
- New admin keypair already generated and funded on-chain (`NEW_ADMIN_ADDRESS`)
- Contract ID (`CONTRACT_ID`)
- Stellar CLI installed

---

## Steps

### 1. Add `transfer_admin` to the contract source

Edit `src/lib.rs` and add the following function inside `#[contractimpl] impl WorkloadGovernor`:

```rust
pub fn transfer_admin(env: Env, current_admin: Address, new_admin: Address) {
    storage::require_initialized(&env, &ContractError::NotInitialized);
    let stored = storage::get_admin(&env).unwrap();
    stored.require_auth();           // old admin must sign
    new_admin.require_auth();        // new admin must countersign
    storage::set_admin(&env, &new_admin);
    storage::bump_instance(&env);
}
```

### 2. Build, optimise, and upload the patched WASM

```bash
stellar contract build
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network testnet \
  --source "$OLD_ADMIN_SECRET"
# Expected output: <NEW_WASM_HASH>
export NEW_WASM_HASH=<output>
```

### 3. Upgrade the contract

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$OLD_ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "$NEW_WASM_HASH"
# Expected output: null
```

### 4. Transfer admin (dual-signature)

Both the old and new admin must sign in the same transaction. Use a multi-source invocation or a pre-authorised transaction envelope.

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$OLD_ADMIN_SECRET" \
  -- transfer_admin \
  --current_admin "$OLD_ADMIN_ADDRESS" \
  --new_admin "$NEW_ADMIN_ADDRESS"
# Both accounts must have authorised this invocation.
# Expected output: null
```

### 5. Verify the new admin is active

```bash
# Only the new admin can register maintainers; use a dummy call that would
# succeed with the new admin and fail with the old.
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$NEW_ADMIN_SECRET" \
  -- register_maintainer \
  --admin "$NEW_ADMIN_ADDRESS" \
  --maintainer "$NEW_ADMIN_ADDRESS" \
  --org_id rotation_test
# Expected output: null
```

### 6. Revoke the old keypair

Deactivate or delete the old admin keypair in your secrets manager. Confirm the old key can no longer call admin functions:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$OLD_ADMIN_SECRET" \
  -- register_maintainer \
  --admin "$OLD_ADMIN_ADDRESS" \
  --maintainer "$OLD_ADMIN_ADDRESS" \
  --org_id should_fail
# Expected output: HostError (auth failure) — this is correct
```

---

## Rollback

If the transfer fails at step 4, the old admin is still in storage. Re-invoke `transfer_admin` with a corrected `new_admin` address.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `UnauthorizedAdmin` | Old admin key not signing | Pass `--source "$OLD_ADMIN_SECRET"` |
| `HostError: auth` on new admin | New admin did not countersign | Use pre-auth or Freighter multi-sig |
| `NotInitialized` (error 2) | Contract not yet set up | Run `initialize` first |

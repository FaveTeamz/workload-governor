# Runbook: Contributor Cap Emergency Increase

Increases the global application cap (default 15) or the per-org assignment cap (default 4) in response to an operational emergency. This change requires a governance vote and a contract upgrade because both limits are compile-time constants.

## Prerequisites

- Governance vote passed and recorded (link the vote in your incident report)
- Admin keypair (`ADMIN_SECRET`)
- Contract ID (`CONTRACT_ID`)
- Stellar CLI installed

---

## Steps

### 1. Hold the governance vote

Cap changes must be approved before any code change. Document:

- Proposed new global cap (`NEW_GLOBAL_CAP`)
- Proposed new org cap (`NEW_ORG_CAP`)
- Vote outcome and link (e.g. GitHub Discussion or on-chain proposal)

Do **not** proceed until the vote passes.

### 2. Update the constants in source

Edit `src/storage.rs`:

```rust
// Before
pub const GLOBAL_APP_LIMIT: u32 = 15;
pub const ORG_ASSIGNMENT_LIMIT: u32 = 4;

// After (example: raise global cap to 20)
pub const GLOBAL_APP_LIMIT: u32 = 20;
pub const ORG_ASSIGNMENT_LIMIT: u32 = 4;
```

Update the README `## Error Codes` table with the new limits.

### 3. Run all tests

```bash
cargo test --features testutils
# Expected output: test result: ok. N passed; 0 failed
```

Fix any failing tests (property tests reference the old cap values and must be updated to match).

### 4. Build, optimise, and upload

```bash
stellar contract build
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network testnet \
  --source "$ADMIN_SECRET"
# Expected output: <NEW_WASM_HASH>
export NEW_WASM_HASH=<output>
```

### 5. Upgrade the contract

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "$NEW_WASM_HASH"
# Expected output: null
```

### 6. Verify the new caps

```bash
# Confirm a contributor can now apply for more than the old limit
# (requires a test account with existing applications)
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_capacity \
  --contributor "$TEST_CONTRIBUTOR"
# Expected output: capacity reflecting the new limit
```

### 7. Update monitoring alerts

If you have CloudWatch or Datadog alerts based on the old cap values, update the thresholds to match the new constants.

---

## Rollback

To revert the cap increase, restore the original constants in `src/storage.rs`, re-run tests, build/upload, and call `upgrade` with the reverted WASM hash.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Test failures after constant change | Property tests reference hardcoded limit | Update `15` / `4` literals in `src/test.rs` |
| `UnauthorizedAdmin` on upgrade | Wrong signing key | Use the original admin keypair |
| `OrgAssignmentLimitReached` still fires | Old WASM still in use | Confirm `upgrade` transaction was finalised |

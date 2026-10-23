# Contract Upgrade Runbook

This document describes the procedure for upgrading WorkloadGovernor to v2
and running the mandatory storage migration.

## Overview

The v2 upgrade changes the key format for org assignment counts:

| Version | Key format |
|---|---|
| v1 | `("o_asgn", org_id, contributor)` |
| v2 | `("o_asgn", contributor, org_id)` |

Upgrading without migrating will orphan all v1 entries, resetting every
contributor's assignment count to 0. The migration function reads v1 keys,
writes v2 keys, and deletes the old entries atomically.

## Pre-Upgrade Checklist

- [ ] Snapshot all live `("o_asgn", …)` storage entries off-chain.
- [ ] Build and audit the new WASM binary.
- [ ] Prepare the `pairs` list: every `(contributor, org_id)` tuple that has
      a non-zero assignment count on-chain.
- [ ] Confirm the admin key is available and has not been rotated.

## WASM Checksum Calculation & Verification

Before installing or upgrading a contract, operators must compute and verify the WASM hash against the compiled release build and published GitHub release assets to prevent deploying unverified or compromised bytecode.

### 1. Compute Local Binary SHA256 Checksum

Run `sha256sum` on the release target WASM:

```bash
# For Soroban target:
sha256sum target/wasm32-unknown-unknown/release/workload_governor.wasm

# Or if building with wasm32v1-none:
sha256sum target/wasm32v1-none/release/workload_governor.wasm
```

Store the calculated hash in an environment variable for verification:

```bash
WASM_PATH="target/wasm32-unknown-unknown/release/workload_governor.wasm"
EXPECTED_HASH=$(sha256sum "$WASM_PATH" | awk '{print $1}')
echo "Compiled WASM SHA256: $EXPECTED_HASH"
```

### 2. Verify Against GitHub Release Asset

Compare the calculated hash against the checksum file distributed with the GitHub release:

```bash
# Download official release checksum
curl -sSL "https://github.com/FaveTeamz/workload-governor/releases/download/${RELEASE_TAG}/workload_governor.wasm.sha256" -o expected.sha256

# Verify match
echo "$EXPECTED_HASH  $WASM_PATH" | sha256sum -c -
```

### Verification Checklist Before Upload

- [ ] Local build reproduced using the pinned toolchain in `rust-toolchain.toml`.
- [ ] SHA256 checksum matches the published release artifact in GitHub Releases.
- [ ] Code audit completed and signed off for the corresponding Git commit tag.
- [ ] Admin multisig signers or operator keys confirmed ready.

## Upgrade Procedure

### Step 1 — Install / Upload New WASM Bytecode

Install the verified WASM binary onto the Stellar network. Both `install` and `upload` can be used (`install` is alias/equivalent in modern Stellar CLI):

```bash
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/workload_governor.wasm \
  --network mainnet \
  --source <admin-account>
```

Alternatively:

```bash
stellar contract upload \
  --wasm target/wasm32-unknown-unknown/release/workload_governor.wasm \
  --network mainnet \
  --source <admin-account>
```

The CLI outputs the 32-byte hex WASM hash. **Verify that the returned on-chain WASM hash exactly matches your calculated `$EXPECTED_HASH`**.

### Step 2 — Invoke `upgrade`

Invoke the contract's `upgrade` function with the verified WASM hash:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <admin-account> \
  -- upgrade \
  --new_wasm_hash "$EXPECTED_HASH"
```

### Step 3 — Run `migrate_v1_to_v2`

Prepare your pairs JSON (example):

```json
[
  ["GCONTRIBUTOR1XXXX", "acme"],
  ["GCONTRIBUTOR2XXXX", "acme"],
  ["GCONTRIBUTOR1XXXX", "beta"]
]
```

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <admin-account> \
  -- migrate_v1_to_v2 \
  --admin <ADMIN_ADDRESS> \
  --pairs '[["GCONTRIBUTOR1", "acme"], ...]'
```

Verify the `MigrationCompleted` event was emitted with `entries_migrated > 0`.

### Step 4 — Post-Upgrade Verification Checklist

Execute smoke tests and read queries against the upgraded contract to verify responsiveness and storage integrity:

```bash
# 1. Spot-check a known contributor/org assignment count
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  -- get_org_assignment_count \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme

# 2. Check global configuration / limits respond
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  -- get_max_assignments_per_contributor

# 3. Test assignment eligibility check
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  -- can_assign \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme
```

#### Post-Upgrade Checklist:
- [ ] Returned assignment counts match the pre-upgrade snapshot.
- [ ] Contract read functions (`get_org_assignment_count`, `can_assign`, etc.) return without error.
- [ ] Test transaction or assignment check succeeds on staging/mainnet.
- [ ] Migration event `MigrationCompleted` confirmed on block explorer with correct `entries_migrated`.
- [ ] Monitoring dashboards and indexer services reporting zero deserialization or RPC errors.

## Rollback

The migration is one-way. The `MigrationAlreadyDone` guard (error code 12)
prevents running it twice. If the migration fails mid-way:

1. Re-run `migrate_v1_to_v2` with only the remaining pairs — already-migrated
   entries will be silently skipped because the v1 key will be absent.
2. If the WASM upgrade itself needs to be reverted, call `upgrade` again with
   the previous WASM hash before migration runs.

## Events

| Event | Topics | Data |
|---|---|---|
| `MigrationCompleted` | `("mig_done", admin)` | `(entries_migrated: u32,)` |

## Error Codes

| Code | Variant | Trigger |
|---|---|---|
| 12 | `MigrationAlreadyDone` | `migrate_v1_to_v2` called a second time |

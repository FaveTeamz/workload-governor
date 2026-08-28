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

## Upgrade Procedure

### Step 1 — Deploy new WASM

```bash
stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --network mainnet \
  --source <admin-account>
# Note the returned WASM hash.
```

### Step 2 — Invoke `upgrade`

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <admin-account> \
  -- upgrade \
  --new_wasm_hash <WASM_HASH>
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

### Step 4 — Verify

```bash
# Spot-check a known contributor/org pair
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  -- get_org_assignment_count \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id acme
```

The returned count must match the pre-upgrade snapshot.

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

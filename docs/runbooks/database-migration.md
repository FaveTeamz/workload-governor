# Database Migration Runbook

This runbook covers procedures for migrating and backfilling data in the WorkloadGovernor PostgreSQL database, with a focus on the `contract_events` table.

---

## Table of contents

1. [Overview](#overview)
2. [backfill-events CLI](#backfill-events-cli)
   - [Prerequisites](#prerequisites)
   - [Flags reference](#flags-reference)
   - [Common workflows](#common-workflows)
   - [Checkpoint behaviour](#checkpoint-behaviour)
   - [Dry-run mode](#dry-run-mode)
3. [Schema migrations](#schema-migrations)
4. [Rollback](#rollback)

---

## Overview

The `contract_events` table stores decoded Soroban smart-contract events indexed by the `EventIndexer` service. When new replicas are provisioned or the indexer has been offline, historical events may need to be backfilled directly from the Soroban RPC node.

The `src/scripts/backfill-events.ts` CLI script handles this process safely with support for dry-run estimation, configurable batch sizes, and automatic resume checkpointing.

---

## backfill-events CLI

### Prerequisites

| Requirement | Details |
|---|---|
| Node.js ≥ 18 | Required to run `ts-node` |
| `DATABASE_URL` env var | PostgreSQL connection string |
| `SOROBAN_RPC_URL` env var | Soroban RPC endpoint (defaults to testnet) |
| `CONTRACT_ID` env var | Soroban contract address to query |

Install dependencies (if not already done):

```bash
npm install
```

### Flags reference

| Flag | Alias | Type | Default | Description |
|---|---|---|---|---|
| `--dry-run` | `-d` | boolean | `false` | Report event statistics without writing to the DB |
| `--batch-size` | `-b` | number | `100` | Events fetched per RPC call |
| `--resume` | `-r` | boolean | `false` | Resume from `.backfill-checkpoint.json` |
| `--start-ledger` | `-s` | number | — | Ledger sequence to start from (ignored when `--resume` is set) |
| `--end-ledger` | `-e` | number | — | Ledger sequence to stop at (inclusive) |

### Common workflows

#### 1. Estimate backfill volume before touching production

Always run a dry-run first to understand event counts and projected storage impact:

```bash
npx ts-node src/scripts/backfill-events.ts --dry-run
```

Sample output:

```
[backfill] *** DRY-RUN MODE — no database writes will be performed ***
[backfill] Processed up to ledger 1234567 | fetched=850 parsed=742 inserted=742 skipped=108
...

==============================
 Backfill summary
==============================
  Mode            : DRY-RUN (no writes)
  Total fetched   : 850
  Total parsed    : 742
  Would insert    : 742
  Est. storage    : 371.0 KB (~512 bytes/event)
  Skipped/dup     : 108
==============================
```

#### 2. Full historical backfill (live)

```bash
npx ts-node src/scripts/backfill-events.ts --batch-size 500
```

#### 3. Backfill from a specific ledger range

```bash
npx ts-node src/scripts/backfill-events.ts \
  --start-ledger 1000000 \
  --end-ledger   1500000 \
  --batch-size   200
```

#### 4. Resume an interrupted backfill

If the process was killed mid-run, resume from where it left off:

```bash
npx ts-node src/scripts/backfill-events.ts --resume
```

The script reads `.backfill-checkpoint.json` from the current working directory and continues from `lastLedger + 1`.

#### 5. Large-scale production backfill

For multi-million ledger backfills, run in a dedicated ECS task or screen session:

```bash
# Start a detached screen session
screen -S backfill

# Inside the session
DATABASE_URL="postgres://..." \
SOROBAN_RPC_URL="https://..." \
CONTRACT_ID="C..." \
npx ts-node src/scripts/backfill-events.ts \
  --batch-size 1000 \
  --resume

# Detach: Ctrl+A then D
# Re-attach later: screen -r backfill
```

### Checkpoint behaviour

- Progress is saved to `.backfill-checkpoint.json` in the current working directory every **1,000 ledgers**.
- A final checkpoint is saved when the script exits cleanly.
- Checkpoint format:

```json
{
  "lastLedger": 1234567,
  "processedAt": "2026-09-27T18:00:00.000Z"
}
```

- Delete `.backfill-checkpoint.json` if you want to start over from the beginning.
- The file is listed in `.gitignore` to prevent accidental commits.

### Dry-run mode

`--dry-run` makes no database writes. It fetches events from the RPC node, parses them, accumulates statistics, and prints a summary. Use it to:

- Estimate row count before provisioning disk space.
- Validate RPC connectivity without side effects.
- Verify event parsing logic in staging.

> **Note:** Checkpoint files are **not** written in dry-run mode.

---

## Schema migrations

The `migrate()` function in `src/db.ts` runs `CREATE TABLE IF NOT EXISTS` statements on startup. For additive changes this is safe to re-run.

For destructive or index-heavy migrations:

1. Write the migration SQL under `scripts/migrations/YYYYMMDD_description.sql`.
2. Test against a staging DB snapshot first.
3. Run with `psql "$DATABASE_URL" -f scripts/migrations/YYYYMMDD_description.sql`.
4. Verify with `\d+ contract_events` in `psql`.

---

## Rollback

If a backfill introduced corrupt rows:

```sql
-- Delete events inserted after a specific timestamp
DELETE FROM contract_events
WHERE created_at > '2026-09-27 18:00:00+00';
```

If a schema migration must be reversed, follow the [rollback runbook](../rollback-runbook.md).

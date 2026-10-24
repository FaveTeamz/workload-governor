# ADR-009: Composite Unique Constraint and Checkpoint Table for Event Indexer Deduplication

**Status:** Accepted  
**Date:** 2026-10-20  
**Deciders:** WorkloadGovernor Core Team  
**Issue:** [#1121](https://github.com/FaveTeamz/workload-governor/issues/1121)

---

## Context

The WorkloadGovernor `EventIndexer` (`src/eventIndexer.ts`) and historical backfill CLI (`src/scripts/backfill-events.ts`) poll the Soroban RPC `getEvents` endpoint to ingest on-chain smart contract events (`applied`, `withdrew`, `assigned`, `completed`, `revoked`, `maint_reg`) into the PostgreSQL `contract_events` table.

In production and distributed deployments, the event ingestion pipeline must handle several operational failure modes without corrupting downstream contributor statistics or emitting duplicate live notifications:

1. **Process Restarts and Cursor Loss**: When the indexer container restarts or loses its in-memory paging cursor, it resumes from the last finalized ledger sequence (`MAX(ledger_seq)` or `indexer_checkpoints.last_ledger`), intentionally re-fetching all events in that boundary ledger.
2. **Multiple Events Within a Single Transaction**: A single Soroban transaction can emit multiple contract events (distinguished by `event_index` in `<ledger>-<tx_index>-<event_index>`).
3. **Synthetic / Fallback Transaction Identifiers**: Certain synthetic or test RPC events may fall back to non-hash identifiers that could collide across ledgers if `ledger_seq` is omitted from the uniqueness key.
4. **Concurrent Indexer Replicas & Backfill Jobs**: Running a historical `backfill-events.ts` job concurrently with the live `EventIndexer` can submit overlapping event batches to PostgreSQL simultaneously.

Initially, `contract_events` used a two-column `UNIQUE (tx_hash, event_index)` constraint and relied on in-memory cursor state. However, cursor loss or synthetic event replay highlighted the need for a formally specified, database-enforced deduplication and checkpointing architecture (implemented in `migrations/2_event_deduplication.js` and `migrations/3_indexer_checkpoints.js`).

---

## Decision

We adopt a **two-layer idempotent ingestion strategy** in PostgreSQL:

1. **Composite Unique Constraint on `contract_events`**:
   Enforce `UNIQUE (ledger_seq, tx_hash, event_index)` (`contract_events_ledger_tx_event_unique` backed by `idx_contract_events_dedup`) and perform all event insertions via:
   ```sql
   INSERT INTO contract_events
     (event_type, contributor, org_id, issue_id, tx_hash, event_index, ledger_seq, timestamp)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
   ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING
   ```
   Downstream real-time notifications (`publishLiveEvent`) are triggered **only** when `rowCount === 1` (i.e., when a new row was actually inserted).

2. **Dedicated `indexer_checkpoints` Table**:
   Persist the last processed ledger sequence and ledger hash per contract (`contract_id PRIMARY KEY, last_ledger INTEGER NOT NULL, last_ledger_hash TEXT, updated_at TIMESTAMPTZ`) using atomic upserts (`ON CONFLICT (contract_id) DO UPDATE`) so the indexer can bound its replay window on startup without scanning the entire `contract_events` history.

---

## Reasons

### 1. Database-Level Idempotency Under Replay and Concurrency

By enforcing `UNIQUE (ledger_seq, tx_hash, event_index)` inside PostgreSQL and using `INSERT ... ON CONFLICT DO NOTHING`, deduplication is atomic even when multiple indexer workers or a concurrent `backfill-events.ts` process write overlapping ledger ranges at the same time.

### 2. Unambiguous Event Identity Across Ledgers

In Soroban RPC, an event's canonical coordinate is the 3-tuple `(ledger_seq, tx_hash, event_index)`. Including `ledger_seq` alongside `tx_hash` and `event_index` eliminates any possibility of cross-ledger collisions when fallback identifiers are used, while supporting multiple events within the same transaction (`event_index = 0, 1, ...`).

### 3. Fast O(1) Startup Recovery via `indexer_checkpoints`

Storing `(contract_id, last_ledger, last_ledger_hash)` in `indexer_checkpoints` allows the indexer to immediately determine its resume cursor even when no new events have been emitted for thousands of ledgers, avoiding repeated re-scans of empty ledger ranges while recording `last_ledger_hash` for divergence detection.

### 4. Exact-Once Live Event Broadcast

Checking `(result.rowCount === 1)` after `INSERT ... ON CONFLICT DO NOTHING` ensures that `publishLiveEvent` is only invoked for genuinely new events, preventing duplicate WebSocket/SSE broadcasts during restart catch-up.

---

## Consequences

### Positive

- **Zero Duplicate Rows**: Full-history or partial-ledger replays are completely safe and idempotent.
- **Safe Concurrent Backfills**: Operators can run `npm run backfill` alongside the live `event-indexer` service without race conditions or unique constraint crashes.
- **Fast Restart Catch-Up**: `indexer_checkpoints` tracks progress across empty ledgers so restarts do not re-poll already-scanned empty ledgers.

### Negative

- **Slightly Larger B-Tree Index**: The 3-column unique index `(ledger_seq, tx_hash, event_index)` consumes marginally more storage and write I/O than a single surrogate key, though negligible at Soroban event throughput (< 1 KB per event).

### Neutral

- Schema migrations (`migrations/2_event_deduplication.js` and `migrations/3_indexer_checkpoints.js`) must be applied prior to running the indexer in production.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| **Application-Memory Set / Redis Bloom Filter** | Volatile across restarts; introduces TOCTOU race conditions between check and insert when multiple processes or backfills run concurrently. |
| **Two-Column `UNIQUE (tx_hash, event_index)` Only** | Does not scope uniqueness by `ledger_seq`, leaving theoretical collision risk for synthetic/fallback transaction identifiers and slower ledger-scoped index lookups. |
| **File-Based Cursor Only (`.backfill-checkpoint.json`)** | Ephemeral container filesystems in ECS/Kubernetes lose local files on pod reschedule, forcing expensive genesis replays. |
| **`SELECT` Before `INSERT` Without Unique Constraint** | Vulnerable to race conditions under concurrent writes and incurs an extra network round-trip per event. |

---

## References

- [`migrations/2_event_deduplication.js`](../../migrations/2_event_deduplication.js)
- [`migrations/3_indexer_checkpoints.js`](../../migrations/3_indexer_checkpoints.js)
- [`src/eventIndexer.ts`](../../src/eventIndexer.ts)
- [ADR-004: Use PostgreSQL Instead of SQLite for the Backend Database](ADR-004-postgresql-over-sqlite.md)

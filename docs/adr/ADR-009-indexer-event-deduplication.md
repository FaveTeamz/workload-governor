# ADR-009: Composite Unique Constraints and Checkpoint Persistence for Event Indexer Deduplication

**Status:** Accepted  
**Date:** 2026-10-22  
**Deciders:** Core team  
**Issue:** [#1121](https://github.com/FaveTeamz/workload-governor/issues/1121)

---

## Context

WorkloadGovernor relies on an asynchronous event indexer (`src/eventIndexer.ts` and `backend/src/scheduler.ts`) to stream and persist Soroban smart contract events into PostgreSQL (`contract_events` and `events` tables). These indexed events drive critical platform functions, including:

1. Tracking contributor application and assignment statuses across organizations.
2. Generating leaderboard metrics and activity feeds.
3. Auditing lifecycle state changes (`applied`, `assigned`, `completed`, `revoked`).

In a distributed blockchain indexing environment, events can be re-delivered or re-processed under several operational scenarios:

- **Indexer restarts & crash recovery:** If the indexing worker restarts, it must resume without missing intermediate events.
- **RPC connection disruptions:** Soroban RPC or Horizon streaming drops can necessitate re-fetching a range of recent ledgers.
- **Historical backfilling:** The `src/scripts/backfill-events.ts` utility re-scans historical ledgers to sync missing data or bootstrap fresh environments.
- **Ledger reorganizations & finality delays:** Re-querying near-tip ledgers may re-ingest events that were already recorded.

Without an explicit deduplication strategy, re-processing identical events produces duplicate rows. Duplicate events corrupt assignment counters, artificially inflate contributor leaderboard stats, and violate data integrity guarantees.

---

## Decision

We adopt a **dual-layer deduplication and cursor recovery strategy**:

1. **Storage-Layer Composite Unique Constraint:**
   Enforce a composite unique constraint across `(ledger_seq, tx_hash, event_index)` on the `contract_events` table (migration `2_event_deduplication.js`), using PostgreSQL's atomic `INSERT ... ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING` pattern.

2. **Ingestion-Layer Checkpoint Persistence:**
   Maintain durable ledger sync checkpoints in a dedicated relational table `indexer_checkpoints (contract_id, last_ledger, last_ledger_hash, updated_at)` (migration `3_indexer_checkpoints.js`), complemented by a low-latency Redis cache key (`indexer:checkpoint:<contractId>`).

---

## Reasons

### 1. Multi-layered defense-in-depth

Neither an application-level cursor nor a database constraint alone is sufficient:
- The **checkpoint table** establishes the high-water mark, minimizing unnecessary RPC fetching and enabling sub-second resumption after service restarts.
- The **database unique constraint** provides the ultimate source of truth, guaranteeing idempotency even when cursor boundaries overlap, during multi-ledger backfills, or in the event of an unexpected cursor regression.

### 2. Elimination of synthetic event collisions across ledgers

Initial iterations evaluated a two-column unique constraint on `(tx_hash, event_index)`. However, certain operational edge cases, such as synthetic test transactions, mock environments, or system-generated event records, may reuse fixed transaction hashes. Including `ledger_seq` in the composite key `(ledger_seq, tx_hash, event_index)` binds the uniqueness scope to the immutable block sequence, preventing cross-ledger constraint clashes.

### 3. Atomic conflict resolution with zero lock contention

PostgreSQL's `ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING` executes within an atomic MVCC insertion. Duplicate events are silently ignored without throwing query-terminating exceptions or requiring application-level distributed locks. This enables high-throughput batch ingestion without deadlock risks.

### 4. Resilient crash recovery without data duplication

When the indexer boots, it executes `initCursor()`:
- It checks Redis for the cached cursor.
- If Redis is cold or evicted, it falls back to querying `indexer_checkpoints`.
- If the checkpoint table is uninitialized, it falls back to `SELECT MAX(ledger_seq) FROM contract_events`.

To safeguard against unfinalized ledger state, the indexer rewinds slightly to re-process from the last confirmed ledger boundary. Because inserts are protected by `ON CONFLICT DO NOTHING`, this overlap is completely safe and guarantees zero duplicate rows.

---

## Consequences

### Positive

- **Strict Idempotency:** The indexer can safely replay any range of past ledgers or re-run historical backfills (`backfill-events.ts`) without generating duplicate entries.
- **Fast Startup:** Services recover their synchronization state immediately via the `indexer_checkpoints` table and Redis, avoiding full table scans.
- **Data Integrity:** Aggregation endpoints, leaderboards, and contributor profiles reflect exact event counts without requiring costly `DISTINCT` queries at read time.
- **Concurrency Safety:** Multiple worker processes or parallel batch backfills targeting disjoint or overlapping ranges do not corrupt table state.

### Negative

- **Index Overhead:** Maintaining the composite B-tree index `idx_contract_events_dedup` on `(ledger_seq, tx_hash, event_index)` adds minimal write and disk storage overhead.
- **Schema Strictness:** All ingested events must supply a deterministic `event_index` and `ledger_seq`; synthetic or off-chain event generators must provide deterministic offsets.

### Neutral

- Transaction checkpoints are committed periodically at set intervals (`CHECKPOINT_LEDGER_INTERVAL = 100` or `CHECKPOINT_TIME_INTERVAL_MS = 5000`) rather than every individual event, balancing write overhead with replay window size.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| **In-Memory / Redis-Only Deduplication** | Redis key eviction, TTL expiration, or server restarts lose deduplication state. Does not protect long-term backfills or database consistency. |
| **Application-Level SELECT-before-INSERT** | Prone to race conditions under concurrent worker executions; doubles database network round-trips for every batch of events. |
| **Checkpoints Only (Without DB Constraint)** | If a cursor is lost, corrupted, or deliberately rewound to recover from a network gap, replayed events would result in catastrophic duplicate insertions. |
| **Two-Column Constraint `(tx_hash, event_index)`** | Does not tie events to the ledger sequence; potential collisions with synthetic events or mock test harnesses that reuse identifiers across ledgers. |
| **Read-Time Deduplication (`SELECT DISTINCT`)** | Shifts the deduplication burden to every API read query, degrading performance on leaderboard queries, pagination, and time-series aggregations. |

---

## References

- Migration: [migrations/2_event_deduplication.js](../../migrations/2_event_deduplication.js)
- Migration: [migrations/3_indexer_checkpoints.js](../../migrations/3_indexer_checkpoints.js)
- Event Indexer: [src/eventIndexer.ts](../../src/eventIndexer.ts)
- Scheduler Checkpoints: [backend/src/scheduler.ts](../../backend/src/scheduler.ts)
- [ADR-004: PostgreSQL Over SQLite](ADR-004-postgresql-over-sqlite.md)
- Issue: [#1121](https://github.com/FaveTeamz/workload-governor/issues/1121)

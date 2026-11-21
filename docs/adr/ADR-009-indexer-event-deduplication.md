# ADR-009: Composite Unique Constraint and Checkpoint Table for Event Indexer Deduplication

**Status:** Accepted  
**Date:** 2026-10-20  
**Deciders:** WorkloadGovernor Core Team  
**Issue:** [#1337](https://github.com/FaveTeamz/workload-governor/issues/1337)

---

## Context

The WorkloadGovernor `EventIndexer` (`src/eventIndexer.ts`) and historical backfill CLI (`src/scripts/backfill-events.ts`) stream on-chain smart contract events (`applied`, `withdrew`, `assigned`, `completed`, `revoked`, `maint_reg`) from the Soroban RPC `getEvents` endpoint into the PostgreSQL `contract_events` table.

Under high-velocity event streaming across multiple worker container replicas in ECS/Kubernetes, the ingestion pipeline must maintain strict consistency and eliminate duplicates amidst challenging operational conditions:

1. **Process Restarts and Cursor Loss**: When an indexer worker restarts, crashes, or loses its in-memory paging cursor, it resumes from the last finalized checkpoint (`indexer_checkpoints.last_ledger` or `MAX(ledger_seq)`), deliberately re-fetching boundary ledgers.
2. **Multiple Events Within a Single Transaction**: A single Soroban transaction invocation can emit multiple contract events (distinguished by `event_index` in the coordinate `<ledger>-<tx_index>-<event_index>`).
3. **Synthetic / Fallback Transaction Identifiers**: Certain synthetic, simulated, or test RPC events can use non-hash identifiers that could collide across distinct ledgers if `ledger_seq` is not scoped within the unique index.
4. **Concurrent Worker Replicas & Backfill Jobs**: Running distributed indexer workers or running the historical `backfill-events.ts` script concurrently with the live indexer service submits overlapping event batches to PostgreSQL simultaneously.
5. **Ledger Reorganizations and Network Disconnects**: Transient RPC drops, network partitions, or ledger reorgs can cause repeated event deliveries or invalidated ledger forks that require transactional recovery.

Initially, `contract_events` lacked a comprehensive deduplication design and relied on in-memory cursor tracking. A formally specified, database-enforced deduplication and checkpointing architecture was required to prevent duplicate contributor stats or spurious notifications.

---

## Decision

We adopt a **two-layer idempotent ingestion and deduplication strategy** in PostgreSQL:

1. **Composite Unique Database Constraint on `contract_events`**:
   We enforce a composite unique constraint on `(ledger_seq, tx_hash, event_index)` (and `(tx_hash, event_index)` compatibility index `idx_contract_events_dedup`) and execute all event insertions using atomic `ON CONFLICT DO NOTHING`:
   ```sql
   INSERT INTO contract_events
     (event_type, contributor, org_id, issue_id, tx_hash, event_index, ledger_seq, timestamp)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
   ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING;
   ```
   Downstream real-time events and WebSocket/SSE notifications (`publishLiveEvent`) are emitted **only** when `rowCount === 1` (i.e., when an event was genuinely inserted).

2. **Dedicated Checkpoint Tracking Table (`indexer_checkpoints`)**:
   We persist the last processed ledger sequence and block hash per contract using atomic upserts:
   ```sql
   INSERT INTO indexer_checkpoints (contract_id, last_ledger, last_ledger_hash, updated_at)
   VALUES ($1, $2, $3, NOW())
   ON CONFLICT (contract_id) DO UPDATE SET
     last_ledger = EXCLUDED.last_ledger,
     last_ledger_hash = EXCLUDED.last_ledger_hash,
     updated_at = NOW();
   ```

3. **Transactional Cursor and Rollback Handlers**:
   Rollback handlers ensure that if an error or ledger fork occurs during batch processing, checkpoint transactions roll back cleanly, and ledger boundary rewinds can prune unfinalized records before re-indexing.

---

## Reasons

### 1. Database-Level ACID Guarantees & Concurrency Safety
Enforcing uniqueness directly inside PostgreSQL guarantees atomic conflict resolution even when multiple worker replicas or backfill jobs process the same block or transaction concurrently. PostgreSQL row-level locks on index insertion handle contention deterministically without requiring application-level distributed locks.

### 2. Unambiguous Event Identity and Canonical Coordinates
In Soroban RPC, every event is uniquely identified by the 3-tuple `(ledger_seq, tx_hash, event_index)`. Scoping uniqueness by both transaction hash and ledger sequence prevents collisions even when synthetic transaction identifiers are present, while accurately tracking multi-event transactions via `event_index`.

### 3. High-Velocity Streaming with O(1) Startup Recovery
Querying `indexer_checkpoints` provides immediate $O(1)$ cursor resumption upon container startup, eliminating the need to execute expensive `SELECT MAX(ledger_seq)` full-table scans across millions of historical events.

### 4. Exactly-Once Downstream Notifications
Inspecting `result.rowCount === 1` guarantees that downstream triggers (WebSocket broadcasts, contributor ranking recalculations, webhooks) only fire on fresh event ingestion, avoiding duplicate alerts during historical backfills or restart replays.

---

## Failure Recovery Modes

1. **Worker Crash & Container Restart Recovery**:
   On container startup, the indexer queries `indexer_checkpoints` for the contract's `last_ledger`. It resumes indexing from `last_ledger + 1` (or replays `last_ledger` to guarantee boundary coverage). Overlapping events from the replayed boundary are silently ignored by `ON CONFLICT DO NOTHING`.
2. **Ledger Reorganization / Fork Recovery**:
   When the indexer detects a hash mismatch between the recorded `last_ledger_hash` and the upstream RPC provider's ledger header, a rollback handler is invoked:
   - Checkpoint cursor rolls back to the common ancestor ledger sequence.
   - Any provisional event records above the fork point are pruned within a transaction (`DELETE FROM contract_events WHERE ledger_seq > $1`).
   - The indexer resumes streaming from the validated chain tip.
3. **Network Disconnects & RPC Timeout Recovery**:
   Network disconnects trigger exponential backoff with jitter (initial backoff 1s, max 30s). Checkpoints are committed only after an entire ledger's event batch has been processed, ensuring no gaps are left in the event log.
4. **Concurrent Replicas & Backfill Collisions**:
   If an operator executes `npm run backfill` while the live indexer service is running, both processes can safely execute concurrent `INSERT` statements; duplicate events result in no-op conflict suppression without transaction deadlocks.

---

## Consequences

### Positive
- **Strong ACID Consistency**: Guarantees zero duplicate event entries in PostgreSQL.
- **Idempotent Replays**: Any ledger range can be safely re-indexed without corrupting application state.
- **Safe Concurrent Backfills**: Backfill jobs and live streaming workers operate concurrently without coordination bottlenecks.
- **Low Operational Overhead**: Uses standard PostgreSQL relational primitives rather than auxiliary messaging clusters.

### Negative
- **Index Write Overhead**: Maintaining the composite unique B-Tree index `(ledger_seq, tx_hash, event_index)` incurs slight write and storage overhead per inserted row, which is well within Soroban throughput budgets (< 1 KB per row).

### Neutral
- **Migration Dependency**: Requires applying `migrations/2_event_deduplication.js` and `migrations/3_indexer_checkpoints.js` prior to starting indexer workers.

---

## Alternatives Considered

1. **In-Memory Deduplication Cache (e.g. Set / LRU / Redis Bloom Filter)**:
   *Rejected.* An in-memory cache is lost whenever indexer worker containers restart or reschedule. Furthermore, Redis introduces Time-Of-Check to Time-Of-Use (TOCTOU) race conditions between key lookup and database insertion unless wrapped in complex Lua scripts or distributed locks.
2. **Distributed Message Queue (Kafka, RabbitMQ, or Redis Streams)**:
   *Rejected.* Introducing a distributed message broker cluster (e.g., Apache Kafka or RabbitMQ) adds substantial infrastructure operational complexity, cluster provisioning, topic partition management, and network hops. At our current and forecasted scale, PostgreSQL provides superior durability, simpler operations, and transactional coupling with our existing relational data.
3. **Periodic Batch Reconciliation / Block Polling**:
   *Rejected.* Batch reconciliation suffers from high ingestion latency (minutes to hours), violates real-time UI notification requirements, and introduces complex two-phase diffing logic compared to immediate stream ingestion.

---

## References

- [`migrations/2_event_deduplication.js`](../../migrations/2_event_deduplication.js)
- [`migrations/3_indexer_checkpoints.js`](../../migrations/3_indexer_checkpoints.js)
- [`src/eventIndexer.ts`](../../src/eventIndexer.ts)
- [`docs/architecture.md`](../architecture.md#event-ingestion--deduplication-architecture)
- [ADR-004: Use PostgreSQL Instead of SQLite for the Backend Database](ADR-004-postgresql-over-sqlite.md)
- [Issue #1337](https://github.com/FaveTeamz/workload-governor/issues/1337)

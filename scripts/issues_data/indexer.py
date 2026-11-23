# Category 3: Event Indexer & Ingestion (Stellar / Horizon) - 10 issues

INDEXER_ISSUES = [
    {
        "title": "fix(indexer): Handle Horizon ledger reorganization and fork rollbacks cleanly",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
In `backend/src/HorizonService.ts` and the event indexer service, ingestion assumes that ledgers stream in strictly sequential, monotonically increasing order. However, during network consensus hiccups, stellar-core validator restarts, or ledger reorgs, historical ledgers may be rolled back or re-emitted with different hashes.

When a ledger reorg occurs, the indexer currently crashes due to unique constraint violations on `(ledger_sequence, transaction_hash)` or persists phantom events from an orphaned branch.

### 🔍 Current Behavior & Root Cause
The checkpoint cursor records the highest ledger sequence processed. If Horizon delivers events for a previously committed ledger or if a ledger branch is abandoned, the indexer cannot unwind state, resulting in permanently corrupted historical event tables and broken contributor counters.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/HorizonService.ts` and `db.ts`:
   - Store ledger sequence along with `ledger_hash` in `indexer_checkpoints`.
   - On each new ledger batch, verify `previous_ledger_hash` against the stored checkpoint hash.
   - If a hash mismatch is detected (indicating a fork/reorg):
     1. Log high-priority alert: `Reorg detected at ledger ${currentSeq}`.
     2. Identify the common ancestor ledger.
     3. Execute database transaction to roll back all indexed events, application states, and counter updates back to the common ancestor.
     4. Update checkpoint cursor to the common ancestor and resume ingestion from the new branch.
2. Add defensive check: reject event insertion if ledger sequence is smaller than checkpoint unless rollback mode is active.

### 📁 Affected Files & Modules
- `backend/src/HorizonService.ts`: Ingestion loop and cursor management
- `backend/src/db.ts`: Rollback transaction queries
- `docs/adr/ADR-009-indexer-event-deduplication.md`: Reorg handling documentation
- `backend/src/__tests__/reorg.test.ts`: Reorg simulation test suite

### ✅ Acceptance Criteria
- [ ] Indexer detects ledger hash divergence and initiates rollback.
- [ ] Events and state changes from orphaned ledger branches are purged transactionally.
- [ ] Checkpoint table accurately reflects post-rollback ledger sequence.
- [ ] Ingestion resumes on the canonical chain branch without manual operator intervention.

### 🧪 Testing & Verification Plan
- Unit test simulating a 3-ledger fork rollback and assert database records match canonical chain.
- Verify zero duplicate key errors during replay.

### 🔒 Security, Reliability & Performance Considerations
Guarantees database consistency with Stellar ledger state even during rare validator network splits or Stellar testnet resets."""
    },
    {
        "title": "fix(indexer): Prevent event deduplication race condition under concurrent ingestion workers",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
To achieve high throughput, the indexer service can run multiple ingestion worker threads. However, under high transaction velocity, concurrent workers processing overlapping event streams can attempt to insert the same Soroban contract event simultaneously.

Without strict database concurrency controls, workers trigger race conditions, resulting in duplicate application counts or unhandled unique constraint violation crashes.

### 🔍 Current Behavior & Root Cause
In `backend/src/HorizonService.ts`:
The deduplication check currently does `SELECT id FROM events WHERE tx_hash = $1 AND event_index = $2`. If the row is not found, it proceeds to `INSERT`. Under concurrent workers, both workers execute the `SELECT` before either executes the `INSERT`, leading to race conditions.

### 🛠️ Proposed Solution & Technical Specification
1. Enforce atomic upsert semantics in PostgreSQL:
   ```sql
   INSERT INTO contract_events (tx_hash, event_index, org_id, issue_id, contributor, event_type, payload, created_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
   ON CONFLICT (tx_hash, event_index) DO NOTHING
   RETURNING id;
   ```
2. Only process side-effects (e.g. updating contributor application count or notifying SSE subscribers) if the insert actually returned a new row.
3. Use PostgreSQL advisory locks or distributed Redis worker locks on ledger ranges: `pg_try_advisory_xact_lock(ledger_sequence)`.

### 📁 Affected Files & Modules
- `backend/src/HorizonService.ts`: Ingestion query logic
- `backend/src/db.ts`: Database transaction management
- `migrations/2_add_events_table.js`: Unique composite constraint definition

### ✅ Acceptance Criteria
- [ ] Database enforces `UNIQUE(tx_hash, event_index)`.
- [ ] Concurrent ingestion of identical events causes exactly one insert and zero duplicate counter increments.
- [ ] Workers do not crash with unhandled duplicate key exceptions.
- [ ] Concurrency integration test passes with 10 parallel ingestion threads.

### 🧪 Testing & Verification Plan
- Run concurrency stress test with 10 workers ingesting 50 duplicate events simultaneously.
- Verify total row count in `contract_events` equals 50.

### 🔒 Security, Reliability & Performance Considerations
Eliminates race conditions and ensures idempotency regardless of worker scheduling or network retries."""
    },
    {
        "title": "feat(indexer): Implement batch insert for contract events in indexer service",
        "labels": ["enhancement", "backend", "performance"],
        "body": """### 🎯 Summary & Context
The event indexer currently persists contract events one-by-one in individual SQL `INSERT` statements within a loop. During high-traffic periods (such as a Wave opening when dozens of contributors apply at the same time), sequential single-row inserts create severe database connection bottlenecks and increase ingestion lag.

Implementing multi-row batch inserts drastically reduces network roundtrips and optimizes PostgreSQL disk writes.

### 🔍 Current Behavior & Root Cause
In `backend/src/HorizonService.ts`:
```typescript
for (const event of events) {
  await db.query('INSERT INTO contract_events ...', [event.tx, ...]);
}
```
For a ledger containing 100 contract events, this issues 100 individual database roundtrips, taking 300–500ms and stalling the ingestion loop.

### 🛠️ Proposed Solution & Technical Specification
1. Refactor event persistence in `backend/src/db.ts`:
   - Implement `batchInsertContractEvents(events: ContractEvent[])`:
   - Construct a parameterized multi-value SQL query:
     `INSERT INTO contract_events (fields...) VALUES ($1, $2, ...), ($8, $9, ...)` (or use `pg-promise` / `sql.join`).
   - Group inserts in batches of up to 250 records per statement.
2. Wrap each batch within an atomic database transaction along with the checkpoint table update.
3. Emit Prometheus metric `indexer_batch_size_histogram` and `indexer_insert_duration_ms`.

### 📁 Affected Files & Modules
- `backend/src/HorizonService.ts`: Batch processing integration
- `backend/src/db.ts`: Batch insert query builder
- `backend/src/tracing.ts`: Batch performance tracing span

### ✅ Acceptance Criteria
- [ ] Ingestion persists up to 250 events in a single SQL statement.
- [ ] Ingestion throughput increases by at least 5x on high-volume ledgers.
- [ ] Atomicity guaranteed: either the entire ledger batch and checkpoint commit, or all rollback together.
- [ ] Memory footprint remains stable during large event backfills.

### 🧪 Testing & Verification Plan
- Benchmark inserting 1,000 events: compare execution time before (<500ms target) and after.
- Verify unit tests pass with empty batch, single-item batch, and max-capacity batch.

### 🔒 Security, Reliability & Performance Considerations
Protects database IOPS and reduces CPU utilization on the RDS PostgreSQL instance."""
    },
    {
        "title": "fix(indexer): Add circuit breaker for failing Soroban RPC endpoints",
        "labels": ["bug", "backend", "operations"],
        "body": """### 🎯 Summary & Context
The indexer queries the Soroban RPC endpoint (`getEvents`, `getLatestLedger`) to pull contract state and event data. If the RPC node encounters an outage, 502/503 bad gateway, or high latency, the indexer repeatedly hammers the failing RPC endpoint without pause.

This floods the network, fills logs with socket errors, blocks worker threads, and prevents graceful failover to secondary backup RPC nodes.

### 🔍 Current Behavior & Root Cause
In `backend/src/soroban.ts` and `HorizonService.ts`:
Requests to RPC are made via `fetch()` without timeout configuration or circuit breaking. When the RPC endpoint stalls, the HTTP request hangs indefinitely or until TCP timeout (120s), stopping event ingestion.

### 🛠️ Proposed Solution & Technical Specification
1. Integrate `opossum` circuit breaker (or custom sliding-window breaker):
   - Configure parameters:
     - `timeout`: 5000ms (timeout slow RPC calls).
     - `errorThresholdPercentage`: 50% (trip open after 50% failures).
     - `resetTimeout`: 30000ms (attempt half-open recovery after 30s).
2. Multi-RPC provider failover:
   - Configure primary RPC (`SOROBAN_RPC_URL`) and secondary backup (`SOROBAN_RPC_BACKUP_URL`).
   - If circuit breaker trips open on primary, automatically route queries to backup provider.
3. Expose circuit breaker state metric (`soroban_rpc_circuit_state: 0=closed, 1=open, 2=half_open`) in Prometheus.

### 📁 Affected Files & Modules
- `backend/src/soroban.ts`: RPC client with circuit breaker wrapper
- `backend/src/HorizonService.ts`: Failover integration
- `backend/src/health.ts`: Health check reflection of RPC circuit state

### ✅ Acceptance Criteria
- [ ] RPC calls timeout after 5000ms instead of hanging indefinitely.
- [ ] Repeated RPC errors trip circuit breaker and avoid hammering downstream nodes.
- [ ] Automatic fallback to secondary RPC provider when primary trips open.
- [ ] Circuit breaker automatically resets to closed once RPC health recovers.

### 🧪 Testing & Verification Plan
- Unit test mocking 500 errors from RPC provider and verify circuit trips to open.
- Verify secondary RPC provider receives requests while primary is open.

### 🔒 Security, Reliability & Performance Considerations
Prevents cascading failures between third-party Stellar RPC infrastructure and WorkloadGovernor internal backend services."""
    },
    {
        "title": "feat(indexer): Support backfilling events from specific starting ledger range via CLI",
        "labels": ["enhancement", "backend", "dx"],
        "body": """### 🎯 Summary & Context
When recovering from an outage, testing in staging environments, or migrating to a fresh database, operators need the ability to backfill historical contract events from a specific ledger range (e.g. from ledger 50,000,000 to 50,050,000).

Currently, the indexer can only start from the hardcoded contract deployment ledger or the latest ledger, with no CLI flags to specify an arbitrary historical range.

### 🔍 Current Behavior & Root Cause
In `backend/src/scheduler.ts` and `HorizonService.ts`:
Cursor initialization checks `SELECT max(ledger) FROM indexer_checkpoints` and falls back to environment variable `START_LEDGER`. There is no standalone executable script or CLI argument parser to execute a targeted, bounded backfill without starting the continuous background daemon.

### 🛠️ Proposed Solution & Technical Specification
1. Create a dedicated CLI tool: `scripts/backfill-events.ts` (or `npm run indexer:backfill`):
   ```bash
   node dist/scripts/backfill-events.js --from=50000000 --to=50050000 --batch-size=500 --dry-run=false
   ```
2. Features:
   - CLI flags: `--from` (required), `--to` (optional, defaults to current latest), `--batch-size` (default 200), `--dry-run` (validate without database writes).
   - Display dynamic CLI progress bar with ETA, events processed per second, and error count.
   - Idempotent upserts ensuring existing database records are not duplicated.
   - Exit with zero on completion, non-zero on unrecoverable failure.

### 📁 Affected Files & Modules
- `backend/src/scripts/backfill-events.ts`: CLI script implementation
- `backend/src/HorizonService.ts`: Reusable ranged ledger fetcher
- `backend/package.json`: Add `indexer:backfill` script command
- `docs/admin-guide.md`: Document historical backfill procedures

### ✅ Acceptance Criteria
- [ ] Operators can execute backfill between arbitrary ledger boundaries via CLI.
- [ ] Script supports `--dry-run` mode to preview events without database modifications.
- [ ] Progress information and throughput metrics displayed to terminal stdout.
- [ ] Script terminates cleanly upon reaching `--to` ledger.

### 🧪 Testing & Verification Plan
- Run test backfill against Stellar testnet for a 100-ledger window.
- Verify database rows match expected event hashes from Horizon explorer.

### 🔒 Security, Reliability & Performance Considerations
Rate-limits backfill queries to avoid exceeding Horizon public API limits (standard 3600 req/hr)."""
    },
    {
        "title": "fix(indexer): Track and persist checkpoint metrics to Prometheus",
        "labels": ["bug", "backend", "observability"],
        "body": """### 🎯 Summary & Context
The event indexer records its current ledger progress in the PostgreSQL `indexer_checkpoints` table. However, there is no real-time Prometheus gauge tracking the delta between the latest network ledger and the latest indexed ledger (known as **Indexer Lag**).

Without an indexer lag metric, ops teams have zero visibility into whether the indexer is caught up, lagging by thousands of ledgers, or completely frozen.

### 🔍 Current Behavior & Root Cause
In `backend/src/HorizonService.ts`:
Checkpoints are written to PostgreSQL every N ledgers, but no Prometheus gauge is updated. If the indexer gets stuck in an infinite retry loop, Prometheus dashboards continue reporting healthy uptime.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/tracing.ts` or `metrics.ts`:
   Define Prometheus gauges:
   - `indexer_latest_ledger_sequence`: Highest ledger sequence committed to DB.
   - `stellar_network_latest_ledger_sequence`: Latest ledger sequence reported by Stellar RPC.
   - `indexer_lag_ledgers`: Computed delta (`stellar_network - indexer_latest`).
   - `indexer_events_processed_total`: Counter partitioned by event type (`apply`, `assign`, `complete`, `revoke`).
2. Update these metrics on every ledger processing cycle.
3. Configure Prometheus alerting rule: trigger `IndexerLagCritical` alert if `indexer_lag_ledgers > 50` for more than 5 minutes.

### 📁 Affected Files & Modules
- `backend/src/HorizonService.ts`: Metric recording hooks
- `backend/src/tracing.ts`: Prometheus registry and gauge definitions
- `monitoring/prometheus/alerting_rules.yml`: Add indexer lag alert definition
- `docs/observability.md`: Document indexer metric schemas

### ✅ Acceptance Criteria
- [ ] `indexer_lag_ledgers` metric accurately reports ledger difference.
- [ ] Metrics endpoint `/metrics` exports all indexer gauges and counters.
- [ ] Prometheus alert triggers when indexer falls behind by more than 50 ledgers.
- [ ] Metric updates have zero noticeable impact on ingestion latency.

### 🧪 Testing & Verification Plan
- Simulate network advance while indexer is paused and verify gauge increases.
- Query `/metrics` and assert presence of `indexer_lag_ledgers`.

### 🔒 Security, Reliability & Performance Considerations
Guarantees early detection of indexer stalls before users report stale application data in the web frontend."""
    },
    {
        "title": "fix(indexer): Handle RPC rate-limiting (429) with jittered exponential backoff",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
Public and dedicated Stellar Horizon and Soroban RPC providers enforce request rate limits (typically HTTP 429 Too Many Requests). When the indexer encounters an HTTP 429 response, it currently retries immediately without backoff.

This causes immediate secondary rate limiting, rapid exhaustion of IP quotas, and temporary blacklisting by RPC providers.

### 🔍 Current Behavior & Root Cause
In `backend/src/HorizonService.ts`:
Fetch calls that receive HTTP 429 throw an Error that triggers an immediate loop iteration, flooding the RPC provider with up to 20 failed requests per second.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/soroban.ts` and `HorizonService.ts`:
   Implement an intelligent retry handler for HTTP 429:
   - Inspect response header `Retry-After`.
   - If present, sleep for the requested duration (in seconds).
   - If absent, compute jittered exponential backoff:
     `delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay)`
     (where `baseDelay = 1000ms`, `maxDelay = 30000ms`).
2. Limit max retries to 5 attempts before failing the current ledger batch and alerting.
3. Log rate limit encounters as warnings with `attemptCount` and `nextRetryDelayMs`.

### 📁 Affected Files & Modules
- `backend/src/soroban.ts`: Fetch wrapper with 429 handling
- `backend/src/HorizonService.ts`: Ingestion retry integration
- `backend/src/__tests__/rateLimitRetry.test.ts`: Retry simulation unit tests

### ✅ Acceptance Criteria
- [ ] Respects `Retry-After` header when provided by RPC node.
- [ ] Applies exponential backoff with randomized jitter on repeated 429s.
- [ ] Prevents rapid retry storms against rate-limited endpoints.
- [ ] Resumes processing automatically once rate-limit window resets.

### 🧪 Testing & Verification Plan
- Mock 429 HTTP responses with `Retry-After: 3` and verify 3000ms delay before retry.
- Test randomized jitter distribution across 10 retry simulations.

### 🔒 Security, Reliability & Performance Considerations
Maintains good citizenship with shared public infrastructure and preserves indexer uptime."""
    },
    {
        "title": "refactor(indexer): Decouple event decoding logic from database persistence transactions",
        "labels": ["enhancement", "backend", "architecture"],
        "body": """### 🎯 Summary & Context
In the current indexer implementation in `backend/src/HorizonService.ts`, the XDR decoding of contract events, schema validation, data normalization, and database transaction queries are tightly coupled inside a single giant async function.

If an XDR decoding error or schema mismatch occurs on event 50 of 100, the entire database transaction is aborted, and debugging is difficult because decoding logic cannot be unit tested in isolation from a database connection.

### 🔍 Current Behavior & Root Cause
`HorizonService.ts` contains over 600 lines mixing Horizon HTTP calls, `stellar-sdk` XDR parsing, SQL query strings, and state counter updates. Unit testing event decoders requires spinning up an in-memory SQLite/Postgres database.

### 🛠️ Proposed Solution & Technical Specification
1. Separate into distinct architectural layers:
   - **`EventDecoderService`**: Pure functional module that accepts raw XDR event buffers and returns strongly-typed `DecodedContractEvent` objects. Pure TypeScript with zero database or network dependencies.
   - **`EventValidationService`**: Validates decoded payloads against ABI and data constraints.
   - **`EventRepository`**: Manages PostgreSQL database persistence and transactions.
   - **`IngestionCoordinator`**: Orchestrates fetching -> decoding -> validating -> persisting.
2. Add comprehensive unit tests directly against `EventDecoderService` using saved test fixtures from testnet transactions.

### 📁 Affected Files & Modules
- `backend/src/HorizonService.ts`: Refactored coordinator
- `backend/src/services/EventDecoderService.ts`: New pure decoding service
- `backend/src/services/EventRepository.ts`: Database repository
- `backend/src/__tests__/EventDecoderService.test.ts`: Pure unit tests

### ✅ Acceptance Criteria
- [ ] Event decoding logic is 100% decoupled from database queries.
- [ ] `EventDecoderService` can be tested purely in memory without database dependencies.
- [ ] Malformed events can be isolated and inspected without breaking the entire ledger batch.
- [ ] Zero regression in event processing accuracy or database schemas.

### 🧪 Testing & Verification Plan
- Run pure unit tests against `EventDecoderService` with 20 sample XDR event fixtures.
- Verify end-to-end integration test passes with refactored architecture.

### 🔒 Security, Reliability & Performance Considerations
Improves code maintainability and enables easier upgrades when Soroban SDK updates event XDR serialization formats."""
    },
    {
        "title": "fix(indexer): Validate contract event schema against ABI before inserting into database",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
When third-party contracts emit events on the network or when the WorkloadGovernor contract undergoes an upgrade that adds new fields to event payloads, the indexer attempts to parse payload tuples into database columns.

If an unexpected payload format is encountered, the indexer currently throws an unhandled `TypeError: Cannot read properties of undefined` and gets permanently stuck on that ledger.

### 🔍 Current Behavior & Root Cause
In `backend/src/HorizonService.ts`:
Event parsing accesses array elements directly: `const issueId = event.value[1].u32();` without verifying that `event.value` has the expected length and types. A malformed or spoofed event causes an unhandled exception.

### 🛠️ Proposed Solution & Technical Specification
1. Define strict Zod / JSON schemas for each valid contract event type:
   - `ApplicationCreated`: `contributor` (Address), `orgId` (Symbol), `issueId` (u32).
   - `ApplicationWithdrawn`: `contributor` (Address), `orgId` (Symbol), `issueId` (u32).
   - `IssueAssigned`: `maintainer` (Address), `contributor` (Address), `orgId` (Symbol), `issueId` (u32).
   - `AssignmentCompleted` & `AssignmentRevoked`.
2. Validate decoded event data against schema:
   - If valid, proceed to database persistence.
   - If invalid:
     1. Quarantine invalid event in `indexer_quarantine` table with raw XDR for developer inspection.
     2. Log detailed error: `Invalid event schema on ledger ${seq}, tx ${txHash}`.
     3. Skip invalid event and continue ledger ingestion to prevent indexer halting.

### 📁 Affected Files & Modules
- `backend/src/schemas/events.ts`: Event schema definitions
- `backend/src/HorizonService.ts`: Schema validation and quarantine handling
- `migrations/5_create_indexer_quarantine.js`: Quarantine table migration
- `docs/indexer-quarantine.md`: Quarantine investigation runbook

### ✅ Acceptance Criteria
- [ ] Valid contract events pass schema validation and insert into database.
- [ ] Malformed or mismatched event payloads are safely routed to quarantine table.
- [ ] Indexer never hangs or crashes due to unexpected event structures.
- [ ] Quarantine table captures raw XDR and error diagnostics.

### 🧪 Testing & Verification Plan
- Unit test feeding malformed XDR events into indexer.
- Verify valid events continue processing while malformed event is quarantined.

### 🔒 Security, Reliability & Performance Considerations
Prevents malicious actors on the public Stellar network from crafting malformed transactions to halt the WorkloadGovernor indexing pipeline."""
    },
    {
        "title": "test(indexer): Add integration test for checkpoint recovery after worker sudden termination",
        "labels": ["testing", "backend"],
        "body": """### 🎯 Summary & Context
In production Kubernetes environments, indexer pods can be killed abruptly at any moment due to node preemption, OOM kills, rolling updates, or host failures (`SIGKILL`). 

An automated integration test is required to verify that when an ingestion worker is terminated mid-batch, upon restart it resumes from the exact last committed checkpoint without creating duplicate rows or skipping ledgers.

### 🔍 Current Behavior & Root Cause
We currently have no automated crash-recovery test. Manual testing cannot reproduce race conditions where a worker dies between inserting events and updating the checkpoint table.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/__tests__/crashRecovery.test.ts`:
   - Initialize PostgreSQL test database with clean schema.
   - Start ingestion worker processing a mocked sequence of 100 ledgers.
   - Abruptly kill the worker process / abort database connection at ledger 45.
   - Inspect database state: assert that only fully committed ledgers (e.g. 1-44) exist.
   - Start a fresh worker instance.
   - Verify that the new worker reads checkpoint 44, resumes at ledger 45, and finishes all 100 ledgers.
   - Assert exact row count and invariant: zero duplicates, zero missing ledgers.

### 📁 Affected Files & Modules
- `backend/src/__tests__/crashRecovery.test.ts`: New integration test
- `backend/src/HorizonService.ts`: Graceful shutdown and transaction boundaries
- `backend/src/db.ts`: Connection recovery handlers

### ✅ Acceptance Criteria
- [ ] Automated integration test simulates mid-transaction worker death.
- [ ] Fresh worker cleanly recovers from stored checkpoint without manual database cleanup.
- [ ] Zero duplicate events in `contract_events` after recovery.
- [ ] Test runs automatically in GitHub Actions CI pipeline.

### 🧪 Testing & Verification Plan
- Execute `npm test -- crashRecovery.test.ts` in `backend/`.
- Verify test executes consistently across 10 consecutive runs.

### 🔒 Security, Reliability & Performance Considerations
Validates database ACID transaction guarantees and proves operational resilience under unpredictable cloud infrastructure failures."""
    }
]

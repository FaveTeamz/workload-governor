# Category 4: Database & Migrations (PostgreSQL) - 9 issues

DB_ISSUES = [
    {
        "title": "fix(db): Add missing down-migration for 3_indexer_checkpoints.js",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
In `migrations/3_indexer_checkpoints.js`, an `up` migration was created to add the `indexer_checkpoints` table. However, the migration file lacks an exported `down` migration function (or has an empty placeholder).

Without reversible down-migrations, automated rollbacks in staging and production CI/CD pipelines fail when an unstage or rollback command (`npm run migrate:rollback` or `scripts/rollback.sh`) is executed.

### 🔍 Current Behavior & Root Cause
In `migrations/3_indexer_checkpoints.js`:
The `exports.up` function executes `CREATE TABLE indexer_checkpoints (...)`, but `exports.down` is missing or undefined. Running `npx node-pg-migrate down` throws `Error: Migration 3_indexer_checkpoints.js has no down method`.

### 🛠️ Proposed Solution & Technical Specification
1. Implement the `down` migration in `migrations/3_indexer_checkpoints.js`:
   ```javascript
   exports.down = (pgm) => {
     pgm.dropTable('indexer_checkpoints', { ifExists: true, cascade: true });
   };
   ```
2. Verify that running `npx node-pg-migrate up` followed by `npx node-pg-migrate down` executes cleanly and drops all associated tables, constraints, and sequences.
3. Update `scripts/rollback.sh` to include a verification step ensuring all migrations define valid up and down handlers.

### 📁 Affected Files & Modules
- `migrations/3_indexer_checkpoints.js`: Migration definition
- `scripts/rollback.sh`: Rollback script
- `backend/src/__tests__/migrations.test.ts`: Migration test suite

### ✅ Acceptance Criteria
- [ ] `migrations/3_indexer_checkpoints.js` exports a working `down` migration.
- [ ] `npm run migrate:rollback` successfully drops `indexer_checkpoints` without errors.
- [ ] Automated migration tests verify bidirectional execution (up -> down -> up) for all migration scripts.

### 🧪 Testing & Verification Plan
- Run `npm run migrate:up` then `npm run migrate:down` on local PostgreSQL test instance.
- Assert table is created and subsequently dropped cleanly.

### 🔒 Security, Reliability & Performance Considerations
Guarantees zero-downtime rollback capability during emergency database release rollbacks."""
    },
    {
        "title": "fix(db): Add down-migration for 3_add_events_org_created_idx.js index",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
The migration `migrations/3_add_events_org_created_idx.js` added a performance index on `contract_events (org_id, created_at DESC)` to speed up organization timeline queries. However, it does not provide a corresponding `down` function to drop the index during rollbacks.

### 🔍 Current Behavior & Root Cause
The file only defines `exports.up = (pgm) => { pgm.createIndex('contract_events', ['org_id', 'created_at']); }`. When rolling back migrations, execution halts with an error, leaving the migration lock held and preventing further deployments.

### 🛠️ Proposed Solution & Technical Specification
1. Add `exports.down`:
   ```javascript
   exports.down = (pgm) => {
     pgm.dropIndex('contract_events', ['org_id', 'created_at'], { ifExists: true });
   };
   ```
2. Use `CONCURRENTLY` parameter where supported for production safety, or ensure standard index dropping semantics.

### 📁 Affected Files & Modules
- `migrations/3_add_events_org_created_idx.js`: Index migration file
- `backend/src/__tests__/migrations.test.ts`: Migration test suite

### ✅ Acceptance Criteria
- [ ] Migration includes `exports.down` dropping index `contract_events_org_id_created_at_idx`.
- [ ] Bidirectional migration test passes without database schema errors.

### 🧪 Testing & Verification Plan
- Execute `npm run migrate:up` followed by `npm run migrate:down` in test environment.

### 🔒 Security, Reliability & Performance Considerations
Prevents database migration lock contention and ensures rollback procedures execute smoothly in production."""
    },
    {
        "title": "perf(db): Add composite index for contributor applications query on (contributor, status, created_at)",
        "labels": ["performance", "backend"],
        "body": """### 🎯 Summary & Context
The query fetching active applications for a contributor (`SELECT * FROM applications WHERE contributor = $1 AND status = 'pending' ORDER BY created_at DESC`) is executed frequently on every dashboard visit and application modal launch.

Under large datasets (500,000+ historical applications), PostgreSQL currently performs a sequential scan or index bitmap heap scan across individual single-column indexes, causing query latency to spike above 250ms.

### 🔍 Current Behavior & Root Cause
Database table `applications` has separate single-column indexes on `contributor` and `status`. Combining these requires BitmapAnd operations and table heap lookups, leading to slow query warnings in backend logs.

### 🛠️ Proposed Solution & Technical Specification
1. Create new database migration: `migrations/6_add_applications_contributor_status_idx.js`:
   ```javascript
   exports.up = (pgm) => {
     pgm.createIndex('applications', ['contributor', 'status', 'created_at'], {
       name: 'idx_applications_contrib_status_created',
       method: 'btree'
     });
   };
   ```
2. Include full `exports.down` to drop index on rollback.
3. Validate query execution plan via `EXPLAIN (ANALYZE, BUFFERS)`: verify that query uses an `Index Only Scan` or `Index Scan` with execution time < 5ms.

### 📁 Affected Files & Modules
- `migrations/6_add_applications_contributor_status_idx.js`: New migration
- `backend/src/db.ts`: Application queries
- `docs/performance-tuning.md`: Query plan benchmark documentation

### ✅ Acceptance Criteria
- [ ] Composite B-Tree index created on `(contributor, status, created_at)`.
- [ ] `EXPLAIN ANALYZE` confirms Index Scan used instead of Bitmap Heap Scan.
- [ ] Query latency reduced from >250ms to <10ms for 500k rows.
- [ ] Down-migration drops the index cleanly.

### 🧪 Testing & Verification Plan
- Run `EXPLAIN ANALYZE` benchmark script before and after adding index.
- Verify index is utilized for contributor dashboard query filters.

### 🔒 Security, Reliability & Performance Considerations
Reduces database CPU utilization and disk read IOPS during peak platform traffic."""
    },
    {
        "title": "fix(db): Configure connection pool idle timeout and connection reap intervals",
        "labels": ["bug", "backend", "operations"],
        "body": """### 🎯 Summary & Context
In `backend/src/db.ts`, the `pg.Pool` instance uses default connection pool configuration without explicit idle timeouts, connection lifetime caps, or reap intervals.

During idle nighttime periods or after traffic spikes, abandoned connections remain open on the PostgreSQL server, exhausting RDS `max_connections` limits and triggering `remaining connection slots are reserved for non-replication superuser connections` errors.

### 🔍 Current Behavior & Root Cause
In `backend/src/db.ts`:
```typescript
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```
Without `idleTimeoutMillis`, `connectionTimeoutMillis`, and `maxLifetimeSeconds`, stale TCP connections held across AWS load balancers leak socket descriptors and stay open indefinitely.

### 🛠️ Proposed Solution & Technical Specification
1. Configure explicit pool settings in `backend/src/db.ts`:
   ```typescript
   export const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: parseInt(process.env.DB_POOL_MAX || '20', 10),
     min: parseInt(process.env.DB_POOL_MIN || '4', 10),
     idleTimeoutMillis: 30000, // Close idle clients after 30s
     connectionTimeoutMillis: 5000, // Return an error if connection cannot be acquired in 5s
     maxLifetimeSeconds: 1800, // Recycle connections every 30 minutes to refresh DNS/TCP
   });
   ```
2. Attach pool error listener:
   `pool.on('error', (err, client) => { logger.error({ err }, 'Unexpected error on idle DB client'); });`
3. Export connection pool metrics (`totalCount`, `idleCount`, `waitingCount`) to Prometheus.

### 📁 Affected Files & Modules
- `backend/src/db.ts`: PostgreSQL pool configuration
- `backend/src/health.ts`: Database readiness check
- `backend/src/tracing.ts`: Pool connection gauges

### ✅ Acceptance Criteria
- [ ] Pool limits max connections to configurable threshold.
- [ ] Idle connections are reaped after 30 seconds.
- [ ] Connection acquisition timeout set to 5000ms to fail fast during DB saturation.
- [ ] Pool errors are logged with structured stack traces without crashing the server.

### 🧪 Testing & Verification Plan
- Unit test verifying pool configuration parameters.
- Stress test opening 50 concurrent connections and verifying idle cleanup.

### 🔒 Security, Reliability & Performance Considerations
Guarantees backend instances do not exhaust PostgreSQL connection limits on AWS RDS."""
    },
    {
        "title": "feat(db): Add migration for soft-deletion and archival of stale applications",
        "labels": ["enhancement", "backend"],
        "body": """### 🎯 Summary & Context
As hackathons and developer waves conclude, millions of historical pending applications that were never assigned remain in the `applications` table. Query performance degrades over time as table size increases, while hard-deleting historical records destroys audit trail integrity.

Implementing a soft-deletion pattern with an archival table maintains complete audit compliance while keeping the primary working table compact and fast.

### 🔍 Current Behavior & Root Cause
Currently, withdrawn or expired applications are either retained indefinitely with status `withdrawn`/`expired` in the primary table or hard-deleted. No archival partition or soft-deletion column exists.

### 🛠️ Proposed Solution & Technical Specification
1. Migration `migrations/7_add_soft_delete_and_archive.js`:
   - Add columns `deleted_at: timestamptz nullable`, `archived_at: timestamptz nullable` to `applications`.
   - Create archival table `applications_archive` matching schema for records older than 90 days.
2. In `backend/src/scheduler.ts`:
   - Implement scheduled archival job: move records with `deleted_at < NOW() - INTERVAL '90 days'` to `applications_archive`.
3. Update API queries to filter `deleted_at IS NULL` automatically.

### 📁 Affected Files & Modules
- `migrations/7_add_soft_delete_and_archive.js`: Migration file
- `backend/src/db.ts`: Soft delete helper queries
- `backend/src/scheduler.ts`: Archival cron worker
- `docs/storage-design.md`: Data retention policy

### ✅ Acceptance Criteria
- [ ] Soft deletion supported via `deleted_at` timestamp.
- [ ] Scheduled worker archives old records without interrupting live queries.
- [ ] Audit logs and historical analytics retain full access via `applications_archive`.
- [ ] Down-migration cleanly reverts changes.

### 🧪 Testing & Verification Plan
- Unit test soft deleting an application and verifying exclusion from active queries.
- Test archival script transferring 100 sample records.

### 🔒 Security, Reliability & Performance Considerations
Keeps primary table working set within PostgreSQL buffer cache for maximum query performance."""
    },
    {
        "title": "fix(db): Enforce foreign key constraints between assignments and applications",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
In the database schema, table `assignments` references `issue_id`, `org_id`, and `contributor`, but lacks an explicit Foreign Key (FK) constraint referencing the parent `applications` table.

Without an FK constraint, orphaned assignment records can be inserted directly through manual database patches or partial indexer ingestion failures, breaking relational data integrity.

### 🔍 Current Behavior & Root Cause
In `migrations/1_initial_schema.js`:
`assignments` and `applications` exist as independent unlinked tables. If an application is deleted or corrected, the corresponding assignment persists with dangling references.

### 🛠️ Proposed Solution & Technical Specification
1. Migration `migrations/8_add_assignments_applications_fk.js`:
   - Clean up or reconcile any existing orphaned rows in staging/test environments.
   - Add foreign key constraint:
     ```sql
     ALTER TABLE assignments 
     ADD CONSTRAINT fk_assignments_application 
     FOREIGN KEY (application_id) 
     REFERENCES applications(id) 
     ON DELETE RESTRICT;
     ```
   - Add composite foreign key or ensure relational integrity between `(org_id, issue_id, contributor)`.
2. Include complete `down` migration to drop constraint if needed.

### 📁 Affected Files & Modules
- `migrations/8_add_assignments_applications_fk.js`: Migration file
- `backend/src/db.ts`: Application/Assignment relationship queries
- `backend/src/__tests__/schemaFk.test.ts`: Constraint tests

### ✅ Acceptance Criteria
- [ ] Foreign key constraint enforced in PostgreSQL schema.
- [ ] Inserting an assignment for a non-existent application fails with FK violation.
- [ ] Relational integrity guaranteed across all database mutation paths.
- [ ] Down-migration drops constraint safely.

### 🧪 Testing & Verification Plan
- Attempt to insert assignment with invalid application_id and assert 23503 FK error.
- Verify existing application-assignment workflows pass without regression.

### 🔒 Security, Reliability & Performance Considerations
Protects database consistency against data corruption or manual SQL manipulation errors."""
    },
    {
        "title": "perf(db): Add EXPLAIN ANALYZE benchmark tests for all leaderboard query endpoints",
        "labels": ["performance", "testing"],
        "body": """### 🎯 Summary & Context
The leaderboard endpoint `GET /api/v1/leaderboard` computes aggregated contributor scores, completed assignment counts, and organization activity rankings. Under high traffic, complex SQL aggregations (`GROUP BY`, `COUNT`, `JOIN`) without performance regression testing can result in catastrophic table locks and slow query cascades.

Creating automated `EXPLAIN ANALYZE` benchmark tests guarantees that leaderboard queries do not exceed execution time thresholds or regress to full table scans.

### 🔍 Current Behavior & Root Cause
There is currently no automated test verifying query plan efficiency. Developers adding new columns or changing joins could inadvertently cause full table sequential scans without failing CI tests.

### 🛠️ Proposed Solution & Technical Specification
1. In `tests/perf/leaderboardQuery.test.ts`:
   - Seed test database with 50,000 synthetic applications, 10,000 assignments, and 2,000 contributors.
   - Run `EXPLAIN (ANALYZE, COSTS, BUFFERS)` on the leaderboard SQL queries.
   - Parse query plan JSON output:
     - Assert `Total Cost < 2000`.
     - Assert `Actual Total Time < 35.0` (35ms).
     - Assert `Node Type != 'Seq Scan'` on large tables.
2. Integrate into weekly benchmark CI workflow or `make bench`.

### 📁 Affected Files & Modules
- `tests/perf/leaderboardQuery.test.ts`: New performance test
- `backend/src/routes/leaderboard.ts`: Leaderboard query logic
- `docs/benchmarks.md`: Benchmark documentation

### ✅ Acceptance Criteria
- [ ] Benchmark test asserts execution time < 35ms on 50k dataset.
- [ ] Sequential scans on primary tables trigger test failure.
- [ ] Benchmark results logged and tracked across git commits.

### 🧪 Testing & Verification Plan
- Execute test on seeded PostgreSQL instance and inspect timing metrics.

### 🔒 Security, Reliability & Performance Considerations
Prevents performance degradation as platform user base grows."""
    },
    {
        "title": "fix(db): Ensure advisory locks are used during database migration runs",
        "labels": ["bug", "backend", "devops"],
        "body": """### 🎯 Summary & Context
When deploying new backend versions across multiple Kubernetes pods or container tasks simultaneously, each starting container executes `npm run migrate:up` in its entrypoint script.

Without a global advisory lock, multiple pods attempt to execute database schema alterations concurrently, causing deadlocks, duplicate table creation errors, or corrupted migration history tables (`pgmigrations`).

### 🔍 Current Behavior & Root Cause
In `backend/scripts/migrate.js` (or entrypoint):
Migrations run directly via `node-pg-migrate`. If two pods run migrations at the same second, both read the migration table before either finishes, leading to race conditions.

### 🛠️ Proposed Solution & Technical Specification
1. Wrap migration execution in a PostgreSQL session-level advisory lock:
   ```sql
   SELECT pg_advisory_lock(748392019482);
   -- Run migrations
   SELECT pg_advisory_unlock(748392019482);
   ```
2. Configure migration script with timeout: if lock cannot be acquired within 60 seconds, fail the startup container with a clear error rather than hanging forever.
3. Ensure lock is released in a `finally` block even if a migration fails.

### 📁 Affected Files & Modules
- `backend/scripts/migrate.js`: Migration runner script
- `Dockerfile`: Container entrypoint command
- `helm/workload-governor/templates/job-migration.yaml`: Dedicated migration job

### ✅ Acceptance Criteria
- [ ] Concurrent migration execution attempts are serialized safely by advisory lock.
- [ ] Lock is automatically released if migration crashes or succeeds.
- [ ] 60-second acquisition timeout prevents infinite startup hangs.
- [ ] Zero duplicate migration execution errors during rolling deployments.

### 🧪 Testing & Verification Plan
- Run 2 simultaneous migration processes in background and verify orderly sequential execution.

### 🔒 Security, Reliability & Performance Considerations
Crucial for seamless zero-downtime rolling deployments in multi-replica Kubernetes clusters."""
    },
    {
        "title": "feat(db): Add database health check probe verifying read and write replicas",
        "labels": ["enhancement", "backend", "operations"],
        "body": """### 🎯 Summary & Context
In production, WorkloadGovernor uses AWS Aurora PostgreSQL with a primary write instance and one or more read replicas. The current `/health` check only executes a simple `SELECT 1` on the default connection string.

It does not verify that write transactions succeed on the primary, nor does it test read replica replication lag or connectivity, meaning the backend could report 'healthy' while unable to process writes.

### 🔍 Current Behavior & Root Cause
In `backend/src/health.ts`:
`await db.query('SELECT 1');`
This basic query only proves that a socket connection exists. It does not verify transaction write capability, read replica health, or replication lag.

### 🛠️ Proposed Solution & Technical Specification
1. Enhance `/health` and `/ready` endpoints in `backend/src/health.ts`:
   - Primary check: Execute `SELECT txid_current()` to verify write transaction capability.
   - Read replica check (if configured): Query `SELECT pg_is_in_recovery(), pg_last_wal_replay_lsn()`.
   - Measure database roundtrip response time (latency ms).
2. Response format:
   ```json
   {
     "status": "healthy",
     "database": {
       "primary": { "status": "up", "latencyMs": 2.4, "writable": true },
       "replica": { "status": "up", "latencyMs": 1.8, "replicationLagSeconds": 0.2 }
     }
   }
   ```
3. Return HTTP 503 if primary write fails.

### 📁 Affected Files & Modules
- `backend/src/health.ts`: Health check handlers
- `backend/src/db.ts`: Replica pool configuration
- `docs/observability.md`: Health check documentation

### ✅ Acceptance Criteria
- [ ] Health check verifies both primary write capability and replica read status.
- [ ] Latency measurements in milliseconds included in health response payload.
- [ ] Database failure returns HTTP 503 with specific subsystem error details.
- [ ] Fast timeout (max 2000ms) prevents health check hangs.

### 🧪 Testing & Verification Plan
- Test health endpoint under normal conditions, read-only simulation, and DB unreachable state.

### 🔒 Security, Reliability & Performance Considerations
Allows Kubernetes and AWS ALB to detect unhealthy database nodes instantly and prevent routing user traffic to degraded instances."""
    }
]

# ADR-004: Use PostgreSQL Instead of SQLite for the Backend Database

**Status:** Accepted  
**Date:** 2024-02-01  
**Deciders:** Core team  
**Issue:** [#606](https://github.com/FaveTeamz/workload-governor/issues/606)

---

## Context

WorkloadGovernor's Node.js backend needs a relational database to:

1. Index Soroban contract events (application submitted, assignment completed, etc.)
   for efficient REST API queries.
2. Cache contract state to serve dashboard reads without querying the network on
   every request.
3. Store user sessions, API keys, and configuration that are not suitable for
   on-chain storage.
4. Support concurrent write operations from the event indexer and the API server.

The two primary candidates evaluated were **PostgreSQL 16** and **SQLite** (via
`better-sqlite3` or `libsql`).

---

## Decision

**Use PostgreSQL 16** as the primary database.

---

## Reasons

### 1. Concurrent write safety

The event indexer runs as a separate process (or worker) from the API server.
Both processes write to the database simultaneously:

- The indexer inserts event rows as Horizon delivers them.
- The API server writes session data and handles user mutations.

SQLite's write concurrency model is single-writer: only one process can hold
a write lock at a time. Under sustained concurrent load this produces `SQLITE_BUSY`
errors and requires retry logic. PostgreSQL uses MVCC (Multi-Version Concurrency
Control), allowing multiple writers without lock contention for non-conflicting rows.

### 2. Production deployment target is a managed service (RDS)

The deployment target for WorkloadGovernor is AWS infrastructure with Amazon RDS
for PostgreSQL. Using SQLite would require self-managing a file on an EC2 instance,
losing the benefits of automated backups, Multi-AZ failover, and the managed upgrade
path that RDS provides.

### 3. JSONB and advanced query support

Soroban contract events are delivered as XDR-encoded JSON blobs. PostgreSQL's
`JSONB` type allows indexing and querying inside event payloads without a schema
migration every time a new event field is added. SQLite 3.38+ has some JSON
support but lacks the JSONB index performance.

### 4. Row-level locking for idempotent event ingestion

The event indexer must be idempotent — re-processing the same Horizon events
must not create duplicate rows. PostgreSQL supports `INSERT ... ON CONFLICT DO NOTHING`
with reliable unique-constraint enforcement across concurrent insertions. SQLite
supports this syntax but has edge cases under concurrent access.

### 5. Standard tooling for the Node.js ecosystem

The project uses `pg` (node-postgres) and Drizzle ORM, both of which have
mature PostgreSQL drivers and migration tooling. SQLite alternatives (`better-sqlite3`,
`libsql`) have smaller ecosystems and fewer production deployment examples.

---

## Consequences

### Positive

- Concurrent write safety — no `SQLITE_BUSY` errors under load.
- RDS integration — automated backups, Multi-AZ, managed upgrades.
- JSONB queries for event payload filtering.
- Consistent with the deployment target from day one.

### Negative

- Heavier local development dependency — contributors need Docker to run
  PostgreSQL locally (SQLite would be zero-dependency).
- Higher operational overhead than a single-file SQLite database.
- Slightly more complex connection pooling configuration.

### Mitigation

- `docker compose up -d postgres redis` in the `docker-compose.yml` starts
  PostgreSQL for local development with one command.
- The `CONTRIBUTING.md` and `docs/contributor-guide.md` document the Docker
  prerequisite explicitly.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| SQLite (better-sqlite3) | Single-writer lock; unsuitable for concurrent indexer + API writes |
| SQLite (libsql / Turso) | Interesting distributed model but adds an external SaaS dependency |
| MySQL / MariaDB | Team has more PostgreSQL expertise; JSONB support is superior in Postgres |
| DynamoDB | No joins; event queries require complex GSI design; higher cost at scale |
| No database (contract-only) | Contract storage cannot be iterated; impossible to list all events for a contributor without an index |

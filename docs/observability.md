# Observability Runbook

This document describes the distributed tracing setup, X-Ray service map, operational runbooks, and log privacy guidelines for the WorkloadGovernor backend.

---

## Log Privacy and Redaction

Both backend loggers redact selected structured fields before logs are sent to storage.

### Redacted Fields and Paths

Pino replaces the configured fields with `[REDACTED]`:

- `req.headers.authorization` — Bearer tokens and HTTP Authorization headers
- `req.headers["x-api-key"]` — API key authentication headers
- `req.headers.cookie` — Session cookies and auth state
- `*.secretKey` — Secret cryptographic keys and seeds
- `*.privateKey` — Ed25519 or RSA private keys
- `*.apiKey` — Service or contributor API keys
- `*.token` — Auth, session, and webhook tokens
- `*.email` — Contributor email addresses and PII
- `*.password` — Passwords and shared secrets

The field rules apply in every environment. Sensitive values embedded in log messages or stored deeper than the configured paths require redaction at the call site.

---

---

## Prometheus Indexer Metrics

The application exposes Prometheus text-format metrics at `GET /metrics`. When
`METRICS_TOKEN` is configured, send it as a bearer token in the `Authorization`
header.

| Metric | Type | Labels | Description |
|---|---|---|---|
| `indexer_last_processed_ledger` | Gauge | — | Latest ledger processed by the indexer |
| `indexer_ledger_lag` | Gauge | — | Stellar network ledger minus the last processed ledger |
| `indexer_events_processed_total` | Counter | `event_type` | Contract events newly persisted by the indexer |

The counter is incremented after an insert succeeds. Duplicate rows do not
increment it. The [Prometheus rule](../monitoring/prometheus/alerting_rules.yml)
fires when the reported lag exceeds 50 ledgers for five minutes.
This document covers every alert defined in
`monitoring/prometheus/alerting_rules.yml` (Prometheus) and
`infra/logs_and_alarms.tf` (CloudWatch), and specifies the structured audit
log schema emitted by `src/logger.ts`.

---

## Infrastructure alerts

### HighCpuUtilization

| Field       | Value |
|-------------|-------|
| Severity    | warning |
| Threshold   | CPU > 85% for 5 minutes |
| Prometheus  | `alerting_rules.yml` → group `infrastructure` |

**What it means**  
One or more hosts are saturating their CPU allocation.  User-visible latency
will increase; if sustained, the service will start dropping requests.

**Investigation steps**

1. Check which process is consuming CPU:
   ```
   top -b -n 1 | head -20
   ```
2. Review recent deployments — a new build may have introduced a hot loop.
3. Check ECS task count; scale out if the cluster has headroom.
4. Inspect `slow_requests` Insights query in CloudWatch for correlated latency.

---

### HighMemoryUtilization

| Field       | Value |
|-------------|-------|
| Severity    | warning |
| Threshold   | Memory > 90% for 5 minutes |
| Prometheus  | `alerting_rules.yml` → group `infrastructure` |

**What it means**  
Available memory is critically low.  The OOM killer may terminate processes,
causing unexpected restarts.

**Investigation steps**

1. Identify the top memory consumers: `ps aux --sort=-%mem | head -10`
2. Check for memory leaks introduced in recent releases.
3. Review heap dumps or APM traces for runaway caches.
4. Scale up the task memory limit or increase the ECS task count.

---

## SLO alerts

### HighHttp5xxErrorRate

| Field       | Value |
|-------------|-------|
| Severity    | **critical** |
| Threshold   | 5xx rate > 5% of total HTTP traffic for 3 minutes |
| Prometheus  | `alerting_rules.yml` → group `slo` |
| CloudWatch  | `${service_name}-slo-5xx-error-ratio` |

**What it means**  
More than 1 in 20 HTTP requests are returning server errors.  This is a
user-impacting outage.  The root cause is often an unhandled exception in
backend code (e.g. a database query that starts throwing after a schema
change) that never manifests as CPU or memory pressure.

**Investigation steps**

1. Open the CloudWatch error-rate Insights query
   (`${service_name}-error-rate`) and filter to the last 15 minutes.
2. Identify which `path` values are generating errors.
3. Correlate with the `contract_submission_failures` query for RPC-related
   causes.
4. Check application logs for stack traces:
   ```
   aws logs filter-log-events \
     --log-group-name /ecs/<service> \
     --filter-pattern "ERROR" \
     --start-time $(date -d '-10 minutes' +%s000)
   ```
5. If caused by a bad deployment, follow the
   [rollback runbook](rollback-runbook.md).
6. If caused by a database issue, check RDS connections on the dashboard and
   follow the [incident-response runbook](runbooks/incident-response.md).

**Escalation**  
Page the on-call backend engineer immediately.  If unresolved in 15 minutes,
escalate to the engineering lead.

---

### HighHttpLatencyP95

| Field       | Value |
|-------------|-------|
| Severity    | warning |
| Threshold   | P95 request latency > 500 ms for 5 minutes |
| Prometheus  | `alerting_rules.yml` → group `slo` |
| CloudWatch  | `${service_name}-slo-p95-latency` |

**What it means**  
The 95th-percentile response time has crossed 500 ms, meaning at least 1 in
20 users is experiencing noticeable slowness.  This often precedes a
`HighHttp5xxErrorRate` event.

**Investigation steps**

1. Open the `slow_requests` Insights query to rank endpoints by P95 latency.
2. Check whether a specific path is the outlier or whether latency is spread
   evenly (the latter suggests a downstream bottleneck such as the database or
   a Soroban RPC endpoint).
3. Check the Soroban RPC failover alarm — a failover in progress will add
   latency until the new endpoint warms up.
4. Review RDS `DatabaseConnections` on the dashboard; a connection-pool
   exhaustion will spike latency across all endpoints.
5. If the spike coincides with a deployment, consider rolling back:
   [rollback runbook](rollback-runbook.md).

**Escalation**  
Notify the on-call engineer.  If P95 latency exceeds 2 s or if
`HighHttp5xxErrorRate` fires concurrently, treat as a severity-1 incident.

---

## Verification

To validate Prometheus rule syntax locally:

```bash
promtool check rules monitoring/prometheus/alerting_rules.yml
```

A clean run produces no output and exits with code 0.

To simulate an error spike in a Prometheus unit-test ruleset, add a test file
at `monitoring/prometheus/alerting_rules_test.yml` and run:

```bash
promtool test rules monitoring/prometheus/alerting_rules_test.yml
```

---

## Audit log schema (#1323)

All audit events are emitted as structured JSON by `logAuditEvent` in
`src/logger.ts`.  Every record carries a top-level `audit: true` field that
makes it trivially filterable without regex.

### JSON schema

```jsonc
{
  "audit": true,              // always present — use as the primary filter key
  "action": "register_org",  // machine-readable operation name (snake_case)
  "actor": {
    "type": "admin",          // "admin" | "maintainer" | "contributor"
    "id": "GAADMIN…",         // Stellar public key or GitHub login
    "ip": "203.0.113.1"       // originating IP, present when available
  },
  "target": {
    "type": "org",            // "org" | "issue" | "contract"
    "id": "stellar-oss"       // resource identifier
  },
  "outcome": "success",       // "success" | "failure"
  "details": {                // optional — action-specific payload
    "tx_hash": "abc123",
    "maintainers": ["GBMAINT…"],
    "error": "MaintainerNotFound"
  }
}
```

### Action catalogue

| action | actor.type | target.type | Emitted by |
|---|---|---|---|
| `admin_auth` | `admin` | `contract` | `routes/admin.ts` — invalid signature |
| `register_org` | `admin` | `org` | `routes/admin.ts` — `POST /api/admin/orgs` success |
| `register_maintainer` | `admin` | `org` | `routes/admin.ts` — contract call failure + DB rollback |
| `deregister_maintainer` | `admin` | `org` | `routes/admin.ts` — `DELETE /api/admin/maintainers` success |
| `cancellation` | `admin` | `issue` | `services/auditService.ts` — cancellation write path |

### CloudWatch Logs Insights queries

**All audit events (last hour)**
```
fields @timestamp, action, actor.id, actor.type, target.id, outcome
| filter audit = true
| sort @timestamp desc
| limit 100
```

**Failed operations only**
```
fields @timestamp, action, actor.id, target.id, details.error
| filter audit = true and outcome = "failure"
| sort @timestamp desc
```

**Activity by a specific admin**
```
fields @timestamp, action, target.id, outcome
| filter audit = true and actor.id = "GAADMIN…"
| sort @timestamp desc
```

**All cancellation events for an org**
```
fields @timestamp, actor.id, target.id, details.reason, details.tx_hash
| filter audit = true and action = "CONTRIBUTOR_WITHDREW" or action = "MAINTAINER_REVOKED"
| sort @timestamp desc
```

### SIEM indexing

The `audit: true` field is the recommended index key.  Every field except
`details` is always present, so queries never need to handle missing keys.
`details` is free-form and action-specific; treat it as an opaque payload for
human review rather than a typed schema to filter on.

---

## Local Development

Tracing is disabled by default when running locally:

```bash
# .env (local)
XRAY_ENABLED=false
```

To test tracing locally with a real daemon:

```bash
# Pull and run the X-Ray daemon in a container
docker run --rm -p 2000:2000/udp \
  -e AWS_DEFAULT_REGION=us-east-1 \
  amazon/aws-xray-daemon:3.x -o   # -o = local mode (no EC2 metadata required)

# Then start the backend with tracing enabled
XRAY_ENABLED=true AWS_XRAY_DAEMON_ADDRESS=127.0.0.1:2000 npm run dev
```

Segments appear in the [X-Ray console](https://console.aws.amazon.com/xray/home) within ~30 seconds.

## PostgreSQL connection pool

The `/metrics` endpoint reports current connection counts from the database pool.

| Metric | Description |
|---|---|
| `pg_pool_total_connections` | Total connections allocated in the pool |
| `pg_pool_idle_connections` | Connections available for queries |
| `db_pool_active` | Connections checked out from the pool |
| `pg_pool_waiting_requests` | Requests queued for a connection |

`DatabasePoolWaitingRequestsHigh` alerts when more than five requests are queued
for a minute. Check long-running queries and transactions before increasing the pool size.

## HTTP error rate and latency alerts

`HighHttp5xxErrorRate` alerts when server errors exceed 1% of requests for five
minutes. `HighHttpLatencyP95` alerts when the 95th-percentile request duration
exceeds 500 ms for five minutes. Check the status and route labels in
`http_requests_total` and the request duration histogram to identify affected routes.
## Related documents

- [Deployment runbook](deployment-runbook.md)
- [Rollback runbook](rollback-runbook.md)
- [Incident response runbook](runbooks/incident-response.md)
- [Architecture overview](architecture.md)

## Database Health Probes (#1256)

`GET /api/health` reports database health under `database`:

```json
{
  "status": "healthy",
  "database": {
    "primary": { "status": "up", "latencyMs": 2, "writable": true },
    "replica": { "status": "up", "latencyMs": 1, "replicationLagSeconds": 0.2 }
  }
}
```

- **Primary.** The primary is `writable` when `pg_is_in_recovery()` is false and
  `transaction_read_only` is `off`. If it is not writable (a standby after failover,
  read-only mode) or unreachable, the response is HTTP 503. `txid_current()` is not
  used, because it allocates a transaction id on every probe.
- **Replica.** The replica is checked only when `DATABASE_REPLICA_URL` is set. It
  reports `replicationLagSeconds`, from `now() - pg_last_xact_replay_timestamp()`.
  A replica that is unreachable, or that lags more than `REPLICA_MAX_LAG_SECONDS`
  (default 30), makes the overall status `degraded` but keeps HTTP 200, because
  reads can fall back to the primary.
- **Readiness.** `GET /api/ready` checks only that the primary is writable (200 or
  503). Use it for Kubernetes readiness probes.

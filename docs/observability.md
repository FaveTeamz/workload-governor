# Observability

This document describes the distributed tracing setup, X-Ray service map, and operational runbooks for the WorkloadGovernor backend.

---

## Distributed Tracing — AWS X-Ray

The backend uses [AWS X-Ray](https://aws.amazon.com/xray/) to trace every inbound request through all downstream service calls.

### Architecture

```
Browser / API client
        │
        ▼
  ALB (trace header injected)
        │
        ▼
  ECS Task — workload-governor-backend
  ├── Express middleware: opens X-Ray segment per request
  ├── tracedFetch("horizon-rpc") → Soroban RPC / Horizon
  ├── tracedFetch("github-api")  → GitHub API
  ├── tracedDbQuery()            → PostgreSQL (pg subsegment)
  └── sends UDP segments to xray-daemon sidecar
              │
              ▼
       xray-daemon sidecar (amazon/aws-xray-daemon:3.x)
              │
              ▼
       AWS X-Ray service (PutTraceSegments)
```

### What is instrumented

| Component | Implementation | Subsegment name |
|---|---|---|
| Inbound HTTP requests | `xrayMiddleware()` in `app.ts` | Root segment per request |
| Horizon RPC calls | `tracedFetch("horizon-rpc", ...)` | `horizon-rpc` |
| Soroban RPC calls | `tracedFetch("soroban-rpc", ...)` | `soroban-rpc` |
| GitHub API calls | `tracedFetch("github-api", ...)` | `github-api` |
| PostgreSQL queries | `tracedDbQuery(pool, sql, ...)` | `postgres` |

### SDK configuration

`backend/src/tracing.ts` exports:

- `xrayMiddleware()` — Express middleware; mount first in `app.ts`.
- `tracedFetch(name, url, init?)` — drop-in replacement for `fetch` that wraps the call in an X-Ray subsegment.
- `tracedDbQuery(pool, sql, values?)` — wraps `pg.Pool.query` with a `postgres` subsegment.

Set `XRAY_ENABLED=false` to disable tracing in local development and unit tests. The helpers become pass-through wrappers with zero overhead when disabled.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `XRAY_ENABLED` | `true` | Set to `false` to disable tracing |
| `SERVICE_NAME` | `workload-governor-backend` | Service name shown in the X-Ray service map |
| `AWS_XRAY_DAEMON_ADDRESS` | `127.0.0.1:2000` | Set automatically by ECS task definition |

---

## X-Ray Service Map

The service map is available in the [AWS X-Ray console](https://console.aws.amazon.com/xray/home#/service-map).

After deploying and generating traffic:

1. Open the X-Ray console → **Service map**.
2. You should see nodes for:
   - `workload-governor-backend` (the ECS service)
   - `postgres` (RDS database)
   - `horizon-rpc` (Horizon/Soroban RPC)
   - `github-api` (GitHub REST API)
3. Click any edge to see latency percentiles (p50, p95, p99) and error rates.

> **Tip:** Select a 5-minute window during an active deploy to see the baseline latency of a cold-start task.

---

## Runbook: p99 Transaction Latency

Use this CloudWatch Insights query to find the p99 latency for Soroban transaction submission over the last hour.

**Log group:** `/ecs/workload-governor-<environment>`

```
fields @timestamp, @message
| filter @message like "TTL extension batch confirmed" or @message like "Transaction"
| parse @message '"hash":"*"' as hash
| parse @message '"batchSize":*,' as batchSize
| stats pct(@duration, 99) as p99_ms,
        avg(@duration) as avg_ms,
        count() as request_count
| sort @timestamp desc
| limit 100
```

To run this query:

1. Open [CloudWatch Logs Insights](https://console.aws.amazon.com/cloudwatch/home#logsV2:logs-insights).
2. Select log group `/ecs/workload-governor-production`.
3. Set the time range to **Last 1 hour**.
4. Paste the query above and choose **Run query**.

### Latency SLOs

| Operation | p50 target | p99 target |
|---|---|---|
| Soroban transaction submit | < 500 ms | < 5 s |
| GitHub sync per repo | < 2 s | < 10 s |
| PostgreSQL query (read) | < 20 ms | < 100 ms |
| Health check endpoint | < 200 ms | < 500 ms |

### Investigating a latency spike

1. Open the X-Ray service map → identify the slow edge.
2. Click the edge → **View traces** → sort by **Duration (desc)**.
3. Open the slowest trace to see which subsegment (DB, Horizon, GitHub) is the bottleneck.
4. Cross-reference with CloudWatch metrics for the suspected service:
   - **RDS**: `DatabaseConnections`, `DBLoad`
   - **Horizon/Soroban RPC**: `soroban_rpc` subsegment duration in X-Ray
   - **GitHub API**: check rate-limit headers in application logs

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

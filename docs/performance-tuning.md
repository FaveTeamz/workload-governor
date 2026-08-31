# Performance Tuning Guide

> **Audience:** Platform operators and SREs responsible for the WorkloadGovernor backend.
>
> **Scope:** Database connection pool sizing, Redis cache TTL recommendations, Horizon RPC concurrency, ECS task right-sizing, load testing procedure, and CloudWatch alarm thresholds.

The backend is expected to handle short-lived bursts when popular issue drops go live. This guide documents every performance knob, the reasoning behind each recommendation, and the signals that tell you when to turn them.

---

## 1. Database Connection Pool Sizing

### Formula

```
connections = (core_count × 2) + effective_spindle_count
```

`effective_spindle_count` is `1` for SSD-backed storage (RDS gp3 / io1) and equal to the number of physical spindles for HDD-backed storage.

| ECS task vCPU | Spindle count | Recommended pool size |
|---|---|---|
| 0.5 | 1 (SSD) | 2 |
| 1 | 1 (SSD) | 3 |
| 2 | 1 (SSD) | 5 |
| 4 | 1 (SSD) | 9 |
| 8 | 1 (SSD) | 17 |

### Current defaults (configured in `src/db.ts`)

| Variable | Default | Description |
|---|---|---|
| `DB_POOL_MAX` | `20` | Maximum connections per Node.js process |
| `DB_IDLE_TIMEOUT` | `30000` | Close idle connections after 30 s |
| `DB_CONNECTION_TIMEOUT` | `2000` | Fail fast if a connection cannot be acquired in 2 s |

### Sizing rules

- Keep `DB_POOL_MAX` < `max_connections_on_rds / number_of_ecs_tasks`.
  - Example: RDS `db.t4g.medium` has `max_connections = 170`. With 4 ECS tasks: `170 / 4 = 42`, so any pool ≤ 42 is safe.
- For a 2 vCPU ECS task, set `DB_POOL_MAX=5` or `9` (formula gives 5; use 9 if you observe frequent pool exhaustion).
- **Warning signal:** `connection wait time > 100 ms` in CloudWatch → either reduce pool size (to release DB connections to other tasks) or add more ECS tasks.

### pgBouncer

If you place pgBouncer in front of RDS (recommended for > 10 tasks):

- Set pgBouncer `pool_mode = transaction`.
- Reduce the application pool: `DB_POOL_MAX=2` (pgBouncer multiplexes efficiently).
- Set pgBouncer's own `max_client_conn` to match the total connections your RDS instance can handle.

---

## 2. Redis Cache TTL Recommendations

Cache TTLs balance freshness against DB load. The current default in `src/services/redis.ts` is **30 seconds** for all keys; the recommendations below are query-type-specific.

| Data type | Cache key prefix | Recommended TTL | Rationale |
|---|---|---|---|
| Global cap (`get_global_application_count`) | `global_cap:*` | 60 s | Changes only on apply/withdraw; 60 s staleness is within one UI refresh cycle |
| Org assignment count (`get_org_assignment_count`) | `org_asgn:*` | 30 s | Changes on assign/complete/revoke; 30 s matches the current default |
| Leaderboard | `leaderboard:*` | 300 s | Expensive aggregate query; 5-minute staleness is acceptable for ranking data |
| Issues list | `issues:*` | 60 s | Read-heavy; can tolerate 1-minute lag on new issues appearing |
| Event feed | `events:*` | 15 s | Users expect near-real-time; keep this short |

### Thundering-herd mitigation

Setting a very short TTL on the leaderboard endpoint under burst traffic will cause every process to stampede the DB simultaneously when the cache expires. Options:

1. **Staggered TTL jitter:** add ±10% random jitter to the TTL value in `setCache` calls.
2. **Lock-based regeneration:** use a Redis `SET NX EX` lock to ensure only one process regenerates the cache; all others serve stale data during the regeneration window.

---

## 3. Horizon RPC Concurrency and Backpressure

### Public Horizon rate limits

The public Horizon instance at `https://horizon.stellar.org` enforces **~100 requests/second per IP**. Exceeding this returns HTTP `429`.

### Concurrency cap

The backend uses `src/horizon.ts` for all RPC calls. Wrap concurrent Horizon calls with a semaphore to avoid cascade failures:

```typescript
// Suggested: add to src/horizon.ts
const CONCURRENCY_LIMIT = parseInt(process.env.HORIZON_CONCURRENCY_LIMIT ?? '10', 10);
```

- **Recommended limit:** 10 simultaneous Horizon calls per backend process.
- With 4 ECS tasks, this gives a total of 40 concurrent Horizon calls — well under the public 100 req/s ceiling.

### Retry strategy

For transient `429` and `503` responses:

| Attempt | Delay |
|---|---|
| 1st retry | 500 ms |
| 2nd retry | 1 500 ms |
| 3rd retry | 4 500 ms |
| Give up | Return error to caller |

Use exponential backoff with jitter: `delay = baseDelay * 2^attempt + random(0, 500)`.

### Circuit breaker

After **5 consecutive `429` responses** from Horizon:

1. Open the circuit — return `503 Service Unavailable` to clients immediately, skipping Horizon calls.
2. Pause Horizon calls for **30 seconds**.
3. Half-open: send one probe request; if successful, close the circuit.

### Dedicated Horizon node

For sustained production load, run a dedicated Horizon instance (self-hosted or via a provider) and set:

```
HORIZON_URL=https://your-dedicated-horizon.example.com
```

This removes the shared rate-limit constraint entirely.

---

## 4. ECS Task CPU / Memory Right-Sizing

The WorkloadGovernor backend is **I/O-bound** (database and Redis), not CPU-bound. The Soroban benchmarks show the heaviest contract call (`assign_issue`) costs only ~4,000 CPU instructions — negligible. The bottleneck is always network round-trips.

### Sizing tiers

| Traffic level | vCPU | Memory | Min tasks | Scale trigger |
|---|---|---|---|---|
| < 100 TPS | 0.5 | 512 MB | 1 | CPU > 70% for 5 min |
| 100–500 TPS | 1 | 1 GB | 2 | CPU > 70% for 5 min |
| 500+ TPS | 2 | 2 GB | 3 | CPU > 70% for 5 min |

The ECS auto-scaling policy in `infra/ecs-autoscaling.tf` targets **70% CPU utilization** (scale-out cooldown: 60 s, scale-in cooldown: 300 s, min tasks: 1, max tasks: 10).

### Memory guidance

- Each Node.js process baseline: **~150–250 MB** (varies by heap activity).
- Keep the task memory limit at least **2× the expected RSS** to avoid OOM kills.
- If P99 latency is elevated but CPU and connection pool are not saturated, suspect **GC pressure** — increase task memory first before adding tasks.

### Scale horizontally, not vertically

- **Scale out (add tasks):** when CPU > 70% or connection pool is exhausted.
- **Scale up (bigger task):** only if a single request is computationally expensive, which is not the case here.
- After each scaling event, verify `DB_POOL_MAX × new_task_count < RDS max_connections`.

---

## 5. Load Testing Checklist

The k6 test suite lives at `tests/load/k6-staging.js`. It simulates a mixed read/write workload at up to 100 virtual users over 5 minutes.

### Pre-test checklist

- [ ] Staging environment uses the same task CPU/memory configuration as production.
- [ ] RDS instance class matches production.
- [ ] Database seeded with representative data: **≥ 1,000 issues**, **≥ 100 contributors**.
- [ ] Redis either flushed (cold-cache test) or pre-warmed (warm-cache test) — test both.
- [ ] Baseline metrics captured before the test: P50 / P95 / P99 latency, error rate, DB connection count.
- [ ] CloudWatch dashboards open and auto-refreshing.

### Running the test

```bash
# Install k6 (macOS / Linux)
# https://k6.io/docs/getting-started/installation/

k6 run tests/load/k6-staging.js \
  --env BASE_URL=https://staging.example.com \
  --env ADMIN_TOKEN=<staging-admin-token> \
  --vus 50 --duration 5m
```

For a stress test (find the breaking point):

```bash
k6 run tests/load/k6-staging.js \
  --env BASE_URL=https://staging.example.com \
  --stage 0s:0,60s:50,120s:100,180s:200,60s:0
```

### Acceptance criteria

| Metric | Target |
|---|---|
| P50 latency (read) | < 50 ms |
| P95 latency (read) | < 200 ms |
| P99 latency (read) | < 500 ms |
| P95 latency (write / transaction build) | < 600 ms |
| Error rate | < 0.1% |
| Any 5xx response | 0 |

The k6 built-in thresholds (in `tests/load/k6-staging.js`) enforce `p(95) < 500 ms` and `error_rate < 1%` — these are the minimum bars. The table above reflects tighter production SLAs.

---

## 6. Recommended CloudWatch Alarms

These alarms supplement the log groups and Insights queries defined in `infra/logs_and_alarms.tf`.

| Alarm name | Metric | Threshold | Action |
|---|---|---|---|
| `HighDBConnections` | RDS `DatabaseConnections` | > 80% of `max_connections` for 5 min | Enable pgBouncer or add ECS tasks |
| `HighCPU` | ECS `CPUUtilization` | > 70% for 5 min | Scale out tasks (auto-scaling should handle this) |
| `HighMemory` | ECS `MemoryUtilization` | > 85% for 5 min | Increase task memory limit |
| `HighLatencyP99` | ALB `TargetResponseTime` (p99) | > 500 ms for 5 min | Investigate pool exhaustion or cache miss rate |
| `HighErrorRate` | ALB `HTTPCode_Target_5XX_Count` | > 1% over 5 min | Page on-call immediately |
| `RedisEvictions` | ElastiCache `Evictions` | > 0 for 5 min | Increase Redis `maxmemory` or reduce TTLs |
| `RedisConnectionSaturation` | ElastiCache `CurrConnections` | > 80% of `maxclients` for 5 min | Scale Redis or reduce app connection pooling |
| `HorizonThrottles` | Custom metric `horizon_429_count` (emitted from backend) | > 10 in 1 min | Reduce `HORIZON_CONCURRENCY_LIMIT` or switch to dedicated node |

### Adding the `horizon_429_count` custom metric

Emit a CloudWatch metric from the backend whenever Horizon returns `429`:

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cw = new CloudWatch({ region: process.env.AWS_REGION });

export async function recordHorizonThrottle() {
  await cw.putMetricData({
    Namespace: 'WorkloadGovernor/Horizon',
    MetricData: [{ MetricName: 'horizon_429_count', Value: 1, Unit: 'Count' }],
  });
}
```

---

## 7. Quick Reference

| Variable | Default | Burst recommendation |
|---|---|---|
| `DB_POOL_MAX` | `20` | `9` (2 vCPU) / `17` (8 vCPU) |
| `DB_IDLE_TIMEOUT` | `30000` ms | `30000` ms |
| `DB_CONNECTION_TIMEOUT` | `2000` ms | `2000` ms |
| `HORIZON_CONCURRENCY_LIMIT` | *(not set)* | `10` |
| `HORIZON_URL` | Stellar public | Self-hosted for > 50 TPS |
| Redis TTL — leaderboard | `30` s (global default) | `300` s |
| Redis TTL — global cap | `30` s (global default) | `60` s |
| Redis TTL — event feed | `30` s (global default) | `15` s |
| ECS min tasks | `1` | `2` (100–500 TPS) / `3` (500+ TPS) |
| ECS CPU target | `70%` | `70%` (keep this; adjust task size instead) |

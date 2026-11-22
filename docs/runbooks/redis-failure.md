# Runbook: Redis Cache Failure

This runbook covers Redis (ElastiCache) cache failure, mass key eviction, cache
poisoning, cluster resizing, and recovery verification for the WorkloadGovernor
backend.

**Service:** `workload-governor-backend`  
**Cache:** AWS ElastiCache for Redis (`terraform/modules/cache/`)  
**Health endpoint:** `GET /api/health`

---

## Symptoms

| Observation | Likely cause |
|---|---|
| `/api/health` returns `status: "degraded"` with `redis` dependency `"unhealthy"` | Redis unreachable or not responding to PING |
| Elevated DB query rate / increased RDS CPU | Cache miss storm (eviction or Redis down) |
| Application logs show `Redis connection error:` | ioredis connection failure |
| Application logs show repeated `Cache MISS for key:` | Mass eviction or cold start |
| ElastiCache `Evictions` CloudWatch metric > 0 | Memory pressure; keys being evicted under `allkeys-lru` |
| Response times elevated for contributor / org endpoints | Cache bypassed; all reads going to PostgreSQL |

---

## Immediate mitigation

Redis is a **non-critical** dependency. When Redis is unreachable the backend
continues serving requests using the database directly:

- `getCache()` in `src/services/redis.ts` catches all errors and returns `null`.
- `setCache()` catches errors silently — writes that fail are a no-op.
- No request fails due to Redis being down. The backend degrades gracefully.

**Priority actions:**

1. Confirm the backend is still responding — check the ALB target group health
   and call `GET /api/health`. A `status: "degraded"` response with
   `redis: "unhealthy"` confirms Redis is down but the service is alive.
2. Notify on-call if `status` is `"unhealthy"` (that indicates PostgreSQL or
   Soroban RPC is also down, which is the more critical issue).
3. Check ElastiCache console for the replication group status.
4. Check application logs for the root cause (see Diagnosing section).

---

## Diagnosing the root cause

### Check /api/health

```bash
curl -s https://<domain>/api/health | jq .
```

Expected healthy response:
```json
{
  "status": "healthy",
  "dependencies": [
    { "name": "postgres",    "status": "healthy", "latency_ms": 4  },
    { "name": "redis",       "status": "healthy", "latency_ms": 1  },
    { "name": "soroban_rpc", "status": "healthy", "latency_ms": 87 },
    { "name": "horizon",     "status": "healthy", "latency_ms": 45 },
    { "name": "github",      "status": "healthy", "latency_ms": 52 }
  ]
}
```

When Redis is down the `redis` entry will show `"status": "unhealthy"` and the
overall `status` will be `"degraded"` (HTTP 200 — Redis is non-critical).

### Check application logs

**Log group:** `/ecs/workload-governor-<environment>`

```
# Filter for Redis errors in the last 30 minutes
aws logs filter-log-events \
  --log-group-name "/ecs/workload-governor-production" \
  --start-time $(date -d '30 minutes ago' +%s000) \
  --filter-pattern "Redis"
```

Key log patterns:
- `Redis connection error:` — ioredis emitting an error event; may include the
  error code (`ECONNREFUSED`, `ETIMEDOUT`, `ECONNRESET`).
- `Redis connected` — successful (re)connection after a failure period.
- `Cache MISS for key:` appearing at an unusually high rate — mass eviction.

### ioredis retry / backoff behaviour

`src/services/redis.ts` configures ioredis with:

```typescript
retryStrategy: (times) => {
  const delay = Math.min(times * 50, 2000);
  return delay;
},
enableOfflineQueue: true,
```

- Retry `1`: 50 ms
- Retry `2`: 100 ms
- Retry `3`: 150 ms
- …
- Retry `40+`: 2 000 ms (capped)

With `enableOfflineQueue: true`, commands issued while Redis is unreachable are
queued in memory and replayed once the connection is restored. This means
requests do not fail — they slow down if the queue fills, but under a brief
outage the backend remains functional.

### Check ElastiCache metrics (CloudWatch)

Navigate to **CloudWatch → Metrics → ElastiCache** and inspect:

| Metric | Concern threshold | Notes |
|---|---|---|
| `CurrConnections` | Drops to 0 | Redis unreachable |
| `Evictions` | > 0 sustained | Memory pressure |
| `CacheMisses` | Spike above baseline | Eviction storm or cold start |
| `CacheHits` | Drops sharply | Cache emptied |
| `DatabaseMemoryUsagePercentage` | > 80 % | Near OOM; eviction imminent |
| `ReplicationLag` | > 1 s | Replica falling behind (production) |
| `EngineCPUUtilization` | > 90 % | Redis CPU saturation |

### Check ElastiCache replication group status

```bash
aws elasticache describe-replication-groups \
  --replication-group-id workload-governor-production \
  --query 'ReplicationGroups[0].Status'
```

Expected value: `"available"`. Other values (`creating`, `modifying`,
`snapshotting`, `deleting`) indicate an ongoing operation.

---

## Flushing keys manually

> **Warning:** `FLUSHALL` removes all data from all Redis databases. Prefer
> targeted key deletion unless a full flush is required. After flushing, the
> backend will hit the database for all requests until the cache warms up.

### Connect to ElastiCache

ElastiCache is only accessible from within the VPC. Use an SSM Session Manager
bastion or an ECS exec session:

```bash
# Start an ECS exec session on a running backend task
TASK_ARN=$(aws ecs list-tasks \
  --cluster workload-governor-production \
  --service-name workload-governor-backend \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster workload-governor-production \
  --task "$TASK_ARN" \
  --container app \
  --interactive \
  --command "/bin/sh"
```

Then connect with redis-cli (TLS required — ElastiCache has
`transit_encryption_enabled = true`):

```bash
# Inside the container (REDIS_HOST is injected from Secrets Manager)
redis-cli -h "$REDIS_HOST" -p 6379 --tls
```

### Targeted key deletion (preferred)

```bash
# Delete all keys matching a pattern (run inside redis-cli session or pass via -e)
redis-cli -h "$REDIS_HOST" -p 6379 --tls \
  --scan --pattern 'contributor:*' | xargs redis-cli -h "$REDIS_HOST" -p 6379 --tls DEL

redis-cli -h "$REDIS_HOST" -p 6379 --tls \
  --scan --pattern 'org:*' | xargs redis-cli -h "$REDIS_HOST" -p 6379 --tls DEL

redis-cli -h "$REDIS_HOST" -p 6379 --tls \
  --scan --pattern 'snapshot:*' | xargs redis-cli -h "$REDIS_HOST" -p 6379 --tls DEL
```

### Flush current database only

```bash
redis-cli -h "$REDIS_HOST" -p 6379 --tls FLUSHDB
```

### Flush all databases (full reset)

```bash
redis-cli -h "$REDIS_HOST" -p 6379 --tls FLUSHALL
```

After flushing, the backend will begin repopulating the cache automatically on
the next cache-miss path through `setCache()`.

---

## Resizing the cluster (Terraform)

If the eviction was caused by memory pressure, increase the node type.

### 1. Update the node type

Edit `terraform/modules/cache/main.tf`:

```hcl
resource "aws_elasticache_replication_group" "this" {
  # ...
  node_type = "cache.t3.small"   # was cache.t3.micro
  # ...
}
```

Available node types (in ascending order): `cache.t3.micro` → `cache.t3.small`
→ `cache.t3.medium` → `cache.m6g.large` → `cache.m6g.xlarge`.

### 2. Plan and apply

```bash
# Staging
terraform -chdir=terraform init -backend-config=backend-staging.hcl
terraform -chdir=terraform plan -var-file=environments/staging/terraform.tfvars
terraform -chdir=terraform apply -var-file=environments/staging/terraform.tfvars

# Production
terraform -chdir=terraform init -backend-config=backend-production.hcl
terraform -chdir=terraform plan -var-file=environments/production/terraform.tfvars
terraform -chdir=terraform apply -var-file=environments/production/terraform.tfvars
```

> **Note:** Changing `node_type` triggers a cluster replacement. ElastiCache
> performs a rolling update (production has `num_cache_clusters = 2`) with
> minimal downtime. During the update, ioredis will retry with exponential
> backoff and reconnect automatically when the new primary is available.

### 3. Verify the backend reconnects

After `terraform apply` completes, tail the ECS task logs:

```bash
aws logs tail "/ecs/workload-governor-production" \
  --follow --filter-pattern "Redis"
```

You should see `Redis connected` within a few seconds of the new cluster
becoming available.

---

## Verifying recovery

### 1. /api/health endpoint

```bash
watch -n 5 'curl -s https://<domain>/api/health | jq "{status, redis: .dependencies[] | select(.name==\"redis\")}"'
```

Wait for:
```json
{ "status": "healthy" }
{ "name": "redis", "status": "healthy", "latency_ms": 1 }
```

### 2. Application logs

```
Redis connected
Cache SET for key: ...
Cache HIT for key: ...
```

The absence of `Redis connection error:` and the return of `Cache HIT` log lines
confirms the cache is healthy and warming up.

### 3. CloudWatch metrics

Confirm these metrics trend back to baseline in the ElastiCache console:

- `CurrConnections` — back to expected level (> 0)
- `CacheHits` — climbing as cache warms
- `CacheMisses` — decreasing
- `Evictions` — back to 0
- `DatabaseMemoryUsagePercentage` — below 80 %

### 4. RDS load

After a cache failure, RDS CPU and connection counts will be elevated during the
warm-up period. Confirm `DatabaseConnections` and `CPUUtilization` in the RDS
CloudWatch metrics return to their pre-incident baseline within 5–10 minutes.

---

## Post-incident actions

1. **Document the incident** in the incident log (see
   `docs/runbooks/incident-response.md`) with timeline, root cause, and
   remediation steps taken.
2. **Review memory sizing:** if the root cause was `Evictions` due to memory
   pressure, schedule a Terraform change to increase the node type before the
   next incident.
3. **Review TTLs:** if keys are accumulating without expiry, audit `setCache()`
   call sites in `src/services/redis.ts` and ensure appropriate TTL values are
   set.
4. **Update alarms:** add a CloudWatch alarm on `Evictions > 0` for 5 consecutive
   minutes if one does not already exist (see `infra/logs_and_alarms.tf`).
5. **Review `enableOfflineQueue`:** if the offline queue caused memory growth
   during a long outage, consider setting `maxRetriesPerRequest` or bounding the
   offline queue size in `src/services/redis.ts`.

---

## References

- `src/services/redis.ts` — ioredis client configuration and cache helpers
- `backend/src/health.ts` — `/api/health` Redis check implementation
- `terraform/modules/cache/` — ElastiCache Terraform module
- `docs/observability.md` — distributed tracing and CloudWatch runbooks
- `infra/logs_and_alarms.tf` — CloudWatch log groups and alarms
- `docs/runbooks/incident-response.md` — general incident response procedure

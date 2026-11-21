# Observability Runbook

This document covers every alert defined in
`monitoring/prometheus/alerting_rules.yml` (Prometheus) and
`infra/logs_and_alarms.tf` (CloudWatch).  Each section names the alert,
explains what it means, and lists concrete investigation steps.

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

## Related documents

- [Deployment runbook](deployment-runbook.md)
- [Rollback runbook](rollback-runbook.md)
- [Incident response runbook](runbooks/incident-response.md)
- [Architecture overview](architecture.md)

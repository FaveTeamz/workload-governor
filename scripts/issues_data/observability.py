# Category 11: Observability, Metrics & Telemetry - 10 issues

OBSERVABILITY_ISSUES = [
    {
        "title": "feat(observability): Export Soroban RPC latency histogram metrics in src/metrics.ts",
        "labels": ["enhancement", "backend", "observability"],
        "body": """### 🎯 Summary & Context
In `backend/src/soroban.ts` and `src/metrics.ts`, outbound HTTP calls to Soroban RPC endpoints (`simulateTransaction`, `sendTransaction`, `getEvents`) currently track only simple failure counts.

Without latency histograms, operators cannot observe p50, p90, and p99 RPC response latency percentiles, making it impossible to detect RPC node degradation before users experience timeouts.

### 🔍 Current Behavior & Root Cause
Calls to Soroban RPC are made without duration metrics. High latency on upstream RPC nodes is only discovered when HTTP requests hit backend gateway timeouts.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/tracing.ts` or `src/metrics.ts`:
   - Create Prometheus Histogram `soroban_rpc_duration_seconds`:
     ```typescript
     export const rpcDurationHistogram = new promClient.Histogram({
       name: 'soroban_rpc_duration_seconds',
       help: 'Duration of Soroban RPC calls in seconds',
       labelNames: ['method', 'status', 'endpoint'],
       buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
     });
     ```
2. Wrap all RPC invocations with timer start/end:
   ```typescript
   const end = rpcDurationHistogram.startTimer({ method, endpoint: host });
   try {
     const res = await fetch(...);
     end({ status: res.status });
   } catch (err) {
     end({ status: 'error' });
     throw err;
   }
   ```
3. Export metrics via `/metrics` endpoint.

### 📁 Affected Files & Modules
- `backend/src/tracing.ts`: Prometheus metrics definitions
- `backend/src/soroban.ts`: RPC client integration
- `docs/observability.md`: Metrics documentation

### ✅ Acceptance Criteria
- [ ] `soroban_rpc_duration_seconds` histogram exported on `/metrics`.
- [ ] Labels capture RPC method name, response status code, and endpoint host.
- [ ] Latency percentiles (p50, p90, p99) viewable in Prometheus / Grafana.
- [ ] Handled errors record `status='error'` label.

### 🧪 Testing & Verification Plan
- Unit test invoking mocked RPC calls and verifying histogram observation values.
- Query `/metrics` and verify Prometheus text format export.

### 🔒 Security, Reliability & Performance Considerations
Provides early warning telemetry for third-party Stellar RPC performance degradation."""
    },
    {
        "title": "fix(observability): Track contract TTL extension count and remaining ledgers as Prometheus gauge",
        "labels": ["bug", "observability"],
        "body": """### 🎯 Summary & Context
WorkloadGovernor pending applications live in temporary Soroban ledger storage and require periodic TTL bumps. Currently, there is no observability metric tracking remaining ledger lifetimes or TTL extension frequencies.

If the automated TTL bumper job fails or falls behind, applications could expire without warning, permanently corrupting the global cap counter.

### 🔍 Current Behavior & Root Cause
In `backend/src/scheduler.ts`:
The TTL extension job executes `extend_application_ttl` on-chain, but does not export remaining ledger counts or bump counts to Prometheus.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/tracing.ts`:
   - Define Prometheus gauge:
     `contract_min_application_remaining_ledgers`: Minimum remaining TTL across all active pending applications.
   - Define Prometheus counter:
     `contract_application_ttl_extensions_total`: Total successful TTL extensions executed.
2. In `backend/src/scheduler.ts`:
   - After inspecting pending applications, record the lowest remaining ledger TTL.
   - Increment extension counter on successful transactions.
3. Configure Prometheus alert: trigger `ApplicationTtlNearExpiration` when `contract_min_application_remaining_ledgers < 2000` (less than ~2.5 hours remaining).

### 📁 Affected Files & Modules
- `backend/src/scheduler.ts`: TTL extension loop
- `backend/src/tracing.ts`: Metrics definitions
- `monitoring/prometheus/alerting_rules.yml`: Alert rule

### ✅ Acceptance Criteria
- [ ] Minimum remaining ledger gauge exported to Prometheus.
- [ ] Alert fires when applications are within 2,000 ledgers of expiration.
- [ ] Total extension counter increments on every successful TTL bump.

### 🧪 Testing & Verification Plan
- Mock application with 1,500 ledgers remaining and verify alert evaluation.
- Query `/metrics` to assert gauge presence.

### 🔒 Security, Reliability & Performance Considerations
Guarantees zero accidental data loss for contributors waiting for issue assignment review."""
    },
    {
        "title": "feat(observability): Add OpenTelemetry tracing spans to database query execution",
        "labels": ["enhancement", "observability"],
        "body": """### 🎯 Summary & Context
In `backend/src/tracing.ts` and `backend/src/db.ts`, OpenTelemetry (OTel) traces incoming HTTP requests, but does not create child spans for individual PostgreSQL database queries.

When an endpoint experiences high latency (e.g. `GET /api/v1/leaderboard` taking 800ms), operators cannot tell whether latency was spent in database execution, network serialization, or business logic.

### 🔍 Current Behavior & Root Cause
Traces only show top-level HTTP handler spans. Database calls appear as silent gaps inside the HTTP span.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/tracing.ts` and `db.ts`:
   - Integrate `@opentelemetry/instrumentation-pg`:
     ```typescript
     new PgInstrumentation({
       enhancedDatabaseReporting: true,
       responseHook: (span, responseInfo) => {
         span.setAttribute('db.row_count', responseInfo.data.rowCount);
       },
     });
     ```
2. Ensure span attributes include `db.system: postgresql`, `db.statement` (sanitized parameters), and `db.name`.
3. Propagate trace context to AWS X-Ray and OpenTelemetry Collector.

### 📁 Affected Files & Modules
- `backend/src/tracing.ts`: OTel instrumentation configuration
- `backend/src/db.ts`: Database client wrapping
- `otel-collector-config.yaml`: Collector pipeline

### ✅ Acceptance Criteria
- [ ] Every database query generates a child span under the active HTTP trace.
- [ ] Spans capture sanitized SQL statements and query execution time.
- [ ] Row count returned by query is attached as span attribute.
- [ ] Zero performance degradation under production query volume.

### 🧪 Testing & Verification Plan
- Send request to `/api/v1/leaderboard` and inspect exported Jaeger/OTel trace.
- Verify presence of `pg.query` child spans.

### 🔒 Security, Reliability & Performance Considerations
Sensitive parameters ($1, $2) must be scrubbed from SQL statement attributes to prevent secret leakage in trace viewers."""
    },
    {
        "title": "fix(observability): Add error rate alerts and threshold definitions in Prometheus alerting rules",
        "labels": ["bug", "observability", "operations"],
        "body": """### 🎯 Summary & Context
In `monitoring/prometheus/alerting_rules.yml`, alerting rules define CPU and memory utilization thresholds, but lack application-level Service Level Objective (SLO) error rate alerts.

If the backend starts returning HTTP 500 errors on 15% of all requests due to an unhandled database exception, on-call engineers are not alerted until CPU or memory limits are exceeded.

### 🔍 Current Behavior & Root Cause
`alerting_rules.yml` contains no rule monitoring the ratio of 5xx responses to total HTTP traffic (`http_requests_total`).

### 🛠️ Proposed Solution & Technical Specification
1. In `monitoring/prometheus/alerting_rules.yml`:
   - Add alert `HighHttp5xxErrorRate`:
     ```yaml
     - alert: HighHttp5xxErrorRate
       expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
       for: 3m
       labels:
         severity: critical
       annotations:
         summary: "High HTTP 5xx error rate on {{ $labels.service }}"
         description: "5xx error rate has exceeded 5% for the last 3 minutes (current: {{ $value | humanizePercentage }})."
     ```
   - Add alert `HighHttpLatencyP95`:
     ```yaml
     - alert: HighHttpLatencyP95
       expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 0.5
       for: 5m
       labels:
         severity: warning
     ```
2. Verify alert rules syntax using `promtool check rules`.

### 📁 Affected Files & Modules
- `monitoring/prometheus/alerting_rules.yml`: Alerting rule definitions
- `infra/logs_and_alarms.tf`: CloudWatch alarm synchronization
- `docs/observability.md`: Alert runbook documentation

### ✅ Acceptance Criteria
- [ ] Alert fires when 5xx error rate exceeds 5% over 3 minutes.
- [ ] Alert fires when p95 latency exceeds 500ms for 5 minutes.
- [ ] `promtool check rules` passes without syntax errors.
- [ ] Alert definitions include actionable troubleshooting links.

### 🧪 Testing & Verification Plan
- Run `promtool check rules monitoring/prometheus/alerting_rules.yml`.
- Simulate error spike in Prometheus unit test ruleset.

### 🔒 Security, Reliability & Performance Considerations
Guarantees rapid MTTA (Mean Time to Acknowledge) and MTTD (Mean Time to Detect) for user-impacting outages."""
    },
    {
        "title": "feat(observability): Implement structured JSON logging for all audit trail events",
        "labels": ["enhancement", "observability"],
        "body": """### 🎯 Summary & Context
Audit trail events emitted by `auditService.ts` (such as maintainer authorizations, contract upgrades, manual cap adjustments) are currently logged as free-form human-readable strings.

Standardizing audit logs into structured JSON format with consistent schemas (`timestamp`, `actor`, `action`, `target`, `outcome`, `metadata`) enables automated parsing, SIEM indexing, and security anomaly detection.

### 🔍 Current Behavior & Root Cause
In `backend/src/logger.ts` and `auditService.ts`:
Logs emit: `logger.info("Maintainer registered: " + maintainer + " for org: " + orgId)`. CloudWatch cannot easily query by `actor` or `action` without complex regex filters.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/logger.ts`:
   - Create specialized audit logger:
     ```typescript
     export function logAuditEvent(event: {
       action: string;
       actor: { type: 'admin' | 'maintainer' | 'contributor'; id: string; ip?: string };
       target: { type: 'org' | 'issue' | 'contract'; id: string };
       outcome: 'success' | 'failure';
       details?: Record<string, any>;
     }) {
       logger.info({ audit: true, ...event }, `AUDIT: ${event.action} by ${event.actor.id}`);
     }
     ```
2. Replace all audit logging statements across backend with `logAuditEvent`.

### 📁 Affected Files & Modules
- `backend/src/logger.ts`: Structured audit logger
- `backend/src/services/auditService.ts`: Audit event calls
- `backend/src/routes/admin.ts`: Route logging
- `docs/observability.md`: Audit log schema specification

### ✅ Acceptance Criteria
- [ ] All audit events emitted in structured JSON format with `audit: true`.
- [ ] Fields include `action`, `actor`, `target`, `outcome`, and `details`.
- [ ] Easily filterable in CloudWatch Insights via `{ $.audit = true }`.
- [ ] Tested for zero performance overhead.

### 🧪 Testing & Verification Plan
- Unit test invoking `logAuditEvent` and verify emitted JSON structure.
- Verify CloudWatch Logs Insights query syntax against sample records.

### 🔒 Security, Reliability & Performance Considerations
Complies with enterprise security log management standards and facilitates forensics during investigations."""
    },
    {
        "title": "fix(observability): Export active connection count gauge from PostgreSQL pool",
        "labels": ["bug", "observability"],
        "body": """### 🎯 Summary & Context
The PostgreSQL connection pool in `backend/src/db.ts` does not report active, idle, or waiting client counts to Prometheus.

During connection pool exhaustion, incoming HTTP requests wait for a free connection until timing out. Without pool metrics, ops engineers cannot determine whether high latency is caused by slow SQL execution or connection pool starvation.

### 🔍 Current Behavior & Root Cause
In `backend/src/db.ts`:
The `pg.Pool` instance exposes `.totalCount`, `.idleCount`, and `.waitingCount`, but these properties are not polled or exported to the Prometheus registry.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/tracing.ts` or `metrics.ts`:
   - Define Prometheus gauges:
     - `db_pool_total_connections`: Total connections in pool.
     - `db_pool_idle_connections`: Idle connections available.
     - `db_pool_active_connections`: In-use connections currently executing queries.
     - `db_pool_waiting_requests`: Number of queued requests waiting for a free connection.
2. In `backend/src/db.ts`:
   - Set up periodic metric collection (every 5 seconds) or collect dynamically during `/metrics` scrape:
     ```typescript
     promClient.collectDefaultMetrics();
     dbPoolActiveGauge.set(pool.totalCount - pool.idleCount);
     dbPoolWaitingGauge.set(pool.waitingCount);
     ```

### 📁 Affected Files & Modules
- `backend/src/db.ts`: Pool metric hooks
- `backend/src/tracing.ts`: Prometheus gauge definitions
- `docs/observability.md`: Database metric schemas

### ✅ Acceptance Criteria
- [ ] Pool active, idle, and waiting counts exported on `/metrics`.
- [ ] Metric updates reflect real-time query concurrency.
- [ ] Alert triggers if `db_pool_waiting_requests > 5` for >1 minute.

### 🧪 Testing & Verification Plan
- Run stress test opening 25 concurrent queries and verify gauges in `/metrics`.

### 🔒 Security, Reliability & Performance Considerations
Vital metric for capacity planning and detecting connection leaks."""
    },
    {
        "title": "feat(observability): Add Grafana dashboard definitions for WorkloadGovernor service KPIs",
        "labels": ["enhancement", "observability", "devops"],
        "body": """### 🎯 Summary & Context
Currently, ops and product teams have to write ad-hoc Prometheus queries to view platform activity, application rates, and error metrics.

Providing pre-built Grafana dashboard JSON models in `monitoring/dashboards/` allows one-click provisioning of visual dashboards for operations and product health.

### 🔍 Current Behavior & Root Cause
No standardized Grafana dashboard JSON exists in version control. Teams set up personal Grafana dashboards that drift over time.

### 🛠️ Proposed Solution & Technical Specification
1. In `monitoring/dashboards/`:
   - Create `workload-governor-overview.json`:
     - Row 1: **Service Health & Traffic** (Request Rate RPS, HTTP 2xx/4xx/5xx Breakdown, p95/p99 Latency).
     - Row 2: **Smart Contract & Indexer KPIs** (Current Ingestion Ledger, Indexer Lag, Event Processing Velocity).
     - Row 3: **Contributor Workload Governance** (Total Pending Applications, Contributor Cap Rejection Rate, Active Assignments).
     - Row 4: **Infrastructure Metrics** (Node.js Heap Memory, CPU Utilization, DB Connection Pool Saturation).
2. Document Grafana import instructions in `docs/dashboards/`.

### 📁 Affected Files & Modules
- `monitoring/dashboards/workload-governor-overview.json`: Dashboard definition
- `docs/dashboards/README.md`: Setup guide
- `helm/workload-governor/templates/configmap-dashboard.yaml`: Automated Helm provisioning

### ✅ Acceptance Criteria
- [ ] Complete Grafana dashboard JSON model committed to repository.
- [ ] Imports cleanly into Grafana v9 / v10 without missing panel errors.
- [ ] Panels accurately map to exported Prometheus metric names.
- [ ] Documented in `docs/dashboards/README.md`.

### 🧪 Testing & Verification Plan
- Import JSON into local Grafana instance and verify all panels render data.

### 🔒 Security, Reliability & Performance Considerations
Empowers engineering and community maintainers with instant real-time visibility into governance metrics."""
    },
    {
        "title": "fix(observability): Mask sensitive contributor metadata and auth tokens in log outputs",
        "labels": ["bug", "observability", "security"],
        "body": """### 🎯 Summary & Context
In `backend/src/logger.ts`, request logging serializers occasionally serialize raw HTTP headers and request bodies, including `Authorization`, `X-API-Key`, and sensitive contributor contact details.

Sensitive tokens and private emails logged in plain text to AWS CloudWatch violate data privacy regulations (GDPR, SOC 2) and expose credentials to unauthorized log viewers.

### 🔍 Current Behavior & Root Cause
In `backend/src/logger.ts`:
Pino redaction rules are either missing or only redact top-level `req.headers.authorization`. Nested payload fields (`req.body.secretKey`, `req.body.email`) are printed in full.

### 🛠️ Proposed Solution & Technical Specification
1. Configure deep redaction paths in `backend/src/logger.ts`:
   ```typescript
   export const logger = pino({
     redact: {
       paths: [
         'req.headers.authorization',
         'req.headers["x-api-key"]',
         'req.headers.cookie',
         '*.secretKey',
         '*.privateKey',
         '*.apiKey',
         '*.token',
         '*.email',
         '*.password',
       ],
       censor: '[REDACTED]',
     },
   });
   ```
2. Verify that log serializer masks credentials across all log output streams.

### 📁 Affected Files & Modules
- `backend/src/logger.ts`: Pino redaction paths
- `backend/src/__tests__/logger.test.ts`: Redaction verification tests
- `docs/observability.md`: Log privacy guidelines

### ✅ Acceptance Criteria
- [ ] Sensitive headers and body fields are automatically replaced with `[REDACTED]`.
- [ ] Nested object structures are recursively sanitized.
- [ ] Zero secret keys or passwords emitted to stdout in production mode.
- [ ] Unit tests verify redaction on all sensitive key patterns.

### 🧪 Testing & Verification Plan
- Unit test passing objects with sensitive keys to logger and assert censored output.

### 🔒 Security, Reliability & Performance Considerations
Prevents accidental data breaches via centralized log aggregation platforms."""
    },
    {
        "title": "feat(observability): Export webhook delivery success and failure metrics",
        "labels": ["enhancement", "observability"],
        "body": """### 🎯 Summary & Context
When organization GitHub repositories send issue webhooks to WorkloadGovernor, the backend processes and acknowledges events.

Exporting Prometheus metrics on webhook delivery volume, processing duration, and verification failure rates allows operations teams to detect when GitHub is sending invalid payloads or when signature verification keys are misconfigured.

### 🔍 Current Behavior & Root Cause
In `backend/src/github.ts`:
Webhook processing records logs, but exports zero Prometheus counters. Webhook failures only become known when maintainers report missing issues hours later.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/tracing.ts` or `metrics.ts`:
   - Create Prometheus Counter `github_webhooks_received_total`:
     Labels: `event_type` (`issues`, `issue_comment`), `status` (`success`, `invalid_signature`, `error`, `ignored`).
   - Create Prometheus Histogram `github_webhook_processing_duration_seconds`.
2. In `backend/src/github.ts`:
   - Increment counters on each incoming webhook branch.
   - Record execution time.

### 📁 Affected Files & Modules
- `backend/src/github.ts`: Webhook metric increments
- `backend/src/tracing.ts`: Prometheus metrics
- `monitoring/prometheus/alerting_rules.yml`: Webhook failure alert

### ✅ Acceptance Criteria
- [ ] Webhook metrics exported on `/metrics`.
- [ ] Distinguishes between successful deliveries, signature mismatches, and processing errors.
- [ ] Alert triggers if webhook signature failure rate exceeds 10%.

### 🧪 Testing & Verification Plan
- Send test webhooks (valid, invalid signature) and check `/metrics` counters.

### 🔒 Security, Reliability & Performance Considerations
Detects webhook spoofing attacks and configuration discrepancies immediately."""
    },
    {
        "title": "fix(observability): Configure OpenTelemetry collector trace sampling rate for production",
        "labels": ["bug", "observability"],
        "body": """### 🎯 Summary & Context
In `otel-collector-config.yaml` and `backend/src/tracing.ts`, OpenTelemetry is currently configured to capture 100% of all traces (`AlwaysOnSampler`).

Under production traffic (millions of requests per day), sampling 100% of traces generates excessive network egress, exhausts storage on tracing backends (AWS X-Ray, Honeycomb, Jaeger), and incurs high cloud infrastructure costs.

### 🔍 Current Behavior & Root Cause
In `backend/src/tracing.ts`:
`sampler: new AlwaysOnSampler()`
Captures every single health check (`/health`), readiness probe, and static asset request, generating gigabytes of redundant trace spans daily.

### 🛠️ Proposed Solution & Technical Specification
1. Configure intelligent tail-based or head-based ratio sampling in `backend/src/tracing.ts`:
   - Health check filter: Drop 100% of traces for `/health`, `/ready`, `/metrics`.
   - Production sampling ratio: Sample 5% of healthy 2xx/3xx traces using `TraceIdRatioBasedSampler(0.05)`.
   - Always sample 100% of error traces (HTTP 5xx, uncaught exceptions).
   - Support `ParentBasedSampler` to respect upstream client sampling decisions.
2. In `otel-collector-config.yaml`:
   - Configure batch processor and tail-sampling processor to drop noise.

### 📁 Affected Files & Modules
- `backend/src/tracing.ts`: Trace sampler configuration
- `otel-collector-config.yaml`: Collector pipeline sampling
- `docs/cost-management.md`: Cloud cost optimization docs

### ✅ Acceptance Criteria
- [ ] Health check and metrics endpoints excluded from tracing.
- [ ] Production trace sampling set to 5% for successful calls.
- [ ] 100% of error traces captured for debugging.
- [ ] CloudWatch / X-Ray ingestion cost reduced by >85%.

### 🧪 Testing & Verification Plan
- Send 100 requests to `/health` and verify 0 spans exported.
- Send error request and verify span is guaranteed captured.

### 🔒 Security, Reliability & Performance Considerations
Dramatically lowers cloud telemetry costs while retaining complete visibility into errors."""
    }
]

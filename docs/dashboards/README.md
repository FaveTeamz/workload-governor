# WorkloadGovernor Grafana Dashboards

Pre-built Grafana dashboards provide turnkey visibility into service health, smart contract indexer velocity, contributor workload governance caps, and infrastructure resource utilization.

---

## Available Dashboards

- **WorkloadGovernor Overview** (`monitoring/dashboards/workload-governor-overview.json`):
  - **Row 1: Service Health & Traffic:** Request Rate (RPS), HTTP 2xx/4xx/5xx status breakdown, p95/p99 latency distribution.
  - **Row 2: Smart Contract & Indexer KPIs:** Current ingestion ledger sequence, indexer lag, and on-chain event processing velocity.
  - **Row 3: Contributor Workload Governance:** Total pending applications, contributor cap rejection rate, and active issue assignments.
  - **Row 4: Infrastructure Metrics:** Node.js V8 heap memory usage, process CPU percentage, and PostgreSQL connection pool saturation & waiting requests.

---

## Importing Dashboards

### 1. Manual Import via Grafana UI

1. Open Grafana (version 9.x or 10.x).
2. In the left navigation menu, navigate to **Dashboards** > **Import**.
3. Upload `monitoring/dashboards/workload-governor-overview.json` or paste the JSON model contents.
4. Select your **Prometheus** datasource and click **Import**.

### 2. Automated Provisioning via Helm (Kubernetes)

When deploying with the WorkloadGovernor Helm chart, dashboard auto-discovery is enabled via the Grafana sidecar:

```bash
helm upgrade --install workload-governor ./helm/workload-governor \
  --namespace workload-governor \
  --set dashboard.enabled=true
```

The template [helm/workload-governor/templates/configmap-dashboard.yaml](../../helm/workload-governor/templates/configmap-dashboard.yaml) provisions the dashboard ConfigMap with the `grafana_dashboard: "1"` label for instant auto-loading.

---

## Metric Reference Mapping

| Dashboard Panel | Prometheus Metric |
|---|---|
| Request Rate (RPS) | `sum(rate(http_requests_total[5m])) by (method, path)` |
| HTTP Status Breakdown | `sum(rate(http_requests_total[5m])) by (status)` |
| Latency p95 / p99 | `histogram_quantile(0.95/0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| Indexer Lag | `indexer_ledger_lag` / `time() - soroban_latest_ledger_timestamp` |
| Ingestion Velocity | `sum(rate(indexer_events_processed_total[5m]))` |
| Cap Rejection Rate | `(sum(rate(contributor_cap_rejections_total[5m])) / sum(rate(contributor_applications_total[5m]))) * 100` |
| DB Pool Saturation | `(db_pool_active_connections / db_pool_total_connections) * 100` |
| DB Pool Waiting Requests | `db_pool_waiting_requests` |

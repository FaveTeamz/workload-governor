# WorkloadGovernor Grafana Dashboards

Pre-built Grafana dashboards provide turnkey visibility into service health, contract indexer progress and PostgreSQL connection pool usage.

---

## Available Dashboards

- **WorkloadGovernor Overview** (`helm/workload-governor/dashboards/workload-governor-overview.json`):
  - **Row 1: Service Health & Traffic:** Request Rate (RPS), HTTP 2xx/4xx/5xx status breakdown, p95/p99 latency distribution.
  - **Row 2: Indexer:** Last processed ledger and lag in ledgers.
  - **Row 3: Infrastructure:** PostgreSQL active connection percentage and waiting requests.

---

## Importing Dashboards

### 1. Manual Import via Grafana UI

1. Open Grafana (version 9.x or 10.x).
2. In the left navigation menu, navigate to **Dashboards** > **Import**.
3. Upload `helm/workload-governor/dashboards/workload-governor-overview.json` or paste the JSON model contents.
4. Select your **Prometheus** datasource and click **Import**.

### 2. Automated Provisioning via Helm (Kubernetes)

When deploying with the WorkloadGovernor Helm chart, enable the ConfigMap for discovery by an existing Grafana sidecar:

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
| Indexer Lag | `indexer_ledger_lag` |
| Last Processed Ledger | `indexer_last_processed_ledger` |
| Active DB Connections (%) | `100 * db_pool_active / clamp_min(pg_pool_total_connections, 1)` |
| DB Pool Waiting Requests | `pg_pool_waiting_requests` |

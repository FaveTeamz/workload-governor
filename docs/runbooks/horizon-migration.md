# Runbook: Horizon & Soroban RPC Node Migration

This operational runbook provides a step-by-step procedure for migrating Stellar Horizon and Soroban RPC endpoints (e.g. from public Stellar Development Foundation nodes to dedicated QuickNode, Blockdaemon, or self-hosted RPC clusters) with zero downtime, zero dropped indexer events, and continuous transaction processing.

---

## Architecture & Impact Analysis

The WorkloadGovernor backend interacts with Stellar RPC nodes via:
- **`HorizonService` (`backend/src/HorizonService.ts`)**: Ingests account balances, sequence numbers, and ledger records via HTTP/HTTPS.
- **Event Indexer**: Polls contract events using Soroban RPC (`getEvents`) to track contributions, applications, and assignments.
- **Transaction Submitter**: Simulates and submits Soroban transactions (`sendTransaction`, `getTransaction`).

### Risk Assessment
- **Event Indexer Desynchronization**: If the target RPC node does not have sufficient ledger history retention, event replay or catchup will fail.
- **Transaction Dropping / Timeout**: Differences in transaction queueing or rate limits between providers can cause unhandled 429 errors or submission timeouts.
- **Network Latency Variance**: Suboptimal geographic routing can increase p99 submission times beyond SLO limits (< 5 s).

---

## Pre-Cutover Validation Checklist

Before initiating cutover, the target RPC endpoint must be validated against the following criteria:

- [ ] **Network Identity**: Matches current network passphrase (e.g., `Public Global Stellar Network ; September 2015` for mainnet, `Test SDF Network ; September 2015` for testnet).
- [ ] **Ledger Retention Depth**: Retains at least 30 days (minimum 518,400 ledgers) of historical ledgers to allow indexer rewind/recovery.
- [ ] **Event Filtering Support**: Supports Soroban `getEvents` RPC method with contract ID topic filtering.
- [ ] **Rate Limits & Concurrency**: Provisioned for at least 100 RPS burst with minimum 50 sustained RPS.
- [ ] **Health Endpoint & Latency**: Base ping latency < 80 ms from ECS/Kubernetes cluster regions.

### Validation Commands

```bash
# 1. Verify Horizon root endpoint and network passphrase
TARGET_HORIZON_URL="https://horizon.example-rpc.com"
curl -s "${TARGET_HORIZON_URL}/" | jq '{
  horizon_version: .horizon_version,
  core_version: .core_version,
  history_latest_ledger: .history_latest_ledger,
  network_passphrase: .network_passphrase
}'

# 2. Check historical ledger depth (verify ledger from 7 days ago is present)
CURRENT_LEDGER=$(curl -s "${TARGET_HORIZON_URL}/" | jq -r .history_latest_ledger)
CHECK_LEDGER=$(( CURRENT_LEDGER - 120960 ))
curl -s -f -o /dev/null -w "%{http_code}\n" "${TARGET_HORIZON_URL}/ledgers/${CHECK_LEDGER}"
# Expected: 200 OK

# 3. Verify Soroban RPC getEvents support
TARGET_RPC_URL="https://soroban-rpc.example-rpc.com"
curl -s -X POST "${TARGET_RPC_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getLatestLedger"
  }' | jq .

# 4. Verify contract event query capability
curl -s -X POST "${TARGET_RPC_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "getEvents",
    "params": {
      "startLedger": '$(( CURRENT_LEDGER - 100 ))',
      "filters": []
    }
  }' | jq '{event_count: (.result.events | length)}'
```

---

## Zero-Downtime Migration Procedure

### Phase 1: Dual-Write / Shadow Verification (Optional / Staging)
In staging, configure the new RPC endpoint 24 hours prior to production deployment to monitor stability and error rates under continuous load.

### Phase 2: Updating Configuration & Secrets

Update the secret manager or environment parameters without altering running tasks:

```bash
# AWS Secrets Manager / Parameter Store
aws ssm put-parameter \
  --name "/workload-governor/production/HORIZON_URL" \
  --value "https://horizon.example-rpc.com" \
  --type "String" \
  --overwrite

aws ssm put-parameter \
  --name "/workload-governor/production/STELLAR_RPC_URL" \
  --value "https://soroban-rpc.example-rpc.com" \
  --type "String" \
  --overwrite
```

### Phase 3: Rolling Deployment

Trigger a rolling deployment in AWS ECS or Kubernetes to rotate pods one by one:

#### For AWS ECS:
```bash
# Force new deployment with updated task definition
aws ecs update-service \
  --cluster workload-governor-production \
  --service workload-governor-backend \
  --force-new-deployment

# Monitor rolling deployment rollout
aws ecs wait services-stable \
  --cluster workload-governor-production \
  --services workload-governor-backend
```

#### For Kubernetes / Helm:
```bash
# Update Helm release values
helm upgrade --install workload-governor ./helm-charts/workload-governor \
  --set env.HORIZON_URL="https://horizon.example-rpc.com" \
  --set env.STELLAR_RPC_URL="https://soroban-rpc.example-rpc.com" \
  --reuse-values

# Watch rolling rollout status
kubectl rollout status deployment/workload-governor-backend -n workload-governor
```

During rolling update:
1. New container instances boot and connect to the new RPC provider.
2. Readiness probes verify connectivity to the new RPC endpoint before receiving inbound traffic.
3. Old instances gracefully terminate after completing inflight requests.

---

## Post-Cutover Verification

Execute the following checks immediately after rolling update completes:

### 1. Ingestion Lag & Ledger Synchronization
Verify that the event indexer is processing new ledgers within 2 ledgers (~10s) of tip:

```bash
# Query backend health endpoint
curl -s https://api.workloadgovernor.org/health | jq '{
  status: .status,
  horizon_lag: .metrics.horizon_ledger_lag,
  soroban_rpc_status: .services.soroban_rpc
}'
```

### 2. Prometheus / CloudWatch Ingestion Metrics
Check CloudWatch metrics for backend ECS service:
- `HorizonRequestSuccessRate`: Must remain > 99.9%.
- `IndexerLedgerLag`: Must remain <= 2 ledgers.
- `Rpc429Rate`: Must be 0.

CloudWatch Logs Insights query to verify healthy RPC responses:
```
fields @timestamp, @message
| filter @message like /HorizonService/ or @message like /tracedFetch.*horizon/
| parse @message "status=* " as rpc_status
| stats count() by rpc_status
```

---

## Rollback Procedure

If the new RPC provider exhibits unexpected latency (> 2s p95), unhandled rate limiting (429), or missing historical blocks:

1. **Revert Configuration**:
   ```bash
   aws ssm put-parameter \
     --name "/workload-governor/production/HORIZON_URL" \
     --value "https://horizon.previous-rpc.com" \
     --type "String" \
     --overwrite
   ```

2. **Trigger Rapid Rollback**:
   ```bash
   aws ecs update-service \
     --cluster workload-governor-production \
     --service workload-governor-backend \
     --force-new-deployment
   ```

3. **Verify Indexer Recovery**:
   Check that event catchup re-synchronizes without gap errors.

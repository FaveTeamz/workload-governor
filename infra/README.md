# infra/

Terraform and AWS infrastructure for workload-governor.

## Terraform Remote State (issue #396)

State is stored in S3 with DynamoDB locking to allow safe concurrent usage by
team members and CI.

| Resource | Name |
|---|---|
| S3 bucket | `workload-governor-tfstate` |
| DynamoDB table | `workload-governor-tfstate-lock` |
| State key (staging) | `staging/terraform.tfstate` |
| State key (production) | `production/terraform.tfstate` |

### Bootstrap (run once)

Before the first `terraform init`, create the S3 bucket and DynamoDB table:

```bash
# Basic (AES-256 SSE)
./terraform/bootstrap.sh

# With customer-managed KMS key
KMS_KEY_ARN=arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID \
  ./terraform/bootstrap.sh
```

The script is idempotent — safe to re-run.

### Per-environment init

```bash
# Staging
terraform init -backend-config=terraform/backend-staging.hcl

# Production
terraform init -backend-config=terraform/backend-production.hcl
```

---

## CloudWatch Operational Dashboard (issue #397)

After `terraform apply`, retrieve the dashboard ARN and share it with the team:

```bash
terraform output operational_dashboard_arn
```

The ARN will look like:
```
arn:aws:cloudwatch::ACCOUNT_ID:dashboard/workload-governor-operational
```

Direct console URL:
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home#dashboards:name=workload-governor-operational
```

The dashboard contains four Logs Insights widgets (1-hour auto-refresh):

| Widget | Query |
|---|---|
| Error Rate by Endpoint | 4xx/5xx grouped by path |
| p95 Latency per Endpoint | 95th-percentile `duration` per path |
| Failed Transactions by Error Code | Soroban error codes from error logs |
| RPC Failover Events | `ECONNREFUSED` / `timeout` / RPC keywords |

See `docs/deployment-runbook.md → Operational Queries` for full query strings
and step-by-step instructions on running them manually.

---

## Files

| File | Purpose |
|---|---|
| `logs_and_alarms.tf` | Log groups, Insights queries, dashboard (issue #397) |
| `uptime.tf` | Route 53 health checks and alarms |
| `secrets.tf` | Secrets Manager resources |
| `ecs_task_secrets_example.tf` | Example ECS task secret injection |
| `ecs-autoscaling.tf` | ECS auto-scaling policies |
| `health-check.tf` | Target group health check |
| `rds-backup.tf` | RDS automated backup configuration |
| `outputs.tf` | Shared outputs (log group names, dashboard ARN) |

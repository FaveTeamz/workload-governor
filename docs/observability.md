# Observability Guide

This document covers the monitoring and observability setup for WorkloadGovernor — including ECS Container Insights, the CloudWatch dashboard, and alert thresholds.

---

## Overview

| Component | Tool | Location |
|-----------|------|----------|
| Container metrics (CPU, memory, tasks) | ECS Container Insights | `terraform/modules/compute/main.tf` |
| Unified dashboard | CloudWatch Dashboard | `infra/monitoring/dashboard.tf` |
| Dashboard JSON export | CloudWatch JSON | `infra/monitoring/dashboard.json` |
| Application-level alarms | CloudWatch Alarms | `infra/monitoring/dashboard.tf` |
| Log groups | CloudWatch Logs | `infra/logs_and_alarms.tf` |

---

## ECS Container Insights

Container Insights is enabled on the ECS cluster via the `containerInsights` setting in Terraform:

```hcl
resource "aws_ecs_cluster" "this" {
  name = local.name
  setting { name = "containerInsights"; value = "enabled" }
}
```

This enables the following enhanced metrics in the `ECS/ContainerInsights` namespace:

| Metric | Description |
|--------|-------------|
| `CPUUtilized` | CPU units consumed by tasks |
| `MemoryUtilized` | Memory (MiB) consumed by tasks |
| `RunningTaskCount` | Number of running tasks in the service |
| `NetworkRxBytes` | Network bytes received |
| `NetworkTxBytes` | Network bytes transmitted |
| `StorageReadBytes` | Container storage read bytes |
| `StorageWriteBytes` | Container storage write bytes |

Container Insights metrics are available in the CloudWatch console under **Metrics → ECS → ContainerInsights**.

---

## CloudWatch Dashboard

The dashboard named **`workload-governor`** provides a unified view of all operational metrics.

### Dashboard widgets

| Row | Widget | Metrics |
|-----|--------|---------|
| 0 | Title | — |
| 1 | ECS CPU Utilisation | `AWS/ECS CPUUtilization` |
| 1 | ECS Memory Utilisation | `AWS/ECS MemoryUtilization` |
| 1 | ECS Running Task Count | `ECS/ContainerInsights RunningTaskCount` |
| 2 | ALB Request Count | `AWS/ApplicationELB RequestCount` |
| 2 | ALB 5xx Error Count | `AWS/ApplicationELB HTTPCode_ELB_5XX_Count` |
| 3 | RDS Connection Count | `AWS/RDS DatabaseConnections` |
| 3 | RDS Read Latency | `AWS/RDS ReadLatency` |
| 3 | RDS Write Latency | `AWS/RDS WriteLatency` |
| 4 | Contract Submissions | `WorkloadGovernor ContractSubmissions` (custom) |
| 4 | Contract Errors | `WorkloadGovernor ContractErrors` (custom) |
| 5 | WAF Blocked Requests | `AWS/WAFV2 BlockedRequests` |

### Viewing the dashboard

1. Open the AWS Console → **CloudWatch → Dashboards**.
2. Select **workload-governor**.

Or use the direct URL:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=workload-governor
```

---

## Deploying with Terraform

Apply the monitoring infrastructure from the `infra/monitoring/` directory:

```bash
cd infra/monitoring

# First time — initialise the backend
terraform init

# Preview changes
terraform plan \
  -var="cluster_name=workload-governor-production" \
  -var="alb_arn_suffix=app/workload-governor-production/ACTUAL_SUFFIX" \
  -var="rds_instance_id=workload-governor-production"

# Apply
terraform apply \
  -var="cluster_name=workload-governor-production" \
  -var="alb_arn_suffix=app/workload-governor-production/ACTUAL_SUFFIX" \
  -var="rds_instance_id=workload-governor-production"
```

**Finding the ALB ARN suffix:** Run the following and copy the `LoadBalancerArn` suffix (the part after `loadbalancer/`):

```bash
aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?contains(LoadBalancerName,'workload-governor')].[LoadBalancerName,LoadBalancerArn]" \
  --output table
```

---

## Importing the Dashboard in a New Environment

Use the exported `infra/monitoring/dashboard.json` to create the dashboard without Terraform (e.g. in a new AWS account or a staging environment):

### AWS CLI

```bash
# Replace us-east-1 with your target region
aws cloudwatch put-dashboard \
  --dashboard-name workload-governor \
  --dashboard-body file://infra/monitoring/dashboard.json \
  --region us-east-1
```

### Customising for a new environment

Before importing, update the placeholder values in `dashboard.json`:

| Placeholder | Replace with |
|-------------|-------------|
| `workload-governor-production` (ClusterName/ServiceName) | Your cluster/service name |
| `app/workload-governor-production/REPLACE_WITH_ACTUAL_SUFFIX` | Your ALB ARN suffix |
| `workload-governor-production` (DBInstanceIdentifier) | Your RDS instance ID |
| `workload-governor-waf` | Your WAF ACL name |
| `us-east-1` | Your AWS region |

Use `sed` or `jq` for bulk replacement:

```bash
sed 's/workload-governor-production/workload-governor-staging/g' \
  infra/monitoring/dashboard.json > /tmp/dashboard-staging.json

aws cloudwatch put-dashboard \
  --dashboard-name workload-governor-staging \
  --dashboard-body file:///tmp/dashboard-staging.json \
  --region us-east-1
```

---

## Alert Thresholds

| Alarm | Threshold | Window | Action |
|-------|-----------|--------|--------|
| ECS CPU High | > 80% | 3 of 3 minutes | SNS → PagerDuty / Slack |
| ECS Memory High | > 85% | 3 of 3 minutes | SNS → PagerDuty / Slack |
| ALB 5xx High | > 10 errors/min | 2 of 2 minutes | SNS → PagerDuty / Slack |
| ECS No Tasks | < 1 running task | 2 of 2 minutes | SNS → PagerDuty / Slack (breaching) |

### Customising thresholds

Thresholds are defined as Terraform variables in `infra/monitoring/dashboard.tf`. To override:

```bash
terraform apply \
  -var="cluster_name=workload-governor-production" \
  # ... other vars
```

Or add a `terraform.tfvars` file:

```hcl
cluster_name    = "workload-governor-production"
rds_instance_id = "workload-governor-production"
sns_alarm_arn   = "arn:aws:sns:us-east-1:123456789012:workload-governor-alerts"
```

### Connecting alarms to Slack

1. Create an SNS topic and subscribe your Slack webhook (via AWS Chatbot or a Lambda forwarder).
2. Set the `sns_alarm_arn` variable to the SNS topic ARN.
3. Re-apply Terraform.

---

## Application-Level Prometheus Metrics

The backend emits custom CloudWatch metrics under the `WorkloadGovernor` namespace (related to issue #571). These are visible in the dashboard under the "Contract Submissions" and "Contract Errors" widgets.

To emit metrics from the application:

```typescript
// Example: publishing a metric via AWS SDK v3
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const cw = new CloudWatchClient({ region: "us-east-1" });
await cw.send(new PutMetricDataCommand({
  Namespace: "WorkloadGovernor",
  MetricData: [{
    MetricName: "ContractSubmissions",
    Dimensions: [{ Name: "Network", Value: "testnet" }],
    Value: 1,
    Unit: "Count",
  }],
}));
```

---

## Log Insights Queries

The following Saved Queries are defined in `infra/logs_and_alarms.tf`:

| Query | Description |
|-------|-------------|
| `{service}-error-rate` | 5-minute error buckets from application logs |
| `{service}-slow-requests` | Requests over 1000ms |
| `{service}-contract-submission-failures` | Contract submission failures |

Access them via **CloudWatch → Logs Insights → Saved queries**.

---

## Related Documents

- [Architecture](architecture.md) — overall system design
- [Contract upgrade runbook](runbooks/contract-upgrade.md) — deploying new WASM
- [Incident response runbook](runbooks/incident-response.md) — handling production incidents
- [Rollback runbook](rollback-runbook.md) — reverting deployments

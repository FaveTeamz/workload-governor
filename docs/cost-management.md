# Cost Management

This document describes the cost allocation tagging policy, AWS Budget configuration, and Cost Explorer setup for the WorkloadGovernor project.

---

## Tagging Policy

All AWS resources managed by Terraform carry the following tags, applied globally via the `default_tags` block in `terraform/main.tf`.

| Tag | Value | Purpose |
|---|---|---|
| `Project` | `workload-governor` | Filters all project resources in Cost Explorer |
| `Environment` | `staging` / `production` (Terraform workspace) | Per-environment cost breakdowns |
| `Team` | `platform` | Team ownership for chargebacks |
| `ManagedBy` | `terraform` | Distinguishes IaC-managed resources from manually created ones |

### Rules

1. **All new resources** introduced via Terraform inherit these tags automatically. No per-resource tagging is required for the four standard tags above.
2. **Resource-specific tags** (e.g. `Name`, `Purpose`) are added at the resource level and do not replace the standard tags.
3. **Manually created resources** (e.g. one-off debugging instances) must be tagged manually before they are brought under IaC management. Tag all four keys.
4. **Tag values are case-sensitive** in Cost Explorer filters. Always use the exact casing shown above (`Project`, not `project`).

---

## Activating Cost Allocation Tags (Manual Step)

AWS requires user-defined cost allocation tags to be explicitly activated before they appear in Cost Explorer reports. This is a one-time console operation that cannot be automated via Terraform.

**Steps:**

1. Sign in to the [AWS Billing console](https://console.aws.amazon.com/billing/home).
2. In the left navigation, choose **Cost allocation tags**.
3. Under **User-defined cost allocation tags**, find the following tags:
   - `Project`
   - `Environment`
   - `Team`
   - `ManagedBy`
4. Select all four tags and click **Activate**.
5. Allow up to **24 hours** for the tags to propagate to Cost Explorer.

> **Note:** Tags on existing resources appear in Cost Explorer from the activation date forward — they do not backfill historical data.

---

## AWS Budget

A monthly cost budget is provisioned via `terraform/cost.tf`.

| Setting | Value |
|---|---|
| Budget name | `workload-governor-monthly-budget` |
| Type | `COST` |
| Period | `MONTHLY` |
| Threshold | `$200 USD` (configurable via `monthly_budget_threshold` variable) |
| Scope | Resources tagged `Project=workload-governor` |

### Alerts

| Alert | Type | Threshold | Channel |
|---|---|---|---|
| 80% forecasted | `FORECASTED` | 80% of threshold | SNS → email + Slack |
| 100% actual | `ACTUAL` | 100% of threshold | SNS → email + Slack |

The **forecasted** alert fires when AWS predicts you will exceed the budget by end of month, giving time to investigate before the breach. The **actual** alert fires when spend has already exceeded the threshold.

### Configuring alert recipients

#### Email

Set the Terraform variable `budget_alert_email` before applying:

```bash
# In your .tfvars file or via environment variable:
budget_alert_email = "devops@example.com"

# Or pass it at plan/apply time:
terraform apply -var="budget_alert_email=devops@example.com"
```

After `terraform apply`, AWS sends a confirmation email to the address. **You must click the confirmation link** before notifications are delivered.

#### Slack

AWS Chatbot handles Slack integration and is configured outside Terraform:

1. Open the [AWS Chatbot console](https://console.aws.amazon.com/chatbot/home).
2. Choose **Configure new client** → **Slack**.
3. Authorise the Chatbot app in your Slack workspace.
4. Create a channel configuration:
   - **SNS topic ARN**: use the `cost_alerts_sns_topic_arn` Terraform output.
   - **Channel**: `#devops-alerts` (or your preferred channel).
5. Save the configuration. Budget alerts will now post to Slack.

---

## Cost Explorer Saved Report

A saved Cost Explorer report filtered by `Project=workload-governor` provides a persistent view of project costs.

> **This step cannot be automated via Terraform** — the AWS Cost Explorer API does not support saved reports.

**Steps to create the report:**

1. Open [Cost Explorer](https://console.aws.amazon.com/cost-management/home#/cost-explorer).
2. Set the following filters:
   - **Date range**: Last 3 months (or custom)
   - **Group by**: `Service`
   - **Filters** → **Tags** → `Project` = `workload-governor`
3. Click **Save to report library**.
4. Name the report `workload-governor-by-service` and save.

Repeat with **Group by: Tag → Environment** to create an environment-level breakdown report named `workload-governor-by-environment`.

---

## Runbook: Unexpected Cost Spike

1. Check the 80% forecasted alert email / Slack message for the service breakdown.
2. Open Cost Explorer → `workload-governor-by-service` saved report.
3. Identify the service driving the spike (commonly ECS, RDS data transfer, or NAT Gateway).
4. Cross-reference with ECS Service Auto Scaling events in CloudWatch.
5. If caused by autoscaling runaway, reduce `desired_count` or adjust the scaling policy in `infra/ecs-autoscaling.tf`.
6. If caused by unexpected traffic, check WAF metrics and rate-limiting rules.

---

## Terraform Variables Reference

| Variable | Default | Description |
|---|---|---|
| `monthly_budget_threshold` | `200` | Monthly USD cost limit. Alerts fire at 80% and 100%. |
| `budget_alert_email` | `""` | Email address for SNS subscription. Empty = no subscription. |

---

## OpenTelemetry & Distributed Tracing Cost Optimization

In high-throughput environments processing millions of daily requests, exporting 100% of telemetry traces generates substantial network egress, saturates distributed tracing backends (AWS X-Ray, Honeycomb, Jaeger, CloudWatch), and increases infrastructure spend.

To achieve high visibility with minimal cloud infrastructure cost, WorkloadGovernor employs an intelligent multi-tiered sampling strategy in `backend/src/tracing.ts` and `otel-collector-config.yaml`:

### 1. High-Frequency Health Check & Probe Exclusion
- **Endpoint Filtering**: 100% of traces targeting high-frequency operational endpoints (`/health`, `/ready`, `/metrics`, `/api/health`) are dropped at both the Express middleware layer and the OpenTelemetry Collector filter processor.
- **Noise Reduction**: Eliminates gigabytes of redundant spans generated by ECS container health checks and Kubernetes liveness/readiness probes daily.

### 2. Intelligent Ratio & Error Sampling
- **5% Probabilistic Production Ratio**: Healthy `2xx` and `3xx` transactions are sampled at 5% (`TraceIdRatioBasedSampler(0.05)`) to maintain statistically significant distributed performance metrics without incurring linear cost scaling.
- **100% Error Trace Capture**: All failed transactions (HTTP `5xx` status codes, uncaught server exceptions, and spans with `SpanStatusCode.ERROR`) are guaranteed 100% capture for root-cause analysis and post-incident debugging.
- **Upstream Context Propagation**: `ParentBasedSampler` respects sampling decisions from upstream clients or microservices to preserve complete end-to-end distributed traces.

### 3. OpenTelemetry Collector Pipeline
- **Tail-Sampling Processor**: Configured in `otel-collector-config.yaml` to evaluate traces after span completion, dropping noise and prioritizing errors.
- **Batch Processor**: Groups spans with a `1s` timeout and `1024` batch size to minimize network round-trips and egress packet overhead.

### 4. Projected Cost Impact
- **Volume Reduction**: Exceeds **85% reduction** in total trace span volume.
- **Cost Savings**: Drastically reduces AWS X-Ray ingestion fees ($5.00 per million traces scanned / stored) and CloudWatch metric ingestion charges while retaining full fidelity on systemic faults.


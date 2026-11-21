Branch: feat/secrets-manager

Purpose: Move application secrets out of environment variables and into AWS Secrets Manager; expose ARNs for use by ECS and CI and remove plaintext secrets from workflows.

Changes in this branch:
- Add `aws_secretsmanager_secret` resources for `DATABASE_URL`, `REDIS_URL`, `GITHUB_TOKEN`, `JWT_SECRET`, and `API_KEYS` in `infra/secrets.tf`.
- Add automatic 30-day rotation for the RDS master password (`database_url`) and the backend API keys (`api_keys`).
- Add CloudWatch metric filters and alarms that fire to the `devops-alerts` SNS topic when any rotation attempt fails.
- Add Terraform outputs with secret ARNs for wiring into ECS task definitions.
- Remove plaintext secrets from CI workflows; CI sets test env values at runtime.

---

## Rotation Overview

| Secret | Strategy | Rotation period | Lambda variable |
|---|---|---|---|
| `DATABASE_URL` | Built-in RDS `SingleUser` rotation | 30 days | `db_rotation_lambda_arn` |
| `API_KEYS` | Custom rotation Lambda | 30 days | `api_key_rotation_lambda_arn` |
| `REDIS_URL` | Manual (rotate via runbook below) | On demand | n/a |
| `GITHUB_TOKEN` | Manual (rotate via runbook below) | On demand | n/a |
| `JWT_SECRET` | Manual (rotate via runbook below) | On demand | n/a |

Rotation is **opt-in**: set the respective Lambda ARN variable in your `terraform.tfvars` to enable it. If the variable is empty, the `aws_secretsmanager_secret_rotation` resource is not created (count = 0).

---

## Initial Setup

1. Run `terraform plan` and apply with the required variables:

   ```bash
   terraform apply \
     -var='service_name=workload-governor' \
     -var='db_rotation_lambda_arn=arn:aws:lambda:us-east-1:123456789012:function:SecretsManagerRDSRotation' \
     -var='api_key_rotation_lambda_arn=arn:aws:lambda:us-east-1:123456789012:function:WorkloadGovernorApiKeyRotation' \
     -var='devops_alerts_sns_arn=arn:aws:sns:us-east-1:123456789012:devops-alerts'
   ```

2. Populate the created secrets with their initial values:

   ```bash
   # RDS master password (JSON format expected by rotation Lambda)
   aws secretsmanager put-secret-value \
     --secret-id workload-governor-DATABASE_URL \
     --secret-string '{"username":"dbadmin","password":"INITIAL_PASSWORD","host":"db.example.com","port":5432,"dbname":"govdb"}'

   # Redis URL
   aws secretsmanager put-secret-value \
     --secret-id workload-governor-REDIS_URL \
     --secret-string 'redis://:password@redis.example.com:6379'

   # GitHub token
   aws secretsmanager put-secret-value \
     --secret-id workload-governor-GITHUB_TOKEN \
     --secret-string 'ghp_...'

   # JWT secret (random 64-byte hex)
   aws secretsmanager put-secret-value \
     --secret-id workload-governor-JWT_SECRET \
     --secret-string "$(openssl rand -hex 64)"

   # Initial API key (will be overwritten on first rotation)
   aws secretsmanager put-secret-value \
     --secret-id workload-governor-API_KEYS \
     --secret-string '{"key":"initial-placeholder"}'
   ```

3. Update ECS task definitions to reference the secret ARNs (see `ecs_task_secrets_example.tf`). Use `valueFrom` so secrets are resolved at task launch — they are **never** baked into the image.

4. Confirm ECS tasks can retrieve secrets (check that the ECS task execution role has `secretsmanager:GetSecretValue` on the relevant ARNs) and the application starts normally.

---

## ECS Secret Injection (zero-downtime)

Secrets are injected into ECS tasks via `valueFrom` in the container definition:

```json
{
  "secrets": [
    { "name": "DATABASE_URL", "valueFrom": "<DATABASE_URL_SECRET_ARN>" },
    { "name": "REDIS_URL",    "valueFrom": "<REDIS_URL_SECRET_ARN>" },
    { "name": "JWT_SECRET",   "valueFrom": "<JWT_SECRET_SECRET_ARN>" },
    { "name": "GITHUB_TOKEN", "valueFrom": "<GITHUB_TOKEN_SECRET_ARN>" }
  ]
}
```

On rotation: the next **new ECS task** launched after a successful rotation automatically receives the new secret value. The old task continues using the previous value until it completes its drain period and is stopped by ECS. This means there is **no application downtime** during rotation.

---

## Rotation Failure Alerts

When a rotation attempt fails, Secrets Manager emits a `RotationFailed` event to CloudTrail. A CloudWatch metric filter captures this and triggers a CloudWatch alarm, which publishes to the `devops-alerts` SNS topic.

The alarm fires within **5 minutes** of the failure event. The SNS topic should have subscriptions for PagerDuty, Slack, or email depending on your setup.

---

## Manual Override Procedure

Use this procedure when you need to rotate a secret immediately (e.g. suspected compromise) without waiting for the scheduled rotation.

### RDS master password — emergency rotation

```bash
# 1. Trigger immediate rotation (ignores the schedule)
aws secretsmanager rotate-secret \
  --secret-id workload-governor-DATABASE_URL \
  --rotate-immediately

# 2. Poll until rotation is complete
while true; do
  STATUS=$(aws secretsmanager describe-secret \
    --secret-id workload-governor-DATABASE_URL \
    --query 'RotationRules' --output text)
  echo "Status: $STATUS"
  sleep 5
done

# 3. Force a new ECS deployment to pick up the new secret
aws ecs update-service \
  --cluster workload-governor-cluster \
  --service workload-governor-backend \
  --force-new-deployment
```

### API keys — emergency rotation

```bash
# 1. Trigger immediate rotation
aws secretsmanager rotate-secret \
  --secret-id workload-governor-API_KEYS \
  --rotate-immediately

# 2. Verify the secret has a new AWSCURRENT version
aws secretsmanager list-secret-version-ids \
  --secret-id workload-governor-API_KEYS

# 3. Force ECS redeployment
aws ecs update-service \
  --cluster workload-governor-cluster \
  --service workload-governor-backend \
  --force-new-deployment
```

### Manual secret update (bypassing rotation Lambda)

Use only when the rotation Lambda is unavailable or not yet configured.

```bash
# Generate a new random value
NEW_VALUE=$(openssl rand -hex 32)

# Update the secret directly
aws secretsmanager put-secret-value \
  --secret-id workload-governor-JWT_SECRET \
  --secret-string "$NEW_VALUE"

# Force ECS redeployment to pick up the new value
aws ecs update-service \
  --cluster workload-governor-cluster \
  --service workload-governor-backend \
  --force-new-deployment
```

### Rollback to previous secret version

```bash
# List available versions
aws secretsmanager list-secret-version-ids \
  --secret-id workload-governor-DATABASE_URL

# Restore a specific version (replaces AWSCURRENT)
aws secretsmanager update-secret-version-stage \
  --secret-id workload-governor-DATABASE_URL \
  --version-stage AWSCURRENT \
  --move-to-version-id <VERSION_ID> \
  --remove-from-version-id $(aws secretsmanager describe-secret \
    --secret-id workload-governor-DATABASE_URL \
    --query 'VersionIdsToStages' --output json | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print(next(k for k,v in d.items() if 'AWSCURRENT' in v))")
```

---

## Verifying Rotation Worked

```bash
# Check that a new AWSCURRENT version exists with a timestamp from today
aws secretsmanager describe-secret \
  --secret-id workload-governor-DATABASE_URL \
  --query '{LastRotatedDate: LastRotatedDate, NextRotationDate: NextRotationDate}'

# Confirm the application is using the new credentials
curl -f https://api.workload-governor.example.com/api/health
```

---

## Next Steps

1. Run `terraform plan` and apply with `-var='service_name=your-service'`.
2. Populate the created secrets in Secrets Manager with initial values (use `aws secretsmanager put-secret-value`).
3. Update ECS task definitions to reference the secret ARNs (see `ecs_task_secrets_example.tf`).
4. Confirm ECS tasks can retrieve secrets (check task role permissions) and the application starts normally.
5. Verify rotation alarms are configured by checking the CloudWatch console for `WorkloadGovernor/Secrets` metrics.

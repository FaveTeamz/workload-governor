# Runbook: Database Migration

This document covers how automated schema migrations work, how to run them
manually, and what to do if a migration fails.

---

## Overview

Database migrations run as a one-shot ECS Fargate task before every deployment.
The task executes `npx prisma migrate deploy` against the live database and exits.
The main service update is blocked until the migration task exits with code 0.

```
GitHub Actions deployment flow:
  1. build-and-push Docker image
  2. migrate job  ← runs prisma migrate deploy via ECS task
  3. deploy job   ← updates ECS service with new image (only starts after step 2)
```

If step 2 fails the deployment stops immediately — no traffic ever reaches code
that expects a schema that has not been applied.

---

## Infrastructure

| Resource | Name pattern | Details |
|---|---|---|
| ECS task definition | `workload-governor-<env>-migration` | 0.25 vCPU / 512 MB Fargate |
| CloudWatch log group | `/ecs/workload-governor-<env>-migration` | 30-day retention |
| Security group | `workload-governor-<env>-migration` | Egress-only (RDS + internet for npm) |
| SSM parameters | `/<project>/<env>/migration-task-def-arn` | Looked up at deploy time |

The migration task shares the same IAM execution role and VPC as the main service.
No additional permissions are required.

---

## Running a Migration Manually

Use this when you need to apply migrations outside the normal deployment flow
(e.g. after a failed deploy or a hotfix).

### Option A — GitHub Actions (recommended)

1. Navigate to **Actions → DB Migration → Run workflow**.
2. Select the target environment (`staging` or `production`).
3. Enter the image tag (Git SHA) that contains the migration files.
4. Click **Run workflow**.

Monitor the run at **Actions → DB Migration → latest run**.

### Option B — AWS CLI

```bash
# 1. Resolve infrastructure parameters
ENV=staging   # or production
PROJECT=workload-governor
CLUSTER="${PROJECT}-${ENV}"

TASK_DEF=$(aws ssm get-parameter \
  --name "/${PROJECT}/${ENV}/migration-task-def-arn" \
  --query "Parameter.Value" --output text)
SUBNET=$(aws ssm get-parameter \
  --name "/${PROJECT}/${ENV}/migration-subnet-id" \
  --query "Parameter.Value" --output text)
SG=$(aws ssm get-parameter \
  --name "/${PROJECT}/${ENV}/migration-sg-id" \
  --query "Parameter.Value" --output text)

# 2. Run the migration task
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration \
    "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --query "tasks[0].taskArn" --output text)
echo "Task ARN: $TASK_ARN"

# 3. Wait for it to finish
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"

# 4. Check exit code
aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --query "tasks[0].containers[0].exitCode"
# Expected: 0
```

### Viewing migration logs

```bash
aws logs tail /ecs/workload-governor-staging-migration --since 30m --follow
# Replace 'staging' with 'production' as needed.
```

---

## Rollback Procedure for Failed Migrations

### Step 1 — Stop the deployment

If the CI pipeline failed on the migration step, the main service was never
updated — no rollback of application code is needed. Investigate the migration
error first.

### Step 2 — Diagnose the failure

```bash
# Fetch logs from the failed migration task
aws logs tail /ecs/workload-governor-staging-migration --since 1h

# Common causes:
#   - DATABASE_URL secret has wrong credentials
#   - Migration SQL has a syntax error
#   - Schema conflict with data already in the table
```

### Step 3 — Fix and re-apply

If the migration SQL is incorrect:
1. Fix the migration file in the codebase.
2. Open a PR, get it merged to `main`.
3. The deployment pipeline will re-run the migration automatically.

If the migration is structurally valid but failed due to a transient error
(e.g. network timeout), re-run the GitHub Actions workflow manually
(**Actions → DB Migration → Run workflow**).

### Step 4 — Reverting an already-applied migration

Prisma does not support automatic rollback of `migrate deploy`. To revert:

1. Write a new migration that undoes the schema change:
   ```bash
   npx prisma migrate dev --name revert_<migration_name>
   # Edit the generated SQL to undo the forward migration
   ```
2. Commit and deploy via the normal PR flow.
3. The forward migration and its revert are both recorded in migration history.

> **Important:** Never manually edit or delete rows from the `_prisma_migrations`
> table in production. Always use Prisma tooling to manage migration state.

### Step 5 — Emergency: service is running but DB is in a broken state

If code was deployed before the migration completed (e.g. a manual deploy that
bypassed CI):

1. Stop the ECS service to take the application offline:
   ```bash
   aws ecs update-service \
     --cluster workload-governor-production \
     --service workload-governor-production \
     --desired-count 0
   ```
2. Run the migration manually (Option B above).
3. Restore service:
   ```bash
   aws ecs update-service \
     --cluster workload-governor-production \
     --service workload-governor-production \
     --desired-count 2
   ```

---

## Testing Against Staging

Before promoting a migration to production:

1. Merge the PR to `main` — the migration auto-runs against staging.
2. Verify the staging service starts and `/api/health` returns `200`.
3. Run a manual smoke test or check recent API logs.
4. Only then approve the production deployment via the GitHub Environment gate.

---

## Health Check Verification

After each migration, the CI workflow polls `GET /api/health` and checks for an
HTTP 200 response. The health endpoint checks that PostgreSQL is reachable and
responding. A `503` or timeout after migration indicates a database connectivity
issue — investigate before proceeding with the service deploy.

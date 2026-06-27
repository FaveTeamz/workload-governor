# Rollback Runbook

**Last updated:** 2026-06-25  
**Scope:** WorkloadGovernor production ECS service + RDS database  
**Target RTO:** ≤ 5 minutes for ECS rollback; database PITR may take 20–40 min.

---

## Quick-decision tree

```
Regression detected?
├── Smoke test / health check failing?  → Trigger 1: Automated smoke-test failure
├── Error rate spike in CloudWatch?     → Trigger 2: Error rate alarm
└── Human spotted the problem?          → Trigger 3: Manual decision
        ↓
App-only regression?  → ECS rollback (this doc, §2)
Data corruption?      → Database rollback (this doc, §3)
Both?                 → Database rollback first, then ECS rollback
```

---

## 1. Rollback triggers

### Trigger 1 — Smoke test failure (automated)

The CD pipeline calls `scripts/rollback.sh` automatically when the post-deploy
health check returns non-200 after a new deploy.

**Evidence in logs:**
```
ERROR: Smoke test failed after 3 attempts.
```

### Trigger 2 — Error rate spike (CloudWatch alarm)

CloudWatch Logs Insights query `<service>-error-rate` fires when errors exceed
threshold in a 5-minute window. Alarm action should page on-call and link to
this runbook.

**Confirm the spike:**
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=LoadBalancer,Value=<alb-arn-suffix> \
  --start-time "$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --period 60 --statistics Sum
```

Proceed to §2 if 5xx count is abnormal compared to baseline.

### Trigger 3 — Manual decision

Used when the regression is subtle (wrong business logic, performance
degradation) and does not trip automated alarms.

**Checklist before rolling back:**
- [ ] Incident channel created (`#inc-<date>-<service>`)
- [ ] Incident commander assigned
- [ ] Previous good image SHA identified (from CD pipeline log or GHCR tags)
- [ ] Decision logged in incident channel

---

## 2. ECS rollback procedure

### 2a. Identify the previous good image SHA

Check the GitHub Actions deploy history or GHCR:

```bash
# List recent GHCR tags (requires gh CLI logged in)
gh api /user/packages/container/workload-governor/versions \
  --jq '.[0:5] | .[] | {id, tags: .metadata.container.tags}'
```

Or check the CD workflow run that preceded the broken deploy — the image SHA is
logged as `sha-<git-short-sha>`.

### 2b. Option A — GitHub Actions (preferred for audit trail)

1. Go to **Actions → Rollback** → **Run workflow**.
2. Fill in:
   | Input | Value |
   |---|---|
   | cluster | `workload-governor-prod` (or your cluster name) |
   | service | `workload-governor` (or your service name) |
   | image_sha | `sha-<previous-good-sha>` |
   | health_url | `https://<prod-domain>/health` |
3. Click **Run workflow** — the `production` environment gate will request approval from a repo admin.
4. Monitor the run. It completes (or times out) in under 5 minutes.

### 2b. Option B — CLI (when GHA is unavailable)

```bash
export CLUSTER="workload-governor-prod"
export SERVICE="workload-governor"
export IMAGE_SHA="sha-<previous-good-sha>"   # e.g. sha-abc1234
export HEALTH_URL="https://<prod-domain>/health"

bash scripts/rollback.sh "$CLUSTER" "$SERVICE" "$IMAGE_SHA"
```

### 2c. Verify

```bash
# Confirm running image
TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER" --services "$SERVICE" \
  --query "services[0].taskDefinition" --output text)

aws ecs describe-task-definition \
  --task-definition "$TASK_DEF" \
  --query "taskDefinition.containerDefinitions[0].image" --output text
```

Expected output: `ghcr.io/<org>/workload-governor:sha-<previous-good-sha>`

```bash
# Health check
curl -sf "https://<prod-domain>/health" | jq .
```

---

## 3. Database rollback procedure

Use this **only** when data is corrupted or lost. ECS rollback alone is
sufficient for pure application bugs.

### 3a. Restore from pre-deploy snapshot (fastest — ~5 min)

The CD pipeline creates a snapshot via `infra/rds-snapshot.sh` before every
production deploy. The snapshot ID is printed in the deploy log:
`Snapshot ready: <db-id>-pre-deploy-<tag>-<timestamp>`.

```bash
SNAPSHOT_ID="<snapshot-id-from-deploy-log>"
NEW_DB_ID="workload-governor-prod-rollback-$(date +%Y%m%d%H%M)"

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "$NEW_DB_ID" \
  --db-snapshot-identifier "$SNAPSHOT_ID"

aws rds wait db-instance-available --db-instance-identifier "$NEW_DB_ID"
echo "Restored DB available: $NEW_DB_ID"
```

### 3b. Point-in-time restore (when no snapshot is available)

```bash
SOURCE_DB="workload-governor-prod"
RESTORE_TO="2026-06-25T02:45:00Z"   # UTC — just before the bad deploy
TARGET_DB="${SOURCE_DB}-pitr"

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier "$SOURCE_DB" \
  --target-db-instance-identifier "$TARGET_DB" \
  --restore-time "$RESTORE_TO"

aws rds wait db-instance-available --db-instance-identifier "$TARGET_DB"
```

### 3c. Cut over the application

1. Update `DATABASE_URL` in Secrets Manager to the restored instance endpoint:
   ```bash
   NEW_ENDPOINT=$(aws rds describe-db-instances \
     --db-instance-identifier "$NEW_DB_ID" \
     --query "DBInstances[0].Endpoint.Address" --output text)

   aws secretsmanager update-secret \
     --secret-id workload-governor/prod/database-url \
     --secret-string "postgresql://<user>:<pass>@${NEW_ENDPOINT}:5432/<db>"
   ```
2. Force a new ECS deployment to pick up the updated secret:
   ```bash
   aws ecs update-service \
     --cluster "$CLUSTER" --service "$SERVICE" \
     --force-new-deployment --output text > /dev/null
   ```
3. Run validation queries:
   ```sql
   SELECT 1;                          -- connectivity
   SELECT COUNT(*) FROM <key_table>;  -- sanity-check row count vs backup
   ```
4. Check application health: `curl -sf "https://<prod-domain>/health"`

### 3d. Cleanup

Delete the broken DB instance **only after** the service is confirmed healthy
and at least 24 hours have passed:

```bash
aws rds delete-db-instance \
  --db-instance-identifier "$SOURCE_DB" \
  --skip-final-snapshot   # snapshot was already taken pre-deploy
```

---

## 4. Testing rollback in staging

Run this procedure after every significant deploy to validate the rollback path.

### 4a. Deploy a deliberately broken image

```bash
# Tag current good image as "broken" with a dummy bad tag
STAGING_CLUSTER="workload-governor-staging"
STAGING_SERVICE="workload-governor"
GOOD_SHA=$(aws ecs describe-task-definition \
  --task-definition "$(aws ecs describe-services \
    --cluster "$STAGING_CLUSTER" --services "$STAGING_SERVICE" \
    --query "services[0].taskDefinition" --output text)" \
  --query "taskDefinition.containerDefinitions[0].image" \
  --output text | cut -d: -f2)

# Deploy a broken image (nonexistent tag — ECS will fail to pull)
bash scripts/rollback.sh "$STAGING_CLUSTER" "$STAGING_SERVICE" "sha-broken000" || true
```

The deploy will fail (ECS cannot pull the image). This confirms failure-mode
behaviour without actual data impact.

### 4b. Trigger rollback

```bash
HEALTH_URL="https://staging.<domain>/health" \
bash scripts/rollback.sh "$STAGING_CLUSTER" "$STAGING_SERVICE" "$GOOD_SHA"
```

### 4c. Acceptance checks

| Check | Command | Expected |
|---|---|---|
| Service stable | `aws ecs describe-services --cluster ... --query "services[0].deployments"` | Single `PRIMARY` deployment |
| Running image | see §2c | `sha-<good-sha>` |
| Health endpoint | `curl -sf .../health` | HTTP 200 |
| Rollback time | Timer from step 4b start to §2c passing | ≤ 5 minutes |

---

## 5. Post-incident checklist

- [ ] Incident timeline documented in incident channel
- [ ] Root cause identified (bad image, config change, migration?)
- [ ] Broken image removed from GHCR or tagged `do-not-use`
- [ ] Pre-deploy snapshot retained until root cause is resolved
- [ ] Monitoring rules tuned if alarm fired late (or not at all)
- [ ] Retrospective scheduled within 48 hours

---

## 6. Reference

| Resource | Location |
|---|---|
| Rollback script | `scripts/rollback.sh` |
| GHA workflow | `.github/workflows/rollback.yml` |
| RDS snapshot script | `infra/rds-snapshot.sh` |
| RDS restore runbook | `infra/rds-restore-runbook.md` |
| CloudWatch alarms | `infra/logs_and_alarms.tf` |
| ECS autoscaling | `infra/ecs-autoscaling.tf` |

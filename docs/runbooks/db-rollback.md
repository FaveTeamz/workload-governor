# Runbook: Database Rollback

Covers reversing a PostgreSQL schema migration that caused issues in
production. Use this runbook when a bad migration must be undone, not for
general data-corruption scenarios (see [docs/rollback-runbook.md §3](../rollback-runbook.md#3-database-rollback-procedure)
for RDS snapshot and PITR options).

**Migration tool:** node-pg-migrate  
**DB:** PostgreSQL 16 on Amazon RDS  
**Estimated time:** 15–30 minutes for a single migration rollback.

---

## Quick-decision tree

```
Database problem after a deploy?
├── Schema-related error (missing column, constraint violation)?
│       → This runbook — run the down migration
├── Data corrupted but schema is fine?
│       → rollback-runbook.md §3 — restore from RDS snapshot or PITR
└── Both schema and data affected?
        → Take a pre-rollback snapshot (Step 2), then this runbook,
          followed by manual data repair or PITR if needed
```

---

## Prerequisites

- [ ] AWS CLI configured with credentials that can access RDS, ECS, and
      Secrets Manager in the production region.
- [ ] `psql` (PostgreSQL 16 client) available on the operator's machine or a
      bastion host inside the production VPC.
- [ ] `DATABASE_URL` for the production RDS instance (retrieve from Secrets
      Manager — do not echo it):
  ```bash
  export DATABASE_URL=$(aws secretsmanager get-secret-value \
    --secret-id workload-governor/prod/database-url \
    --query SecretString \
    --output text \
    --region us-east-1)
  ```
- [ ] `NODE_ENV=production` and the app repo checked out at the commit that
      introduced the bad migration (so `migrations/` matches the DB state).
- [ ] Incident channel open and incident commander assigned.

---

## Step 1 — Identify the bad migration

### 1a. Symptoms of a migration-related failure

| Symptom | Likely cause |
|---|---|
| `GET /api/health` returns 500 with a DB error | Migration ran but app code is incompatible |
| `column "x" does not exist` in error logs | Migration added a column the old app version expected, or a down migration removed a column the running app needs |
| `relation "x" does not exist` | Table not yet created or already dropped |
| `violates not-null constraint` / `violates unique constraint` | Migration added a constraint that existing data violates |
| `ERROR: operator does not exist` | Type change incompatibility |

### 1b. Check which migrations have run

```bash
psql "$DATABASE_URL" \
  -c "SELECT id, name, run_on FROM pgmigrations ORDER BY run_on DESC LIMIT 10;"
```

The `name` column contains the migration file name without the `.js` extension
(e.g. `1_initial_schema`). The most recently run migration is the first suspect.

### 1c. Confirm the error in application logs

```bash
# CloudWatch Logs — last 50 error lines for the ECS service
aws logs filter-log-events \
  --log-group-name "/ecs/workload-governor" \
  --filter-pattern "ERROR" \
  --start-time "$(date -u -d '30 minutes ago' +%s%3N)" \
  --query "events[*].message" \
  --output text \
  --region us-east-1 | tail -50
```

Correlate the error message with the migration that ran. If the error is
unrelated to the schema, stop here and use the appropriate runbook.

---

## Step 2 — Take a pre-rollback snapshot

**Always do this before running any down migration.** It gives you a restore
point if the down migration itself fails or causes additional damage.

```bash
DB_INSTANCE="workload-governor-prod"
SNAPSHOT_ID="${DB_INSTANCE}-pre-down-$(date +%Y%m%d%H%M)"

aws rds create-db-snapshot \
  --db-instance-identifier "$DB_INSTANCE" \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --region us-east-1

# Wait for the snapshot to complete (typically 2–5 minutes)
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --region us-east-1

echo "Pre-rollback snapshot ready: $SNAPSHOT_ID"
```

Record `$SNAPSHOT_ID` in the incident channel before proceeding.

---

## Step 3 — Stop the application

Stop the ECS service to prevent in-flight requests from writing to the schema
while the down migration is running.

```bash
CLUSTER="workload-governor-prod"
SERVICE="workload-governor"

# Scale the service to 0 tasks
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --desired-count 0 \
  --region us-east-1

# Wait until all tasks are stopped
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region us-east-1

echo "ECS service stopped."
```

---

## Step 4 — Run the down migration

node-pg-migrate rolls back one migration at a time. Run it once per migration
you need to undo, from newest to oldest.

```bash
# Ensure DATABASE_URL is set (see Prerequisites)
# Run from the root of the repository

npm run migrate:down
```

This executes the `exports.down` function of the most recently run migration
(as recorded in `pgmigrations`). The output will confirm which migration was
reversed:

```
> node-pg-migrate down ...
Migrating down: 1_initial_schema
Migrated down:  1_initial_schema (took 0.234s)
```

If you need to roll back multiple migrations, run the command once for each:

```bash
# Roll back two migrations in sequence (newest first)
npm run migrate:down
npm run migrate:down
```

### What the down migration does

For `1_initial_schema`, the `exports.down` function drops all tables in the
following reverse order:

1. `github_issue_labels`
2. `api_keys`
3. `assignments`
4. `applications`
5. `maintainers`
6. `issues`
7. `events` (indexes `idx_events_occurred_at`, `idx_events_org_id` first)
8. `orgs`

**This is destructive.** All data in these tables will be deleted. Only proceed
if the pre-rollback snapshot in Step 2 is confirmed.

---

## Step 5 — Verify schema state

After the down migration, confirm the schema reflects what you expect.

### 5a. Check pgmigrations table

```bash
psql "$DATABASE_URL" \
  -c "SELECT id, name, run_on FROM pgmigrations ORDER BY run_on DESC LIMIT 5;"
```

The migration you rolled back should no longer appear. If all migrations were
reversed, the table will be empty (or contain only migrations that were not
rolled back).

### 5b. Confirm dropped tables no longer exist

```bash
psql "$DATABASE_URL" \
  -c "\dt"
# Expected: only tables that should remain after the rollback
# For a full rollback of 1_initial_schema: no user tables listed
```

### 5c. Check for active connections

Confirm no stale connections are holding locks that would block the re-migration
later:

```bash
psql "$DATABASE_URL" -c "
SELECT pid, usename, application_name, state, wait_event_type, wait_event
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid();"
```

Terminate unexpected connections if found:

```bash
# Terminate a specific connection by pid
psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(<pid>);"
```

---

## Step 6 — Data integrity verification

Run these queries to confirm the database is in a consistent state after the
rollback. Adjust expected counts based on your knowledge of pre-migration data.

```bash
psql "$DATABASE_URL" << 'SQL'
-- 1. Verify expected tables exist (adjust for your rollback depth)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Spot-check row counts against pre-deploy known values
SELECT 'orgs'         AS tbl, COUNT(*) FROM orgs
UNION ALL
SELECT 'events',              COUNT(*) FROM events
UNION ALL
SELECT 'issues',              COUNT(*) FROM issues
UNION ALL
SELECT 'maintainers',         COUNT(*) FROM maintainers
UNION ALL
SELECT 'applications',        COUNT(*) FROM applications
UNION ALL
SELECT 'assignments',         COUNT(*) FROM assignments
UNION ALL
SELECT 'api_keys',            COUNT(*) FROM api_keys
UNION ALL
SELECT 'github_issue_labels', COUNT(*) FROM github_issue_labels;

-- 3. Check for orphaned foreign-key-like references (no strict FK constraints,
--    but verify org_id values in events match known orgs)
SELECT DISTINCT e.org_id
FROM events e
WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.org_id = e.org_id);
-- Expected: zero rows

-- 4. Confirm no duplicate primary keys (pgmigrations can expose this
--    if a migration was partially applied)
SELECT contributor, org_id, issue_id, COUNT(*)
FROM applications
GROUP BY contributor, org_id, issue_id
HAVING COUNT(*) > 1;
-- Expected: zero rows

SELECT contributor, org_id, issue_id, COUNT(*)
FROM assignments
GROUP BY contributor, org_id, issue_id
HAVING COUNT(*) > 1;
-- Expected: zero rows
SQL
```

If any check returns unexpected rows, do not redeploy. Investigate the
discrepancy and restore from the pre-rollback snapshot (Step 2) if necessary.

---

## Step 7 — Redeploy the previous app version

After the schema is back to a known-good state, redeploy the application
version that is compatible with it.

### 7a. Identify the previous good image SHA

```bash
# List recent GHCR image tags (requires gh CLI)
gh api /user/packages/container/workload-governor/versions \
  --jq '.[0:5] | .[] | {id, tags: .metadata.container.tags}'
```

Or check the GitHub Actions deploy history for the last successful deploy
before the bad migration was introduced.

### 7b. Redeploy via the rollback script

```bash
export CLUSTER="workload-governor-prod"
export SERVICE="workload-governor"
export IMAGE_SHA="sha-<previous-good-sha>"   # e.g. sha-abc1234

bash scripts/rollback.sh "$CLUSTER" "$SERVICE" "$IMAGE_SHA"
```

This updates the ECS task definition to the previous image and triggers a new
deployment. It also restores the `--desired-count` to its previous value.

### 7c. Alternatively, scale up manually with the previous task definition

If the rollback script is unavailable:

```bash
# Find the previous task definition revision
aws ecs list-task-definitions \
  --family-prefix workload-governor \
  --sort DESC \
  --region us-east-1 \
  --query "taskDefinitionArns[0:5]"

# Update service to use it and restore desired count
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "workload-governor:<PREVIOUS_REVISION>" \
  --desired-count 2 \
  --region us-east-1

aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region us-east-1
```

---

## Step 8 — Run the up migration for the compatible schema (if needed)

If the previous app version requires a migration that was also rolled back
as part of this procedure, re-apply it now:

```bash
npm run migrate:up
```

Verify the `pgmigrations` table reflects the expected state:

```bash
psql "$DATABASE_URL" \
  -c "SELECT id, name, run_on FROM pgmigrations ORDER BY run_on;"
```

---

## Step 9 — Verify application health

```bash
# Health check — should return 200 {"status":"ok"}
curl -sf "https://<prod-domain>/health" | jq .

# Smoke-test a read endpoint
curl -sf "https://<prod-domain>/api/issues?org_id=<org_id>" | jq '. | length'
```

Check for errors in CloudWatch:

```bash
aws logs filter-log-events \
  --log-group-name "/ecs/workload-governor" \
  --filter-pattern "ERROR" \
  --start-time "$(date -u -d '5 minutes ago' +%s%3N)" \
  --query "events[*].message" \
  --output text \
  --region us-east-1
```

Expected: no new errors after the redeployment.

---

## Step 10 — Clean up

Once the service is confirmed healthy and **at least 24 hours have passed**:

```bash
# Delete the pre-rollback snapshot (created in Step 2)
aws rds delete-db-snapshot \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --region us-east-1
```

Do not delete this snapshot if the root cause is unresolved or if the
incident post-mortem has not been completed.

---

## Post-incident review checklist

- [ ] Root cause of the bad migration identified and documented
- [ ] Incident timeline recorded in the incident channel
- [ ] Pre-rollback snapshot retained until post-mortem is complete
- [ ] Migration file updated or reverted in the repository
- [ ] Migration tested against a staging database restore before re-landing
- [ ] `pgmigrations` table state in production matches the intended state
- [ ] CloudWatch alarms confirmed quiet for ≥30 minutes after recovery
- [ ] Retrospective scheduled within 48 hours of the incident

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `permission denied` on `psql` | DB credentials lack DDL privileges | Use the admin DB user from Secrets Manager |
| `node-pg-migrate` exits with `Already at the beginning` | No migrations to roll back (pgmigrations is empty) | Schema is already at baseline — no action needed |
| Down migration fails mid-way | Partial execution left schema in inconsistent state | Restore from the Step 2 snapshot; file a bug against the migration |
| ECS tasks fail to stop after Step 3 | In-flight requests draining | Increase `--deregistration-delay` and re-run; or wait for the deregistration period to expire |
| `psql: could not connect to server` | Not in the production VPC | Connect via a bastion host or AWS Session Manager |
| Row counts in Step 6 are lower than expected | Data loss during the down migration | Restore from Step 2 snapshot; investigate before re-running |

---

## Reference

| Resource | Location |
|---|---|
| Migration files | `migrations/` |
| Run migration up | `npm run migrate:up` |
| Run migration down | `npm run migrate:down` |
| Migrations state table | `pgmigrations` (in PostgreSQL) |
| RDS snapshot script | `infra/rds-snapshot.sh` |
| ECS rollback script | `scripts/rollback.sh` |
| DB connection secret | `workload-governor/prod/database-url` (Secrets Manager) |
| ECS cluster | `workload-governor-prod` |
| ECS service | `workload-governor` |
| Snapshot restore runbook | [docs/rollback-runbook.md §3](../rollback-runbook.md#3-database-rollback-procedure) |
| Deployment runbook | [docs/deployment-runbook.md](../deployment-runbook.md) |

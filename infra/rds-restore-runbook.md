# RDS Point-in-Time Restore Runbook

## When to use
Data corruption, accidental deletion, or failed migration. Use the pre-deploy snapshot first; fall back to PITR.

## 1 — Restore from pre-deploy snapshot (preferred)
```bash
SNAPSHOT_ID=<snapshot-id>   # from CD pipeline output
NEW_DB_ID=<restored-db-id>

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "${NEW_DB_ID}" \
  --db-snapshot-identifier "${SNAPSHOT_ID}"

aws rds wait db-instance-available --db-instance-identifier "${NEW_DB_ID}"
```

## 2 — Point-in-time restore
```bash
DB_ID=<source-instance-id>
RESTORE_TO="2026-06-23T18:00:00Z"  # UTC timestamp

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier "${DB_ID}" \
  --target-db-instance-identifier "${DB_ID}-pitr" \
  --restore-time "${RESTORE_TO}"

aws rds wait db-instance-available --db-instance-identifier "${DB_ID}-pitr"
```

## 3 — Update connection string
Update `DATABASE_URL` in your ECS task definition / Secrets Manager to point to the restored instance, then redeploy the service.

## Validation checklist
- [ ] Instance status: `available`
- [ ] Run smoke queries: `SELECT 1`, check row counts on critical tables
- [ ] App health check passes after cutover
- [ ] Delete the broken instance only after validation

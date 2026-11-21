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

---

## 4 — Automated restore verification (`--verify-restore`)

The `infra/rds-snapshot.sh` script supports a `--verify-restore` flag that
automatically validates backup integrity after snapshot creation by provisioning
an ephemeral test instance, running connectivity and table-count checks, emitting
a CloudWatch metric, and then tearing down the instance.

### Usage

```bash
# Create snapshot only (existing behaviour)
./infra/rds-snapshot.sh <db-instance-id> <deploy-tag>

# Create snapshot AND verify restore
./infra/rds-snapshot.sh <db-instance-id> <deploy-tag> --verify-restore
```

### What verify-restore does

1. Creates a snapshot as normal (`<db-id>-pre-deploy-<tag>-<timestamp>`).
2. Waits for the snapshot to reach `available` state.
3. Restores an ephemeral instance named `<snapshot-id>-verify` from the snapshot.
4. Waits for the ephemeral instance to become `available`.
5. Runs a connectivity check:
   - Uses `pg_isready` if available, otherwise a TCP probe via `/dev/tcp`.
6. If `psql` is available, queries `information_schema.tables` and logs the public table count.
7. Emits a `RDSRestoreVerification` CloudWatch metric to the `WorkloadGovernor/RDS` namespace:
   - Value `1` = verification passed
   - Value `0` = verification failed
8. Writes a step summary to `$GITHUB_STEP_SUMMARY` (when running in GitHub Actions).
9. **Guarantees deletion** of the ephemeral instance via a `trap` on `EXIT`, `INT`, and `TERM` — the instance is cleaned up whether the script succeeds, errors, or is interrupted.

### Environment variables (optional)

| Variable | Default | Purpose |
|---|---|---|
| `DB_VERIFY_USER` | `postgres` | PostgreSQL user for connectivity check |
| `DB_VERIFY_PASSWORD` | `""` | Password for the verify user |
| `DB_VERIFY_NAME` | `postgres` | Database name for table-count query |
| `AWS_DEFAULT_REGION` | `us-east-1` | AWS region for CloudWatch metric |

### CloudWatch metric

| Dimension | Value |
|---|---|
| Namespace | `WorkloadGovernor/RDS` |
| Metric name | `RDSRestoreVerification` |
| Dimension | `SnapshotId=<snapshot-id>` |
| Value | `1` (pass) or `0` (fail) |

You can create a CloudWatch alarm on this metric to alert when a scheduled verify-restore run fails (value = 0).

### CI integration example

```yaml
# .github/workflows/rds-backup-verify.yml (excerpt)
- name: Verify RDS restore
  run: |
    ./infra/rds-snapshot.sh ${{ env.DB_INSTANCE_ID }} ${{ github.sha }} --verify-restore
  env:
    AWS_DEFAULT_REGION: us-east-1
    DB_VERIFY_USER: ${{ secrets.DB_VERIFY_USER }}
    DB_VERIFY_PASSWORD: ${{ secrets.DB_VERIFY_PASSWORD }}
    DB_VERIFY_NAME: ${{ secrets.DB_VERIFY_NAME }}
```

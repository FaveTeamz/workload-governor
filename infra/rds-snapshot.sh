#!/usr/bin/env bash
# Create a manual RDS snapshot before production deploy, with optional restore verification.
#
# Usage:
#   ./infra/rds-snapshot.sh <db-instance-id> <deploy-tag>
#   ./infra/rds-snapshot.sh <db-instance-id> <deploy-tag> --verify-restore
#
# --verify-restore mode:
#   After the snapshot is available, provisions an ephemeral RDS instance from it,
#   runs a connectivity check, emits a CloudWatch metric, then guarantees teardown
#   of the test instance regardless of success or error.
set -euo pipefail

DB_ID="${1:?DB instance ID required}"
TAG="${2:?Deploy tag required}"
VERIFY_RESTORE="${3:-}"

SNAPSHOT_ID="${DB_ID}-pre-deploy-${TAG}-$(date +%Y%m%d%H%M%S)"
VERIFY_INSTANCE_ID="${SNAPSHOT_ID}-verify"

# ── CloudWatch metric helper ───────────────────────────────────────────────────
emit_metric() {
  local value="${1}"  # 1 = success, 0 = failure
  local region="${AWS_DEFAULT_REGION:-us-east-1}"
  aws cloudwatch put-metric-data \
    --namespace "WorkloadGovernor/RDS" \
    --metric-name "RDSRestoreVerification" \
    --value "${value}" \
    --unit "Count" \
    --dimensions "SnapshotId=${SNAPSHOT_ID}" \
    --region "${region}" || true  # never fail the outer script on metric emission
  echo "Emitted RDSRestoreVerification metric: value=${value}"
}

# ── Step summary helper (GitHub Actions or plain stdout) ──────────────────────
step_summary() {
  local msg="${1}"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    echo "${msg}" >> "${GITHUB_STEP_SUMMARY}"
  fi
  echo "${msg}"
}

# ── Cleanup trap for ephemeral verify instance ────────────────────────────────
cleanup_verify_instance() {
  if aws rds describe-db-instances \
       --db-instance-identifier "${VERIFY_INSTANCE_ID}" \
       --query 'DBInstances[0].DBInstanceStatus' \
       --output text 2>/dev/null | grep -qvE '^(None|deleting)$'; then
    echo "Deleting ephemeral verify instance: ${VERIFY_INSTANCE_ID}"
    aws rds delete-db-instance \
      --db-instance-identifier "${VERIFY_INSTANCE_ID}" \
      --skip-final-snapshot || true
    echo "Delete request submitted for ${VERIFY_INSTANCE_ID}."
  fi
}

# ── Create snapshot ────────────────────────────────────────────────────────────
echo "Creating snapshot: ${SNAPSHOT_ID}"
aws rds create-db-snapshot \
  --db-instance-identifier "${DB_ID}" \
  --db-snapshot-identifier "${SNAPSHOT_ID}"

echo "Waiting for snapshot to be available..."
aws rds wait db-snapshot-available \
  --db-snapshot-identifier "${SNAPSHOT_ID}"

echo "Snapshot ready: ${SNAPSHOT_ID}"

# ── Verify restore (optional) ─────────────────────────────────────────────────
if [[ "${VERIFY_RESTORE}" == "--verify-restore" ]]; then
  echo ""
  echo "=== Verify-restore mode enabled ==="

  # Register cleanup trap so the ephemeral instance is always deleted
  trap cleanup_verify_instance EXIT INT TERM

  # Determine the source instance class (reuse the same class for the verify instance)
  SRC_CLASS=$(aws rds describe-db-instances \
    --db-instance-identifier "${DB_ID}" \
    --query 'DBInstances[0].DBInstanceClass' \
    --output text 2>/dev/null || echo "db.t3.micro")

  echo "Restoring ephemeral instance ${VERIFY_INSTANCE_ID} from snapshot ${SNAPSHOT_ID}..."
  aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier "${VERIFY_INSTANCE_ID}" \
    --db-snapshot-identifier "${SNAPSHOT_ID}" \
    --db-instance-class "${SRC_CLASS}" \
    --no-multi-az \
    --no-publicly-accessible

  echo "Waiting for ephemeral instance to become available (this may take several minutes)..."
  aws rds wait db-instance-available \
    --db-instance-identifier "${VERIFY_INSTANCE_ID}"

  echo "Ephemeral instance available: ${VERIFY_INSTANCE_ID}"

  # ── Connectivity & table-count checks ────────────────────────────────────
  VERIFY_STATUS="failed"

  # Fetch the endpoint
  VERIFY_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "${VERIFY_INSTANCE_ID}" \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

  VERIFY_PORT=$(aws rds describe-db-instances \
    --db-instance-identifier "${VERIFY_INSTANCE_ID}" \
    --query 'DBInstances[0].Endpoint.Port' \
    --output text)

  echo "Verify instance endpoint: ${VERIFY_ENDPOINT}:${VERIFY_PORT}"

  # Run connectivity check via pg_isready (PostgreSQL) or a basic TCP probe
  if command -v pg_isready &>/dev/null; then
    DB_USER="${DB_VERIFY_USER:-postgres}"
    if pg_isready -h "${VERIFY_ENDPOINT}" -p "${VERIFY_PORT}" -U "${DB_USER}" -t 30; then
      echo "pg_isready: connection successful"
      VERIFY_STATUS="ok"
    else
      echo "pg_isready: connection FAILED" >&2
    fi
  else
    # Fallback: TCP probe with bash /dev/tcp
    echo "pg_isready not found; using TCP probe..."
    if timeout 30 bash -c "</dev/tcp/${VERIFY_ENDPOINT}/${VERIFY_PORT}" 2>/dev/null; then
      echo "TCP probe: port ${VERIFY_PORT} reachable"
      VERIFY_STATUS="ok"
    else
      echo "TCP probe: could not reach ${VERIFY_ENDPOINT}:${VERIFY_PORT}" >&2
    fi
  fi

  # Table count check via psql if available
  if [[ "${VERIFY_STATUS}" == "ok" ]] && command -v psql &>/dev/null; then
    DB_USER="${DB_VERIFY_USER:-postgres}"
    DB_NAME="${DB_VERIFY_NAME:-postgres}"
    TABLE_COUNT=$(PGPASSWORD="${DB_VERIFY_PASSWORD:-}" psql \
      -h "${VERIFY_ENDPOINT}" \
      -p "${VERIFY_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null \
      | tr -d ' ' || echo "0")
    echo "Table count in restored instance: ${TABLE_COUNT}"
    step_summary "### RDS Restore Verification\n- Snapshot: \`${SNAPSHOT_ID}\`\n- Verify instance: \`${VERIFY_INSTANCE_ID}\`\n- Status: **${VERIFY_STATUS}**\n- Public table count: ${TABLE_COUNT}"
  else
    step_summary "### RDS Restore Verification\n- Snapshot: \`${SNAPSHOT_ID}\`\n- Verify instance: \`${VERIFY_INSTANCE_ID}\`\n- Status: **${VERIFY_STATUS}**"
  fi

  # Emit CloudWatch metric
  if [[ "${VERIFY_STATUS}" == "ok" ]]; then
    emit_metric 1
    echo "Restore verification PASSED."
  else
    emit_metric 0
    echo "Restore verification FAILED — check logs above." >&2
    # trap will still clean up; exit with failure code
    exit 1
  fi

  echo "Ephemeral instance will be deleted by cleanup trap."
fi

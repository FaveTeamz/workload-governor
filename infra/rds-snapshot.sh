#!/usr/bin/env bash
# Create a manual RDS snapshot before production deploy
# Usage: ./infra/rds-snapshot.sh <db-instance-id> <deploy-tag>
set -euo pipefail

DB_ID="${1:?DB instance ID required}"
TAG="${2:?Deploy tag required}"
SNAPSHOT_ID="${DB_ID}-pre-deploy-${TAG}-$(date +%Y%m%d%H%M%S)"

echo "Creating snapshot: ${SNAPSHOT_ID}"
aws rds create-db-snapshot \
  --db-instance-identifier "${DB_ID}" \
  --db-snapshot-identifier "${SNAPSHOT_ID}"

echo "Waiting for snapshot to be available..."
aws rds wait db-snapshot-available \
  --db-snapshot-identifier "${SNAPSHOT_ID}"

echo "Snapshot ready: ${SNAPSHOT_ID}"

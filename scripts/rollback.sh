#!/usr/bin/env bash
# Automated ECS rollback to a previous image SHA.
#
# Usage:
#   ./scripts/rollback.sh <cluster> <service> <image-sha>
#
# Environment variables (override defaults):
#   ROLLBACK_TIMEOUT  – seconds to wait for service stability (default: 300)
#   HEALTH_URL        – smoke-test endpoint after rollback (optional)
#
# Exit codes:
#   0  success
#   1  argument / environment error
#   2  rollback deployment timed out
#   3  post-rollback smoke test failed
set -euo pipefail

CLUSTER="${1:?Cluster name required (arg 1)}"
SERVICE="${2:?Service name required (arg 2)}"
TARGET_SHA="${3:?Target image SHA required (arg 3, e.g. sha-abc1234)}"
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-300}"
HEALTH_URL="${HEALTH_URL:-}"

REGISTRY="ghcr.io"
# Derive image repo from the running task definition (avoids hard-coding org)
CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER" --services "$SERVICE" \
  --query "services[0].taskDefinition" --output text)

CURRENT_IMAGE=$(aws ecs describe-task-definition \
  --task-definition "$CURRENT_TASK_DEF" \
  --query "taskDefinition.containerDefinitions[0].image" --output text)

IMAGE_REPO="${CURRENT_IMAGE%%:*}"   # strip tag
NEW_IMAGE="${IMAGE_REPO}:${TARGET_SHA}"

echo "==> Rollback target : ${NEW_IMAGE}"
echo "==> Cluster / Service: ${CLUSTER} / ${SERVICE}"

# ── 1. Register new task definition revision with the previous image ──────────
NEW_TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition "$CURRENT_TASK_DEF" \
  --query "taskDefinition" --output json)

UPDATED_JSON=$(echo "$NEW_TASK_DEF_JSON" | python3 -c "
import json, sys
td = json.load(sys.stdin)
td['containerDefinitions'][0]['image'] = '${NEW_IMAGE}'
# Remove fields that must not be present when registering
for key in ('taskDefinitionArn','revision','status','requiresAttributes',
            'compatibilities','registeredAt','registeredBy'):
    td.pop(key, None)
print(json.dumps(td))
")

NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "$UPDATED_JSON" \
  --query "taskDefinition.taskDefinitionArn" --output text)

echo "==> Registered task definition: ${NEW_TASK_DEF_ARN}"

# ── 2. Update the ECS service ─────────────────────────────────────────────────
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --force-new-deployment \
  --output text > /dev/null

echo "==> Waiting for service stability (timeout: ${ROLLBACK_TIMEOUT}s)..."
START=$(date +%s)
while true; do
  STATUS=$(aws ecs describe-services \
    --cluster "$CLUSTER" --services "$SERVICE" \
    --query "services[0].deployments" --output json)

  RUNNING_COUNT=$(echo "$STATUS" | python3 -c "
import json, sys
deps = json.load(sys.stdin)
primary = next((d for d in deps if d['status'] == 'PRIMARY'), None)
print(primary['runningCount'] if primary else 0)
")
  DESIRED_COUNT=$(aws ecs describe-services \
    --cluster "$CLUSTER" --services "$SERVICE" \
    --query "services[0].desiredCount" --output text)
  DEPLOY_COUNT=$(echo "$STATUS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

  if [[ "$DEPLOY_COUNT" -eq 1 && "$RUNNING_COUNT" -ge "$DESIRED_COUNT" ]]; then
    echo "==> Service stable: ${RUNNING_COUNT}/${DESIRED_COUNT} tasks running."
    break
  fi

  ELAPSED=$(( $(date +%s) - START ))
  if [[ "$ELAPSED" -ge "$ROLLBACK_TIMEOUT" ]]; then
    echo "ERROR: Timed out waiting for service stability after ${ROLLBACK_TIMEOUT}s." >&2
    exit 2
  fi

  echo "    tasks ${RUNNING_COUNT}/${DESIRED_COUNT}, deployments: ${DEPLOY_COUNT} — waiting..."
  sleep 15
done

# ── 3. Post-rollback smoke test ───────────────────────────────────────────────
if [[ -n "$HEALTH_URL" ]]; then
  echo "==> Smoke test: GET ${HEALTH_URL}"
  for attempt in 1 2 3; do
    HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" || true)
    if [[ "$HTTP_STATUS" == "200" ]]; then
      echo "==> Smoke test passed (HTTP 200)."
      break
    fi
    echo "    Attempt ${attempt}: HTTP ${HTTP_STATUS:-no response}"
    if [[ "$attempt" -eq 3 ]]; then
      echo "ERROR: Smoke test failed after 3 attempts." >&2
      exit 3
    fi
    sleep 10
  done
fi

echo "==> Rollback complete. Active image: ${NEW_IMAGE}"

#!/usr/bin/env bash
# Automated ECS rollback to a previous task definition or image SHA.
#
# Usage:
#   ./scripts/rollback.sh [options] <cluster> <service>
#
# Options:
#   --task-definition <ARN>   Roll back to this specific task definition ARN.
#                             Defaults to the most recent INACTIVE task definition
#                             (the one immediately before the active revision).
#   --image-sha <sha>         Build a new task definition revision pointing at
#                             <registry>/<repo>:<sha>.  Ignored when --task-definition
#                             is supplied.
#   --health-url <url>        Override the smoke-test endpoint.
#
# Positional arguments (required):
#   <cluster>   ECS cluster name
#   <service>   ECS service name
#
# Environment variables (override defaults):
#   ROLLBACK_TIMEOUT  – seconds to wait for service stability (default: 300)
#   HEALTH_URL        – smoke-test endpoint (overridden by --health-url)
#   SLACK_WEBHOOK_URL – optional Slack webhook; no notification if unset
#
# Exit codes:
#   0  success
#   1  argument / environment / pre-flight error
#   2  rollback deployment timed out
#   3  post-rollback smoke test failed

set -euo pipefail

# ── Argument parsing ──────────────────────────────────────────────────────────
CLUSTER=""
SERVICE=""
TARGET_TASK_DEF_ARN=""
TARGET_SHA=""
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-300}"
HEALTH_URL="${HEALTH_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-definition)
      TARGET_TASK_DEF_ARN="${2:?--task-definition requires a value}"
      shift 2
      ;;
    --image-sha)
      TARGET_SHA="${2:?--image-sha requires a value}"
      shift 2
      ;;
    --health-url)
      HEALTH_URL="${2:?--health-url requires a value}"
      shift 2
      ;;
    --*)
      echo "ERROR: Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$CLUSTER" ]]; then
        CLUSTER="$1"
      elif [[ -z "$SERVICE" ]]; then
        SERVICE="$1"
      else
        echo "ERROR: Unexpected positional argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

[[ -n "$CLUSTER" ]] || { echo "ERROR: cluster name required (positional arg 1)." >&2; exit 1; }
[[ -n "$SERVICE" ]] || { echo "ERROR: service name required (positional arg 2)." >&2; exit 1; }

OPERATOR="${GITHUB_ACTOR:-$(whoami)}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Helper: post Slack notification ──────────────────────────────────────────
slack_notify() {
  local message="$1"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -sf -X POST -H 'Content-type: application/json' \
      --data "{\"text\": \"${message}\"}" \
      "$SLACK_WEBHOOK_URL" || echo "WARNING: Slack notification failed (non-fatal)."
  fi
}

# ── 0. Discover current (active) task definition ─────────────────────────────
echo "==> Querying current service state for ${CLUSTER}/${SERVICE}..."
CURRENT_TASK_DEF_ARN=$(aws ecs describe-services \
  --cluster "$CLUSTER" --services "$SERVICE" \
  --query "services[0].taskDefinition" --output text)

[[ "$CURRENT_TASK_DEF_ARN" != "None" && -n "$CURRENT_TASK_DEF_ARN" ]] || {
  echo "ERROR: Could not retrieve task definition from service ${SERVICE}." >&2
  exit 1
}

CURRENT_REVISION=$(echo "$CURRENT_TASK_DEF_ARN" | sed 's/.*://')
FAMILY=$(echo "$CURRENT_TASK_DEF_ARN" | sed 's|.*/||; s/:[0-9]*$//')
echo "==> Current task definition: ${CURRENT_TASK_DEF_ARN}"

# ── Store the last 5 task definition ARNs (written to SSM for manual rollback) ─
_store_task_def_history() {
  local ssm_key="/workload-governor/${CLUSTER}/${SERVICE}/task-def-history"
  echo "==> Persisting task definition history to SSM: ${ssm_key}"

  # Fetch existing list (JSON array), prepend current, keep only 5
  local existing
  existing=$(aws ssm get-parameter --name "$ssm_key" --query "Parameter.Value" \
    --output text 2>/dev/null || echo "[]")

  local updated
  updated=$(python3 -c "
import json, sys
existing = json.loads('''${existing}''') if '''${existing}''' != '' else []
arns = ['${CURRENT_TASK_DEF_ARN}'] + [a for a in existing if a != '${CURRENT_TASK_DEF_ARN}']
print(json.dumps(arns[:5]))
")

  aws ssm put-parameter \
    --name "$ssm_key" \
    --value "$updated" \
    --type String \
    --overwrite \
    --description "Last 5 task definition ARNs for ${CLUSTER}/${SERVICE}" \
    >/dev/null
  echo "==> Stored 5 most recent ARNs in SSM."
}

_store_task_def_history || echo "WARNING: Could not persist task definition history (non-fatal)."

# ── 1. Resolve the target task definition ARN ────────────────────────────────
if [[ -n "$TARGET_TASK_DEF_ARN" ]]; then
  # Explicit ARN supplied — use it directly
  echo "==> Target task definition (explicit): ${TARGET_TASK_DEF_ARN}"
elif [[ -n "$TARGET_SHA" ]]; then
  # Build a new revision from an image SHA
  echo "==> Building new task definition revision from image SHA: ${TARGET_SHA}"

  CURRENT_IMAGE=$(aws ecs describe-task-definition \
    --task-definition "$CURRENT_TASK_DEF_ARN" \
    --query "taskDefinition.containerDefinitions[0].image" --output text)
  IMAGE_REPO="${CURRENT_IMAGE%%:*}"
  NEW_IMAGE="${IMAGE_REPO}:${TARGET_SHA}"

  CURRENT_TD_JSON=$(aws ecs describe-task-definition \
    --task-definition "$CURRENT_TASK_DEF_ARN" \
    --query "taskDefinition" --output json)

  UPDATED_JSON=$(echo "$CURRENT_TD_JSON" | python3 -c "
import json, sys
td = json.load(sys.stdin)
td['containerDefinitions'][0]['image'] = '${NEW_IMAGE}'
for key in ('taskDefinitionArn','revision','status','requiresAttributes',
            'compatibilities','registeredAt','registeredBy'):
    td.pop(key, None)
print(json.dumps(td))
")

  TARGET_TASK_DEF_ARN=$(aws ecs register-task-definition \
    --cli-input-json "$UPDATED_JSON" \
    --query "taskDefinition.taskDefinitionArn" --output text)
  echo "==> Registered: ${TARGET_TASK_DEF_ARN}"
else
  # Default: the previous stable revision (current revision - 1)
  PREV_REVISION=$(( CURRENT_REVISION - 1 ))
  [[ "$PREV_REVISION" -ge 1 ]] || {
    echo "ERROR: Current task definition is revision 1 — no previous revision to roll back to." >&2
    exit 1
  }
  TARGET_TASK_DEF_ARN="${FAMILY}:${PREV_REVISION}"
  echo "==> Defaulting to previous revision: ${TARGET_TASK_DEF_ARN}"
fi

# ── 2. Pre-flight: verify target task definition is ACTIVE ───────────────────
echo "==> Pre-flight check: verifying target task definition status..."
TD_STATUS=$(aws ecs describe-task-definition \
  --task-definition "$TARGET_TASK_DEF_ARN" \
  --query "taskDefinition.status" --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$TD_STATUS" == "NOT_FOUND" ]]; then
  echo "ERROR: Task definition not found: ${TARGET_TASK_DEF_ARN}" >&2
  slack_notify "❌ *Rollback ABORTED* — task definition not found: \`${TARGET_TASK_DEF_ARN}\`  operator: ${OPERATOR}  timestamp: ${TIMESTAMP}"
  exit 1
fi

if [[ "$TD_STATUS" != "ACTIVE" ]]; then
  echo "ERROR: Task definition ${TARGET_TASK_DEF_ARN} is in state '${TD_STATUS}', expected ACTIVE." >&2
  slack_notify "❌ *Rollback ABORTED* — task definition \`${TARGET_TASK_DEF_ARN}\` is \`${TD_STATUS}\`  operator: ${OPERATOR}  timestamp: ${TIMESTAMP}"
  exit 1
fi
echo "==> Pre-flight passed: ${TARGET_TASK_DEF_ARN} is ACTIVE."

# ── 3. Update the ECS service ─────────────────────────────────────────────────
echo "==> Updating ECS service to use task definition: ${TARGET_TASK_DEF_ARN}"
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$TARGET_TASK_DEF_ARN" \
  --force-new-deployment \
  --output text > /dev/null

slack_notify "🔄 *Rollback STARTED* on \`${CLUSTER}/${SERVICE}\`  from: \`${CURRENT_TASK_DEF_ARN}\`  to: \`${TARGET_TASK_DEF_ARN}\`  operator: ${OPERATOR}  timestamp: ${TIMESTAMP}"

# ── 4. Wait for deployment to stabilise (poll every 10 s, timeout configurable) ─
echo "==> Waiting for service to stabilise (timeout: ${ROLLBACK_TIMEOUT}s, polling every 10s)..."
START=$(date +%s)

while true; do
  DEPLOYMENTS_JSON=$(aws ecs describe-services \
    --cluster "$CLUSTER" --services "$SERVICE" \
    --query "services[0].deployments" --output json)

  DEPLOY_COUNT=$(echo "$DEPLOYMENTS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

  READ=$(echo "$DEPLOYMENTS_JSON" | python3 -c "
import json, sys
deps = json.load(sys.stdin)
primary = next((d for d in deps if d['status'] == 'PRIMARY'), None)
if primary:
    print(primary.get('runningCount', 0), primary.get('desiredCount', 0))
else:
    print(0, 0)
")
  RUNNING_COUNT=$(echo "$READ" | awk '{print $1}')
  DESIRED_COUNT=$(echo "$READ" | awk '{print $2}')

  if [[ "$DEPLOY_COUNT" -eq 1 && "$RUNNING_COUNT" -ge "$DESIRED_COUNT" && "$DESIRED_COUNT" -gt 0 ]]; then
    echo "==> Service stable: ${RUNNING_COUNT}/${DESIRED_COUNT} tasks running, 1 active deployment."
    break
  fi

  ELAPSED=$(( $(date +%s) - START ))
  if [[ "$ELAPSED" -ge "$ROLLBACK_TIMEOUT" ]]; then
    echo "ERROR: Timed out waiting for service stability after ${ROLLBACK_TIMEOUT}s." >&2
    slack_notify "⏱ *Rollback TIMED OUT* on \`${CLUSTER}/${SERVICE}\`  target: \`${TARGET_TASK_DEF_ARN}\`  operator: ${OPERATOR}  timestamp: ${TIMESTAMP}"
    exit 2
  fi

  echo "    running: ${RUNNING_COUNT}/${DESIRED_COUNT}, active deployments: ${DEPLOY_COUNT} — waiting (${ELAPSED}s elapsed)..."
  sleep 10
done

# ── 5. Post-rollback smoke tests ──────────────────────────────────────────────
if [[ -n "$HEALTH_URL" ]]; then
  echo "==> Smoke test: GET ${HEALTH_URL}"
  SMOKE_PASSED=false
  for attempt in 1 2 3; do
    HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 15 "$HEALTH_URL" || true)
    if [[ "$HTTP_STATUS" == "200" ]]; then
      echo "==> Smoke test passed (HTTP 200)."
      SMOKE_PASSED=true
      break
    fi
    echo "    Attempt ${attempt}/3: HTTP ${HTTP_STATUS:-no response}"
    [[ "$attempt" -lt 3 ]] && sleep 10
  done

  if [[ "$SMOKE_PASSED" == "false" ]]; then
    echo "ERROR: Post-rollback smoke test failed after 3 attempts." >&2
    slack_notify "⚠️ *Rollback SMOKE TEST FAILED* on \`${CLUSTER}/${SERVICE}\`  target: \`${TARGET_TASK_DEF_ARN}\`  health-url: ${HEALTH_URL}  operator: ${OPERATOR}  timestamp: ${TIMESTAMP}"
    exit 3
  fi
else
  echo "==> No HEALTH_URL set — skipping smoke test."
fi

# ── 6. Success notification ───────────────────────────────────────────────────
echo "==> Rollback complete."
echo "    Cluster/Service : ${CLUSTER} / ${SERVICE}"
echo "    Old (replaced)  : ${CURRENT_TASK_DEF_ARN}"
echo "    New (active)    : ${TARGET_TASK_DEF_ARN}"
echo "    Operator        : ${OPERATOR}"
echo "    Timestamp       : ${TIMESTAMP}"

slack_notify "✅ *Rollback SUCCEEDED* on \`${CLUSTER}/${SERVICE}\`  old: \`${CURRENT_TASK_DEF_ARN}\`  restored: \`${TARGET_TASK_DEF_ARN}\`  operator: ${OPERATOR}  timestamp: ${TIMESTAMP}"

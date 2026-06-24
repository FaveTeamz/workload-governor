#!/usr/bin/env bash
# Testnet smoke tests for WorkloadGovernor — exercises all 13 contract functions.
# Post-deploy step: run after stellar contract deploy + initialize.
#
# Required env vars:
#   CONTRACT_ID      deployed contract address
#   ADMIN_KEY        stellar key name / secret for admin
#   MAINTAINER_KEY   stellar key name / secret for maintainer
#   CONTRIBUTOR_KEY  stellar key name / secret for contributor
# Optional:
#   NETWORK          default: testnet

set -euo pipefail

CONTRACT_ID="${CONTRACT_ID:?CONTRACT_ID is required}"
ADMIN_KEY="${ADMIN_KEY:?ADMIN_KEY is required}"
MAINTAINER_KEY="${MAINTAINER_KEY:?MAINTAINER_KEY is required}"
CONTRIBUTOR_KEY="${CONTRIBUTOR_KEY:?CONTRIBUTOR_KEY is required}"
NETWORK="${NETWORK:-testnet}"

# Derive public addresses from key names
ADMIN_ADDR=$(stellar keys address "$ADMIN_KEY")
MAINTAINER_ADDR=$(stellar keys address "$MAINTAINER_KEY")
CONTRIBUTOR_ADDR=$(stellar keys address "$CONTRIBUTOR_KEY")

ORG_ID="smoke-org-1"
ISSUE_1="smoke-issue-1"
ISSUE_2="smoke-issue-2"

PASS=0
FAIL=0
TOTAL=13

pass() { echo "PASS: $1"; ((PASS++)); }
fail() { echo "FAIL: $1"; ((FAIL++)); }

# invoke <source_key> <fn> [args...]
# Asserts exit 0 and returns stdout.
invoke() {
  local src="$1"; shift
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$src" \
    -- "$@"
}

run() {
  local label="$1"; shift
  if invoke "$@" ; then
    pass "$label"
  else
    fail "$label"
  fi
}

run_assert() {
  local label="$1"
  local expected="$2"
  shift 2
  local actual
  actual=$(invoke "$@") || { fail "$label (invoke failed)"; return; }
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label (expected '$expected', got '$actual')"
  fi
}

echo "=== WorkloadGovernor testnet smoke tests ==="
echo "Contract : $CONTRACT_ID"
echo "Network  : $NETWORK"
echo ""

# 1. initialize
run "1/13 initialize" \
  "$ADMIN_KEY" initialize --admin "$ADMIN_ADDR"

# 2. register_maintainer
run "2/13 register_maintainer" \
  "$ADMIN_KEY" register_maintainer \
    --admin "$ADMIN_ADDR" \
    --maintainer "$MAINTAINER_ADDR" \
    --org_id "$ORG_ID"

# 3. apply_for_issue (issue1)
run "3/13 apply_for_issue(issue1)" \
  "$CONTRIBUTOR_KEY" apply_for_issue \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 4. get_global_application_count → 1
run_assert "4/13 get_global_application_count=1" "1" \
  "$CONTRIBUTOR_KEY" get_global_application_count \
    --contributor "$CONTRIBUTOR_ADDR"

# 5. has_applied → true
run_assert "5/13 has_applied=true" "true" \
  "$CONTRIBUTOR_KEY" has_applied \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 6. extend_application_ttl
run "6/13 extend_application_ttl" \
  "$CONTRIBUTOR_KEY" extend_application_ttl \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 7. assign_issue (issue1)
run "7/13 assign_issue(issue1)" \
  "$MAINTAINER_KEY" assign_issue \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 8. get_org_assignment_count → 1
run_assert "8/13 get_org_assignment_count=1" "1" \
  "$CONTRIBUTOR_KEY" get_org_assignment_count \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID"

# 9. is_assigned → true
run_assert "9/13 is_assigned=true" "true" \
  "$CONTRIBUTOR_KEY" is_assigned \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 10. complete_assignment (issue1)
run "10/13 complete_assignment(issue1)" \
  "$MAINTAINER_KEY" complete_assignment \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 11. apply_for_issue (issue2)
run "11/13 apply_for_issue(issue2)" \
  "$CONTRIBUTOR_KEY" apply_for_issue \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_2"

# 12. assign_issue (issue2)
run "12/13 assign_issue(issue2)" \
  "$MAINTAINER_KEY" assign_issue \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_2"

# 13. revoke_assignment (issue2)
run "13/13 revoke_assignment(issue2)" \
  "$MAINTAINER_KEY" revoke_assignment \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_2"

# --- Cleanup (best-effort, idempotent) ---
echo ""
echo "=== Cleanup ==="
invoke "$CONTRIBUTOR_KEY" withdraw_application \
  --contributor "$CONTRIBUTOR_ADDR" --org_id "$ORG_ID" --issue_id "$ISSUE_1" 2>/dev/null && echo "cleanup: withdrew issue1 app" || true
invoke "$CONTRIBUTOR_KEY" withdraw_application \
  --contributor "$CONTRIBUTOR_ADDR" --org_id "$ORG_ID" --issue_id "$ISSUE_2" 2>/dev/null && echo "cleanup: withdrew issue2 app" || true
invoke "$MAINTAINER_KEY" revoke_assignment \
  --maintainer "$MAINTAINER_ADDR" --contributor "$CONTRIBUTOR_ADDR" --org_id "$ORG_ID" --issue_id "$ISSUE_1" 2>/dev/null && echo "cleanup: revoked issue1 assignment" || true
invoke "$MAINTAINER_KEY" revoke_assignment \
  --maintainer "$MAINTAINER_ADDR" --contributor "$CONTRIBUTOR_ADDR" --org_id "$ORG_ID" --issue_id "$ISSUE_2" 2>/dev/null && echo "cleanup: revoked issue2 assignment" || true

# --- Summary ---
echo ""
echo "=== Summary: $PASS/$TOTAL passed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1

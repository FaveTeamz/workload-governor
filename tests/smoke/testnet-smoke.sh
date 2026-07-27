#!/usr/bin/env bash
# =============================================================================
# Testnet smoke tests for WorkloadGovernor — exercises all contract functions.
# Issue #367: post-deployment verification suite.
#
# Covers every function listed in the README:
#   initialize, register_maintainer, apply_for_issue, withdraw_application,
#   assign_issue, complete_assignment, revoke_assignment,
#   extend_application_ttl, get_global_application_count,
#   get_org_assignment_count, has_applied, is_assigned, check_consistency
#
# Required env vars:
#   CONTRACT_ID      deployed contract address
#   ADMIN_KEY        stellar key name / secret for admin
#   MAINTAINER_KEY   stellar key name / secret for maintainer
#   CONTRIBUTOR_KEY  stellar key name / secret for contributor
# Optional:
#   NETWORK          default: testnet
#   CI_KEY           set to use one key for all roles (CI convenience)
# =============================================================================

set -euo pipefail

CONTRACT_ID="${CONTRACT_ID:?CONTRACT_ID is required}"
NETWORK="${NETWORK:-testnet}"

# CI single-key mode: set CI_KEY to use one key for all roles.
if [[ -n "${CI_KEY:-}" ]]; then
  ADMIN_KEY="$CI_KEY"
  MAINTAINER_KEY="$CI_KEY"
  CONTRIBUTOR_KEY="$CI_KEY"
else
  ADMIN_KEY="${ADMIN_KEY:?ADMIN_KEY or CI_KEY is required}"
  MAINTAINER_KEY="${MAINTAINER_KEY:?MAINTAINER_KEY or CI_KEY is required}"
  CONTRIBUTOR_KEY="${CONTRIBUTOR_KEY:?CONTRIBUTOR_KEY or CI_KEY is required}"
fi

# Derive public addresses from key names
ADMIN_ADDR=$(stellar keys address "$ADMIN_KEY")
MAINTAINER_ADDR=$(stellar keys address "$MAINTAINER_KEY")
CONTRIBUTOR_ADDR=$(stellar keys address "$CONTRIBUTOR_KEY")

ORG_ID="smoke-org-1"
ISSUE_1="smoke-issue-1"
ISSUE_2="smoke-issue-2"
ISSUE_3="smoke-issue-3"   # used for withdraw_application test

PASS=0
FAIL=0
TOTAL=15   # 15 named test steps

pass() { echo "PASS: $1"; ((PASS++)); }
fail() { echo "FAIL: $1"; ((FAIL++)); }

# ---------------------------------------------------------------------------
# invoke <source_key> <fn> [args...]   — asserts exit 0 and returns stdout
# ---------------------------------------------------------------------------
invoke() {
  local src="$1"; shift
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$src" \
    -- "$@"
}

# ---------------------------------------------------------------------------
# run <label> <source_key> <fn> [args...]
# Runs invoke; PASS on exit 0, FAIL on non-zero.
# ---------------------------------------------------------------------------
run() {
  local label="$1"; shift
  if invoke "$@" ; then
    pass "$label"
  else
    fail "$label"
  fi
}

# ---------------------------------------------------------------------------
# run_assert <label> <expected> <source_key> <fn> [args...]
# Runs invoke; compares stdout to expected value.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# run_expect_error <label> <expected_error_code> <source_key> <fn> [args...]
# Expects a non-zero exit code whose stderr contains the error code integer.
# ---------------------------------------------------------------------------
run_expect_error() {
  local label="$1"
  local expected_code="$2"
  shift 2
  local stderr_out
  if stderr_out=$(invoke "$@" 2>&1); then
    fail "$label (expected error $expected_code but invocation succeeded)"
  else
    if echo "$stderr_out" | grep -qE "(Error|error|code)[^0-9]*${expected_code}[^0-9]|HostError.*${expected_code}"; then
      pass "$label"
    else
      fail "$label (expected error code $expected_code, got: $stderr_out)"
    fi
  fi
}

echo "=== WorkloadGovernor testnet smoke tests ==="
echo "Contract : $CONTRACT_ID"
echo "Network  : $NETWORK"
echo "Total    : $TOTAL tests"
echo ""

# ---------------------------------------------------------------------------
# 1/15 initialize
#   On a freshly-deployed contract this succeeds.
#   On a contract already initialized (most testnet runs) it must return
#   error 1 (AlreadyInitialized).  Both outcomes are acceptable here.
# ---------------------------------------------------------------------------
echo -n "Testing 1/15 initialize ... "
if invoke "$ADMIN_KEY" initialize --admin "$ADMIN_ADDR" 2>/dev/null; then
  pass "1/15 initialize (first-time)"
else
  # Check that it failed with error code 1 (AlreadyInitialized)
  ERR_OUT=$(invoke "$ADMIN_KEY" initialize --admin "$ADMIN_ADDR" 2>&1 || true)
  if echo "$ERR_OUT" | grep -qE "(Error|error|code)[^0-9]*1[^0-9]|AlreadyInitialized|HostError.*1"; then
    pass "1/15 initialize (already initialized, error 1 — expected on testnet)"
  else
    fail "1/15 initialize (unexpected error: $ERR_OUT)"
  fi
fi

# 2/15 register_maintainer
run "2/15 register_maintainer" \
  "$ADMIN_KEY" register_maintainer \
    --admin "$ADMIN_ADDR" \
    --maintainer "$MAINTAINER_ADDR" \
    --org_id "$ORG_ID"

# 3/15 apply_for_issue (issue1)
run "3/15 apply_for_issue(issue1)" \
  "$CONTRIBUTOR_KEY" apply_for_issue \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 4/15 get_global_application_count → 1
run_assert "4/15 get_global_application_count=1" "1" \
  "$CONTRIBUTOR_KEY" get_global_application_count \
    --contributor "$CONTRIBUTOR_ADDR"

# 5/15 has_applied → true
run_assert "5/15 has_applied=true" "true" \
  "$CONTRIBUTOR_KEY" has_applied \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 6/15 extend_application_ttl
run "6/15 extend_application_ttl" \
  "$CONTRIBUTOR_KEY" extend_application_ttl \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 7/15 assign_issue (issue1)
run "7/15 assign_issue(issue1)" \
  "$MAINTAINER_KEY" assign_issue \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 8/15 get_org_assignment_count → 1
run_assert "8/15 get_org_assignment_count=1" "1" \
  "$CONTRIBUTOR_KEY" get_org_assignment_count \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID"

# 9/15 is_assigned → true
run_assert "9/15 is_assigned=true" "true" \
  "$CONTRIBUTOR_KEY" is_assigned \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 10/15 complete_assignment (issue1)
run "10/15 complete_assignment(issue1)" \
  "$MAINTAINER_KEY" complete_assignment \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_1"

# 11/15 apply_for_issue (issue2)
run "11/15 apply_for_issue(issue2)" \
  "$CONTRIBUTOR_KEY" apply_for_issue \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_2"

# 12/15 assign_issue (issue2)
run "12/15 assign_issue(issue2)" \
  "$MAINTAINER_KEY" assign_issue \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_2"

# 13/15 revoke_assignment (issue2)
run "13/15 revoke_assignment(issue2)" \
  "$MAINTAINER_KEY" revoke_assignment \
    --maintainer "$MAINTAINER_ADDR" \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_2"

# ---------------------------------------------------------------------------
# 14/15 withdraw_application
#   Apply for issue3, then withdraw it — verifies the full apply→withdraw path.
# ---------------------------------------------------------------------------
echo ""
echo "--- withdraw_application path ---"
if invoke "$CONTRIBUTOR_KEY" apply_for_issue \
    --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_3" 2>/dev/null; then
  # Application created; now withdraw it
  run "14/15 withdraw_application(issue3)" \
    "$CONTRIBUTOR_KEY" withdraw_application \
      --contributor "$CONTRIBUTOR_ADDR" \
      --org_id "$ORG_ID" \
      --issue_id "$ISSUE_3"
else
  fail "14/15 withdraw_application — prerequisite apply_for_issue(issue3) failed"
fi

# ---------------------------------------------------------------------------
# 15/15 check_consistency (read-only diagnostic — must return empty list)
# ---------------------------------------------------------------------------
run_assert "15/15 check_consistency=[]" "[]" \
  "$CONTRIBUTOR_KEY" check_consistency \
    --pairs "[]" \
    --issue_ids "[]"

# ---------------------------------------------------------------------------
# Cleanup (best-effort, idempotent — does not affect PASS/FAIL counters)
# ---------------------------------------------------------------------------
echo ""
echo "=== Cleanup ==="
for issue in "$ISSUE_1" "$ISSUE_2" "$ISSUE_3"; do
  invoke "$CONTRIBUTOR_KEY" withdraw_application \
    --contributor "$CONTRIBUTOR_ADDR" --org_id "$ORG_ID" --issue_id "$issue" \
    2>/dev/null && echo "cleanup: withdrew $issue app" || true
  invoke "$MAINTAINER_KEY" revoke_assignment \
    --maintainer "$MAINTAINER_ADDR" --contributor "$CONTRIBUTOR_ADDR" \
    --org_id "$ORG_ID" --issue_id "$issue" \
    2>/dev/null && echo "cleanup: revoked $issue assignment" || true
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Summary: $PASS/$TOTAL passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1

#!/usr/bin/env bash
# CI happy-path smoke test for WorkloadGovernor.
# Runs automatically after testnet-deploy in contract-ci.yml.
#
# Required env vars:
#   CONTRACT_ID   deployed contract address
#   ADMIN_KEY     stellar key name pre-loaded by CI (default: ci-admin)
# Optional:
#   NETWORK       default: testnet

set -euo pipefail

CONTRACT_ID="${CONTRACT_ID:?CONTRACT_ID is required}"
ADMIN_KEY="${ADMIN_KEY:-ci-admin}"
NETWORK="${NETWORK:-testnet}"

ADMIN_ADDR=$(stellar keys address "$ADMIN_KEY")

# Generate ephemeral maintainer + contributor keys for this run
stellar keys generate ci-maintainer --network "$NETWORK" --fund
stellar keys generate ci-contributor --network "$NETWORK" --fund

MAINTAINER_ADDR=$(stellar keys address ci-maintainer)
CONTRIBUTOR_ADDR=$(stellar keys address ci-contributor)

ORG_ID="ci-smoke-org"
ISSUE_ID="ci-smoke-issue-1"

inv() {
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$1" \
    -- "${@:2}"
}

echo "=== CI smoke test: $CONTRACT_ID ==="

# Step 1 – initialize
inv "$ADMIN_KEY" initialize --admin "$ADMIN_ADDR"

# Step 2 – register maintainer
inv "$ADMIN_KEY" register_maintainer \
  --admin "$ADMIN_ADDR" \
  --maintainer "$MAINTAINER_ADDR" \
  --org_id "$ORG_ID"

# Step 3 – apply for issue
inv ci-contributor apply_for_issue \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"

# Step 4 – assign issue
inv ci-maintainer assign_issue \
  --maintainer "$MAINTAINER_ADDR" \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"

# Step 5 – complete assignment
inv ci-maintainer complete_assignment \
  --maintainer "$MAINTAINER_ADDR" \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"

# Assertions: both counters must be 0 after completion
global=$(inv ci-contributor get_global_application_count --contributor "$CONTRIBUTOR_ADDR")
org=$(inv ci-contributor get_org_assignment_count --contributor "$CONTRIBUTOR_ADDR" --org_id "$ORG_ID")

[[ "$global" == "0" ]] || { echo "FAIL: global_application_count=$global (expected 0)"; exit 1; }
[[ "$org"    == "0" ]] || { echo "FAIL: org_assignment_count=$org (expected 0)"; exit 1; }

echo "=== PASS: all steps complete, counters reset to 0 ==="

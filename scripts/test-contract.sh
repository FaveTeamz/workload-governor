#!/bin/bash
# scripts/test-contract.sh
#
# Smoke-tests the WorkloadGovernor contract against a running Stellar network.
# Used by the upgrade-dryrun CI step and can be run locally against a sandbox.
#
# Environment variables:
#   CONTRACT_ID  — deployed contract ID (required)
#   ADMIN_KEY    — Stellar CLI key name for the admin (default: dryrun-admin)
#   NETWORK      — network name configured in stellar CLI (default: local)
#
# Usage:
#   CONTRACT_ID=CA... ADMIN_KEY=my-key NETWORK=testnet bash scripts/test-contract.sh

set -euo pipefail

CONTRACT_ID="${CONTRACT_ID:?CONTRACT_ID must be set}"
ADMIN_KEY="${ADMIN_KEY:-dryrun-admin}"
NETWORK="${NETWORK:-local}"

ADMIN_ADDR=$(stellar keys address "$ADMIN_KEY")

invoke() {
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    "$@"
}

invoke_source() {
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$ADMIN_KEY" \
    "$@"
}

echo "=== WorkloadGovernor contract smoke tests ==="
echo "Contract:  $CONTRACT_ID"
echo "Network:   $NETWORK"
echo "Admin key: $ADMIN_KEY ($ADMIN_ADDR)"
echo ""

# ── Test 1: initialize ────────────────────────────────────────────────────
echo "1. initialize..."
invoke_source -- initialize --admin "$ADMIN_ADDR"
echo "   ✓ initialized"

# ── Test 2: register_maintainer ───────────────────────────────────────────
echo "2. register_maintainer..."
MAINTAINER_ADDR="$ADMIN_ADDR"   # reuse admin key as maintainer for smoke test
ORG_ID="smoke-org"
invoke_source -- register_maintainer \
  --admin "$ADMIN_ADDR" \
  --maintainer "$MAINTAINER_ADDR" \
  --org_id "$ORG_ID"
echo "   ✓ maintainer registered"

# ── Test 3: get_org_cap (default = 4) ────────────────────────────────────
echo "3. get_org_cap (expect 4)..."
CAP=$(invoke -- get_org_cap --org_id "$ORG_ID")
if [ "$CAP" != "4" ]; then
  echo "   ✗ expected 4, got $CAP"
  exit 1
fi
echo "   ✓ default cap = 4"

# ── Test 4: set_org_cap ───────────────────────────────────────────────────
echo "4. set_org_cap to 6..."
invoke_source -- set_org_cap \
  --maintainer "$MAINTAINER_ADDR" \
  --org_id "$ORG_ID" \
  --new_cap 6
CAP=$(invoke -- get_org_cap --org_id "$ORG_ID")
if [ "$CAP" != "6" ]; then
  echo "   ✗ expected 6, got $CAP"
  exit 1
fi
echo "   ✓ cap = 6"

# ── Test 5: apply_for_issue ───────────────────────────────────────────────
echo "5. apply_for_issue..."
CONTRIBUTOR_ADDR="$ADMIN_ADDR"
ISSUE_ID=1
invoke_source -- apply_for_issue \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"
HAS_APPLIED=$(invoke -- has_applied \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID")
if [ "$HAS_APPLIED" != "true" ]; then
  echo "   ✗ has_applied should be true"
  exit 1
fi
echo "   ✓ application exists"

# ── Test 6: assign_issue ──────────────────────────────────────────────────
echo "6. assign_issue..."
invoke_source -- assign_issue \
  --maintainer "$MAINTAINER_ADDR" \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"
IS_ASSIGNED=$(invoke -- is_assigned \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID")
if [ "$IS_ASSIGNED" != "true" ]; then
  echo "   ✗ is_assigned should be true"
  exit 1
fi
ASGN_COUNT=$(invoke -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID")
if [ "$ASGN_COUNT" != "1" ]; then
  echo "   ✗ assignment count should be 1, got $ASGN_COUNT"
  exit 1
fi
echo "   ✓ assignment exists, count = 1"

# ── Test 7: complete_assignment ───────────────────────────────────────────
echo "7. complete_assignment..."
invoke_source -- complete_assignment \
  --maintainer "$MAINTAINER_ADDR" \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"
IS_ASSIGNED=$(invoke -- is_assigned \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID")
if [ "$IS_ASSIGNED" != "false" ]; then
  echo "   ✗ is_assigned should be false after completion"
  exit 1
fi
echo "   ✓ assignment completed, slot freed"

echo ""
echo "=== All smoke tests passed ✓ ==="

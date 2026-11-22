#!/usr/bin/env bash
# scripts/rotate-admin-key.sh
#
# Automates on-chain admin key rotation for the WorkloadGovernor contract
# (Phases 1–4 of docs/runbooks/admin-key-rotation.md).
#
# What this script does:
#   1. Generates a fresh Ed25519 keypair and funds the new account.
#   2. Calls transfer_admin with dual signatures from both the old and new admin.
#   3. Verifies the new admin is active on-chain (register_maintainer succeeds).
#   4. Verifies the old admin is rejected on-chain (register_maintainer returns #3).
#
# What this script does NOT do:
#   Phase 5 (AWS Secrets Manager update) and Phase 6 (ECS restart) must be run
#   manually or via your CI/CD pipeline. See the full runbook for those steps:
#   docs/runbooks/admin-key-rotation.md
#
# Usage:
#   # Dry run (no on-chain changes):
#   DRY_RUN=1 CONTRACT_ID=CA... OLD_ADMIN_KEY=my-key NETWORK=testnet \
#     bash scripts/rotate-admin-key.sh
#
#   # Live run:
#   CONTRACT_ID=CA... OLD_ADMIN_KEY=my-key NETWORK=testnet \
#     bash scripts/rotate-admin-key.sh
#
#   # Provide an existing new admin key (skip keygen):
#   CONTRACT_ID=CA... OLD_ADMIN_KEY=old-key NEW_ADMIN_KEY=existing-new-key \
#     NETWORK=testnet bash scripts/rotate-admin-key.sh
#
# Required environment variables:
#   CONTRACT_ID     — deployed WorkloadGovernor contract ID
#   OLD_ADMIN_KEY   — Stellar CLI identity name for the current admin
#   NETWORK         — Stellar CLI network name (e.g. testnet, mainnet, local)
#
# Optional environment variables:
#   NEW_ADMIN_KEY   — Stellar CLI identity name for the new admin.
#                     If unset, a name is generated: new-admin-<date>
#   DRY_RUN         — set to 1 to print commands without executing on-chain calls
#   SKIP_FUND       — set to 1 to skip Friendbot funding (mainnet or pre-funded key)
#
# Exit codes:
#   0  all phases completed and verified successfully
#   1  pre-flight argument or environment error
#   2  transfer_admin transaction failed
#   3  post-rotation on-chain verification failed

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

info()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()    { echo -e "  ${YELLOW}!${NC} $*"; }
error()   { echo -e "  ${RED}✗${NC} $*" >&2; }
heading() { echo -e "\n${YELLOW}=== $* ===${NC}"; }

# ── Argument validation ───────────────────────────────────────────────────────
CONTRACT_ID="${CONTRACT_ID:?CONTRACT_ID must be set (deployed WorkloadGovernor contract ID)}"
OLD_ADMIN_KEY="${OLD_ADMIN_KEY:?OLD_ADMIN_KEY must be set (Stellar CLI identity name for current admin)}"
NETWORK="${NETWORK:?NETWORK must be set (e.g. testnet, mainnet, local)}"
NEW_ADMIN_KEY="${NEW_ADMIN_KEY:-new-admin-$(date +%Y%m%d)}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_FUND="${SKIP_FUND:-0}"

# ── Dry-run wrapper ───────────────────────────────────────────────────────────
# In dry-run mode, on-chain commands are printed but not executed.
# Read-only commands (stellar keys address) always execute so we can display
# addresses correctly.
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [DRY RUN] $*"
  else
    "$@"
  fi
}

# ── Print configuration ───────────────────────────────────────────────────────
echo ""
echo "WorkloadGovernor Admin Key Rotation"
echo "===================================="
echo "  Contract ID  : $CONTRACT_ID"
echo "  Network      : $NETWORK"
echo "  Old admin key: $OLD_ADMIN_KEY"
echo "  New admin key: $NEW_ADMIN_KEY"
if [[ "$DRY_RUN" == "1" ]]; then
  echo "  Mode         : DRY RUN (no on-chain transactions will be submitted)"
else
  echo "  Mode         : LIVE"
fi
echo ""

# ── Resolve old admin address ─────────────────────────────────────────────────
OLD_ADMIN_ADDRESS=$(stellar keys address "$OLD_ADMIN_KEY" 2>/dev/null) || {
  error "Could not resolve address for '$OLD_ADMIN_KEY'. Run 'stellar keys list' to verify."
  exit 1
}
info "Old admin address: $OLD_ADMIN_ADDRESS"

# ── Pre-flight: verify old admin is active on chain ───────────────────────────
heading "Pre-flight check"

if [[ "$DRY_RUN" != "1" ]]; then
  PREFLIGHT_OUTPUT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$OLD_ADMIN_KEY" \
    -- register_maintainer \
    --admin "$OLD_ADMIN_ADDRESS" \
    --maintainer "$OLD_ADMIN_ADDRESS" \
    --org_id preflight_check 2>&1) || {
    error "Pre-flight failed: old admin is not recognised on-chain."
    error "Output: $PREFLIGHT_OUTPUT"
    error "Confirm CONTRACT_ID and OLD_ADMIN_KEY are correct, then retry."
    exit 1
  }
  info "Old admin is active on-chain."
else
  warn "Dry run: skipping on-chain pre-flight."
fi

# ── Phase 1: Generate a fresh admin keypair ───────────────────────────────────
heading "Phase 1 — Generate new admin keypair"

# Check if the key already exists in the keystore
if stellar keys address "$NEW_ADMIN_KEY" &>/dev/null; then
  warn "Key '$NEW_ADMIN_KEY' already exists in the keystore. Using existing key."
else
  run stellar keys generate --global "$NEW_ADMIN_KEY" --network "$NETWORK"
  info "Generated key: $NEW_ADMIN_KEY"
fi

# Resolve the new admin address (use a placeholder in dry-run if key doesn't exist)
if [[ "$DRY_RUN" == "1" ]]; then
  NEW_ADMIN_ADDRESS="${NEW_ADMIN_ADDRESS:-<NEW_ADMIN_ADDRESS_PLACEHOLDER>}"
  if stellar keys address "$NEW_ADMIN_KEY" &>/dev/null; then
    NEW_ADMIN_ADDRESS=$(stellar keys address "$NEW_ADMIN_KEY")
  fi
else
  NEW_ADMIN_ADDRESS=$(stellar keys address "$NEW_ADMIN_KEY")
fi

info "New admin address: $NEW_ADMIN_ADDRESS"

# Fund the new account (testnet only unless overridden)
if [[ "$SKIP_FUND" == "1" ]]; then
  warn "SKIP_FUND=1: skipping Friendbot funding. Ensure the new account is funded."
elif [[ "$NETWORK" == "mainnet" ]]; then
  warn "Network is mainnet. Friendbot not available."
  warn "Transfer at least 1 XLM to $NEW_ADMIN_ADDRESS before proceeding."
  echo ""
  read -r -p "Press ENTER once the account is funded, or Ctrl-C to abort: "
else
  echo "  Funding $NEW_ADMIN_ADDRESS via Friendbot..."
  run curl -sf "https://friendbot.stellar.org/?addr=${NEW_ADMIN_ADDRESS}" -o /dev/null
  info "Account funded."
fi

# ── Phase 2: Execute transfer_admin (dual-signature) ─────────────────────────
heading "Phase 2 — transfer_admin (dual-signature)"

echo "  Signing with old admin: $OLD_ADMIN_KEY ($OLD_ADMIN_ADDRESS)"
echo "  Signing with new admin: $NEW_ADMIN_KEY ($NEW_ADMIN_ADDRESS)"
echo ""

if [[ "$DRY_RUN" == "1" ]]; then
  echo "  [DRY RUN] stellar tx new invoke \\"
  echo "    --id $CONTRACT_ID --network $NETWORK \\"
  echo "    -- transfer_admin \\"
  echo "    --current_admin $OLD_ADMIN_ADDRESS \\"
  echo "    --new_admin     $NEW_ADMIN_ADDRESS \\"
  echo "  | stellar tx sign --sign-with-key $OLD_ADMIN_KEY \\"
  echo "  | stellar tx sign --sign-with-key $NEW_ADMIN_KEY \\"
  echo "  | stellar tx send"
else
  TX_OUTPUT=$(stellar tx new invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    -- transfer_admin \
    --current_admin "$OLD_ADMIN_ADDRESS" \
    --new_admin     "$NEW_ADMIN_ADDRESS" \
    | stellar tx sign --sign-with-key "$OLD_ADMIN_KEY" \
    | stellar tx sign --sign-with-key "$NEW_ADMIN_KEY" \
    | stellar tx send 2>&1) || {
    error "transfer_admin transaction failed."
    error "Output: $TX_OUTPUT"
    error "See docs/runbooks/admin-key-rotation.md Phase 2 for recovery steps."
    exit 2
  }
  info "transfer_admin succeeded."
  echo "  Transaction output: $TX_OUTPUT"
fi

# ── Phase 3: Verify the new admin is active ───────────────────────────────────
heading "Phase 3 — Verify new admin is active on-chain"

if [[ "$DRY_RUN" == "1" ]]; then
  warn "Dry run: skipping on-chain verification."
else
  VERIFY_OUTPUT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$NEW_ADMIN_KEY" \
    -- register_maintainer \
    --admin "$NEW_ADMIN_ADDRESS" \
    --maintainer "$NEW_ADMIN_ADDRESS" \
    --org_id rotation_verify 2>&1) || {
    error "New admin verification failed — 'register_maintainer' was rejected."
    error "Output: $VERIFY_OUTPUT"
    error "The transfer may not have been confirmed yet. Wait ~5 s and retry, or"
    error "check the transaction hash in the Stellar explorer."
    exit 3
  }
  info "New admin is active on-chain."
fi

# ── Phase 4: Confirm the old admin is rejected ───────────────────────────────
heading "Phase 4 — Confirm old admin is rejected on-chain"

if [[ "$DRY_RUN" == "1" ]]; then
  warn "Dry run: skipping rejection check."
else
  REJECT_OUTPUT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$OLD_ADMIN_KEY" \
    -- register_maintainer \
    --admin "$OLD_ADMIN_ADDRESS" \
    --maintainer "$OLD_ADMIN_ADDRESS" \
    --org_id should_fail 2>&1) && {
    # If the call SUCCEEDS, the rotation did not take effect — that's the error.
    error "CRITICAL: old admin is still accepted on-chain after transfer."
    error "The rotation may not have been confirmed. Investigate immediately."
    exit 3
  } || true  # expected: command returns non-zero (contract error)

  if echo "$REJECT_OUTPUT" | grep -q "UnauthorizedAdmin\|#3"; then
    info "Old admin correctly rejected with UnauthorizedAdmin (#3)."
  else
    error "Unexpected error from old admin call (expected UnauthorizedAdmin #3)."
    error "Output: $REJECT_OUTPUT"
    exit 3
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
if [[ "$DRY_RUN" == "1" ]]; then
  echo "  Dry run complete — no on-chain changes made."
else
  echo -e "  ${GREEN}On-chain rotation complete.${NC}"
  echo ""
  echo "  Old admin : $OLD_ADMIN_ADDRESS  ← no longer authorised"
  echo "  New admin : $NEW_ADMIN_ADDRESS  ← active"
fi
echo ""
echo "  NEXT STEPS (manual):"
echo "  Phase 5 — Update AWS Secrets Manager secret '${SERVICE_NAME:-workload-governor}-ADMIN_SECRET'"
echo "  Phase 6 — Restart ECS backend service and verify GET /api/health"
echo ""
echo "  Full procedure: docs/runbooks/admin-key-rotation.md"
echo "=============================================="

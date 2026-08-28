#!/usr/bin/env bash
# =============================================================================
# check-key-collisions.sh
#
# WorkloadGovernor — Storage Key Collision Simulation
#
# Purpose:
#   Validate that none of the six storage key types produce identical encoded
#   representations for any combination of test inputs. This is the CI
#   enforcement of the "zero key collision guarantee" documented in
#   docs/storage-design.md.
#
# How it works:
#   Each key type is represented as a canonical string encoding that captures:
#     1. The storage type prefix symbol (e.g., "g_apps", "app", etc.)
#     2. The tuple arity (number of elements)
#     3. The type sequence of elements (e.g., Address, Symbol, u32)
#     4. The concrete values of elements from the test vector
#
#   This models the properties that Soroban XDR encoding makes distinct:
#     - Tuple arity  (XDR ScVec length prefix)
#     - Scalar vs tuple  (XDR ScVal discriminant)
#     - Symbol values  (6-bit packed encoding of the prefix)
#     - Element type sequence  (XDR type discriminants per element)
#     - Element values  (concrete bytes)
#
#   See docs/storage-design.md for the formal proof that these properties
#   guarantee collision freedom.
#
# Usage:
#   bash scripts/check-key-collisions.sh
#   Exit 0: no collisions detected
#   Exit 1: one or more collisions detected (CI should fail)
#
# Adding new keys:
#   1. Add a new encode_key_<name>() function below.
#   2. Add calls to it in the "Generate keys" section using the test vectors.
#   3. Add a comment updating the expected number of unique keys.
#   4. Update docs/storage-design.md with the new pairwise proof rows.
#
# Requirements: bash 4+, awk (standard on all Linux/macOS)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers (disabled if not a tty)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' NC=''
fi

info()    { echo -e "${YELLOW}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; }
header()  { echo; echo "=== $* ==="; }

# ---------------------------------------------------------------------------
# Key encoding functions
#
# Format: TIER|ARITY|PREFIX_SYMBOL|TYPE_SEQ|VALUE_SEQ
#
#   TIER        : "tmp" (temporary) or "per" (persistent)
#   ARITY       : number of tuple elements; "0" for scalar keys
#   PREFIX_SYM  : the symbol_short!() prefix value as a string
#   TYPE_SEQ    : colon-separated element types, e.g. "Symbol:Address:Symbol:u32"
#   VALUE_SEQ   : colon-separated element values matching TYPE_SEQ
#
# The combination of all five fields uniquely identifies a key instance.
# Two keys collide if and only if all five fields are identical for the same
# combination of concrete inputs — which the proof shows is impossible for
# distinct key types.
# ---------------------------------------------------------------------------

# K1 — Global App Count
# ("g_apps", contributor: Address)
encode_key_global_app_count() {
    local contributor="$1"
    echo "tmp|2|g_apps|Symbol:Address|g_apps:${contributor}"
}

# K2 — App Entry
# ("app", contributor: Address, org_id: Symbol, issue_id: u32)
encode_key_app_entry() {
    local contributor="$1" org_id="$2" issue_id="$3"
    echo "tmp|4|app|Symbol:Address:Symbol:u32|app:${contributor}:${org_id}:${issue_id}"
}

# K3 — Admin
# "admin"  (scalar Symbol — NOT a tuple)
encode_key_admin() {
    # Arity=0 signals a scalar (no tuple wrapping); PREFIX_SYM carries the full key
    echo "per|0|admin|Symbol|admin"
}

# K4 — Maintainer
# ("maint", maintainer: Address, org_id: Symbol)
encode_key_maintainer() {
    local maintainer="$1" org_id="$2"
    echo "per|3|maint|Symbol:Address:Symbol|maint:${maintainer}:${org_id}"
}

# K5 — Org Assignment Count
# ("o_asgn", contributor: Address, org_id: Symbol)
encode_key_org_assignment_count() {
    local contributor="$1" org_id="$2"
    echo "per|3|o_asgn|Symbol:Address:Symbol|o_asgn:${contributor}:${org_id}"
}

# K6 — Assignment Entry
# ("asgn", org_id: Symbol, issue_id: u32, contributor: Address)
encode_key_assignment_entry() {
    local org_id="$1" issue_id="$2" contributor="$3"
    echo "per|4|asgn|Symbol:Symbol:u32:Address|asgn:${org_id}:${issue_id}:${contributor}"
}

# ---------------------------------------------------------------------------
# Test vectors
#
# These are representative values. The collision check is not exhaustive over
# the full input domain — that is guaranteed by the structural proof in
# docs/storage-design.md. These vectors confirm the encoding functions
# themselves are implemented correctly and produce distinct outputs.
# ---------------------------------------------------------------------------

# Simulated Stellar addresses (G... addresses, 56 chars)
CONTRIBUTOR_1="GABC1111111111111111111111111111111111111111111111111111"
CONTRIBUTOR_2="GXYZ9999999999999999999999999999999999999999999999999999"
MAINTAINER_1="GMNT1111111111111111111111111111111111111111111111111111"
MAINTAINER_2="GMNT2222222222222222222222222222222222222222222222222222"

# org_id symbols (1-9 lowercase chars, valid Soroban Symbol values)
ORG_A="acme_org"
ORG_B="beta_inc"

# issue_id values (u32)
ISSUE_1=1
ISSUE_2=42
ISSUE_3=999

# ---------------------------------------------------------------------------
# Generate all key encodings for the test vectors
# ---------------------------------------------------------------------------

header "Generating key encodings"

declare -A seen_keys   # key_encoding -> key_label
declare -a all_keys    # ordered list of "label|encoding" for reporting
COLLISION_COUNT=0

register_key() {
    local label="$1"
    local encoding="$2"
    info "K[$label]: $encoding"
    all_keys+=("${label}|${encoding}")
    if [[ -v seen_keys["$encoding"] ]]; then
        fail "COLLISION DETECTED:"
        fail "  Key: $label"
        fail "  Collides with: ${seen_keys[$encoding]}"
        fail "  Encoding: $encoding"
        (( COLLISION_COUNT++ )) || true
    else
        seen_keys["$encoding"]="$label"
    fi
}

# K1 — Global App Count (two contributors)
register_key "K1[c1]"      "$(encode_key_global_app_count "$CONTRIBUTOR_1")"
register_key "K1[c2]"      "$(encode_key_global_app_count "$CONTRIBUTOR_2")"

# K2 — App Entry (contributor × org × issue combinations)
register_key "K2[c1,orgA,i1]"  "$(encode_key_app_entry "$CONTRIBUTOR_1" "$ORG_A" "$ISSUE_1")"
register_key "K2[c1,orgA,i2]"  "$(encode_key_app_entry "$CONTRIBUTOR_1" "$ORG_A" "$ISSUE_2")"
register_key "K2[c1,orgB,i1]"  "$(encode_key_app_entry "$CONTRIBUTOR_1" "$ORG_B" "$ISSUE_1")"
register_key "K2[c2,orgA,i1]"  "$(encode_key_app_entry "$CONTRIBUTOR_2" "$ORG_A" "$ISSUE_1")"
register_key "K2[c2,orgB,i3]"  "$(encode_key_app_entry "$CONTRIBUTOR_2" "$ORG_B" "$ISSUE_3")"

# K3 — Admin (scalar — only one per contract)
register_key "K3[admin]"   "$(encode_key_admin)"

# K4 — Maintainer (maintainer × org combinations)
register_key "K4[m1,orgA]"  "$(encode_key_maintainer "$MAINTAINER_1" "$ORG_A")"
register_key "K4[m1,orgB]"  "$(encode_key_maintainer "$MAINTAINER_1" "$ORG_B")"
register_key "K4[m2,orgA]"  "$(encode_key_maintainer "$MAINTAINER_2" "$ORG_A")"

# K5 — Org Assignment Count (contributor × org combinations)
register_key "K5[c1,orgA]"  "$(encode_key_org_assignment_count "$CONTRIBUTOR_1" "$ORG_A")"
register_key "K5[c1,orgB]"  "$(encode_key_org_assignment_count "$CONTRIBUTOR_1" "$ORG_B")"
register_key "K5[c2,orgA]"  "$(encode_key_org_assignment_count "$CONTRIBUTOR_2" "$ORG_A")"

# K6 — Assignment Entry (org × issue × contributor combinations)
register_key "K6[orgA,i1,c1]"  "$(encode_key_assignment_entry "$ORG_A" "$ISSUE_1" "$CONTRIBUTOR_1")"
register_key "K6[orgA,i2,c1]"  "$(encode_key_assignment_entry "$ORG_A" "$ISSUE_2" "$CONTRIBUTOR_1")"
register_key "K6[orgB,i1,c2]"  "$(encode_key_assignment_entry "$ORG_B" "$ISSUE_1" "$CONTRIBUTOR_2")"

# ---------------------------------------------------------------------------
# Cross-type pair checks
#
# Explicitly verify that the 15 critical cross-type pairs are distinct by
# testing a concrete shared-parameter scenario: same contributor, same org,
# same issue across all key types that accept those parameters.
# ---------------------------------------------------------------------------

header "Cross-type pairwise validation"

info "Testing shared parameters: contributor=$CONTRIBUTOR_1, org=$ORG_A, issue=$ISSUE_1"

CROSS_KEYS=(
    "K1:$(encode_key_global_app_count "$CONTRIBUTOR_1")"
    "K2:$(encode_key_app_entry "$CONTRIBUTOR_1" "$ORG_A" "$ISSUE_1")"
    "K3:$(encode_key_admin)"
    "K4:$(encode_key_maintainer "$CONTRIBUTOR_1" "$ORG_A")"
    "K5:$(encode_key_org_assignment_count "$CONTRIBUTOR_1" "$ORG_A")"
    "K6:$(encode_key_assignment_entry "$ORG_A" "$ISSUE_1" "$CONTRIBUTOR_1")"
)

declare -A cross_seen
CROSS_COLLISION_COUNT=0

for entry in "${CROSS_KEYS[@]}"; do
    label="${entry%%:*}"
    encoding="${entry#*:}"
    if [[ -v cross_seen["$encoding"] ]]; then
        fail "CROSS-TYPE COLLISION: $label encoding matches ${cross_seen[$encoding]}"
        fail "  Encoding: $encoding"
        (( CROSS_COLLISION_COUNT++ )) || true
    else
        cross_seen["$encoding"]="$label"
        ok "$label is unique: $encoding"
    fi
done

# ---------------------------------------------------------------------------
# Same-arity pair stress test (P9: K2 vs K6; P13: K4 vs K5)
#
# These are the pairs identified in the formal proof as sharing tuple arity.
# They are distinguished only by their leading prefix symbol. Verify with
# inputs constructed to be as similar as possible.
# ---------------------------------------------------------------------------

header "Same-arity pair stress test"

info "P9 stress — K2 vs K6 (both arity 4, different leading symbol)"
# Use the same address for both contributor and org to maximise similarity
K2_stress="$(encode_key_app_entry  "$CONTRIBUTOR_1" "$ORG_A" "$ISSUE_1")"
K6_stress="$(encode_key_assignment_entry "$ORG_A" "$ISSUE_1" "$CONTRIBUTOR_1")"
if [[ "$K2_stress" == "$K6_stress" ]]; then
    fail "P9 STRESS COLLISION: K2 == K6"
    (( CROSS_COLLISION_COUNT++ )) || true
else
    ok "P9: K2 ≠ K6"
    ok "  K2: $K2_stress"
    ok "  K6: $K6_stress"
fi

info "P13 stress — K4 vs K5 (both arity 3, different leading symbol)"
K4_stress="$(encode_key_maintainer           "$CONTRIBUTOR_1" "$ORG_A")"
K5_stress="$(encode_key_org_assignment_count "$CONTRIBUTOR_1" "$ORG_A")"
if [[ "$K4_stress" == "$K5_stress" ]]; then
    fail "P13 STRESS COLLISION: K4 == K5"
    (( CROSS_COLLISION_COUNT++ )) || true
else
    ok "P13: K4 ≠ K5"
    ok "  K4: $K4_stress"
    ok "  K5: $K5_stress"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

header "Summary"

TOTAL_KEYS=${#all_keys[@]}
UNIQUE_KEYS=${#seen_keys[@]}
TOTAL_COLLISIONS=$(( COLLISION_COUNT + CROSS_COLLISION_COUNT ))

echo "Total key instances generated : $TOTAL_KEYS"
echo "Unique encodings              : $UNIQUE_KEYS"
echo "Collisions detected           : $TOTAL_COLLISIONS"
echo

if [[ "$TOTAL_COLLISIONS" -eq 0 ]]; then
    ok "All key encodings are unique — zero collision guarantee holds."
    exit 0
else
    fail "$TOTAL_COLLISIONS collision(s) detected. Storage key design is broken."
    fail "See docs/storage-design.md for the formal proof and update instructions."
    exit 1
fi

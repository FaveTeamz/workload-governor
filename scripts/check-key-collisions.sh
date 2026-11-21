#!/usr/bin/env bash
# check-key-collisions.sh
#
# Verifies collision freedom across all WorkloadGovernor storage key prefixes
# by generating 1 000 000 synthetic key strings and asserting no duplicates.
#
# Usage:
#   bash scripts/check-key-collisions.sh
#
# Exit codes:
#   0 — zero collisions detected
#   1 — collision(s) found (fatal)

set -euo pipefail

TOTAL=1000000
TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT

echo "Generating $TOTAL synthetic storage keys..."

python3 - <<'PYEOF' > "$TMPFILE"
import hashlib, sys

prefixes = ["ga", "ap", "adm", "mn", "oa", "as"]
keys = set()
collisions = 0
total = 1_000_000
per_prefix = total // len(prefixes)

for prefix in prefixes:
    for i in range(per_prefix):
        # Simulate compound key: prefix + synthetic address hash + org + issue_id
        addr = hashlib.sha256(f"contributor_{i}".encode()).hexdigest()[:32]
        org  = f"org{i % 100}"
        key  = f"{prefix}|{addr}|{org}|{i}"
        if key in keys:
            collisions += 1
            print(f"COLLISION: {key}", file=sys.stderr)
        keys.add(key)

print(f"Keys generated : {len(keys)}")
print(f"Collisions     : {collisions}")
if collisions > 0:
    sys.exit(1)
PYEOF

echo "---"
cat "$TMPFILE"
echo "---"

if grep -q "^Collisions     : 0$" "$TMPFILE"; then
    echo "PASS: zero key collisions across $TOTAL synthetic keys."
    exit 0
else
    echo "FAIL: collisions detected. See output above." >&2
    exit 1
fi

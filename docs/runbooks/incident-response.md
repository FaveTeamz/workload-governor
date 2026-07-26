# Runbook: Incident Response

What to do when a bug is discovered in a deployed WorkloadGovernor contract.

> **Pause strategy**: Soroban contracts have no built-in pause mechanism. The current mitigation is to upgrade to a "frozen" WASM that rejects all state-changing calls until a fix is deployed. See step 3.

## Severity Levels

| Level | Definition | Response time |
|-------|------------|--------------|
| P0 | Funds at risk / state corruption in progress | Immediate |
| P1 | Incorrect cap enforcement / data inconsistency | < 1 hour |
| P2 | UI/API bug with no on-chain impact | Next business day |

---

## Steps

### 1. Confirm the incident

```bash
# Query the contract state for the affected contributor / issue
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- has_applied \
  --contributor "$AFFECTED_CONTRIBUTOR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"
# Note the actual output vs expected output in your incident report.
```

Capture the full transaction hash from the Stellar Explorer:
`https://stellar.expert/explorer/testnet/tx/<TX_HASH>`

### 2. Notify stakeholders

- Post in `#incidents` Slack channel with severity, affected contract ID, and initial findings.
- Open a GitHub issue tagged `incident` and link this runbook.
- If P0: page on-call admin immediately.

### 3. Freeze the contract (P0/P1 only)

Upload a "frozen" WASM that panics on every state-changing function with `NotInitialized` (error 2). This halts new state changes while preserving existing storage.

```bash
# Build the frozen WASM from the `freeze` feature flag (add to Cargo.toml if not present):
cargo build --features freeze --target wasm32v1-none --release
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network testnet \
  --source "$ADMIN_SECRET"
export FREEZE_HASH=<output>

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "$FREEZE_HASH"
# Expected output: null
# All subsequent state-changing calls will now return NotInitialized (error 2).
```

### 4. Develop and test the fix

```bash
# Work on a fix branch
git checkout -b fix/incident-<date>

# After fixing, run the full test suite
cargo test --features testutils
# Expected output: test result: ok. N passed; 0 failed

# Run the smoke tests against testnet after deploying the fix there
bash tests/smoke/testnet-smoke.sh
```

### 5. Deploy the fix

Follow [contract-upgrade.md](./contract-upgrade.md) to build, upload, and upgrade to the fixed WASM.

### 6. Verify state integrity

```bash
# Spot-check key storage invariants for the affected accounts
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count --contributor "$AFFECTED_CONTRIBUTOR"

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count \
  --contributor "$AFFECTED_CONTRIBUTOR" --org_id "$ORG_ID"
```

Compare against the pre-incident snapshot if available.

### 7. Close the incident

- Update the GitHub issue with root cause, timeline, fix summary, and any follow-up items.
- Post a post-mortem in `#incidents` within 48 hours (P0/P1).
- Add a regression test for the bug to `src/test.rs`.

---

## Useful Commands

```bash
# List recent events for the contract
stellar events \
  --id "$CONTRACT_ID" \
  --network testnet \
  --count 50

# Check contract WASM hash currently deployed
stellar contract info \
  --id "$CONTRACT_ID" \
  --network testnet
```

---

## Contacts

| Role | Contact |
|------|---------|
| On-call admin | See PagerDuty rotation |
| Stellar network status | https://status.stellar.org |
| Stellar Discord | https://discord.gg/stellar |

---

## Incident Type: CounterInconsistency (Error 13)

**Severity:** P1 — data inconsistency; no funds at risk, but `revoke_assignment` will revert for affected pairs until remediated.

**Error code:** `13` (`ContractError::CounterInconsistency`)

**When it fires:** `revoke_assignment` reads `get_org_assignment_count` and finds `0` while an `("asgn", …)` sentinel is still present in storage. This means the counter and the sentinel are out of sync.

---

### Detection

#### Step 1 — Identify affected contributors via event history

Query all `assigned` events to build the candidate list of `(contributor, org_id)` pairs that have ever been assigned:

```bash
# Fetch the last 200 events for the contract
stellar events \
  --id "$CONTRACT_ID" \
  --network testnet \
  --count 200 \
  --output json \
  | jq '[.[] | select(.topic[0] == "assigned") | {contributor: .body[0], org_id: .body[2]}]' \
  | sort | uniq > candidates.json

cat candidates.json
# [{"contributor":"GAB...","org_id":"my_org"}, ...]
```

#### Step 2 — Check counters for each candidate pair

For each pair from step 1:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR" \
  --org_id "$ORG_ID"
# Expected: ≥ 1 if any assignment sentinels exist.
# Actual 0 with known live assignments → CounterInconsistency confirmed.
```

#### Step 3 — Use `check_consistency()` for batch detection

Pass all candidate pairs and the known issue IDs in a single read-only call:

```bash
# Build the pairs and issue_ids arguments from your event index, then:
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- check_consistency \
  --pairs '[["GAB...contributor","my_org"],["GCD...contributor2","other_org"]]' \
  --issue_ids '[1,2,3,4,5,10,42]'
# Output: list of inconsistent (contributor, org_id) pairs.
# Empty list means no inconsistency detected for the probed pairs.
```

> `check_consistency` is a read-only function — it never modifies state. Run it as many times as needed.

#### Step 4 — Verify specific sentinels

For each flagged pair, confirm which issue IDs have orphan sentinels:

```bash
# For each issue_id you suspect:
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- is_assigned \
  --contributor "$CONTRIBUTOR" \
  --org_id "$ORG_ID" \
  --issue_id "$ISSUE_ID"
# true  → orphan sentinel (counter=0 but entry exists)
# false → no sentinel
```

---

### Remediation

The fix is to rebuild the counter from the sentinels. Because Soroban storage cannot be scanned directly, you must know the complete set of issue IDs for each affected pair (from your off-chain event index).

#### Option A — Counter rebuild via admin migration call (recommended)

Write a one-off migration transaction that sets the counter to the correct value:

```bash
# Count the number of live sentinels for this pair manually:
LIVE_COUNT=0
for ISSUE_ID in $KNOWN_ISSUE_IDS; do
  RESULT=$(stellar contract invoke \
    --id "$CONTRACT_ID" --network testnet \
    -- is_assigned \
    --contributor "$CONTRIBUTOR" \
    --org_id "$ORG_ID" \
    --issue_id "$ISSUE_ID")
  if [ "$RESULT" = "true" ]; then
    LIVE_COUNT=$((LIVE_COUNT + 1))
  fi
done
echo "True assignment count: $LIVE_COUNT"
```

Then invoke the counter-repair function (deploy a patched WASM with a `repair_counter` admin function if one is not available in the current version):

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$ADMIN_SECRET" \
  -- repair_counter \
  --contributor "$CONTRIBUTOR" \
  --org_id "$ORG_ID" \
  --correct_count "$LIVE_COUNT"
```

After the repair, verify:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR" --org_id "$ORG_ID"
# Expected: $LIVE_COUNT
```

And confirm `check_consistency` no longer flags the pair:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- check_consistency \
  --pairs '[["'$CONTRIBUTOR'","'$ORG_ID'"]]' \
  --issue_ids "[$KNOWN_ISSUE_IDS_JSON]"
# Expected: [] (empty)
```

#### Option B — Remove orphan sentinels

If the sentinels are stale (the contributor's work is actually not active), remove them instead of fixing the counter:

```bash
# A maintainer can call revoke_assignment — but it panics with CounterInconsistency
# when counter=0. Instead, deploy a patched WASM with a force_remove_sentinel admin
# function, or use Option A to set the counter to the correct value first, then
# call revoke_assignment normally.
```

---

### Prevention

Three layers prevent this from recurring:

**1. Debug assertions in the contract (src/lib.rs)**

`assign_issue` and `complete_assignment` both contain `#[cfg(debug_assertions)]` blocks that call `panic_with_error!(env, ContractError::CounterInconsistency)` if the counter and sentinel disagree immediately after a write. These assertions fire in test builds and catch regressions before deployment.

**2. `check_consistency()` in CI smoke tests**

Add a `check_consistency` call to `tests/smoke/testnet-smoke.sh` after every upgrade to confirm no corruption was introduced:

```bash
# Add to testnet-smoke.sh after the smoke test calls:
RESULT=$(stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- check_consistency \
  --pairs "[...]" \
  --issue_ids "[...]")
if [ "$RESULT" != "[]" ]; then
  echo "CounterInconsistency detected after upgrade: $RESULT"
  exit 1
fi
```

**3. Dry-run upgrade step**

The `upgrade-dryrun` CI job runs the full test suite (including the debug-assertions build) on every PR. Any migration script or storage change that would produce a mismatch is caught in CI before merging. See `docs/runbooks/contract-upgrade.md` step 0.

---

### Post-Incident Checklist

- [ ] All affected `(contributor, org_id)` pairs identified via `check_consistency`.
- [ ] Each pair's true sentinel count verified manually.
- [ ] Counter rebuilt to match sentinel count via migration call.
- [ ] `check_consistency` returns empty for all affected pairs after repair.
- [ ] Root cause identified (which script or operation zeroed the counter).
- [ ] Regression test added to `src/test.rs` covering the corruption scenario.
- [ ] Migration script that caused the issue fixed or removed.
- [ ] Post-mortem filed in `#incidents` within 48 hours (P1).

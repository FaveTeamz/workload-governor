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

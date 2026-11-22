# Mainnet Deployment Checklist

> **Purpose:** Ensure every safety gate is verified before deploying or upgrading the WorkloadGovernor contract on Stellar mainnet. Complete this checklist in order and obtain the required sign-offs before proceeding.
>
> **Related runbook:** [contract-upgrade.md](./contract-upgrade.md) — technical CLI steps for the upgrade itself.

---

## Pre-Deployment Gates

All items below **must** be ✅ before the deployment window opens. Do not proceed if any item is unchecked.

- [ ] **Mutation score ≥ 90%** — run `cargo test --features testutils` followed by `node scripts/mutation-report.js` and confirm the caught-mutations percentage is at or above 90%.
- [ ] **All unit and property-based tests pass** on the current commit — `cargo test --features testutils` exits zero.
- [ ] **All E2E smoke tests pass on testnet** — `./tests/smoke/testnet-smoke.sh` exits zero with a clean contract deployed to testnet.
- [ ] **Binary size < 20 KB after optimize** — see [Deployment Steps §3](#3-verify-binary-size).
- [ ] **Admin key backed up** — the admin keypair is stored in the secrets manager, a restore drill has been performed in the last 30 days, and the test restore succeeded.
- [ ] **At least 2 team member reviews** on the PR — confirmed in GitHub (required status checks enforce this).
- [ ] **`CHANGELOG.md` updated** with the new version entry and release date.
- [ ] **No outstanding `FIXME` or `TODO` in `src/lib.rs`** — `grep -n 'FIXME\|TODO' src/lib.rs` returns no output.
- [ ] **Security checklist reviewed** — [docs/security-checklist.md](../security-checklist.md) has been walked through for this release.
- [ ] **`config/contracts.json` points to the correct testnet address** for the final staging smoke test.

---

## Deployment Steps

### 1. Build the contract

```bash
stellar contract build
# Expected: "Finished release [optimized] target(s)"
```

### 2. Optimise the WASM

```bash
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm
# Expected: "Saved contract to …workload_governor.optimized.wasm"
```

### 3. Verify binary size

```bash
wc -c < target/wasm32v1-none/release/workload_governor.optimized.wasm
# Must print a number less than 20480 (20 KB).
# If the size is ≥ 20 KB, stop — do not proceed until the binary is smaller.
```

### 4. Upload WASM to mainnet

```bash
stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source "$ADMIN_SECRET"
# Output: 64-character hex WASM hash
export NEW_WASM_HASH=<output from above>
echo "WASM hash: $NEW_WASM_HASH"   # record this in the deployment PR
```

### 5. Call `upgrade` on the contract

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source "$ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "$NEW_WASM_HASH"
# Expected output: null
# Any error → stop and follow the Rollback Procedure below.
```

### 6. Verify initialisation

```bash
# Check the contract is already initialised by reading a counter.
# A successful response (even "0") confirms the contract is live and responsive.
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  -- get_global_application_count \
  --contributor "$ADMIN_PUBLIC"
# Expected output: "0" or an existing count.
```

#### First-time deployment only

If this is the very first deployment (no prior `initialize` call), run:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source "$ADMIN_SECRET" \
  -- initialize \
  --admin "$ADMIN_PUBLIC"
# Expected output: null
```

### 7. Update backend configuration

Update `config/contracts.json` with the new mainnet contract ID if it changed (new deployment, not an upgrade):

```json
{
  "mainnet": "<NEW_CONTRACT_ID>",
  "testnet": "<TESTNET_CONTRACT_ID>"
}
```

Redeploy the backend service so it picks up the updated `CONTRACT_ID` environment variable.

---

## Post-Deployment Verification

- [ ] **Mainnet smoke test** — call `has_applied` with a known contributor address and confirm the response is valid JSON.
  ```bash
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network mainnet \
    -- has_applied \
    --contributor "$KNOWN_CONTRIBUTOR" \
    --org_id "test-org" \
    --issue_id 1
  # Expected: "false"
  ```
- [ ] **Event emission verified** — check the Stellar block explorer ([stellar.expert/explorer/public](https://stellar.expert/explorer/public)) for contract events emitted by the upgrade transaction hash.
- [ ] **Backend health endpoint** returns `{ "status": "ok" }`:
  ```bash
  curl -sf https://<api-domain>/health | jq .
  ```
- [ ] **Backend `CONTRACT_ID` env var updated** and ECS service redeployed (confirm task definition revision bumped).
- [ ] **30-minute monitoring window** — watch CloudWatch dashboard for error rate and P99 latency. Alarm thresholds: error rate < 0.1%, P99 < 500 ms.
- [ ] **Git tag pushed**:
  ```bash
  git tag mainnet-v<version>
  git push origin mainnet-v<version>
  ```

---

## Rollback Procedure

If any post-deployment check fails or a critical bug is found, revert to the previous WASM immediately.

### Step 1 — retrieve the previous WASM

Option A — from the previous git tag:
```bash
git checkout mainnet-v<previous-version>
stellar contract build
stellar contract optimize --wasm target/wasm32v1-none/release/workload_governor.wasm
```

Option B — from the deployment log (if the previous WASM hash was recorded):
```bash
export PREVIOUS_WASM_HASH=<recorded hash>
```

### Step 2 — upload the previous WASM (if using Option A)

```bash
stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source "$ADMIN_SECRET"
export PREVIOUS_WASM_HASH=<output>
```

### Step 3 — call `upgrade` with the previous hash

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source "$ADMIN_SECRET" \
  -- upgrade \
  --new_wasm_hash "$PREVIOUS_WASM_HASH"
# Expected output: null
```

> **Note:** All on-chain storage is preserved across upgrades. No data migration is required.

### Step 4 — verify rollback

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  -- get_global_application_count \
  --contributor "$ADMIN_PUBLIC"
# Expected: valid count
```

### Step 5 — restore backend configuration

Revert `config/contracts.json` to the previous values and redeploy the backend service.

### Step 6 — file an incident report

Open a post-mortem issue within 24 hours of the rollback. Include: timeline, root cause, impact, and corrective actions.

---

## Sign-off

Both reviewers must sign off before the deployment window is opened. Signatures are initials or GitHub usernames.

| Reviewer | Role | Date (UTC) | Signature |
|---|---|---|---|
| | | | |
| | | | |

---

## References

- [Contract Upgrade Runbook](./contract-upgrade.md)
- [Admin Key Rotation Runbook](./admin-key-rotation.md)
- [Incident Response Runbook](./incident-response.md)
- [Security Checklist](../security-checklist.md)
- [Error Reference](../error-reference.md)

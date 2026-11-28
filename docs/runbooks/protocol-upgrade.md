# Runbook: Stellar Network Protocol Upgrade Handling

This operational runbook defines the end-to-end procedure for preparing, verifying, executing, and safeguarding **WorkloadGovernor** smart contracts, event indexers, and backend services across a Stellar / Soroban network protocol upgrade.

---

## 1. Overview & Impact Analysis

Stellar network protocol upgrades (voted on by validators) can introduce changes that directly affect Soroban smart contracts and off-chain indexing services:

| Area | Potential Breaking / Behavioral Change | Affected Component |
|---|---|---|
| **Soroban Environment Interface (`soroban-env-host`)** | New host functions, deprecated host imports, or stricter WASM validation rules | `src/lib.rs`, compiled `.wasm` binary |
| **XDR Schema (`stellar-xdr`)** | Updated `ScVal`, `DiagnosticEvent`, `TransactionMetaV3/V4`, or ledger header definitions | `src/eventIndexer.ts`, `src/xdrVerifier.ts`, `@stellar/stellar-sdk` |
| **Resource Cost Models & Limits** | Adjusted CPU instructions, memory bytes, read/write ledger entry limits, or rent fee rates | Contract invocations (`apply_for_issue`, `assign_issue`, `get_contributor_snapshot`) |
| **State Archival & TTL Semantics** | Changes to minimum/maximum temporary or persistent entry TTL extension bounds | `src/storage.rs`, `extend_application_ttl` |

---

## 2. Pre-Upgrade Timeline & Preparation Checklist

Use the [SDF protocol upgrade calendar](https://stellar.org/protocol-upgrades) and the linked release guide to track the Testnet validator upgrade and Mainnet vote in UTC. Subscribe to the Stellar Developer Discord announcements for schedule changes and check whether a Testnet reset is planned. Assign an incident lead, an RPC and indexer owner, and a contract admin before the rehearsal.

Protocol 21 is a precedent for rehearsing TTL and VM resource costs. Protocol 22 added constructors and BLS12-381 host functions, so check existing contracts as well as any candidate WASM that uses new features. The SDF calendar records both rollouts.

- [ ] **Track SDF Protocol Upgrade Schedule**: Record the target protocol version (e.g., Protocol $N$), Testnet upgrade timestamp, and Mainnet vote timestamp.
- [ ] **Verify RPC & Horizon Provider Readiness**: Confirm that Horizon (`HORIZON_URL`) and Soroban RPC (`SOROBAN_RPC_URL`) providers are running Stellar Core and Soroban RPC builds compatible with Protocol $N$.
- [ ] **Pin Baseline Artifacts**: Record the currently deployed Mainnet `CONTRACT_ID`, active on-chain WASM SHA-256 hash (`PREVIOUS_WASM_HASH`), and current backend container image digest.
- [ ] **Snapshot Indexer Checkpoints**: Confirm `indexer_checkpoints` has an up-to-date `last_ledger` record before the upgrade window.
- [ ] Confirm a secondary RPC provider serves the same network and protocol and retains the ledger range needed to resume indexing.
- [ ] Capture baseline view results, simulation fees and resource usage, confirmation latency, and indexer lag. Agree on acceptable deviations and record the observation window in the change ticket.
- [ ] Require passing Testnet evidence, a compatible fallback application release, and an on-call handoff before approving the Mainnet rollout.

---

## 3. Testnet Verification Steps

As soon as Stellar Testnet upgrades to the new protocol version, execute the following verification sequence before any Mainnet changes.

### Step 3.1 — Confirm Testnet Protocol Version & RPC Health

```bash
TESTNET_HORIZON_URL="https://horizon-testnet.stellar.org"
TESTNET_RPC_URL="https://soroban-testnet.stellar.org"

# 1. Verify Horizon core & current protocol version
curl -s "${TESTNET_HORIZON_URL}/" | jq '{
  horizon_version: .horizon_version,
  core_version: .core_version,
  current_protocol_version: .current_protocol_version,
  supported_protocol_version: .supported_protocol_version,
  history_latest_ledger: .history_latest_ledger
}'

# 2. Verify Soroban RPC version and protocol compatibility
curl -s -X POST "${TESTNET_RPC_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getVersionInfo"
  }' | jq .
```

### Step 3.2 — Verify Existing Deployed Contract on Upgraded Testnet

Test whether the existing compiled WASM continues to execute cleanly under the new protocol cost model and host environment:

```bash
# 1. Read-only smoke checks
stellar contract invoke \
  --id "${TESTNET_CONTRACT_ID}" \
  --network testnet \
  -- get_global_application_count \
  --contributor "${TEST_CONTRIBUTOR_ADDRESS}"

stellar contract invoke \
  --id "${TESTNET_CONTRACT_ID}" \
  --network testnet \
  -- get_org_assignment_count \
  --contributor "${TEST_CONTRIBUTOR_ADDRESS}" \
  --org_id acme

# 2. Exercise an application and its withdrawal on Testnet
stellar contract invoke \
  --id "${TESTNET_CONTRACT_ID}" \
  --network testnet \
  --source "${TEST_CONTRIBUTOR_IDENTITY}" \
  -- apply_for_issue \
  --contributor "${TEST_CONTRIBUTOR_ADDRESS}" \
  --org_id acme \
  --issue_id 9001

stellar contract invoke \
  --id "${TESTNET_CONTRACT_ID}" \
  --network testnet \
  --source "${TEST_CONTRIBUTOR_IDENTITY}" \
  -- withdraw_application \
  --contributor "${TEST_CONTRIBUTOR_ADDRESS}" \
  --org_id acme \
  --issue_id 9001
```

### Step 3.3 — Verify XDR Decoding & Event Indexer Compatibility

Verify that `EventIndexer` (`src/eventIndexer.ts`) and `xdrVerifier` (`src/xdrVerifier.ts`) decode events and transaction envelopes emitted under the new protocol version without XDR deserialization errors:

```bash
# Run unit and integration suites locally
npm run typecheck
npm run test:unit
npm test
make test-all

# Run dry-run historical/recent event backfill against Testnet RPC
npx ts-node src/scripts/backfill-events.ts --dry-run --batch-size 50
```

Run the same smoke checks against the current deployment and against each candidate release. Record the Testnet transaction hashes and confirm inclusion and expected state changes in a closed ledger. Compare simulation CPU, memory, resource fee, and TTL or rent costs to the baseline. Investigate deviations outside the agreed limits before promoting the release.

Confirm:
- Zero `ScVal.fromXDR` decoding failures in logs.
- `topics[0] == "WG"` 3-topic contract events parse cleanly into `ContractEventRecord` rows.
- CPU and memory resource consumption reported by transaction simulation remain within safety margins (< 70% of ledger limits).

---

## 4. WASM Rebuild & SDK Upgrade Procedures

If the protocol upgrade introduces XDR changes, deprecates host functions, or requires an updated `soroban-sdk` / `@stellar/stellar-sdk`:

### Step 4.1 — Update Rust & TypeScript SDK Dependencies

1. Update `Cargo.toml` to the protocol-compatible `soroban-sdk` release:
   ```toml
   [dependencies]
   soroban-sdk = "<new-version>"

   [dev-dependencies]
   soroban-sdk = { version = "<new-version>", features = ["testutils"] }
   ```
2. Select an `@stellar/stellar-sdk` version from the target protocol’s compatibility guide and update both Node packages and their lockfiles:
   ```bash
   npm install --save-exact "@stellar/stellar-sdk@${JS_SDK_VERSION}"
   npm --prefix backend install --save-exact "@stellar/stellar-sdk@${JS_SDK_VERSION}"
   ```
3. Update Stellar CLI to match the target protocol version:
   ```bash
   cargo install --locked stellar-cli --version "${STELLAR_CLI_VERSION}"
   stellar --version
   ```

### Step 4.2 — Rebuild, Optimize & Audit the Contract WASM

```bash
# 1. Ensure WASM targets are installed
rustup target add wasm32v1-none wasm32-unknown-unknown

# 2. Run full Rust contract test suite (unit, property-based, and benchmark tests)
cargo test --features testutils

# 3. Verify zero storage key collisions
bash scripts/check-key-collisions.sh

# 4. Build release WASM binary
stellar contract build

# 5. Optimize WASM binary for on-chain deployment
WASM_RAW="target/wasm32v1-none/release/workload_governor.wasm"
WASM_OPT="target/wasm32v1-none/release/workload_governor.optimized.wasm"
stellar contract optimize --wasm "${WASM_RAW}" --wasm-out "${WASM_OPT}"

# 6. Check binary size against the target network limit and record SHA-256 hash
ls -lh "${WASM_OPT}"
NEW_WASM_HASH=$(sha256sum "${WASM_OPT}" | awk '{print $1}')
echo "Optimized WASM SHA256: ${NEW_WASM_HASH}"
```

### Step 4.3 — Deploy & Verify Rebuilt WASM on Testnet First

```bash
# Upload new WASM bytecode to Testnet
INSTALLED_HASH=$(stellar contract install \
  --wasm "${WASM_OPT}" \
  --network testnet \
  --source "${TESTNET_ADMIN_ACCOUNT}")

test "${INSTALLED_HASH}" = "${NEW_WASM_HASH}" || { echo "Hash mismatch!"; exit 1; }

# Upgrade Testnet contract instance
stellar contract invoke \
  --id "${TESTNET_CONTRACT_ID}" \
  --network testnet \
  --source "${TESTNET_ADMIN_ACCOUNT}" \
  -- upgrade \
  --new_wasm_hash "${NEW_WASM_HASH}"
```

Re-run Step 3.2 and Step 3.3 against the upgraded Testnet contract before scheduling Mainnet deployment.

---

## 5. Mainnet Protocol Upgrade Execution

1. **Pre-Vote Freeze Window (T-30 minutes)**:
   - Pause non-critical administrative operations.
   - Record current Mainnet ledger sequence and `indexer_checkpoints` row:
     ```sql
     SELECT contract_id, last_ledger, last_ledger_hash, updated_at
     FROM indexer_checkpoints;
     ```
2. **Validator Protocol Vote (T-0)**:
   - Monitor Horizon `/` for `current_protocol_version` transition.
3. **Backend & Indexer Rollout (if SDK update required)**:
   - Roll out updated backend and `event-indexer` containers with the new `@stellar/stellar-sdk` build.
4. **Mainnet Contract WASM Upgrade (if WASM rebuild required)**:
   - Follow [Contract Upgrade Runbook](contract-upgrade.md) (`stellar contract install` followed by `upgrade --new_wasm_hash "$NEW_WASM_HASH"`).
5. **Post-Upgrade Health Verification**:
   - Check `/health` endpoint and confirm `IndexerLedgerLag <= 2`.
   - Spot-check `get_global_application_count` and `get_org_assignment_count` against recorded values on Mainnet.
   - Compare RPC ledger advancement and protocol version across both providers. Track `sendTransaction` hashes through `getTransaction` and confirm successful inclusion in closed ledgers.
   - Confirm `getEvents` results are decoded and persisted, `indexer_ledger_lag` returns to its pre-vote range, and no ledger ranges were skipped. Keep the freeze in place until all checks remain healthy throughout the observation window.

---

## 6. Emergency Rollback Safeguards

If transaction inclusion or read-only calls fail, new host traps or XDR decoding errors appear, or indexer lag stays above the agreed limit throughout the observation window, keep writes paused and open an incident. Record the last confirmed ledger, affected transaction hashes, and the last verified indexer checkpoint.

- If only the primary RPC is stale or unhealthy, switch to the rehearsed secondary after confirming its network passphrase, target protocol, ledger progress, and history coverage. Resume from a verified checkpoint. Look up pending transaction hashes before resubmitting.
- If both providers show the failure, keep writes paused and escalate to the Stellar RPC providers and SDF. The validator vote sets the network protocol. Operators can switch providers or roll back compatible application releases and contract WASM.
- Reopen writes after the post-upgrade checks pass. Record the recovery ledger and any replayed event range.

### 6.1 — Smart Contract WASM Rollback

Before reverting, confirm the previous WASM is available, works under the active protocol, and can read the current state layout. An executable swap preserves storage changes from earlier transactions. Coordinate authorization using the [contract upgrade runbook](contract-upgrade.md).

```bash
# Revert contract bytecode to the pre-upgrade WASM hash
stellar contract invoke \
  --id "${MAINNET_CONTRACT_ID}" \
  --network mainnet \
  --source "${MAINNET_ADMIN_ACCOUNT}" \
  -- upgrade \
  --new_wasm_hash "${PREVIOUS_WASM_HASH}"

# Or execute the automated rollback helper script
CONTRACT_ID="${MAINNET_CONTRACT_ID}" \
PREVIOUS_WASM_HASH="${PREVIOUS_WASM_HASH}" \
ADMIN_SECRET="${MAINNET_ADMIN_SECRET}" \
NETWORK="mainnet" \
  bash scripts/rollback.sh
```

### 6.2 — Event Indexer & Backend Service Rollback

1. **Stop Indexer Pollution**: If XDR decoding produces malformed records, scale `event-indexer` to `0` replicas immediately:
   ```bash
   kubectl scale deployment/workload-governor-indexer --replicas=0 -n workload-governor
   ```
2. **Rollback Backend Container Image** (use the rehearsed image compatible with the active protocol and current database schema):
   ```bash
   helm rollback workload-governor -n workload-governor
   kubectl rollout status deployment/workload-governor-backend -n workload-governor
   ```
3. **Safe Event Replay After Fix**:
   - Reconcile malformed rows and reset the persisted and cached checkpoints to the last verified ledger before restarting. Use the backfill dry run to verify coverage and source older ledgers from a provider with sufficient retention.
   - Reconcile the replayed range and confirm lag has recovered before reopening writes.

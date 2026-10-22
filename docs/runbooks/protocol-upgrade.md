# Stellar Network Protocol Upgrade Runbook

This runbook outlines the operational procedures for managing Stellar network protocol upgrades (e.g., Protocol 20 → 21 → 22) within the WorkloadGovernor ecosystem.

Protocol upgrades can introduce updated Soroban cost models, revised resource fee structures, new host functions, and breaking XDR schema definitions. This guide details pre-upgrade monitoring, testnet verification steps, WASM rebuild procedures, and emergency rollback safeguards to ensure zero downtime and uninterrupted event indexing.

---

## 1. Overview & Upgrade Architecture

During a Stellar network protocol upgrade, validator nodes vote on a designated ledger sequence to activate a new protocol version. For smart contract platforms like WorkloadGovernor, upgrades introduce three primary vectors of impact:

1. **Soroban Cost Model & Resource Limits:**
   - Instruction budget modifications (CPU instructions, memory limits).
   - Storage fee rate adjustments (read/write bytes, ledger entry rents, TTL rent rates).
   - Footprint limits for read-only and read-write ledger keys.
2. **XDR Serialization & Schema Shifts:**
   - Changes to transaction envelopes, diagnostic events, contract event structures, or ledger entry headers.
   - Downstream impacts on Horizon, Soroban RPC, and the backend event indexer (`src/eventIndexer.ts`).
3. **Rust Toolchain & Soroban SDK Compatibility:**
   - New host function interfaces and deprecations requiring rebuilt WASM contract bytecode.

---

## 2. Upgrade Lifecycle & Timeline

```
+---------------------+     +-----------------------+     +-------------------------+     +-----------------------+
| 1. Announcement     | --> | 2. Testnet Upgrade    | --> | 3. Verification & Build | --> | 4. Mainnet Upgrade    |
| CAPs & Releases     |     | Validators Activate   |     | Cost Modeling & Tests   |     | Coordinated Rollout   |
+---------------------+     +-----------------------+     +-------------------------+     +-----------------------+
```

| Phase | Window | Operational Focus |
|---|---|---|
| **Phase 1: Announcement** | T-6 to T-4 weeks | Track Core Advancement Proposals (CAPs), Soroban SDK, and Stellar Core candidate releases. |
| **Phase 2: Testnet Upgrade** | T-3 to T-2 weeks | Testnet activates the protocol upgrade. Validate RPC responses and cost simulation. |
| **Phase 3: Staging & Rebuild**| T-2 to T-1 weeks | Recompile WASM with target toolchain, compute SHA256 checksums, run testnet end-to-end suites. |
| **Phase 4: Mainnet Cutover** | Day T | Monitor validator vote ledger. Deploy contract WASM upgrades and monitor indexer health. |

---

## 3. Testnet Verification Steps

Testnet activates several weeks ahead of Mainnet. Use this window to rigorously evaluate contract execution and backend ingestion.

### 3.1 Tooling & SDK Alignment

Ensure operator machines, CI pipelines, and devcontainers are upgraded to the required CLI and SDK versions matching the protocol release:

```bash
# Update Stellar CLI to target release
cargo install --locked stellar-cli --features opt

# Verify version
stellar version

# Ensure wasm32 target is available
rustup target add wasm32v1-none
```

Update `@stellar/stellar-sdk` across the backend and frontend if XDR definitions were updated:

```bash
npm install @stellar/stellar-sdk@latest
```

### 3.2 Simulation & Cost Model Benchmarking

Simulate contract invocations on Testnet to verify that new cost models do not exhaust resource limits or cause out-of-budget failures:

```bash
# 1. Simulate application submission
stellar contract invoke \
  --id <TESTNET_CONTRACT_ID> \
  --source <TESTNET_CALLER_KEY> \
  --network testnet \
  --cost \
  -- apply \
  --contributor <TESTNET_CONTRIBUTOR> \
  --org_id stellar-oss \
  --issue_id 42

# 2. Simulate assignment completion
stellar contract invoke \
  --id <TESTNET_CONTRACT_ID> \
  --source <TESTNET_ADMIN_KEY> \
  --network testnet \
  --cost \
  -- complete \
  --contributor <TESTNET_CONTRIBUTOR> \
  --org_id stellar-oss \
  --issue_id 42
```

**Evaluation Checklist:**
- [ ] `cpu_insns` remains well within protocol limits (typically ≤ 100,000,000 instructions per transaction).
- [ ] `mem_bytes` complies with updated Soroban memory constraints (≤ 40 MB).
- [ ] Resource fee adjustments are recorded and incorporated into backend transaction submission configs (`src/services/stellar.ts`).
- [ ] Footprint read-write keys align with contract storage requirements without exceeding footprint caps.

### 3.3 Event Indexer & XDR Compatibility Verification

Network upgrades frequently introduce subtle additions to XDR event representations. Validate that the event indexer seamlessly ingests and decodes events on Testnet:

1. Point a staging indexer instance to a Testnet Soroban RPC endpoint running the new protocol version.
2. Trigger contract events (`applied`, `assigned`, `completed`, `revoked`).
3. Verify that `src/eventIndexer.ts` parses `ContractEvent` topics and values without throwing deserialization exceptions:
   ```bash
   # Check logs for XDR decoding errors
   grep -i "xdr" logs/indexer.log
   grep -i "failed to decode" logs/indexer.log
   ```
4. Confirm database insertion into `contract_events` occurs with accurate `ledger_seq`, `tx_hash`, and JSON payload formatting.

---

## 4. WASM Rebuild Procedures

If the protocol version deprecates host environment functions or optimizes compilation targets, the contract WASM binary must be rebuilt and certified.

### 4.1 Update Dependencies

Inspect `contracts/workload_governor/Cargo.toml` and update `soroban-sdk` to the required protocol release:

```toml
[dependencies]
soroban-sdk = { version = "21.0.0", default-features = false }
```

### 4.2 Deterministic Compilation

Compile the release WASM using the pinned toolchain:

```bash
# Compile via Stellar CLI
stellar contract build

# Alternatively, manual build with explicit target
cargo build --target wasm32v1-none --release --package workload_governor

# Optimize binary size (stripping debug symbols and unused sections)
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm
```

### 4.3 SHA256 Checksum Calculation & Certification

Compute and record the immutable SHA256 hash of the optimized WASM binary:

```bash
WASM_PATH="target/wasm32v1-none/release/workload_governor.optimized.wasm"
if [ ! -f "$WASM_PATH" ]; then
  WASM_PATH="target/wasm32v1-none/release/workload_governor.wasm"
fi

WASM_HASH=$(sha256sum "$WASM_PATH" | awk '{print $1}')
echo "Target WASM SHA256 Checksum: $WASM_HASH"
```

Verify that the local build hash matches the CI release pipeline artifact:
- [ ] Local SHA256 checksum matches published release checksum in GitHub Releases.
- [ ] Git commit SHA corresponds to audited release tag.
- [ ] Contract interfaces (`interface.json` / contract specs) remain backward-compatible with existing backend bindings.

### 4.4 Testnet Upload & Dry-Run Upgrade

Before applying the upgrade to Mainnet:

```bash
# 1. Upload bytecode to Testnet
stellar contract upload \
  --wasm "$WASM_PATH" \
  --network testnet \
  --source <testnet-deployer-account>

# 2. Invoke upgrade on Testnet contract
stellar contract invoke \
  --id <TESTNET_CONTRACT_ID> \
  --network testnet \
  --source <testnet-admin-account> \
  -- upgrade \
  --new_wasm_hash "$WASM_HASH"

# 3. Verify state retention and function responsiveness
stellar contract invoke \
  --id <TESTNET_CONTRACT_ID> \
  --network testnet \
  -- get_max_assignments_per_contributor
```

---

## 5. Mainnet Upgrade Execution

Once the Mainnet validator vote concludes and the protocol upgrade ledger activates:

### Step 1: Pre-Upgrade Freeze Window
1. Announce a temporary 30-minute maintenance window on status channels.
2. Verify existing database checkpoint status:
   ```sql
   SELECT contract_id, last_ledger, updated_at FROM indexer_checkpoints;
   ```
3. Snapshot the current Mainnet WASM hash from contract state:
   ```bash
   PREV_WASM_HASH=$(stellar contract inspect --id <MAINNET_CONTRACT_ID> --network mainnet | grep "wasm_hash" | awk '{print $2}')
   echo "Active WASM Hash before upgrade: $PREV_WASM_HASH"
   ```

### Step 2: Upload New Bytecode to Mainnet
```bash
stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --network mainnet \
  --source <admin-signing-account>
```
Confirm the returned on-chain hash matches `$WASM_HASH`.

### Step 3: Execute Contract Upgrade Invocation
Execute the upgrade call via the admin account or multisig threshold:
```bash
stellar contract invoke \
  --id <MAINNET_CONTRACT_ID> \
  --network mainnet \
  --source <admin-signing-account> \
  -- upgrade \
  --new_wasm_hash "$WASM_HASH"
```

### Step 4: Verification Smoke Tests
Execute read-only queries to verify operational integrity:
```bash
# Check admin configuration
stellar contract invoke --id <MAINNET_CONTRACT_ID> --network mainnet -- get_admin

# Verify assignment queries function properly
stellar contract invoke --id <MAINNET_CONTRACT_ID> --network mainnet -- get_max_assignments_per_contributor
```

---

## 6. Emergency Rollback Safeguards

If an unexpected regression, budget exhaustion error, or indexing failure occurs following the upgrade, execute the following emergency rollback procedures.

### Safeguard 1: Instant Smart Contract Rollback

Soroban smart contracts allow rolling back the WASM bytecode if the contract data schema remains compatible:

```bash
# Revert contract to previous verified WASM hash
stellar contract invoke \
  --id <MAINNET_CONTRACT_ID> \
  --network mainnet \
  --source <admin-signing-account> \
  -- upgrade \
  --new_wasm_hash "$PREV_WASM_HASH"
```

**Conditions:**
- Rollback can be performed immediately if no storage migrations modifying data layout have executed.
- Verify contract function post-reversion using `get_admin`.

### Safeguard 2: Event Indexer Rewind & Checkpoint Reset

If the event indexer crashed or recorded corrupt state due to XDR incompatibilities:

1. Stop the indexer process:
   ```bash
   npm run stop # or systemctl stop workload-governor-indexer
   ```
2. Revert the database checkpoint to a ledger preceding the upgrade activation:
   ```sql
   UPDATE indexer_checkpoints
   SET last_ledger = <SAFE_PRE_UPGRADE_LEDGER>
   WHERE contract_id = '<MAINNET_CONTRACT_ID>';
   ```
3. Invalidate Redis cursor cache:
   ```bash
   redis-cli DEL "indexer:checkpoint:<MAINNET_CONTRACT_ID>"
   ```
4. Deploy the previous stable backend container image or hotfix parsing patch.
5. Restart the indexer. Due to `ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING` (see [ADR-009](../adr/ADR-009-indexer-event-deduplication.md)), replayed ledgers will safely deduplicate without manual data cleansing.

### Safeguard 3: Circuit Breaker & Traffic Throttle

If contract calls fail intermittently under the new cost model:
1. Temporarily pause outbound automated transactions by setting `MAINTENANCE_MODE=true` in `backend/.env`.
2. Direct frontend traffic to read-only replica status pages.
3. Convene core team incident triage following [incident-response.md](incident-response.md).

---

## 7. Post-Upgrade Verification Checklist

- [ ] All primary contract methods (`apply`, `assign`, `complete`, `revoke`) tested and verified on Mainnet.
- [ ] Contract resource fees within expected margins of pre-upgrade projections.
- [ ] Event indexer synchronization latency `< 5s` behind current network ledger.
- [ ] Sentry / Datadog / Prometheus error rates remain nominal (`< 0.1%`).
- [ ] Maintenance window concluded and community status notification published.

---

## References

- [Contract Upgrade Runbook](contract-upgrade.md)
- [ADR-009: Event Indexer Deduplication](../adr/ADR-009-indexer-event-deduplication.md)
- [Stellar Core Protocol Upgrade Guide](https://developers.stellar.org/docs/networks/upgrades)
- Issue: [#1123](https://github.com/FaveTeamz/workload-governor/issues/1123)

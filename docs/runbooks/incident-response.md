# Runbook: Incident Response

What to do when a bug is discovered in a deployed WorkloadGovernor contract.

> **Pause strategy**: Soroban contracts have no built-in pause mechanism. The current mitigation is to upgrade to a "frozen" WASM that rejects all state-changing calls until a fix is deployed. See step 3.

## Disaster Recovery Metrics

These objectives apply to the WorkloadGovernor backend (PostgreSQL on Amazon
RDS) and any stateful infrastructure. They are binding targets for all
incident response activities.

| Metric | Target | Basis |
|--------|--------|-------|
| **RPO** (Recovery Point Objective) | **< 15 minutes** | RDS automated backups run continuously with PITR granularity of ~5 minutes; manual snapshots capture the state at any point within the 7-day retention window |
| **RTO** (Recovery Time Objective) | **< 30 minutes** | Covers detection, decision, PITR restore initiation, ECS task restart, and health-check validation |

### Infrastructure assumptions

- **Backup retention:** 7 days of automated RDS backups (`backup_retention_period = 7`).
- **Backup window:** 03:00–04:00 UTC daily (`backup_window = "03:00-04:00"`).
- **PITR granularity:** ~5 minutes (AWS RDS continuous backup).
- **Deletion protection:** enabled (`deletion_protection = true`) — the instance
  cannot be deleted via Terraform or the AWS console without explicitly
  disabling this flag first.
- **Encryption at rest:** enabled (`storage_encrypted = true`).

> These metrics assume the RDS instance is reachable from the production VPC
> and that operator credentials are available. Network partitions or credential
> loss extend RTO and must be treated as a SEV-1 in their own right.

---

## Severity Matrix

Severity levels map contract/backend problems to response SLAs and
communication channels. Use the highest applicable level when in doubt.

| Level | Definition | Initial response | Update cadence | Communication channels |
|-------|------------|-----------------|----------------|------------------------|
| **SEV-1** | Funds at risk, active state corruption, or full service outage. RPO/RTO breach imminent. | **Immediate** (< 5 min) | Every 15 min | Page on-call admin via PagerDuty; post in `#incidents`; notify engineering lead |
| **SEV-2** | Incorrect cap enforcement, data inconsistency affecting multiple users, partial service degradation. | < 15 min | Every 30 min | Post in `#incidents`; notify on-call admin; open GitHub issue tagged `incident` |
| **SEV-3** | Single-user data inconsistency, non-critical API errors, degraded performance with no data loss. | < 1 hour | Every 2 hours | Post in `#incidents`; open GitHub issue tagged `incident` |
| **SEV-4** | UI/API cosmetic bug, documentation gap, no on-chain or database impact. | Next business day | As needed | Open GitHub issue tagged `bug` |

### Severity ↔ legacy priority mapping

Existing runbook sections use P0/P1/P2 labels. The mapping is:

| Legacy | SEV equivalent |
|--------|----------------|
| P0 | SEV-1 |
| P1 | SEV-2 or SEV-3 (depending on scope) |
| P2 | SEV-4 |

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

### 3. Pause or freeze the contract (P0/P1 only)

#### Option A — Instant pause via `pause()` (recommended)

The contract has a first-class `pause()` function that can be called instantly by the admin. It blocks all state-changing operations while keeping query functions accessible.

```bash
# Pause the contract immediately
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$ADMIN_SECRET" \
  -- pause \
  --admin <ADMIN_ADDRESS>
# Expected output: null
# All state-changing calls will now return ContractPaused (error 15).

# Verify the pause is active
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- is_paused
# Expected output: true

# Resume normal operations once the fix is deployed:
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source "$ADMIN_SECRET" \
  -- unpause \
  --admin <ADMIN_ADDRESS>
```

**Advantages over the WASM upgrade approach:**
- Instant: no build/upload/upgrade cycle (saves 10–30 minutes)
- Query functions remain accessible for diagnostics
- Reversible without a WASM upgrade

#### Option B — WASM upgrade freeze (fallback)

Use this only if the admin key is unavailable or the `pause` function itself is buggy.

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

## Disaster Recovery Checklists

Use these checklists when data corruption is confirmed or suspected. They run
in parallel with the contract-level steps above.

### Database (PostgreSQL on RDS) — PITR Recovery

> Target: restore to a consistent point within the last 15 minutes (RPO).
> Complete all steps within 30 minutes of incident declaration (RTO).

- [ ] **T+0 min** — Declare incident at SEV-1/SEV-2 and open incident channel.
- [ ] **T+1 min** — Freeze application writes: scale ECS service to 0 tasks.
  ```bash
  aws ecs update-service \
    --cluster workload-governor-prod \
    --service workload-governor \
    --desired-count 0 \
    --region us-east-1
  ```
- [ ] **T+2 min** — Identify the latest safe restore point (choose a timestamp
  at least 5 minutes before the first corruption event).
  ```bash
  # List automated backups to confirm PITR coverage
  aws rds describe-db-instances \
    --db-instance-identifier workload-governor-prod \
    --query "DBInstances[0].{LatestRestorableTime:LatestRestorableTime,BackupRetentionPeriod:BackupRetentionPeriod}" \
    --region us-east-1
  ```
- [ ] **T+3 min** — Initiate PITR restore to a new instance.
  ```bash
  RESTORE_TIME="2026-09-25T22:35:00Z"   # replace with chosen safe point (ISO 8601 UTC)
  aws rds restore-db-instance-to-point-in-time \
    --source-db-instance-identifier workload-governor-prod \
    --target-db-instance-identifier workload-governor-prod-pitr \
    --restore-time "$RESTORE_TIME" \
    --region us-east-1
  ```
- [ ] **T+5 min** — While restore is running, update the application's
  `DATABASE_URL` secret in Secrets Manager to point to the new endpoint
  (retrieve the endpoint once the instance status is `available`).
  ```bash
  # Poll until available (typically 10–20 min for RDS PITR)
  aws rds wait db-instance-available \
    --db-instance-identifier workload-governor-prod-pitr \
    --region us-east-1

  NEW_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier workload-governor-prod-pitr \
    --query "DBInstances[0].Endpoint.Address" \
    --output text \
    --region us-east-1)
  echo "New endpoint: $NEW_ENDPOINT"
  ```
- [ ] **T+20 min** — Update the `DATABASE_URL` secret to the new endpoint and
  restart ECS tasks against the restored instance.
  ```bash
  # Retrieve current secret, update host, write back
  CURRENT=$(aws secretsmanager get-secret-value \
    --secret-id workload-governor/prod/database-url \
    --query SecretString --output text --region us-east-1)
  # Edit $CURRENT to replace the hostname with $NEW_ENDPOINT, then:
  aws secretsmanager put-secret-value \
    --secret-id workload-governor/prod/database-url \
    --secret-string "$UPDATED_URL" \
    --region us-east-1

  aws ecs update-service \
    --cluster workload-governor-prod \
    --service workload-governor \
    --desired-count 2 \
    --force-new-deployment \
    --region us-east-1
  ```
- [ ] **T+25 min** — Run health checks and data integrity spot-checks.
  ```bash
  curl -sf "https://<prod-domain>/api/health" | jq .
  # Expected: {"status":"ok"}
  ```
- [ ] **T+30 min** — Confirm RTO met; post status update in incident channel.
- [ ] After incident is resolved: rename or delete the old corrupted instance
  (only after post-mortem is complete and `deletion_protection` is disabled).

> For schema-migration rollback scenarios, see
> [docs/runbooks/db-rollback.md](./db-rollback.md) — PITR and snapshot
> procedures are cross-referenced there.

---

### Redis — Cache / Session Recovery

Redis is used for caching and session state only. It holds no source-of-truth
data, so RPO/RTO for Redis is lower-priority than for PostgreSQL.

- [ ] **Identify the Redis failure mode:**
  - If the Redis node is unavailable → traffic falls back to the database;
    expect elevated DB latency but no data loss. Proceed to step below.
  - If Redis contains corrupted session state → flush and restart.
- [ ] **Flush and restart** (cache corruption):
  ```bash
  # Connect to ElastiCache Redis cluster (via bastion or VPC endpoint)
  redis-cli -h <elasticache-endpoint> -p 6379 FLUSHALL
  ```
  Then restart the ECS service to re-warm the cache on first requests.
- [ ] **Failover to a replica** (node failure):
  ```bash
  aws elasticache failover-replication-group \
    --replication-group-id workload-governor-cache \
    --node-group-id 0001 \
    --primary-cluster-id <replica-node-id> \
    --region us-east-1
  ```
- [ ] Verify cache is healthy by checking `GET /api/health` and confirming
  response times return to baseline (< 200 ms p95).
- [ ] Log the flush/failover action in the incident channel with timestamp.

---

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

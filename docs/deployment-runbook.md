# Deployment Runbook

Step-by-step guide for building, deploying, and initializing WorkloadGovernor
on Stellar mainnet. Every command is copy-pasteable; replace angle-bracket
placeholders with real values.

---

## Prerequisites

- Rust stable toolchain with `wasm32v1-none` target
- Stellar CLI (`stellar-cli`) ≥ 21
- A funded mainnet account for the deployer (`<DEPLOYER_ACCOUNT>`)
- A funded mainnet account to be the admin (`<ADMIN_ADDRESS>`)
- At least one maintainer address per org ready (`<MAINTAINER_ADDRESS>`)

---

## Step 1 — Build and Optimise the WASM

```bash
# Add the required target if not already present
rustup target add wasm32v1-none

# Build the release WASM
cargo build --target wasm32v1-none --release

# Optimise (mandatory before mainnet; reduces size and fees)
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

# Verify the optimised artifact exists
ls -lh target/wasm32v1-none/release/workload_governor.optimized.wasm
```

Expected output: a `.optimized.wasm` file under 64 KB.

---

## Step 2 — Fund the Deployer Account on Mainnet

The deployer account must hold enough XLM to cover:

- Contract upload fees (proportional to WASM size)
- Contract deployment fees
- Initialization transaction fee

```bash
# Check current balance
stellar account show \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT>

# If funding from another account:
stellar tx send \
  --network mainnet \
  --source <FUNDING_ACCOUNT> \
  --destination <DEPLOYER_ACCOUNT> \
  --amount 10
```

Minimum recommended balance: **5 XLM** on top of the base reserve.

---

## Step 3 — Deploy the Contract and Capture the Contract ID

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT>
```

The CLI prints the contract ID. Save it immediately:

```bash
export CONTRACT_ID=<OUTPUT_CONTRACT_ID>
echo "CONTRACT_ID=$CONTRACT_ID" >> .env.mainnet
```

Verify the contract is on-chain:

```bash
stellar contract info \
  --id "$CONTRACT_ID" \
  --network mainnet
```

---

## Step 4 — Initialize with the Admin Address

`initialize` can only be called once. If it fails the contract is unusable and
a new deployment is required (see Rollback).

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT> \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

Verify initialization succeeded:

```bash
# Should return the admin address without error
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <DEPLOYER_ACCOUNT> \
  -- get_global_application_count \
  --contributor <ADMIN_ADDRESS>
```

Expected result: `0` (not an error).

---

## Step 5 — Register First Maintainers

Repeat for each (maintainer, org) pair.

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>
```

---

## Step 6 — Verify Each Step with Contract Invocations

```bash
# 6a. Confirm admin is set (error 2 = NotInitialized means Step 4 failed)
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- get_global_application_count \
  --contributor <ADMIN_ADDRESS>

# 6b. Confirm maintainer registration
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- get_org_assignment_count \
  --contributor <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>

# 6c. Test apply_for_issue end-to-end with a canary account
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <CANARY_CONTRIBUTOR> \
  -- apply_for_issue \
  --contributor <CANARY_CONTRIBUTOR> \
  --org_id <ORG_ID> \
  --issue_id 1

# Confirm it was recorded
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <CANARY_CONTRIBUTOR> \
  -- has_applied \
  --contributor <CANARY_CONTRIBUTOR> \
  --org_id <ORG_ID> \
  --issue_id 1
# Expected: true

# 6d. Withdraw the canary application
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <CANARY_CONTRIBUTOR> \
  -- withdraw_application \
  --contributor <CANARY_CONTRIBUTOR> \
  --org_id <ORG_ID> \
  --issue_id 1
```

---

## Rollback: What to Do if Initialization Fails

### Partial failure: deploy succeeded, initialize failed

The contract WASM is uploaded but the storage is blank. The contract will
return error `2` (`NotInitialized`) on any state-changing call.

Options:

1. **Retry initialization** — if the transaction failed due to a transient
   network error, simply re-run the Step 4 command. The `AlreadyInitialized`
   guard (error `1`) will prevent a double-init.

2. **Redeploy** — if the admin address was wrong or the call cannot be retried:

   ```bash
   # Deploy a fresh instance
   stellar contract deploy \
     --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
     --network mainnet \
     --source <DEPLOYER_ACCOUNT>

   export CONTRACT_ID=<NEW_CONTRACT_ID>

   # Update all client configs to point to the new contract ID
   # Then initialize the new instance
   stellar contract invoke \
     --id "$CONTRACT_ID" \
     --network mainnet \
     --source <DEPLOYER_ACCOUNT> \
     -- initialize \
     --admin <ADMIN_ADDRESS>
   ```

3. **Update .env** — after any redeployment, update `CONTRACT_ID` in every
   environment config (`.env.mainnet`, backend ECS task definition,
   Terraform variables) and redeploy the backend.

### Partial failure: maintainer registration failed

Registration is idempotent in outcome — a second call for the same
`(maintainer, org_id)` pair simply overwrites with the same value. Re-run
Step 5 safely.

### Contract upgrade path

If a logic bug requires a fix after deployment, use the `upgrade` function
(admin only) to swap the WASM hash without changing the contract ID:

```bash
# 1. Build and optimise the new WASM (Step 1)
# 2. Upload the WASM to get its hash
stellar contract install \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network mainnet \
  --source <ADMIN_ADDRESS>
# Save the printed wasm_hash

# 3. Invoke upgrade
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  --source <ADMIN_ADDRESS> \
  -- upgrade \
  --new_wasm_hash <WASM_HASH>
```


---

## Load Testing

The staging environment is validated against a k6 load test after every
deployment to confirm it can sustain 50 concurrent virtual users without
breaching SLA thresholds.

### Test scenario

| Parameter | Value |
|---|---|
| Virtual users | 50 (ramped over 30 s, held 5 min, ramped down 30 s) |
| Workload pattern | Each VU applies for 3 issues, then withdraws 1 |
| Endpoints under test | `POST /api/transactions/apply`, `POST /api/transactions/withdraw`, `GET /api/contributors/:address/applications`, `GET /health` |
| p95 latency threshold | < 2 000 ms (hard gate) |
| Error rate threshold | < 1 % (hard gate) |
| Metrics captured | p50 / p95 / p99 latency, throughput (req/s), per-endpoint error counts |

### Running the test manually

```bash
# Install k6 (if not already present)
# https://grafana.com/docs/k6/latest/set-up/install-k6/

# Run against staging
k6 run \
  --env BASE_URL=https://staging.example.com \
  --env ADMIN_TOKEN=<STAGING_ADMIN_TOKEN> \
  tests/load/k6-staging.js

# Results are written to results/k6-summary.json automatically.
# Ensure the results/ directory exists first:
mkdir -p results
```

k6 exits with code `0` when all thresholds pass and `99` when any threshold
fails. Use the exit code as the CI gate condition.

### CI job — GitHub Actions

Add the following job to `.github/workflows/staging-deploy.yml` (or any
workflow that runs after a staging deployment):

```yaml
  load-test:
    name: Load test — staging
    runs-on: ubuntu-latest
    needs: deploy          # adjust to match your deploy job name
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring \
            --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
            https://dl.k6.io/deb stable main" \
            | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install -y k6

      - name: Create results directory
        run: mkdir -p results

      - name: Run load test
        env:
          BASE_URL:    ${{ secrets.STAGING_URL }}
          ADMIN_TOKEN: ${{ secrets.STAGING_ADMIN_TOKEN }}
        run: |
          k6 run \
            --env BASE_URL="$BASE_URL" \
            --env ADMIN_TOKEN="$ADMIN_TOKEN" \
            tests/load/k6-staging.js
        # k6 exits 99 if any threshold fails — the step will fail the job

      - name: Upload k6 summary
        if: always()   # upload even if the test failed
        uses: actions/upload-artifact@v4
        with:
          name: k6-summary-${{ github.run_id }}
          path: results/k6-summary.json
          retention-days: 90
```

#### Required secrets

| Secret name | Description |
|---|---|
| `STAGING_URL` | Base URL of the staging deployment, e.g. `https://staging.example.com` |
| `STAGING_ADMIN_TOKEN` | Value of the `ADMIN_TOKEN` environment variable on the staging server |

### Interpreting results

The test prints a summary to stdout at the end of the run:

```
=== WorkloadGovernor Staging Load Test — Summary ===

  ✓ http_req_duration: p(95)<2000
  ✓ errors: rate<0.01
  ✓ apply_req_duration: p(95)<2000
  ✓ withdraw_req_duration: p(95)<2000
  ✓ query_req_duration: p(95)<2000
  ✓ health_req_duration: p(95)<500

  ✓ All thresholds passed — deployment to staging is HEALTHY

  p50 latency : 120 ms
  p95 latency : 890 ms  (threshold: <2000 ms)
  p99 latency : 1340 ms
  error rate  : 0.12 %  (threshold: <1 %)
  throughput  : 22.40 req/s
```

The machine-readable `results/k6-summary.json` is also produced. Feed it into
a trend-tracking tool (Grafana, DataDog, or a simple GitHub Pages chart) to
detect latency regressions across deployments.

### Alert criteria

The CI job acts as the primary alert. If either threshold is breached:

1. The k6 process exits with code `99`.
2. The GitHub Actions step fails, blocking any downstream promotion job.
3. The `k6-summary.json` artifact is always uploaded for post-mortem analysis.

For real-time alerting during a manual run, watch for the `✗` prefix in the
stdout summary — any failing threshold line is prefixed with `✗`.

### Trend tracking across deployments

The `results/k6-summary.json` artifact contains all raw metric values. To
compare runs over time:

1. Store the artifact in a persistent location (S3, GCS, or a dedicated branch).
2. Parse `metrics.http_req_duration.values['p(95)']`,
   `metrics.errors.values.rate`, and `metrics.http_reqs.values.rate` for the
   three headline numbers.
3. Plot them per deployment SHA to identify latency creep before it becomes
   an incident.

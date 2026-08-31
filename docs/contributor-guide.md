# Contributor Guide — WorkloadGovernor

Welcome to WorkloadGovernor! This guide covers everything you need to go from zero to
your first merged pull request: local environment setup, running tests, understanding
the apply → assign → complete workflow, fuzz testing, and troubleshooting common errors.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Dev Setup (5 minutes)](#2-local-dev-setup-5-minutes)
3. [Running the Test Suites](#3-running-the-test-suites)
4. [The Apply → Assign → Complete Workflow](#4-the-apply--assign--complete-workflow)
5. [Setting Up a Testnet Account](#5-setting-up-a-testnet-account)
6. [Checking Cap Availability](#6-checking-cap-availability)
7. [Applying for an Issue](#7-applying-for-an-issue)
8. [Checking Application Status](#8-checking-application-status)
9. [Extending an Application TTL](#9-extending-an-application-ttl)
10. [Withdrawing an Application](#10-withdrawing-an-application)
11. [Fuzz Testing](#11-fuzz-testing)
12. [Troubleshooting](#12-troubleshooting)
13. [Fairness Model Quick Reference](#13-fairness-model-quick-reference)
14. [Complete Worked Example](#14-complete-worked-example)
15. [Further Reading](#15-further-reading)

---

## 1. Prerequisites

You need the following tools before cloning the repo.

### Rust toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Stable toolchain (contract + tests)
rustup toolchain install stable
rustup default stable

# Nightly toolchain (fuzz targets only)
rustup install nightly

# WASM compilation target
rustup target add wasm32v1-none
```

### Stellar CLI

```bash
cargo install stellar-cli --features opt --locked
stellar --version
# stellar 21.x.x or newer
```

### Node.js (backend and frontend)

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
node --version   # v20.x.x
npm --version    # 10.x.x
```

### Docker (local services)

```bash
# Ubuntu / Debian
sudo apt-get install -y docker.io docker-compose-plugin
docker --version          # Docker 24.x or newer
docker compose version    # Docker Compose v2.x
```

### cargo-fuzz (fuzz testing, optional)

```bash
cargo install cargo-fuzz --locked
```

### Tool version summary

| Tool | Minimum version | Purpose |
|------|-----------------|---------|
| Rust (stable) | 1.78 | Contract + tests |
| Rust (nightly) | latest | Fuzz targets |
| stellar-cli | 21.0 | Contract invocation |
| Node.js | 20.x | Backend + frontend |
| npm | 10.x | Package manager |
| PostgreSQL | 16.x | Backend database (via Docker) |
| Redis | 7.x | Event queue (via Docker) |
| Docker | 24.x | Local services |

---

## 2. Local Dev Setup (5 minutes)

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/workload-governor.git
cd workload-governor

# 2. Add upstream remote so you can sync with the main repo
git remote add upstream https://github.com/FaveTeamz/workload-governor.git

# 3. Install Node.js dependencies (backend + frontend)
npm ci
cd frontend && npm ci && cd ..

# 4. Copy the example environment file and fill in values
cp .env.example .env
# Edit .env: set DATABASE_URL, REDIS_URL, etc.

# 5. Start local PostgreSQL and Redis via Docker
docker compose up -d postgres redis

# 6. Build the smart contract WASM
cargo build --target wasm32v1-none --release

# 7. Verify all tests pass
cargo test --features testutils
```

If all tests pass, your environment is ready. The full setup takes roughly 5 minutes
on a modern laptop (most of the time is spent downloading Rust crates the first time).

### Optional: build the optimised WASM

Before deploying to testnet, optimise the WASM to meet the 64 KB contract size limit:

```bash
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm
# Output: target/wasm32v1-none/release/workload_governor.optimized.wasm
```

---

## 3. Running the Test Suites

### Contract tests (Rust)

```bash
# All unit + property-based tests
cargo test --features testutils

# Property-based tests only
cargo test --features testutils prop_

# Unit tests only
cargo test --features testutils unit_

# Benchmark tests (prints CPU/memory to stdout)
cargo test --features testutils bench_

# Check Rustdoc builds cleanly
cargo doc --no-deps
```

### Backend tests (Node.js)

```bash
# All backend unit tests
npm test

# Type-check only (no emit)
npm run typecheck

# Lint
npm run lint
```

### Frontend tests

```bash
cd frontend

# Unit tests (Vitest)
npm run test:unit

# Unit tests in watch mode
npm run test:unit:watch

# Unit tests with coverage
npm run test:unit:coverage

# Playwright end-to-end tests
npx playwright test

# Lint + typecheck
npm run lint
npm run typecheck
```

### API spec validation

The `openapi.yaml` file is the source of truth for the REST API. Validate that
the running server matches the spec:

```bash
# Start the API server in one terminal
npm run build && node dist/index.js

# In another terminal
npm run validate:api
```

This runs Dredd against every endpoint in `openapi.yaml` and exits non-zero on
any mismatch.

### Mutation testing (optional, takes several minutes)

```bash
cargo install cargo-mutants --locked
cargo mutants --features testutils -- src/lib.rs
node scripts/mutation-report.js mutants.out/
```

---

## 4. The Apply → Assign → Complete Workflow

WorkloadGovernor enforces two fairness caps on contributions:

| Cap | Limit | Scope |
|-----|-------|-------|
| Global application cap | 15 | Pending applications across all orgs |
| Org assignment cap | 4 | Active assignments per contributor per org |

The lifecycle of a contribution has three phases:

```
Contributor            Maintainer
    │                      │
    │  apply_for_issue      │
    │──────────────────────►│  (creates pending application)
    │                      │
    │                      │  assign_issue
    │◄──────────────────────│  (converts application → assignment)
    │                      │
    │  [do the work]        │
    │                      │
    │                      │  complete_assignment  -or-  revoke_assignment
    │◄──────────────────────│  (frees the assignment slot)
    │                      │
```

**Storage semantics:**
- Applications are stored in **temporary storage** with a 24-hour TTL (≈ 17,280 ledgers).
  They expire automatically when a Wave ends — no cleanup transaction needed.
- Assignments are stored in **persistent storage** and never expire unless a maintainer
  calls `complete_assignment` or `revoke_assignment`.

**What happens during each transition:**

| Action | Effect |
|--------|--------|
| `apply_for_issue` | Creates app sentinel + increments global app counter |
| `withdraw_application` | Removes app sentinel + decrements global app counter |
| `assign_issue` | Removes app sentinel + decrements global counter + creates assignment + increments org counter |
| `complete_assignment` | Removes assignment + decrements org counter |
| `revoke_assignment` | Same as `complete_assignment`; emits `assignment_revoked` event instead |

---

## 5. Setting Up a Testnet Account

All commands in this guide target **testnet** — a free sandbox. No real XLM is needed.

### Generate a keypair

```bash
stellar keys generate --global my-contributor-key --network testnet
export CONTRIBUTOR_ADDRESS=$(stellar keys address my-contributor-key)
echo $CONTRIBUTOR_ADDRESS
```

### Fund with Friendbot

```bash
curl "https://friendbot.stellar.org/?addr=$CONTRIBUTOR_ADDRESS"
# Verify: should see "successful": true in the response

stellar account show $CONTRIBUTOR_ADDRESS --network testnet
# Should show a non-zero XLM balance
```

### Set the contract ID

```bash
export CONTRACT_ID=$(cat config/contracts.json | grep testnet -A1 | grep contractId | awk -F'"' '{print $4}')
# Or set it directly:
export CONTRACT_ID=<CONTRACT_ID_FROM_CONTRACTS_JSON>
echo $CONTRACT_ID
```

---

## 6. Checking Cap Availability

### How many global application slots remain?

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_capacity \
  --contributor "$CONTRIBUTOR_ADDRESS"
# Returns: 0..15 (15 = no applications yet)
```

### Current global application count (raw)

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

### Remaining org assignment slots

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_capacity \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs
```

### Is the global cap hit?

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- global_app_limit_reached \
  --contributor "$CONTRIBUTOR_ADDRESS"
# Returns: true if at limit, false otherwise
```

---

## 7. Applying for an Issue

Each issue has:
- `org_id` — the organisation symbol (e.g. `rust_libs`, `wave_tools`). Short symbol,
  lowercase, up to 9 characters, no spaces.
- `issue_id` — a numeric identifier (e.g. `42`).

### Submit the application

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source my-contributor-key \
  -- apply_for_issue \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs \
  --issue_id 42
# Expected output: null
```

> The `--source` flag must be the key whose address matches `--contributor`.
> The contract enforces `contributor.require_auth()` — a different key returns
> `UnauthorizedContributor` (error 5).

---

## 8. Checking Application Status

### Verify a specific application exists

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- has_applied \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs \
  --issue_id 42
# Returns: true (pending) or false (absent/expired)
```

### List all pending applications

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_pending_applications \
  --contributor "$CONTRIBUTOR_ADDRESS"
# Returns: array of [org_id, issue_id] pairs, e.g. [["rust_libs", 42], ["wave_tools", 7]]
```

### Check assignment status after maintainer action

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- is_assigned \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs \
  --issue_id 42
# Returns: true once assigned
```

### Check org assignment count

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs
```

---

## 9. Extending an Application TTL

Applications use temporary storage with a TTL of approximately **24 hours**
(17,280 ledgers at 5 s/ledger). During a long review cycle, anyone can extend it:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- extend_application_ttl \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs \
  --issue_id 42
# Expected output: null
```

Call this roughly every 12 hours if you expect a slow review cycle. If the TTL
expires, the application entry is removed and you will need to re-apply.

---

## 10. Withdrawing an Application

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  --source my-contributor-key \
  -- withdraw_application \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs \
  --issue_id 42
# Expected output: null

# Confirm the count decreased
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

---

## 11. Fuzz Testing

Fuzz targets live in `fuzz/fuzz_targets/` and require the nightly toolchain plus
`cargo-fuzz`. See the [README.md fuzz section](../README.md#fuzz-testing) for the
full reference; the quick-start is below.

### Install and build

```bash
rustup install nightly
cargo install cargo-fuzz --locked
cargo +nightly fuzz build
```

### Run a target

```bash
# Run fuzz_apply for 10 minutes
cargo +nightly fuzz run fuzz_apply -- -max_total_time=600

# Run with pre-seeded corpus
cargo +nightly fuzz run fuzz_apply fuzz/corpus/fuzz_apply -- -max_total_time=600
```

| Target | What it tests |
|--------|---------------|
| `fuzz_apply` | Random contributor/org/issue inputs → `apply_for_issue` |
| `fuzz_assign` | Random inputs → `assign_issue`, `complete_assignment`, `revoke_assignment` |
| `fuzz_batch_apply` | Batch of random issue IDs; verifies the ≤15 global cap holds |

### Interpreting results

If the fuzzer finds a crash it writes the input to `fuzz/artifacts/<target>/`. To
reproduce the crash:

```bash
cargo +nightly fuzz run fuzz_apply fuzz/artifacts/fuzz_apply/crash-<hash>
```

A crash that triggers a Soroban `panic_with_error!` is **expected behaviour** for
invalid inputs (e.g. applying over the cap). Only panics that do **not** correspond
to a defined `ContractError` variant represent real bugs.

### Corpus generation

Hand-crafted seed inputs covering edge cases (u32::MAX issue IDs, max-length org
symbols, duplicate detection, cap boundaries) live in `fuzz/corpus/`. Regenerate:

```bash
python3 scripts/generate-corpus.py
# Custom output directory:
python3 scripts/generate-corpus.py --corpus-dir /tmp/fresh-corpus
```

---

## 12. Troubleshooting

### Error 1 — WASM build fails: `error[E0308]: mismatched types`

**Cause:** Using a Rust edition or toolchain version incompatible with
`soroban-sdk`. The contract requires Rust stable 1.78+.

**Fix:**
```bash
rustup update stable
rustup default stable
cargo build --target wasm32v1-none --release
```

### Error 2 — `error[E0428]: the name global_cap_key is defined multiple times`

**Cause:** `src/storage.rs` contains a duplicate function definition (a known
merge artefact). Remove the second occurrence of `fn global_cap_key()`.

**Fix:** Open `src/storage.rs` and delete the duplicate block:
```
fn global_cap_key() -> Symbol {
    symbol_short!("g_cap")
}
```
Keep only one definition near the top of the persistent storage section.

### Error 3 — `stellar contract invoke` fails with `HostError: Error(Contract, #N)`

The number after `#` is the error code. Common ones for contributors:

| Code | Meaning | Fix |
|------|---------|-----|
| 5 | `UnauthorizedContributor` | `--source` key does not match `--contributor` address. Use `--source my-contributor-key` with the key you generated |
| 6 | `GlobalApplicationLimitReached` | You have 15 pending applications. Withdraw one first |
| 8 | `DuplicateApplication` | You already applied for this exact (org, issue). Check with `has_applied` |
| 9 | `ApplicationNotFound` | Application expired or never created. Re-apply |

To get verbose error output:
```bash
stellar contract invoke --id "$CONTRACT_ID" --network testnet --verbose \
  --source my-contributor-key \
  -- apply_for_issue --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id rust_libs --issue_id 42
```

### Error 4 — Friendbot returns `{"status": 400, "detail": "..."}`

**Cause:** The account is already funded, or Friendbot is temporarily unavailable.

**Fix:**
```bash
# Check if already funded
stellar account show $CONTRIBUTOR_ADDRESS --network testnet
# If balance > 0, no action needed.
```

### Error 5 — `docker compose up` fails with `port already in use`

**Cause:** PostgreSQL or Redis is already running on the default port.

**Fix:**
```bash
# Stop conflicting services
sudo systemctl stop postgresql redis-server
docker compose up -d postgres redis
```

### Error 6 — `cargo test` fails with `error: could not compile due to 2 previous errors`

**Cause:** The duplicate `global_cap_key` in `src/storage.rs` (see Error 2 above).

**Fix:** Same as Error 2 — remove the duplicate function.

### Error 7 — Horizon connection timeout in integration tests

**Cause:** Network connectivity issue to `https://horizon-testnet.stellar.org`, or
a firewall blocking outbound HTTPS.

**Fix:**
```bash
curl -s https://horizon-testnet.stellar.org | head -c 200
# If this fails, check your VPN or proxy settings.
```

### Error 8 — Application doesn't appear in `get_pending_applications`

**Cause:** The application TTL expired between the `apply_for_issue` call and the
`get_pending_applications` query. Soroban temporary storage is silently removed
when TTL reaches 0.

**Fix:** Re-apply and call `extend_application_ttl` within 12 hours to keep it live.

### Error 9 — `npm run validate:api` fails with `TypeError: Cannot read property`

**Cause:** API server is not running, or the `.env` file has incorrect values.

**Fix:**
```bash
# Make sure the server is up
npm run build && node dist/index.js &
sleep 2
npm run validate:api
```

### Error 10 — `cargo +nightly fuzz build` fails with `error: toolchain 'nightly' is not installed`

**Fix:**
```bash
rustup install nightly
rustup component add rust-src --toolchain nightly
cargo +nightly fuzz build
```

---

## 13. Fairness Model Quick Reference

| Cap | Limit | Scope | Reset mechanism |
|-----|-------|-------|----------------|
| Global application cap | 15 | All orgs combined | Withdraw a pending application, or wait for assignment |
| Org assignment cap | 4 | Per org | Maintainer calls `complete_assignment` or `revoke_assignment` |

Applications live in **temporary storage** (TTL ≈ 24 h). Assignments live in
**persistent storage** (no expiry — only cleared by maintainer action).

For a plain-English walkthrough with worked examples, see
[docs/fairness-explainer.md](fairness-explainer.md). For the formal invariants
and threat model, see [docs/fairness-model.md](fairness-model.md).

---

## 14. Complete Worked Example

A full contribution workflow from scratch on testnet:

```bash
# 1. One-time setup
stellar keys generate --global alice --network testnet
export ALICE=$(stellar keys address alice)
curl "https://friendbot.stellar.org/?addr=$ALICE"
export CONTRACT_ID=<CONTRACT_ID>

# 2. Check remaining capacity (fresh account: 15 slots free)
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_capacity --contributor "$ALICE"
# → 15

# 3. Apply for issue 42 in org rust_libs
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source alice \
  -- apply_for_issue \
  --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → null

# 4. List all pending applications
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_pending_applications --contributor "$ALICE"
# → [["rust_libs", 42]]

# 5. Confirm application is recorded
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- has_applied --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → true

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count --contributor "$ALICE"
# → 1

# 6. Extend TTL before it expires (call every ~12 hours during review)
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- extend_application_ttl \
  --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → null

# 7. (After maintainer assigns) — verify assignment
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- is_assigned --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → true

# 8. (If you change your mind before assignment) — withdraw
stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  --source alice \
  -- withdraw_application \
  --contributor "$ALICE" --org_id rust_libs --issue_id 42
# → null

stellar contract invoke --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count --contributor "$ALICE"
# → 0
```

---

## 15. Further Reading

- [README.md](../README.md) — project overview, building, and deploying
- [CONTRIBUTING.md](../CONTRIBUTING.md) — branch naming, commit convention, PR checklist
- [docs/video-scripts/quickstart.md](video-scripts/quickstart.md) — video walkthrough script and companion text guide
- [docs/fairness-model.md](fairness-model.md) — formal invariants and gaming analysis
- [docs/storage-design.md](storage-design.md) — all storage key patterns with TTL semantics
- [docs/error-reference.md](error-reference.md) — complete error code reference with examples
- [docs/api-reference.md](api-reference.md) — REST API reference for backend integration
- [docs/adr/](adr/) — architecture decision records explaining key design choices
- [Stellar Documentation](https://developers.stellar.org/docs/smart-contracts) — Soroban contract docs

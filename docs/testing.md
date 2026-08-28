# Testing Guide

Complete reference for running every test layer in the WorkloadGovernor project.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Localnet Setup (Stellar Quickstart)](#localnet-setup-stellar-quickstart)
3. [Environment Variables](#environment-variables)
4. [Contract Tests (Rust)](#contract-tests-rust)
5. [Property-Based Tests](#property-based-tests)
6. [Backend API Tests](#backend-api-tests)
7. [E2E Tests (Playwright)](#e2e-tests-playwright)
8. [Fuzz Tests](#fuzz-tests)
9. [Mutation Testing](#mutation-testing)
10. [Benchmarks](#benchmarks)
11. [CI Notes](#ci-notes)

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust + Cargo | stable ≥ 1.78 | `curl https://sh.rustup.rs -sSf \| sh` |
| `wasm32v1-none` target | — | `rustup target add wasm32v1-none` |
| Nightly Rust (fuzz only) | latest nightly | `rustup install nightly` |
| Stellar CLI | ≥ 21.x | [Install guide](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli) |
| Node.js | ≥ 20 LTS | [nodejs.org](https://nodejs.org) |
| Docker + Compose | ≥ 24 | [docker.com](https://www.docker.com/get-started) |
| `cargo-fuzz` (fuzz only) | latest | `cargo install cargo-fuzz --locked` |
| `cargo-mutants` (mutation) | latest | `cargo install cargo-mutants --locked` |

Verify tools:

```bash
rustc --version
stellar --version
node --version
docker compose version
```

Install Node dependencies from the project root:

```bash
npm install
```

---

## Localnet Setup (Stellar Quickstart)

The Stellar Quickstart Docker image runs a full local Stellar network — Horizon, Friendbot, and a Soroban RPC node — in a single container.  Use it when you want to run E2E tests or smoke tests against a real (but local) contract deployment.

### 1. Pull and start the Quickstart image

```bash
docker run --rm -it \
  --name stellar-localnet \
  -p 8000:8000 \
  stellar/quickstart:latest \
  --standalone \
  --enable-soroban-rpc
```

`--standalone` runs a private network (no Testnet/Mainnet connection).  
`--enable-soroban-rpc` exposes the Soroban JSON-RPC endpoint at `http://localhost:8000/soroban/rpc`.

Wait until the container logs show:

```
horizon: INFO started horizon server on 0.0.0.0:8000
soroban-rpc: INFO listening on :8080
```

### 2. Fund the admin account

```bash
# Friendbot funds any address on standalone / testnet
curl "http://localhost:8000/friendbot?addr=<ADMIN_PUBLIC_KEY>"
```

Replace `<ADMIN_PUBLIC_KEY>` with the value from your `.env` file.

### 3. Deploy the contract

```bash
# Build and optimise
stellar contract build
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

# Upload and deploy
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --network local \
  --source <ADMIN_SECRET_KEY>

# Initialise (replace CONTRACT_ID with output of the deploy step)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network local \
  --source <ADMIN_SECRET_KEY> \
  -- initialize \
  --admin <ADMIN_PUBLIC_KEY>
```

### 4. Configure the backend

Copy and edit the environment file:

```bash
cp .env.example .env
```

Update these keys to point at the local node and your deployed contract:

```dotenv
SOROBAN_RPC_URL=http://localhost:8000/soroban/rpc
STELLAR_NETWORK_PASSPHRASE=Standalone Network ; February 2017
CONTRACT_ID=<your deployed contract ID>
ADMIN_PUBLIC_KEY=<your admin public key>
ADMIN_SECRET_KEY=<your admin secret key>
```

Start the backend and database services:

```bash
docker compose up -d          # PostgreSQL + Redis
npm run dev                   # backend on http://localhost:3000
```

---

## Environment Variables

The following variables are read by the backend, the Playwright E2E suite, and
the smoke tests.  Copy `.env.example` to `.env` and fill in the values.

| Variable | Description | Default (localnet) |
|---|---|---|
| `SOROBAN_RPC_URL` | Soroban JSON-RPC endpoint | `http://localhost:8000/soroban/rpc` |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase | `Standalone Network ; February 2017` |
| `CONTRACT_ID` | Deployed contract ID | *(empty — set after deploy)* |
| `ADMIN_PUBLIC_KEY` | Admin G-address | *(generate with `stellar keys generate`)* |
| `ADMIN_SECRET_KEY` | Admin secret key (S-address) | *(generate with `stellar keys generate`)* |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/workload_governor` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |

In CI, inject `ADMIN_PUBLIC_KEY` and `ADMIN_SECRET_KEY` as GitHub Actions secrets.
The E2E test file `tests/e2e/admin-maintainer-flow.spec.ts` reads them via
`process.env` and falls back to safe test-only defaults when absent.

---

## Contract Tests (Rust)

The contract's unit and integration tests live in `src/test.rs` and `tests/`.
They use the Soroban test utilities crate (enabled by the `testutils` feature flag).

```bash
# Run all contract tests
cargo test --features testutils

# Run a specific test by name (supports partial match)
cargo test --features testutils unit_register_maintainer

# Show stdout output from tests (useful for debugging)
cargo test --features testutils -- --nocapture
```

All Rust tests run against an in-process Soroban ledger — no running node is needed.

---

## Property-Based Tests

Property-based tests use `fast-check` and live alongside the unit tests in
`tests/unit/`.  They cover the global application cap and org assignment cap
invariants.

```bash
# Run all property-based tests (prefix: prop_)
npm test -- --testPathPattern="prop_"

# Or use the Vitest runner (preferred for frontend property tests):
npm run test:unit -- prop_
```

Key property test files:

| File | Invariant |
|---|---|
| `tests/unit/prop_global_app_limit.test.ts` | Global application count never exceeds 15 |
| `tests/unit/prop_org_assign_limit.test.ts` | Org assignment count never exceeds the org cap |

---

## Backend API Tests

The backend API tests use Jest + Supertest with an in-memory mock database
(`tests/api/setup.ts` — `MockPool`).  No running PostgreSQL or Soroban node is
required.

```bash
# Run all backend tests (API + unit + integration)
npm test

# Run API tests only
npm test -- --testPathPattern="tests/api"

# Run with coverage
npm run coverage:backend
```

Key test files:

| File | Coverage |
|---|---|
| `tests/api/transactions.test.ts` | Apply, withdraw, assign, complete, revoke transactions |
| `tests/api/admin.test.ts` | Maintainer registration, org registration, auth guard |
| `tests/api/contributors.test.ts` | Contributor counts and cap enforcement |
| `tests/api/webhooks.test.ts` | GitHub webhook processing |
| `tests/api/rate-limit.test.ts` | Rate limiting per wallet / IP |

---

## E2E Tests (Playwright)

End-to-end tests intercept HTTP calls with `page.route()` — no real backend or
Stellar node is required unless you explicitly want to run against localnet.

### Install Playwright browsers (first time only)

```bash
npx playwright install --with-deps
```

### Run the full E2E suite

```bash
npx playwright test
```

### Run a single spec file

```bash
npx playwright test tests/e2e/admin-maintainer-flow.spec.ts
```

### Run with trace and screenshot on all tests

```bash
npx playwright test --trace on --screenshot on
```

### View the HTML report after a run

```bash
npx playwright show-report
```

### E2E spec inventory

| File | Feature |
|---|---|
| `tests/e2e/admin-maintainer-flow.spec.ts` | Admin registers / deregisters maintainers; error codes 4 and 17 |
| `tests/e2e/apply-withdraw-flow.spec.ts` | Contributor apply and withdraw lifecycle |
| `tests/e2e/global-cap.spec.ts` | Global application cap (15) enforcement |
| `tests/e2e/maintainer-flow.spec.ts` | Maintainer panel — assign, complete, revoke, access control |
| `tests/e2e/gauge-increment.spec.ts` | Gauge counter increment after events |
| `tests/e2e/apply-flow.spec.ts` | Basic contributor apply flow |

### Admin maintainer flow — environment variables in CI

The `admin-maintainer-flow.spec.ts` suite reads admin credentials from
environment variables so CI can inject ephemeral keys:

```yaml
# .github/workflows/e2e.yml (excerpt)
- name: Run E2E tests
  env:
    ADMIN_PUBLIC_KEY: ${{ secrets.ADMIN_PUBLIC_KEY }}
    ADMIN_SECRET_KEY: ${{ secrets.ADMIN_SECRET_KEY }}
  run: npx playwright test
```

When the variables are absent (local dev), the file falls back to safe
mock-only keys that never reach a real network.

### Running E2E tests against localnet

Set `baseURL` in `playwright.config.ts` or override at run time:

```bash
BASE_URL=http://localhost:3000 npx playwright test
```

Ensure the backend is running and the contract is deployed and initialised
before starting the test run (see [Localnet Setup](#localnet-setup-stellar-quickstart)).

---

## Fuzz Tests

Fuzz targets live in `fuzz/fuzz_targets/` and require the nightly Rust
toolchain plus `cargo-fuzz`.

```bash
# Install cargo-fuzz (nightly required)
rustup install nightly
cargo install cargo-fuzz --locked

# Build all fuzz targets
cargo +nightly fuzz build

# Run a target for 10 minutes
cargo +nightly fuzz run fuzz_apply      -- -max_total_time=600
cargo +nightly fuzz run fuzz_assign     -- -max_total_time=600
cargo +nightly fuzz run fuzz_batch_apply -- -max_total_time=600

# Run with pre-seeded corpus
cargo +nightly fuzz run fuzz_apply fuzz/corpus/fuzz_apply -- -max_total_time=600
```

| Target | What it tests |
|---|---|
| `fuzz_apply` | Random contributor / org / issue inputs to `apply_for_issue` |
| `fuzz_assign` | Random inputs to `assign_issue`, `complete_assignment`, `revoke_assignment` |
| `fuzz_batch_apply` | Batch apply with random issue IDs; enforces ≤ 15 global cap |

Any corpus inputs that exposed a bug are committed to `fuzz/corpus/`.

### Regenerate seed corpus

```bash
python3 scripts/generate-corpus.py          # writes to fuzz/corpus/
python3 scripts/generate-corpus.py --corpus-dir /tmp/fresh-corpus
```

The script is idempotent — re-running overwrites canonical seeds and leaves
fuzzer-discovered inputs untouched.

---

## Mutation Testing

[cargo-mutants](https://mutants.rs) verifies that the test suite catches logic
errors by introducing small mutations to the contract source and confirming
that at least one test fails per mutant.

```bash
# Run mutation testing against the contract source
cargo mutants --features testutils -- src/lib.rs

# Generate the HTML + text report
node scripts/mutation-report.js mutants.out/

# Text summary only
node scripts/mutation-report.js --text-only

# Enforce a score threshold (exits non-zero if below)
node scripts/mutation-report.js --threshold=90 --text-only
```

The badge in `README.md` reflects the last recorded run.  After adding or
changing tests, re-run `cargo mutants` and update `mutants.out/` to refresh
the badge.

Current recorded score: **75% (21/28 caught)** — target is ≥ 90%.

---

## Benchmarks

Benchmark tests measure CPU instructions and simulated memory for common
contract operations.

```bash
# Run benchmarks (prints to stdout)
cargo test --features testutils bench_

# Capture output for documentation
cargo test --features testutils bench_ 2>&1 | tee benchmarks.txt
```

Benchmark results are documented in [docs/benchmarks.md](benchmarks.md).

---

## CI Notes

The GitHub Actions workflow at `.github/workflows/ci.yml` runs the following
checks on every pull request:

- `cargo test --features testutils` — all Rust contract tests
- `npm test` — all backend API + unit tests
- `npx playwright test` — all E2E tests (workers = 1 in CI, 1 retry)
- `npm run typecheck` — TypeScript type checking
- `npm run lint` — ESLint

The contract pipeline at `.github/workflows/contract-pipeline.yml` additionally
runs `cargo mutants` and publishes the mutation score badge.

Secrets required in the repository settings for E2E tests to use real credentials:

| Secret | Description |
|---|---|
| `ADMIN_PUBLIC_KEY` | Admin G-address for contract interactions |
| `ADMIN_SECRET_KEY` | Admin secret key (S-address) |

When these secrets are absent, the E2E tests fall back to mock-only keys and
all network calls are intercepted by `page.route()`.

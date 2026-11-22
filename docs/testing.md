# Testing Guide

Complete reference for running every test layer in the WorkloadGovernor project.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Localnet Setup (Stellar Quickstart)](#localnet-setup-stellar-quickstart)
3. [Environment Variables](#environment-variables)
4. [Test Runner Configuration](#test-runner-configuration)
5. [Command Reference](#command-reference)
6. [Contract Tests (Rust)](#contract-tests-rust)
7. [Property-Based Tests](#property-based-tests)
8. [Backend API Tests](#backend-api-tests)
9. [E2E Tests (Playwright)](#e2e-tests-playwright)
10. [Fuzz Tests](#fuzz-tests)
11. [Mutation Testing](#mutation-testing)
12. [Benchmarks](#benchmarks)
13. [CI Notes](#ci-notes)

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

## Test Runner Configuration

The repository has three JavaScript test runners (Jest, Vitest, Playwright)
plus Cargo, spread across seven config files. Each config file covers a
different set of test files. Pick the command by the file you are working on,
not by the directory it happens to sit in.

### Config inventory

| Config file | Runner | Test files covered (globs) | Environment | Command |
|---|---|---|---|---|
| `jest.config.js` → project `unit` | Jest + ts-jest | `tests/unit/**/*.test.ts` | node | `npx jest -c jest.config.js --selectProjects unit` |
| `jest.config.js` → project `api` | Jest + ts-jest | `tests/api/**/*.test.ts` (global setup `tests/api/setup.ts`, `MockPool`) | node | `npx jest -c jest.config.js --selectProjects api` |
| `jest.config.js` → project `contract` | Jest + ts-jest | `tests/contract/**/*.test.ts` (OpenAPI response-shape tests) | node | `npm run test:contract` |
| `jest.config.ts` | Jest + ts-jest | `tests/**/*.test.ts`, including `tests/routes/`, `tests/integration/`, and `tests/multi-org.test.ts` | node | `npx jest -c jest.config.ts` |
| `vitest.config.ts` → project `prop` | Vitest | `tests/unit/prop_*.test.ts` | node | `npm run test:unit -- --project prop` |
| `vitest.config.ts` → project `unit-jsdom` | Vitest | `tests/unit/**/*.test.tsx` | jsdom | `npm run test:unit -- --project unit-jsdom` |
| `vitest.unit.config.ts` | Vitest | `tests/unit/**/*.test.{ts,tsx}` (coverage over `frontend/src/**`) | jsdom | `npx vitest run --config vitest.unit.config.ts` |
| `frontend/vitest.config.ts` | Vitest | `frontend/src/**/*.test.{ts,tsx}` | jsdom | `npm --prefix frontend test` |
| `backend/vitest.config.ts` | Vitest | `backend/src/**/*.test.ts` | node | `cd backend && npx vitest run` |
| `backend/package.json` → `"jest"` | Jest + ts-jest | `backend/src/**` Jest default (`__tests__/`, `*.test.ts`) | node | `npm --prefix backend test` |
| `playwright.config.ts` | Playwright | `tests/e2e/**` | Chromium | `npx playwright test` |
| `Cargo.toml` (`testutils` feature) | cargo test | `src/test.rs`, `tests/*.rs` | in-process Soroban ledger | `cargo test --features testutils` |

> **Two root Jest configs.** Jest refuses to start when it finds both
> `jest.config.js` and `jest.config.ts` without an explicit `--config`:
>
> ```
> ● Multiple configurations found:
>     * jest.config.js
>     * jest.config.ts
> ```
>
> Until one of them is removed, pass `-c jest.config.js` (or
> `-c jest.config.ts`) when running Jest from the repository root, e.g.
> `npm test -- -c jest.config.js`. `jest.config.js` is the primary config: it
> defines the `unit` / `api` / `contract` projects that `npm run test:contract`
> and `npm run coverage:backend` rely on.

### Why the configs are split

**Jest vs Vitest at the root.** The backend service code in `src/` was tested
with Jest first, and most files in `tests/unit/*.test.ts` and all of
`tests/api/` use Jest-only APIs (`jest.mock`, `jest.fn`). They must run under
Jest. Newer tests use Vitest. This is either because they are
React components that need jsdom and the same Vite/React plugin chain as the
frontend (`tests/unit/*.test.tsx`), or because they are pure property-based
tests (`fast-check`) that have no Jest dependency and run faster under Vitest
(`tests/unit/prop_*.test.ts`). The root `vitest.config.ts` includes only
those two groups, so that Vitest never tries to run a Jest-API file.

**`vitest.config.ts` vs `vitest.unit.config.ts`.**

| | `vitest.config.ts` | `vitest.unit.config.ts` |
|---|---|---|
| Structure | Two named projects (`prop` in node, `unit-jsdom` in jsdom) | One flat project, everything in jsdom |
| Includes | `prop_*.test.ts` + `*.test.tsx` only | Every `tests/unit/*.test.{ts,tsx}` file |
| Coverage | None configured (backend coverage comes from Jest) | V8 over `frontend/src/**` (`text` + `lcov`) |
| `@tokens` alias | No | Yes (`frontend/src/tokens.json`) |
| Used by | `npm run test:unit`, `coverage.yml` | Manual runs only |

`vitest.config.ts` is the safe default: it runs only files known to be
Vitest-compatible, each in the right environment. `vitest.unit.config.ts` is
a lightweight single-project config with no Storybook or browser project. Use
it when you want frontend coverage for components tested from `tests/unit/`,
or need the `@tokens` alias. Because it also picks up the Jest-API `.ts`
files, expect those to fail under it. Filter to the files you care about,
e.g. `npx vitest run --config vitest.unit.config.ts WithdrawConfirmModal`.

**Frontend and backend packages.** `frontend/` and `backend/` are separate npm
packages with their own `node_modules`, so each has its own config.
`frontend/vitest.config.ts` owns the component tests that sit next to source
files and enforces a 75% coverage threshold. `backend/` (the Horizon
service) currently has one Vitest file (`src/scheduler.test.ts`, run with
`backend/vitest.config.ts`) and one Jest file
(`src/__tests__/HorizonService.test.ts`, run with `npm test` in `backend/`,
which enforces 100% coverage). Neither `backend/` runner is wired into CI.

---

## Command Reference

Run from the repository root unless noted.

**Rust contract**

| Command | What it runs |
|---|---|
| `cargo test --features testutils` | All contract unit, integration, and property tests |
| `cargo test --features testutils unit_` | Contract unit tests only (name filter) |
| `cargo test --features testutils prop_` | Contract property-based tests only (name filter) |
| `cargo test --features testutils bench_ -- --nocapture` | Benchmark tests, printing CPU/memory figures |
| `cargo llvm-cov --features testutils --lcov --output-path coverage/contract/lcov.info` | Contract tests with coverage (as in `coverage.yml`) |
| `cargo mutants` | Mutation testing (see [Mutation Testing](#mutation-testing)) |
| `cargo +nightly fuzz run <target>` | A fuzz target (see [Fuzz Tests](#fuzz-tests)) |

**Root package (backend service in `src/`)**

| Command | What it runs |
|---|---|
| `npm test -- -c jest.config.js` | Jest: `unit` + `api` + `contract` projects (`npm test` without `-c` currently fails; see above) |
| `npm test -- -c jest.config.js --selectProjects api` | Jest: API tests in `tests/api/` only |
| `npm run test:contract` | Jest: OpenAPI response-shape contract tests in `tests/contract/` |
| `npm run coverage:backend` | Jest with coverage (`lcov` + `text`), 80% global threshold |
| `npm run test:unit` | Vitest (`vitest.config.ts`): `prop` + `unit-jsdom` projects |
| `npm run test:unit -- --project prop` | Vitest: property-based tests only |
| `npm run test:unit:watch` | Vitest in watch mode |
| `npm run test:unit:coverage` | Vitest with coverage |
| `npx vitest run --config vitest.unit.config.ts` | Vitest: flat jsdom run over all `tests/unit/`, V8 coverage of `frontend/src` |
| `npx playwright test` | Playwright E2E suite in `tests/e2e/` |
| `npm run coverage` | `coverage:backend` then `coverage:frontend` |

**Frontend package**

| Command | What it runs |
|---|---|
| `npm --prefix frontend test` | Vitest (`frontend/vitest.config.ts`): all `frontend/src/**/*.test.{ts,tsx}` |
| `npm --prefix frontend run coverage` | The same with Istanbul coverage into `frontend/coverage/` (75% threshold) |
| `npm --prefix frontend run test:e2e` | Playwright from `frontend/` |
| `npm --prefix frontend run test:responsive` | Playwright responsive spec only |

**Backend package**

| Command | What it runs |
|---|---|
| `npm --prefix backend test` | Jest with coverage over `backend/src` (100% threshold) |
| `cd backend && npx vitest run` | Vitest (`backend/vitest.config.ts`) over `backend/src/**/*.test.ts` |

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

### Workflow ↔ config mapping

| Workflow | Job | Command | Config used |
|---|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | `ci` | `npm test` | Root Jest (subject to the two-config caveat above) |
| [`ci.yml`](../.github/workflows/ci.yml) | `ci` | `npm run test:contract` | `jest.config.js` → `contract` |
| [`openapi-validate.yml`](../.github/workflows/openapi-validate.yml) | `contract-tests` | `npm run test:contract` | `jest.config.js` → `contract` |
| [`openapi-validate.yml`](../.github/workflows/openapi-validate.yml) | `validate-api` | `npm run validate:api` | Dredd + `dredd-hooks.js` (note: no `validate:api` script is currently defined in `package.json`) |
| [`backend-integration.yml`](../.github/workflows/backend-integration.yml) | `integration` | `npm test -- --testPathPattern="tests/api"` | Root Jest, against a real PostgreSQL service |
| [`frontend-ci.yml`](../.github/workflows/frontend-ci.yml) | `frontend-ci` | `npm test` (in `frontend/`) | `frontend/vitest.config.ts` |
| [`frontend.yml`](../.github/workflows/frontend.yml) | `build` | `npm test -- --watchAll=false` (in `frontend/`) | `frontend/vitest.config.ts` |
| [`coverage.yml`](../.github/workflows/coverage.yml) | `coverage-backend` | `npx vitest run --config vitest.config.ts --coverage` | Root `vitest.config.ts` |
| [`coverage.yml`](../.github/workflows/coverage.yml) | `coverage-frontend` | `npx vitest run --config frontend/vitest.config.ts --coverage` | `frontend/vitest.config.ts` |
| [`coverage.yml`](../.github/workflows/coverage.yml) | `coverage-contract` | `cargo llvm-cov --features testutils --lcov` | `Cargo.toml` |
| [`contract-ci.yml`](../.github/workflows/contract-ci.yml) | `test` | `cargo llvm-cov --features testutils --lcov --summary-only` | `Cargo.toml` |
| [`contract-pipeline.yml`](../.github/workflows/contract-pipeline.yml) | `test` | `cargo llvm-cov --features testutils` (full suite) | `Cargo.toml` |
| [`e2e.yml`](../.github/workflows/e2e.yml) | `e2e` | `npx playwright test` | `playwright.config.ts` |
| [`smoke-tests.yml`](../.github/workflows/smoke-tests.yml) | `smoke` | `bash tests/smoke/testnet-smoke.sh` (manual dispatch) | — |

Not run by any workflow: `vitest.unit.config.ts`, `backend/vitest.config.ts`,
the `backend/package.json` Jest config, and `jest.config.ts` when selected
explicitly.

The contract pipeline at `.github/workflows/contract-pipeline.yml` additionally
runs fuzzing and publishes the mutation report.

### Coverage reporting (`codecov.yml`)

Coverage is uploaded to Codecov as three separate **flags**, one per upload in
`coverage.yml`. Each flag has its own project and patch targets:

| Flag | Paths | Produced by | Project target | Patch target |
|---|---|---|---|---|
| `backend` | `src/` | `coverage-backend` job, upload `./coverage/backend/lcov.info` | 80% (±2%) | 70% |
| `frontend` | `frontend/src/` | `coverage-frontend` job, upload `./coverage/frontend/lcov.info` | 75% (±2%) | 65% |
| `contract` | `src/` (Rust) | `coverage-contract` job, upload `./coverage/contract/lcov.info`; also `contract-pipeline.yml` | 90% (±1%) | 80% |

- **Overall status:** the combined project check targets 80% and fails on a
  drop of more than 2%. The default patch check targets 70% of changed lines
  (±5%).
- **Carryforward:** all flags use `carryforward: true`. When a run does not
  upload a flag (for example, a workflow was skipped by a path filter),
  Codecov reuses that flag's last good upload instead of treating it as 0%.
- **Ignored paths:** `tests/`, `infra/`, `docs/`, `*.md`, `dist/`,
  `coverage/`, `node_modules/`, and `target/` never count towards coverage.
- **PR comment:** Codecov updates a single comment per PR, and only when
  coverage changes, with carryforward flags shown.

Things to know when reading coverage numbers:

- `backend` and `contract` share the `src/` path. The TypeScript and Rust
  sources live side by side, so each flag's percentage is computed over
  whatever files its lcov report actually contains.
- Local reporters write to each config's default directory (`coverage/` at
  the root, `frontend/coverage/` for the frontend). The `coverage.yml` uploads
  expect `coverage/backend/` and `coverage/frontend/`. If an upload reports a
  missing file, compare the `reportsDirectory` in the config with the `files:`
  path in the workflow.
- Local thresholds are separate from Codecov targets: `jest.config.js`
  enforces 80%, `frontend/vitest.config.ts` 75%, and `backend/package.json`
  100%.

### Secrets

Secrets required in the repository settings for E2E tests to use real credentials:

| Secret | Description |
|---|---|
| `ADMIN_PUBLIC_KEY` | Admin G-address for contract interactions |
| `ADMIN_SECRET_KEY` | Admin secret key (S-address) |

When these secrets are absent, the E2E tests fall back to mock-only keys and
all network calls are intercepted by `page.route()`.

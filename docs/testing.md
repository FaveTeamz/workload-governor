# Testing Guide

This document describes every test layer in WorkloadGovernor, how to run each suite locally, and what the CI pipelines check.

---

## Table of Contents

1. [Test Layers Overview](#1-test-layers-overview)
2. [Unit Tests — Rust Contract](#2-unit-tests--rust-contract)
3. [Unit Tests — TypeScript Backend](#3-unit-tests--typescript-backend)
4. [Unit Tests — Frontend](#4-unit-tests--frontend)
5. [Integration Tests — API Routes](#5-integration-tests--api-routes)
6. [E2E Tests](#6-e2e-tests)
7. [Smoke Tests](#7-smoke-tests)
8. [Load Tests](#8-load-tests)
9. [Fuzz Tests](#9-fuzz-tests)
10. [Mutation Testing](#10-mutation-testing)
11. [CI Pipeline Map](#11-ci-pipeline-map)

---

## 1. Test Layers Overview

| Layer | Tool | Location | What it covers |
|---|---|---|---|
| Rust unit | `cargo test` | `src/test.rs` | Contract function invariants, error codes |
| Rust property | `cargo test` | `src/test.rs` (prop_ prefix) | Cap enforcement under random inputs |
| TS backend unit | Vitest | `tests/unit/` | Pure functions, XDR utilities, hooks |
| TS API routes | Vitest + Supertest | `tests/routes/`, `tests/api/` | HTTP request/response contract |
| Frontend unit | Vitest | `frontend/tests/unit/` | React component rendering and hooks |
| E2E frontend | Playwright | `tests/e2e/*.spec.ts` | SPA user flows against a live dev server |
| E2E contract | Playwright | `tests/e2e/contributor-lifecycle.spec.ts` | Full contributor lifecycle via REST API |
| Smoke | Bash | `tests/smoke/` | Testnet sanity checks after deploy |
| Load | k6 | `tests/load/` | Throughput and latency under sustained load |
| Fuzz | cargo-fuzz | `fuzz/fuzz_targets/` | LibFuzzer against contract entry points |
| Mutation | cargo-mutants | `src/lib.rs` | Logic-error detection in contract tests |

---

## 2. Unit Tests — Rust Contract

```bash
# All contract tests
cargo test --features testutils

# Property-based tests only
cargo test --features testutils prop_

# Unit tests only
cargo test --features testutils unit_

# Benchmark tests (prints resource usage)
cargo test --features testutils bench_
```

Tests live in `src/test.rs`. Property-based tests use randomised inputs to verify that the global-application cap (15) and org-assignment cap (4) are never exceeded.

---

## 3. Unit Tests — TypeScript Backend

```bash
npm test
# or
npx vitest run
```

Configuration: `vitest.config.ts` and `vitest.unit.config.ts`.

Backend-specific tests with their own setup are under `backend/`:

```bash
cd backend
npm test
```

---

## 4. Unit Tests — Frontend

```bash
cd frontend
npm test
# or
npx vitest run
```

Component rendering, hook behaviour, and snapshot tests live under `frontend/tests/unit/` and `frontend/src/components/*.test.tsx`.

---

## 5. Integration Tests — API Routes

Supertest-based route tests exercise the full HTTP stack with an in-memory database mock:

```bash
npx vitest run tests/routes
npx vitest run tests/api
```

The mock database (`tests/api/setup.ts`) uses an in-memory SQL engine — no real Postgres or Redis is needed.

---

## 6. E2E Tests

### Frontend SPA flows

Playwright tests that exercise the running SPA through a real browser:

```bash
# Start the dev server first
npm run dev &

# Run all Playwright specs
npx playwright test

# Run a specific spec
npx playwright test tests/e2e/maintainer-flow.spec.ts

# Show the HTML report
npx playwright show-report
```

Configuration: `playwright.config.ts`

#### Specs

| File | What it tests |
|---|---|
| `tests/e2e/maintainer-flow.spec.ts` | MaintainerPanel assign / complete / revoke / access control |
| `tests/e2e/apply-flow.spec.ts` | Contributor apply button and withdraw flow |
| `tests/e2e/global-cap.spec.ts` | UI response when the global application cap is reached |
| `tests/e2e/gauge-increment.spec.ts` | Gauge animation on counter change |

---

### Contract E2E — contributor lifecycle

The `contributor-lifecycle.spec.ts` test covers the complete happy path of a contributor interacting with the contract through the REST API:

```
setup → contributor applies → maintainer assigns → maintainer completes
```

It asserts intermediate contract states at every step:

| Step | Assertion |
|---|---|
| After apply | `global_app_count ≥ 1` |
| After assign | `org_assignment_count ≥ 1`, `global_app_count = 0` |
| After complete | `org_assignment_count = 0`, `global_app_count = 0` |
| Final | Completed assignment absent from active assignments list |

It also covers the withdraw sub-flow:

```
contributor applies → contributor withdraws → global_app_count = 0
```

#### Running locally

```bash
# 1. Start the backend server
npm run dev &

# 2. Wait for the health endpoint
curl http://localhost:3001/health

# 3. Run the lifecycle spec
npx playwright test tests/e2e/contributor-lifecycle.spec.ts
```

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:3001` | Base URL of the backend API |
| `E2E_API_KEY` | `test-token` | Bearer token for authenticated endpoints |

#### CI workflow

The lifecycle spec runs in the `contract-e2e` GitHub Actions workflow (`.github/workflows/contract-e2e.yml`):

1. Spins up Redis as a service container.
2. Starts the backend.
3. Waits up to 30 s for the health endpoint.
4. Runs `contributor-lifecycle.spec.ts`.
5. Uploads the Playwright HTML report as an artifact.

The workflow triggers on every push to `main`, every PR targeting `main`, and on `workflow_dispatch`.

#### Teardown and isolation

Each test run generates a unique `issue_id` derived from `Date.now()` to prevent collisions between parallel runs. The `afterAll` hook performs best-effort cleanup by withdrawing any residual application and deleting any residual assignment.

---

## 7. Smoke Tests

Smoke tests validate a live testnet deployment:

```bash
# Full testnet smoke (requires STELLAR_NETWORK=testnet and valid keys)
bash tests/smoke/testnet-smoke.sh

# CI-only smoke (lighter, no testnet keys needed)
bash tests/smoke/ci-smoke.sh
```

---

## 8. Load Tests

k6 load tests target the staging environment:

```bash
# Requires k6 installed: https://k6.io/docs/getting-started/installation/
k6 run tests/load/k6-staging.js
```

---

## 9. Fuzz Tests

```bash
# Requires nightly Rust + cargo-fuzz
rustup install nightly
cargo install cargo-fuzz --locked

# Build fuzz targets
cargo +nightly fuzz build

# Run a target for 10 minutes
cargo +nightly fuzz run fuzz_apply -- -max_total_time=600
```

Fuzz targets live in `fuzz/fuzz_targets/`. Pre-seeded corpus inputs are in `fuzz/corpus/`.

---

## 10. Mutation Testing

```bash
cargo install cargo-mutants --locked
cargo mutants --features testutils -- src/lib.rs
```

See `mutants.out/` for the last recorded run. The current score and target are documented in the README.

---

## 11. CI Pipeline Map

| Workflow file | Trigger | What it runs |
|---|---|---|
| `.github/workflows/ci.yml` | Push / PR to main | Backend unit + route tests |
| `.github/workflows/contract-ci.yml` | Push / PR to main | Rust lint, tests, benchmarks |
| `.github/workflows/contract-pipeline.yml` | Push / PR / nightly | Rust full pipeline + fuzz |
| `.github/workflows/contract-e2e.yml` | Push / PR to main | Contributor lifecycle E2E |
| `.github/workflows/e2e.yml` | Push / PR to main | Frontend Playwright E2E |
| `.github/workflows/frontend-ci.yml` | Push / PR to main | Frontend unit tests |
| `.github/workflows/backend-integration.yml` | Push / PR to main | Backend integration tests |
| `.github/workflows/coverage.yml` | Push / PR to main | Coverage reporting to Codecov |
| `.github/workflows/smoke-tests.yml` | After staging deploy | Smoke tests |

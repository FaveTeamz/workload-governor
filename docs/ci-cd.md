# CI/CD Pipeline

This document describes the Continuous Integration and Continuous Deployment (CI/CD) workflows for the WorkloadGovernor project.

---

## Frontend CI — `.github/workflows/frontend.yml`

### Purpose

Catches build failures, lint errors, type errors, test regressions, and Storybook breakage before any PR can be merged to `main`.

### Trigger

| Event | Branches |
|---|---|
| `pull_request` | targeting `main` |
| `push` | `main` |

### Jobs

#### `build` — Lint → Test → Build

Runs steps in fail-fast order: lint and type-check execute first so style errors surface quickly without waiting for slower test and build steps.

| Step | Command | Purpose |
|---|---|---|
| Install dependencies | `npm ci` | Reproducible install from `package-lock.json` |
| Lint | `npm run lint` | oxlint + Next.js ESLint rules |
| Type-check | `npm run typecheck` | `tsc --noEmit` — catches TS errors without emitting files |
| Unit tests | `npm test -- --watchAll=false` | Vitest unit suite (non-interactive, CI-safe flag) |
| Build | `npm run build` | Next.js production build |

#### `storybook` — Build Storybook

Runs in parallel with the `build` job. Builds the static Storybook site and uploads it as a GitHub Actions artifact named `storybook-static` for PR preview.

| Step | Command | Purpose |
|---|---|---|
| Install dependencies | `npm ci` | Reproducible install |
| Build Storybook | `npm run build-storybook` | Produces `frontend/storybook-static/` |
| Upload artifact | `actions/upload-artifact@v4` | 7-day retention, downloadable from the Actions run summary |

### Dependency Caching

`node_modules` is cached via `actions/cache@v4` keyed on the SHA-256 hash of `frontend/package-lock.json`. Both jobs share the same cache key so the cache is populated once and reused.

```
key:   frontend-node-<os>-<hash of package-lock.json>
restore-keys:
  frontend-node-<os>-
```

An exact cache hit skips `npm ci` I/O entirely. A partial hit restores the closest prior cache and `npm ci` installs only the delta.

### Fail-fast ordering

```
Lint ──► Type-check ──► Tests ──► Build
```

Each step only runs if the preceding step passes. This surfaces the cheapest failures first.

### Storybook artifact preview

After the Storybook job completes, navigate to the Actions run → **Artifacts** → `storybook-static`. Download and unzip the archive, then open `index.html` locally to browse the component library as it would appear post-merge.

Artifacts are retained for **7 days**.

---

## Other Workflows

| Workflow | File | Purpose |
|---|---|---|
| Contract CI | `.github/workflows/contract-ci.yml` | Rust build, unit tests, property tests, WASM optimisation |
| Contract Pipeline | `.github/workflows/contract-pipeline.yml` | Full deploy pipeline (testnet / mainnet) |
| Coverage | `.github/workflows/coverage.yml` | Uploads coverage reports to Codecov |
| Staging Deploy | `.github/workflows/staging-deploy.yml` | ECS rolling deploy to staging on merge to `main` |
| Dependency Audit | `.github/workflows/dependency-audit.yml` | npm audit + cargo audit on schedule |
| Chromatic | `.github/workflows/chromatic.yml` | Visual regression testing via Chromatic |
| Fuzz Weekly | `.github/workflows/fuzz-weekly.yml` | Scheduled 10-minute fuzz runs for each target |
| Backend Integration | `.github/workflows/backend-integration.yml` | Node.js backend integration tests |
| Benchmark Regression | `.github/workflows/benchmark-regression.yml` | Contract CPU/memory regression guard |

---

## Local validation

Before pushing, you can reproduce every CI step locally:

```bash
cd frontend

# Install
npm ci

# Lint
npm run lint

# Type-check
npm run typecheck

# Unit tests (non-watch)
npm test -- --watchAll=false

# Build
npm run build

# Storybook
npm run build-storybook
```

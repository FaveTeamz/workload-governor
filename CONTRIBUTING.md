# Contributing to WorkloadGovernor

<<<<<<< HEAD
Thank you for contributing to WorkloadGovernor! This guide explains how to set up
your development environment, run tests, and keep the API spec in sync with the
implementation.
=======
Thank you for helping improve WorkloadGovernor! This guide covers everything
you need to know to contribute effectively.
>>>>>>> upstream/main

---

## Table of Contents

<<<<<<< HEAD
1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Environment Variables](#environment-variables)
4. [Running the API Server](#running-the-api-server)
5. [Running Tests](#running-tests)
6. [API Spec Validation](#api-spec-validation)
7. [Frontend Development](#frontend-development)
8. [Code Style](#code-style)
9. [Pull Request Process](#pull-request-process)

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 20.x | Backend runtime |
| npm | 10.x | Package manager |
| PostgreSQL | 16.x | Primary database |
| Redis | 7.x | Event queue / cache |
| Docker | 24.x | Local services via docker-compose |
| Rust + Cargo | 1.78+ | Smart contract (optional for API dev) |

---

## Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/FaveTeamz/workload-governor.git
cd workload-governor

# 2. Install Node.js dependencies
npm ci

# 3. Copy example env file and fill in values
cp .env.example .env

# 4. Start local PostgreSQL and Redis via Docker
docker compose up -d postgres redis

# 5. Apply database migrations (when they exist)
# npm run db:migrate

# 6. Build TypeScript
npm run build
=======
1. [Getting Started](#getting-started)
2. [Reporting Bugs](#reporting-bugs)
3. [Proposing Features](#proposing-features)
4. [Development Workflow](#development-workflow)
5. [Branch Naming](#branch-naming)
6. [Commit Convention](#commit-convention)
7. [PR Checklist](#pr-checklist)
8. [Changelog Requirements](#changelog-requirements)
9. [Versioning Convention (Semver)](#versioning-convention-semver)
10. [Release Process](#release-process)
11. [Code Style](#code-style)
12. [Testing](#testing)
13. [Code of Conduct](#code-of-conduct)

---

## Getting Started

```bash
# 1. Fork the repository and clone your fork
git clone https://github.com/<your-username>/workload-governor.git
cd workload-governor

# 2. Add the upstream remote
git remote add upstream https://github.com/FaveTeamz/workload-governor.git

# 3. Install the Soroban toolchain
rustup target add wasm32v1-none
cargo install --locked stellar-cli

# 4. Verify everything builds and tests pass
cargo build --target wasm32v1-none --release
cargo test --features testutils
>>>>>>> upstream/main
```

If you prefer to interact with the deployed contract directly via CLI rather than
building from source, see [docs/contributor-guide.md](docs/contributor-guide.md)
for a complete CLI workflow walkthrough — no frontend required.

---

<<<<<<< HEAD
## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `PORT` | `3001` | API server port |
| `NODE_ENV` | `development` | Node environment |
| `LOG_LEVEL` | `info` | Pino log level |

See `.env.example` for the full list.

---

## Running the API Server

```bash
# Development mode (ts-node, auto-reload)
npm run dev

# Production mode (compiled JS)
npm run build && node dist/index.js
```

The server starts on `http://localhost:3001` by default.

---

## Running Tests

```bash
# All backend unit tests
npm test

# Type-checking only (no emit)
npm run typecheck

# Lint
npm run lint

# Frontend Playwright tests
cd frontend
npx playwright test
```

---

## API Spec Validation

The `openapi.yaml` file is the **source of truth** for the REST API contract.
Every route defined in `src/routes/` **must** have a matching entry in `openapi.yaml`.
The CI job will fail if:

- A route exists in `src/routes/` but is missing from the spec
- The spec defines a path/method with a different request/response shape than the
  implementation returns

### Running validation locally

Make sure the server is running on port 3001, then:

```bash
# Start the server in one terminal
npm run build && node dist/index.js

# In another terminal, run Dredd against the live server
npm run validate:api
```

Dredd will call every endpoint defined in `openapi.yaml`, validate the responses,
and exit non-zero if any check fails.

### When you add a new route

1. Add the route handler in `src/routes/<resource>.ts`
2. Register it in `src/index.ts`
3. Add the path, operation, request/response schemas to `openapi.yaml`
4. Run `npm run validate:api` locally to confirm the new endpoint passes
5. Update or add relevant unit tests in `tests/`

If you skip step 3, the CI `openapi-validate` job will fail on your PR.

### CI behaviour

The `openapi-validate` workflow (`.github/workflows/openapi-validate.yml`) runs on
every PR that touches `src/routes/**` or `openapi.yaml`. It:

1. Spins up PostgreSQL and Redis service containers
2. Builds the TypeScript project
3. Seeds minimal test data
4. Starts the API server
5. Runs `npm run validate:api` (Dredd) against the live server
6. Fails the PR if any endpoint check does not pass

---

## Frontend Development

```bash
cd frontend
npm ci
npm run dev       # Next.js dev server on http://localhost:3000
npm test          # Playwright responsive tests
npm run lint      # ESLint
npm run typecheck # TypeScript type-check
```

### Responsive design rules

- Navigation hamburger menu at `< 768px`
- Issue card grid: 1-column `< 640px`, 2-column `< 1024px`, 3-column `>= 1024px`
- TxConfirmModal renders as a bottom sheet on mobile
- EventHistoryTable renders as card list on mobile
- All touch targets ≥ 44×44 px (WCAG 2.5.5)

### Empty state illustrations

SVG files live in `frontend/public/illustrations/`. Each must be:
- Under 5 KB
- Use `currentColor` for strokes/fills (dark mode compatible)
- Accompanied by an `EmptyState` component variant
=======
## Reporting Bugs

Open an issue using the **Bug Report** template (`.github/ISSUE_TEMPLATE/bug_report.md`).

Include:
- What you did (steps to reproduce)
- What you expected to happen
- What actually happened (error message, error code)
- Environment: network (testnet/mainnet), contract ID, browser/Node version

---

## Proposing Features

Open an issue using the **Feature Request** template (`.github/ISSUE_TEMPLATE/feature_request.md`).

Include:
- The problem you are solving
- Your proposed solution
- Alternatives you considered
- Whether it requires a contract upgrade (ABI change = MAJOR semver bump)

---

## Development Workflow

1. Sync your fork: `git fetch upstream && git rebase upstream/main`.
2. Create a feature branch: `git checkout -b feat/short-description`.
3. Make your changes — keep commits focused and atomic.
4. Update `CHANGELOG.md` under the `[Unreleased]` section (see below).
5. Open a pull request targeting `main`.

---

## Branch Naming

```
feat/<short-description>      # new functionality
fix/<short-description>       # bug fixes
docs/<short-description>      # documentation only
refactor/<short-description>  # no behaviour change
chore/<short-description>     # tooling, deps, CI
```

Example: `feat/global-cap-increase`, `fix/saturating-subtraction`.

---

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer, e.g. Closes #42]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

---

## PR Checklist

Before requesting review, confirm every item:

- [ ] `cargo fmt` applied
- [ ] `cargo clippy --features testutils -- -D warnings` passes with zero warnings
- [ ] `cargo test --features testutils` passes
- [ ] New functionality has new tests
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] Docs updated if public API or behaviour changed
- [ ] PR title follows Conventional Commits format
- [ ] Issue number referenced in PR description (`Closes #N`)

---

## Changelog Requirements

**Every pull request to `main` must update `CHANGELOG.md`.**

- Add your entry under the `## [Unreleased]` heading.
- Use the appropriate sub-heading: `Added`, `Changed`, `Deprecated`,
  `Removed`, `Fixed`, or `Security`.
- Reference the issue number in parentheses, e.g. `(#42)`.
- A CI check (`changelog-check`) will fail the PR if `CHANGELOG.md`
  has not been modified.

Example entry:

```markdown
## [Unreleased]

### Fixed
- Correct saturating subtraction in `withdraw_application` (#55).
```

---

## Versioning Convention (Semver)

This project follows [Semantic Versioning 2.0.0](https://semver.org/).

```
MAJOR.MINOR.PATCH
```

| Component | Increment when… |
|-----------|-----------------|
| **MAJOR** | A breaking on-chain change: altered function signatures, changed error discriminants, storage key renames, or removal of a public function. |
| **MINOR** | New backward-compatible functionality: new public functions, new events, new optional parameters. |
| **PATCH** | Backward-compatible bug fixes, documentation updates, refactors with no observable behavior change. |

> **Important:** Because WorkloadGovernor is a Soroban smart contract, any change
> that alters the ABI (function names, parameter types, return types, error codes)
> is a **MAJOR** version bump — even if it seems minor from a traditional software
> perspective. Deployed contracts cannot change their address, so clients depend on
> strict ABI stability.

---

## Release Process

### 1. Prepare the release branch

```bash
git checkout main
git pull upstream main
git checkout -b release/vX.Y.Z
```

### 2. Update the changelog

Move all entries from `[Unreleased]` to a new versioned heading and update the
diff links at the bottom of `CHANGELOG.md`:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

[X.Y.Z]: https://github.com/FaveTeamz/workload-governor/compare/vPREV...vX.Y.Z
[Unreleased]: https://github.com/FaveTeamz/workload-governor/compare/vX.Y.Z...HEAD
```

### 3. Bump the version in Cargo.toml

```toml
[package]
version = "X.Y.Z"
```

Run `cargo build --target wasm32v1-none --release` to confirm the build still passes.

### 4. Open a PR and merge

Open a PR from `release/vX.Y.Z` → `main`. After review and CI passes, merge.

### 5. Tag the release

```bash
git checkout main
git pull upstream main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push upstream vX.Y.Z
```

### 6. Publish GitHub Release

- Go to **Releases → Draft a new release**.
- Select the tag `vX.Y.Z`.
- Copy the changelog section for this version into the release notes.
- Attach the optimised WASM artifact:
  ```bash
  stellar contract optimize \
    --wasm target/wasm32v1-none/release/workload_governor.wasm
  ```
  Attach `target/wasm32v1-none/release/workload_governor.optimized.wasm`.
>>>>>>> upstream/main

---

## Code Style

<<<<<<< HEAD
- **TypeScript strict mode** is enabled — no `any` without justification
- **ESLint** must pass with zero warnings (`npm run lint`)
- **Formatting**: follow the existing project style (2-space indent, single quotes)
- **Imports**: use named exports for utilities, default exports for route/component files
- **Logging**: use structured pino logging; include `org_id` on every event log line
- **Error handling**: never swallow errors silently — log with context and re-throw or return

---

## Pull Request Process

1. Branch naming: `feat/<issue-number>-short-description` or `fix/<issue-number>-short-description`
2. Keep PRs focused — one issue per PR where possible
3. All CI checks must pass: lint, typecheck, test, build, openapi-validate (when applicable)
4. Add or update tests for every new feature or bug fix
5. Update `openapi.yaml` if you add or change any route (see [API Spec Validation](#api-spec-validation))
6. Request at least one reviewer from the FaveTeamz team
7. Squash commits before merging to keep `main` history clean

---

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
=======
- Run `cargo fmt` before committing.
- Run `cargo clippy --features testutils -- -D warnings` and fix all warnings.
- Every new `pub fn` must have a Rustdoc comment following the style in `src/lib.rs`
  (sections: summary, `# Who can call`, `# Arguments`, `# Returns`, `# Errors`,
  `# Examples` for user-facing functions).

---

## Testing

```bash
# All tests
cargo test --features testutils

# Property-based tests only
cargo test --features testutils prop_

# Unit tests only
cargo test --features testutils unit_

# Check docs build cleanly
cargo doc --no-deps
```

### Frontend unit tests (Vitest)

```bash
# Run all frontend unit tests once
npm run test:unit

# Run in watch mode during development
npm run test:unit:watch

# Run with coverage report
npm run test:unit:coverage
```

### React component snapshot tests

Snapshot files live in `tests/unit/__snapshots__/`. They are committed to
version control so CI catches unintended visual regressions.

**When you intentionally change a component's rendered output**, update the
snapshots and commit the new `.snap` file alongside your code change:

```bash
# Update all snapshots
npx vitest run --update-snapshots

# Update snapshots for a single file
npx vitest run tests/unit/snapshots.test.tsx --update-snapshots
```

CI will fail if any snapshot differs from the committed version. Always review
`git diff tests/unit/__snapshots__/` before committing updated snapshots.

All PRs must pass CI. New functionality requires new tests.

---

## Code of Conduct

This project follows the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
By participating you agree to uphold its standards. Report unacceptable
behaviour to the maintainers via a private GitHub message.
>>>>>>> upstream/main

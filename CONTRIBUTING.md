# Contributing to WorkloadGovernor

Thank you for contributing to WorkloadGovernor! This guide explains how to set up
your development environment, run tests, and keep the API spec in sync with the
implementation.

---

## Table of Contents

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
```

---

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

---

## Code Style

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

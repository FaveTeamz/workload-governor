# Contributing to WorkloadGovernor

Welcome! This guide walks you through everything needed to go from a fresh machine to running tests and making your first contribution.

Verified on **Ubuntu 22.04** and **macOS 14**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and build](#2-clone-and-build)
3. [Run unit tests](#3-run-unit-tests)
4. [Run the local Soroban sandbox](#4-run-the-local-soroban-sandbox)
5. [Deploy and invoke the contract locally](#5-deploy-and-invoke-the-contract-locally)
6. [Start the backend and frontend in dev mode](#6-start-the-backend-and-frontend-in-dev-mode)
7. [Writing docs (rustdoc and ADRs)](#7-writing-docs-rustdoc-and-adrs)
8. [Submitting a pull request](#8-submitting-a-pull-request)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

Install each tool and verify the version before continuing.

| Tool | Minimum version | Install |
|---|---|---|
| Rust + Cargo | stable ≥ 1.78 | `curl https://sh.rustup.rs -sSf \| sh` |
| `wasm32v1-none` target | — | `rustup target add wasm32v1-none` |
| Stellar CLI | ≥ 21.x | [Install guide](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli) |
| Node.js | ≥ 20 LTS | [nodejs.org](https://nodejs.org) |
| Docker + Compose | ≥ 24 | [docker.com](https://www.docker.com/get-started) |
| Freighter wallet | latest | [Chrome extension](https://www.freighter.app/) |

Verify all tools are on your PATH:

```bash
rustc --version        # rustc 1.78.0 (or later)
stellar --version      # stellar 21.x.x (or later)
node --version         # v20.x.x (or later)
docker compose version # Docker Compose version 2.x.x
```

---

## 2. Clone and build

Fork the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/<your-username>/workload-governor.git
cd workload-governor

# Add the upstream remote so you can pull future changes
git remote add upstream https://github.com/FaveTeamz/workload-governor.git
```

Build the Soroban contract WASM:

```bash
stellar contract build
# Output: target/wasm32v1-none/release/workload_governor.wasm
```

The release profile (`Cargo.toml`) already sets `opt-level = 'z'` and `lto = true`, so the binary stays well under the 64 KB contract size limit.

---

## 3. Run unit tests

```bash
# All tests (unit + property-based)
cargo test --features testutils

# Property-based tests only
cargo test --features testutils prop_

# Unit tests only
cargo test --features testutils unit_

# Benchmark tests (prints CPU/memory usage)
cargo test --features testutils bench_
```

All tests must pass before opening a PR.

---

## 4. Run the local Soroban sandbox

The Stellar CLI ships a local sandbox that mimics the Soroban runtime without needing testnet funds.

Start the sandbox:

```bash
stellar sandbox start --network local
```

The sandbox runs at `http://localhost:8000`. It resets on restart, so it is safe for experimentation.

Stop it when done:

```bash
stellar sandbox stop
```

---

## 5. Deploy and invoke the contract locally

Build first (step 2), then deploy to the local sandbox:

```bash
# Create a local test identity (one-time)
stellar keys generate --overwrite alice
stellar keys generate --overwrite bob

# Deploy
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --network local \
  --source alice
# Prints the CONTRACT_ID — copy it for the next commands
```

Initialize the contract:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network local \
  --source alice \
  -- initialize \
  --admin $(stellar keys address alice)
```

Apply for an issue (smoke test):

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network local \
  --source bob \
  -- apply_for_issue \
  --contributor $(stellar keys address bob) \
  --org_id "my-org" \
  --issue_id "issue-42"
```

A successful call returns `null`. See [docs/api-reference.md](api-reference.md) for all available functions.

---

## 6. Start the backend and frontend in dev mode

### 6.1 Start database dependencies

```bash
cp .env.example .env            # safe defaults — edit DATABASE_URL / REDIS_URL if needed
docker compose up -d
docker compose ps               # postgres and redis should show "(healthy)" after ~15 s
```

pgAdmin is available at http://localhost:5050 (admin@example.com / admin).

### 6.2 Configure and start the backend

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and set these mandatory values:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/workload_governor
REDIS_URL=redis://localhost:6379
CONTRACT_ID=<CONTRACT_ID from step 5>
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_SECRET=<at least 32 random characters>
```

Then start the server:

```bash
npm install
npm run dev
# Server listening on http://localhost:3000
```

Confirm it is healthy:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### 6.3 Configure and start the frontend

```bash
cp frontend/.env.example frontend/.env
```

Open `frontend/.env` and set these mandatory values:

```dotenv
VITE_API_URL=http://localhost:3000
VITE_CONTRACT_ID=<CONTRACT_ID from step 5>
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

Start the Vite dev server:

```bash
cd frontend
npm install
npm run dev
# App available at http://localhost:5173
```

### 6.4 Connect Freighter

1. Open the Freighter browser extension.
2. Switch to **Testnet**.
3. Fund your account via [Friendbot](https://friendbot.stellar.org/?addr=<your-address>).
4. Navigate to http://localhost:5173 and connect your wallet.

---

## 7. Writing docs (rustdoc and ADRs)

### Inline doc comments (rustdoc)

Every public function and type must have a `///` doc comment with at least a `# Examples` section:

```rust
/// Registers a maintainer for a given organization.
///
/// # Errors
/// Returns [`Error::UnauthorizedAdmin`] if `admin` is not the contract admin.
///
/// # Examples
/// ```ignore
/// client.register_maintainer(&admin, &maintainer, &Symbol::new(&env, "my-org"));
/// ```
pub fn register_maintainer(env: Env, admin: Address, maintainer: Address, org_id: Symbol) { … }
```

Generate and check the docs locally:

```bash
cargo doc --no-deps --open   # opens in browser; must produce zero warnings
```

### Architecture Decision Records (ADRs)

New design decisions belong in `docs/adr/` using the Nygard template:

```
docs/adr/
  ADR-001-temporary-vs-persistent-storage.md
  ADR-002-global-and-org-caps.md
  ADR-003-two-step-admin-transfer.md
```

Each ADR file must contain these four sections:

```markdown
## Status
Accepted

## Context
Why this decision was needed.

## Decision
What was decided.

## Consequences
Trade-offs and implications.
```

Link new ADRs from the README documentation table.

---

## 8. Submitting a pull request

1. Create a branch from an up-to-date `main`:
   ```bash
   git fetch upstream
   git checkout -b docs/my-change upstream/main
   ```
2. Make your changes and commit:
   ```bash
   git add <files>
   git commit -m "docs: brief description of change"
   ```
3. Push to your fork:
   ```bash
   git push -u origin docs/my-change
   ```
4. Open a PR **from your fork to `FaveTeamz/workload-governor`** (the upstream, not your fork's `main`).
5. In the PR description, reference every issue being closed:
   ```
   Closes #<issue-number>
   ```
6. Ensure `cargo test --features testutils` passes locally before requesting review.

---

## 9. Troubleshooting

### `stellar contract build` fails — "target may not be installed"

```bash
rustup target add wasm32v1-none
rustup update stable
stellar contract build
```

### Backend crashes with "ECONNREFUSED 5432"

Docker hasn't finished starting or port 5432 is taken by a local Postgres instance.

```bash
docker compose ps
lsof -i :5432
sudo systemctl stop postgresql   # Linux
brew services stop postgresql    # macOS
```

Re-run `docker compose up -d` and wait for `(healthy)`.

### Backend exits with "relation does not exist"

Migrations run at startup via `migrate()` in `src/db.ts`. Check the startup logs:

```bash
npm run dev 2>&1 | head -30
```

Confirm `DATABASE_URL` matches your running container:

```bash
docker compose exec postgres psql -U postgres -c "\l"
```

### Frontend shows "Network Error"

`VITE_API_URL` doesn't match where the backend is listening, or the backend is not running.

```bash
curl http://localhost:3000/health
grep VITE_API_URL frontend/.env   # must be: VITE_API_URL=http://localhost:3000
```

Restart the Vite dev server after editing `.env` — Vite bakes env vars at build time.

### Freighter shows "Invalid network"

Freighter's active network must match `VITE_STELLAR_NETWORK`.

1. Open Freighter → Settings → Network → select **Testnet**.
2. Ensure `VITE_STELLAR_RPC_URL` in `frontend/.env` matches the Freighter RPC endpoint.
3. Hard-refresh the browser (`Ctrl+Shift+R`).

---

For deeper reference see [docs/local-dev-guide.md](local-dev-guide.md).

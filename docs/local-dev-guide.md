# Local Development Guide

Run the full WorkloadGovernor stack — contract, backend, and frontend — in under 30 minutes.

---

## Prerequisites

Install and verify each tool before starting.

| Tool | Version | Install |
|---|---|---|
| Rust + Cargo | stable ≥ 1.78 | `curl https://sh.rustup.rs -sSf \| sh` |
| `wasm32v1-none` target | — | `rustup target add wasm32v1-none` |
| Stellar CLI | ≥ 21.x | [Install guide](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli) |
| Node.js | ≥ 20 LTS | [nodejs.org](https://nodejs.org) |
| Docker + Compose | ≥ 24 | [docker.com](https://www.docker.com/get-started) |
| Freighter wallet | latest | [Chrome extension](https://www.freighter.app/) |

Verify:

```bash
rustc --version
stellar --version
node --version
docker compose version
```

---

## 1. Clone and prepare

```bash
git clone https://github.com/your-org/workload-governor.git
cd workload-governor
```

---

## 2. Start database dependencies

One command starts PostgreSQL, Redis, and pgAdmin:

```bash
cp .env.example .env          # uses safe defaults — edit if needed
docker compose up -d
```

Wait for healthy status (≈15 s):

```bash
docker compose ps             # postgres and redis should show "(healthy)"
```

pgAdmin is available at http://localhost:5050 (admin@example.com / admin).

---

## 3. Build the Soroban contract

```bash
stellar contract build
# WASM written to: target/wasm32v1-none/release/workload_governor.wasm
```

Run contract tests:

```bash
cargo test --features testutils
```

Deploy to testnet and note the contract ID printed at the end:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --network testnet \
  --source <your-account>
# outputs: C...CONTRACT_ID...
```

Initialize the contract:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-account> \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

---

## 4. Configure and start the backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` — mandatory values:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/workload_governor
REDIS_URL=redis://localhost:6379
CONTRACT_ID=<CONTRACT_ID from step 3>
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_SECRET=<at least 32 random characters>
```

Install dependencies and run migrations + server:

```bash
npm install
npm run dev
# Server listening on http://localhost:3000
```

Confirm it's healthy:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

---

## 5. Configure and start the frontend

```bash
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env` — mandatory values:

```dotenv
VITE_API_URL=http://localhost:3000
VITE_CONTRACT_ID=<CONTRACT_ID from step 3>
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

Start the dev server:

```bash
cd frontend
npm install
npm run dev
# App available at http://localhost:5173
```

---

## 6. Configure Freighter

1. Open the Freighter extension.
2. Switch to **Testnet**.
3. Create or import an account and fund it via [friendbot](https://friendbot.stellar.org/?addr=<your-address>).
4. Navigate to http://localhost:5173 and connect your wallet.

---

## Stack summary

| Service | URL | Started by |
|---|---|---|
| PostgreSQL | localhost:5432 | `docker compose up` |
| Redis | localhost:6379 | `docker compose up` |
| pgAdmin | http://localhost:5050 | `docker compose up` |
| Backend API | http://localhost:3000 | `npm run dev` (root) |
| Frontend | http://localhost:5173 | `npm run dev` (frontend/) |

---

## Troubleshooting

### 1. `pg_isready` fails / backend crashes with "ECONNREFUSED 5432"

Docker hasn't finished starting or the port is taken by a local Postgres instance.

```bash
# Check container status
docker compose ps

# Check if port 5432 is already occupied
lsof -i :5432

# Stop local postgres if running
sudo systemctl stop postgresql   # Linux
brew services stop postgresql    # macOS
```

Then re-run `docker compose up -d` and wait for `(healthy)`.

---

### 2. `stellar contract build` fails — "target may not be installed"

The `wasm32v1-none` toolchain target is missing.

```bash
rustup target add wasm32v1-none
rustup update stable
stellar contract build
```

---

### 3. Backend exits with "relation does not exist"

Migrations haven't run. The `migrate()` function in `src/db.ts` runs at startup — check the startup logs:

```bash
npm run dev 2>&1 | head -30
```

If `DATABASE_URL` is wrong the connection will fail silently. Confirm the value matches your running container:

```bash
docker compose exec postgres psql -U postgres -c "\l"
```

---

### 4. Frontend shows "Network Error" / API calls fail

The `VITE_API_URL` doesn't match where the backend is listening, or the backend is not running.

```bash
# Confirm backend is up
curl http://localhost:3000/health

# Confirm .env value (must not have trailing slash)
grep VITE_API_URL frontend/.env
# should be: VITE_API_URL=http://localhost:3000
```

Restart the Vite dev server after editing `.env` — Vite bakes env vars at startup.

---

### 5. Freighter shows "Invalid network" or transactions simulate but never submit

Freighter's active network must match `VITE_STELLAR_NETWORK`.

1. Open Freighter → Settings → Network.
2. Select **Testnet** (or add a custom network pointing to your local node).
3. Ensure `VITE_STELLAR_RPC_URL` in `frontend/.env` matches the Freighter RPC endpoint.
4. Hard-refresh the browser tab (`Ctrl+Shift+R`).

If the contract was deployed to a different network than Freighter is connected to, transactions will always fail. Re-deploy to the correct network or switch Freighter to match.

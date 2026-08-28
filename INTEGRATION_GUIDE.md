# WorkloadGovernor Integration Guide

Step-by-step guide for external organisations integrating WorkloadGovernor into
their contributor workflow — from contract setup through webhook configuration,
testnet verification, and ongoing monitoring.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Registering Your Organisation via the Admin API](#3-registering-your-organisation-via-the-admin-api)
4. [Setting Up GitHub Webhooks](#4-setting-up-github-webhooks)
5. [Registering Maintainers On-Chain](#5-registering-maintainers-on-chain)
6. [Testing the Integration End-to-End on Testnet](#6-testing-the-integration-end-to-end-on-testnet)
7. [Monitoring and Alerting](#7-monitoring-and-alerting)

---

## 1. Overview

### What WorkloadGovernor does

WorkloadGovernor is a Soroban smart contract deployed on the Stellar network
that enforces **structural fairness caps** on developer workloads across
open-source organisations:

- **Global cap** — a contributor may hold at most **15 pending applications**
  across all organisations at any time.
- **Per-org cap** — a contributor may hold at most **4 active assignments**
  within a single organisation at any time.

These caps are enforced on-chain. No backend configuration can override them.
The contract is the authoritative source of truth.

The contract exposes thirteen functions covering the full application lifecycle:

| Action | Who calls it |
|---|---|
| Submit an application for an issue | Contributor |
| Withdraw a pending application | Contributor |
| Assign an issue to a contributor | Maintainer |
| Complete a work assignment | Maintainer |
| Revoke an active assignment | Maintainer |
| Extend application TTL | Anyone |
| Query application / assignment state | Anyone |

### What WorkloadGovernor does not do

- It does not create or manage GitHub issues — those remain in GitHub.
- It does not verify contributor identities beyond Stellar key authentication.
- It does not hold funds or administer payments.
- It does not enforce organisation membership — that is your responsibility.
- It does not automatically react to GitHub events — webhook handling requires
  the backend service described in this guide.

### Integration architecture

```
GitHub          Backend API          Stellar Network
  │                 │                      │
  │  webhook event  │                      │
  ├────────────────►│                      │
  │                 │  build + simulate tx  │
  │                 ├─────────────────────►│
  │                 │   signed XDR          │
  │◄────────────────┤◄─────────────────────┤
  │                 │                      │
  │                 │  sendTransaction      │
  │                 ├─────────────────────►│
  │                 │                      │  WorkloadGovernor
  │                 │                      │  contract enforces
  │                 │                      │  fairness caps
```

---

## 2. Prerequisites

Complete every item in this section before proceeding.

### 2.1 Stellar accounts

You need three funded Stellar accounts. On testnet, use Friendbot to fund them.
On mainnet, each account needs at least 5 XLM above its base reserve.

| Account | Purpose |
|---|---|
| Admin account | Deploys and initialises the contract; registers maintainers |
| Maintainer account(s) | Assigns, completes, and revokes issues in your org |
| Deployer account | Pays contract upload and deployment fees (can be the same as admin) |

Create and fund accounts on testnet:

```bash
# Install Stellar CLI (version ≥ 21)
# https://developers.stellar.org/docs/tools/stellar-cli

# Generate keys
stellar keys generate admin-key
stellar keys generate maintainer-key
stellar keys generate deployer-key

# Fund via Friendbot (testnet only)
ADMIN_ADDR=$(stellar keys address admin-key)
MAINTAINER_ADDR=$(stellar keys address maintainer-key)
DEPLOYER_ADDR=$(stellar keys address deployer-key)

curl "https://friendbot.stellar.org?addr=$ADMIN_ADDR"
curl "https://friendbot.stellar.org?addr=$MAINTAINER_ADDR"
curl "https://friendbot.stellar.org?addr=$DEPLOYER_ADDR"

# Verify funding
stellar account show --network testnet --source admin-key
```

### 2.2 GitHub organisation admin access

You need admin access to the GitHub organisation you are integrating. This is
required to:

- Install webhooks on the organisation or on individual repositories.
- Generate a webhook secret.

### 2.3 Backend deployment

WorkloadGovernor's backend API must be running and reachable before you can
register your organisation. Follow `docs/deployment-runbook.md` to deploy the
backend. At minimum you need:

- Docker (or Node.js 20 LTS) to run the backend service
- PostgreSQL 16
- Redis (for caching and job queues)

Copy and fill in `backend/.env.example`:

```bash
cp backend/.env.example backend/.env
```

Required variables for integration:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection URL |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `CONTRACT_ID` | Deployed WorkloadGovernor contract ID |
| `STELLAR_RPC_URL` | Soroban RPC endpoint |
| `STELLAR_HORIZON_URL` | Horizon API endpoint |
| `GITHUB_TOKEN` | GitHub PAT with `repo:read` scope (minimum) |
| `ADMIN_TOKEN` | Secret token for admin API endpoints |
| `JWT_SECRET` | Long random string (≥ 32 characters) |
| `WEBHOOK_SECRET` | Secret for verifying GitHub webhook payloads |

Verify the backend is reachable:

```bash
curl https://<your-backend-host>/health
# Expected: {"status":"ok"}
```

### 2.4 Smart contract deployed and initialised

If you are using a shared hosted instance, skip to
[Section 3](#3-registering-your-organisation-via-the-admin-api) — the contract
is already deployed.

If you are self-hosting, deploy and initialise the contract first:

```bash
# Build and optimise the WASM
rustup target add wasm32v1-none
cargo build --target wasm32v1-none --release
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network testnet \
  --source deployer-key

# Save the printed contract ID
export CONTRACT_ID=<OUTPUT_CONTRACT_ID>

# Initialise (one-time only — cannot be undone)
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source deployer-key \
  -- initialize \
  --admin "$ADMIN_ADDR"
```

Update `CONTRACT_ID` in `backend/.env` to point to this contract ID.

---

## 3. Registering Your Organisation via the Admin API

### 3.1 Choose an organisation ID

Your `org_id` is an arbitrary string identifier for your GitHub organisation
within WorkloadGovernor. It must be:

- URL-safe (lowercase letters, digits, hyphens)
- Unique across all organisations using the same contract instance
- Consistent — you will use this same ID in every subsequent API call

**Convention:** use your GitHub organisation slug (e.g. `my-github-org`).

### 3.2 Register a maintainer via the admin API

The admin API endpoint registers a Stellar address as an authorised maintainer
for your organisation. This is also used to assert your org's existence in the
off-chain database.

**Endpoint:** `POST /api/admin/maintainers`

**Authentication:** `x-admin-token` header with the value of `ADMIN_TOKEN` from
`backend/.env`.

Register your first maintainer:

```bash
curl -X POST https://<your-backend-host>/api/admin/maintainers \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <ADMIN_TOKEN>" \
  -d '{
    "address": "<MAINTAINER_STELLAR_ADDRESS>",
    "org_id": "<your-org-id>"
  }'
```

**Expected response `201`:**

```json
{
  "address": "GABC1...9KLM",
  "org_id": "my-github-org"
}
```

**Error responses:**

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"address and org_id required"}` | Missing field in request body |
| `401` | `{"error":"unauthorized"}` | Wrong or missing `x-admin-token` |
| `500` | `{"error":"internal server error"}` | Database or server error |

### 3.3 Verify the registration

Check that your org and maintainer appear in the issues endpoint:

```bash
curl "https://<your-backend-host>/api/issues?org_id=<your-org-id>"
# Returns [] if no issues synced yet — that is expected
```

---

## 4. Setting Up GitHub Webhooks

GitHub webhooks deliver event payloads to your backend whenever issues are
opened, closed, assigned, or commented on. WorkloadGovernor uses these events
to keep the off-chain database (issue titles, statuses) in sync with GitHub.

### 4.1 Generate a webhook secret

The webhook secret is used to sign GitHub payloads with HMAC-SHA256. Your
backend verifies the signature on every incoming request.

Generate a secure random secret:

```bash
# Option A — openssl (recommended)
openssl rand -hex 32

# Option B — Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# Option C — Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output. You will need it in two places:

1. `WEBHOOK_SECRET` in `backend/.env`
2. The "Secret" field when creating the webhook in GitHub

Set it in your backend environment before creating the webhook:

```bash
# Edit backend/.env
WEBHOOK_SECRET=<your-generated-secret>

# Restart the backend to pick up the new value
docker compose restart backend
# or
pm2 restart workload-governor-backend
```

### 4.2 Create the webhook in GitHub

You can create a webhook at the **repository** level (receives events for one
repo) or at the **organisation** level (receives events for all repos in the
org). Organisation-level webhooks are recommended for WorkloadGovernor.

**Via GitHub UI:**

1. Go to your organisation's **Settings** → **Webhooks** → **Add webhook**.
2. Fill in the fields:

| Field | Value |
|---|---|
| Payload URL | `https://<your-backend-host>/api/webhooks/github` |
| Content type | `application/json` |
| Secret | The value you generated in step 4.1 |
| SSL verification | Enable (required for production) |

3. Under **Which events would you like to trigger this webhook?**, select
   **Let me select individual events** and enable:

   - `Issues` — issue opened, closed, edited, labeled, assigned, unassigned
   - `Issue comments` — new comments (optional, used for notifications)
   - `Pull requests` — PR opened, closed, merged (optional)

4. Ensure **Active** is checked, then click **Add webhook**.

**Via GitHub CLI:**

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /orgs/<your-github-org>/hooks \
  -f "name=web" \
  -f "config[url]=https://<your-backend-host>/api/webhooks/github" \
  -f "config[content_type]=json" \
  -f "config[secret]=<your-webhook-secret>" \
  -f "config[insecure_ssl]=0" \
  -f "active=true" \
  -F "events[]=issues" \
  -F "events[]=issue_comment"
```

### 4.3 Verify webhook delivery

After saving the webhook in GitHub, GitHub sends a `ping` event. Check the
delivery log:

1. In GitHub, go to **Settings** → **Webhooks** → click your webhook →
   **Recent Deliveries**.
2. The `ping` delivery should show a green tick and a `200` response from your
   backend.

If you see a `4xx` or `5xx` response, check:

- `WEBHOOK_SECRET` in `backend/.env` matches the secret entered in GitHub.
- The backend is publicly reachable at the payload URL.
- The `/api/webhooks/github` route is implemented and running.

### 4.4 Webhook signature verification (implementation note)

If you are implementing a custom webhook handler, verify the signature on every
request before processing it:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyGitHubSignature(
  payload: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const received = signatureHeader.slice(7); // strip "sha256="
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex")
  );
}
```

Always use `timingSafeEqual` — comparing strings directly leaks timing
information.

---

## 5. Registering Maintainers On-Chain

The admin API call in Section 3.2 stores the maintainer in the off-chain
PostgreSQL database. You must also register the maintainer in the smart
contract itself so they can call `assign_issue`, `complete_assignment`, and
`revoke_assignment` on-chain.

### 5.1 Register a maintainer on-chain

```bash
ADMIN_ADDR=$(stellar keys address admin-key)
MAINTAINER_ADDR=$(stellar keys address maintainer-key)

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source admin-key \
  -- register_maintainer \
  --admin "$ADMIN_ADDR" \
  --maintainer "$MAINTAINER_ADDR" \
  --org_id "<your-org-id>"
```

Expected output: the transaction hash. No output means success (the function
returns `void`).

### 5.2 Verify maintainer registration

Confirm the maintainer is registered by checking they can query state without
error:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source maintainer-key \
  -- get_org_assignment_count \
  --contributor "$MAINTAINER_ADDR" \
  --org_id "<your-org-id>"
# Expected: 0
```

A result of `0` confirms the call succeeded. If you receive error code `2`
(`NotInitialized`), the contract was not initialised — re-run Step 2.4.

### 5.3 Register additional maintainers

Repeat steps 5.1 and 5.2 for every maintainer address and org pair. The API
call (Section 3.2) and the on-chain registration (step 5.1) must both be
completed for each maintainer.

If a maintainer attempts to call `assign_issue` without being registered
on-chain, the transaction will fail with error code `4`
(`UnauthorizedMaintainer`).

### 5.4 Register maintainers via the admin API (batch)

To register multiple maintainers quickly, loop over the admin API:

```bash
MAINTAINERS=(
  "GABC1...ADDR1"
  "GABC2...ADDR2"
  "GABC3...ADDR3"
)

for addr in "${MAINTAINERS[@]}"; do
  curl -X POST https://<your-backend-host>/api/admin/maintainers \
    -H "Content-Type: application/json" \
    -H "x-admin-token: <ADMIN_TOKEN>" \
    -d "{\"address\": \"$addr\", \"org_id\": \"<your-org-id>\"}"
  echo ""
done
```

Then register each on-chain:

```bash
for addr in "${MAINTAINERS[@]}"; do
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --network testnet \
    --source admin-key \
    -- register_maintainer \
    --admin "$ADMIN_ADDR" \
    --maintainer "$addr" \
    --org_id "<your-org-id>"
done
```

---

## 6. Testing the Integration End-to-End on Testnet

Run these checks in order before pointing contributors to your integration.
All checks use the testnet smoke test script included in the repository.

### 6.1 Prerequisites for smoke testing

Export the required environment variables:

```bash
export CONTRACT_ID=<your-testnet-contract-id>
export ADMIN_KEY=admin-key          # stellar key name
export MAINTAINER_KEY=maintainer-key
export CONTRIBUTOR_KEY=contributor-key  # a test contributor account
export NETWORK=testnet
```

Fund the contributor account on testnet if not already done:

```bash
CONTRIBUTOR_ADDR=$(stellar keys address contributor-key)
curl "https://friendbot.stellar.org?addr=$CONTRIBUTOR_ADDR"
```

### 6.2 Run the automated smoke tests

```bash
chmod +x tests/smoke/testnet-smoke.sh
./tests/smoke/testnet-smoke.sh
```

The script runs all 13 contract functions and prints `PASS` or `FAIL` for each.
Expected output:

```
=== WorkloadGovernor testnet smoke tests ===
Contract : C...
Network  : testnet

PASS: 1/13 initialize
PASS: 2/13 register_maintainer
PASS: 3/13 apply_for_issue(issue1)
PASS: 4/13 get_global_application_count=1
PASS: 5/13 has_applied=true
PASS: 6/13 extend_application_ttl
PASS: 7/13 assign_issue(issue1)
PASS: 8/13 get_org_assignment_count=1
PASS: 9/13 is_assigned=true
PASS: 10/13 complete_assignment(issue1)
PASS: 11/13 apply_for_issue(issue2)
PASS: 12/13 assign_issue(issue2)
PASS: 13/13 revoke_assignment(issue2)

=== Summary: 13/13 passed ===
```

### 6.3 End-to-end verification checklist

Work through this checklist manually after the smoke tests pass.

#### Backend health

- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `GET /api/issues?org_id=<your-org-id>` returns an array (empty is fine)

#### Admin API

- [ ] `POST /api/admin/maintainers` with correct token returns `201`
- [ ] `POST /api/admin/maintainers` with wrong token returns `401`
- [ ] `POST /api/admin/maintainers` with missing fields returns `400`

#### Webhook delivery

- [ ] GitHub shows a green tick on the `ping` delivery in Recent Deliveries
- [ ] Opening a new issue in GitHub triggers a delivery with `200` response
- [ ] Backend logs show the webhook payload was received and verified

#### On-chain operations

- [ ] Contributor can apply for an issue (error code `8` = duplicate if re-run,
  which is expected)
- [ ] `has_applied` returns `true` after applying
- [ ] `get_global_application_count` increments after applying
- [ ] Maintainer can assign the issue (requires contributor to have applied)
- [ ] `is_assigned` returns `true` after assignment
- [ ] `get_org_assignment_count` increments after assignment
- [ ] Maintainer can complete the assignment
- [ ] `get_org_assignment_count` decrements after completion
- [ ] Contributor can withdraw a pending application

#### Fairness cap enforcement

- [ ] Contributor blocked at 15 pending applications (error code `6`)
- [ ] Contributor blocked at 4 active assignments in the same org (error code `7`)

### 6.4 Testing cap enforcement manually

```bash
ORG_ID="<your-org-id>"
CONTRIBUTOR_ADDR=$(stellar keys address contributor-key)

# Check current counts before testing
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source contributor-key \
  -- get_global_application_count \
  --contributor "$CONTRIBUTOR_ADDR"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source contributor-key \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR_ADDR" \
  --org_id "$ORG_ID"
```

### 6.5 Troubleshooting common testnet failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `initialize` fails with error `1` | Contract already initialised | Skip `initialize` — it is already done |
| `register_maintainer` fails with error `3` | Wrong admin key | Use the key that matches `ADMIN_ADDR` passed to `initialize` |
| `assign_issue` fails with error `4` | Maintainer not registered on-chain | Run step 5.1 first |
| `assign_issue` fails with error `9` | No pending application | Contributor must call `apply_for_issue` first |
| `apply_for_issue` fails with error `6` | Global limit reached | Withdraw an existing application |
| Webhook returns `401` from backend | Secret mismatch | Ensure `WEBHOOK_SECRET` in `.env` matches GitHub's webhook secret field |
| `GET /health` returns connection error | Backend not running | Check Docker / process logs |

---

## 7. Monitoring and Alerting

### 7.1 Health check endpoint

Poll `GET /health` as your primary uptime check:

```bash
curl https://<your-backend-host>/health
# {"status":"ok"}
```

Configure your uptime monitoring tool (UptimeRobot, Pingdom, AWS Route 53
Health Checks, or your own CloudWatch alarm) to alert when this endpoint
returns non-`200` or times out.

Recommended check interval: **every 60 seconds**.

### 7.2 Key metrics to track

#### Backend API

| Metric | Alert threshold | Notes |
|---|---|---|
| HTTP 5xx error rate | > 1% over 5 min | Indicates backend or DB issues |
| HTTP 4xx error rate | > 5% over 5 min | May indicate bad webhook payloads |
| Response latency p99 | > 2 000 ms | Tune DB queries or add Redis caching |
| Webhook delivery failures | Any | GitHub pauses webhooks after repeated failures |

#### Stellar / Contract

| Metric | How to check | Alert when |
|---|---|---|
| Contract RPC availability | `GET $STELLAR_RPC_URL/health` | Non-`200` response |
| Failed `sendTransaction` rate | Backend application logs | > 0 over 10 min |
| Application TTL expiry rate | Query `has_applied` on known applications | Unexpected `false` |

#### Database

| Metric | Alert threshold |
|---|---|
| PostgreSQL connection pool exhaustion | Any |
| Replication lag (if using read replicas) | > 10 s |
| Disk usage | > 80% |

### 7.3 Log-based alerting

Configure alerts on these log patterns in your log aggregation tool
(CloudWatch Logs, Datadog, Loki, etc.):

```
# Backend error patterns to alert on
"internal server error"
"unauthorized"       -- repeated 401s may indicate credential rotation needed
"Contract error"     -- on-chain transaction failures
"webhook signature"  -- signature verification failures
```

**Structured log fields to index:**

- `level` — filter to `error` and `warn` for alerting
- `route` — breakdown by API endpoint
- `org_id` — filter activity per organisation
- `status` — HTTP status code distribution

### 7.4 GitHub webhook monitoring

GitHub will automatically disable a webhook if it fails repeatedly. To prevent
disruption:

1. Monitor the webhook delivery logs in GitHub:
   - **Settings** → **Webhooks** → your webhook → **Recent Deliveries**
2. Set up a GitHub Actions workflow or external cron job to verify webhook
   health daily.
3. If GitHub disables your webhook, re-enable it from the same settings page
   after fixing the underlying issue.

### 7.5 On-chain state queries for monitoring

Poll these endpoints periodically to build an operational dashboard:

```bash
# Check a contributor's global application count
curl "https://<your-backend-host>/api/contributors/<STELLAR_ADDRESS>/applications"

# Check a contributor's active assignments in your org
curl "https://<your-backend-host>/api/contributors/<STELLAR_ADDRESS>/assignments"

# List all issues in your org
curl "https://<your-backend-host>/api/issues?org_id=<your-org-id>"

# List open issues only
curl "https://<your-backend-host>/api/issues?org_id=<your-org-id>&status=open"
```

### 7.6 Recommended alerting runbook

When an alert fires:

1. **Backend health alert** — check `docker logs` or ECS task logs for the
   error. Common causes: database unreachable, environment variable missing,
   OOM kill.

2. **High 5xx rate** — check if the Soroban RPC node is reachable. If the RPC
   node is degraded, transactions will fail. Fall back to a secondary RPC
   endpoint by updating `STELLAR_RPC_URL`.

3. **Webhook delivery failure** — check the GitHub webhook recent deliveries
   page for the response code. A `401` means the secret rotated without
   updating GitHub. A `500` means the backend threw an error processing the
   payload.

4. **Contract transaction failure** — check the error code in the response body
   against [docs/error-reference.md](docs/error-reference.md) to identify
   whether it is a configuration issue (e.g. unregistered maintainer) or a
   data issue (e.g. cap reached).

---

## Next Steps

After completing this guide your organisation is fully integrated:

- Contributors can apply for issues via the frontend or directly through the
  Stellar contract.
- Maintainers can assign, complete, and revoke work on-chain.
- Webhook events keep the off-chain database in sync with GitHub.
- Monitoring is in place to detect backend or contract issues early.

For ongoing operations, refer to:

- [`docs/deployment-runbook.md`](docs/deployment-runbook.md) — upgrading the
  contract, rotating admin keys, rollback procedures.
- [`docs/error-reference.md`](docs/error-reference.md) — full error code
  reference with resolution steps.
- [`docs/api-reference.md`](docs/api-reference.md) — complete REST API
  reference.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contributing to WorkloadGovernor
  itself.

For support, open an issue in the WorkloadGovernor repository.

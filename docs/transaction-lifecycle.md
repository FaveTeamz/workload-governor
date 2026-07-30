# Soroban Transaction Lifecycle

This document traces every step a contributor transaction takes — from the
moment the backend constructs the XDR envelope through Stellar network
consensus, contract execution, event indexing, and final UI update.

It answers the most common contributor support question: **"Freighter said
the transaction succeeded, so why hasn't the UI updated?"**

---

## Quick Reference: 7 Stages

| Stage | Where | Typical duration |
|-------|-------|-----------------|
| 1. XDR construction | Backend API | < 200 ms |
| 2. User signing | Freighter extension | 5 – 30 s (user-gated) |
| 3. Transaction submission | Backend → Soroban RPC | < 500 ms |
| 4. Stellar network consensus | Stellar validators | 3 – 7 s (one ledger) |
| 5. Backend confirmation polling | Backend → Soroban RPC | up to 30 s |
| 6. Event emission and indexing | EventIndexer → PostgreSQL | up to 10 s |
| 7. UI update | Frontend → REST API | up to 5 s |

**Worst-case end-to-end: ~72 seconds.** Happy-path: ~15 seconds.

---

## Timing Diagram

```
Browser / Frontend
  │
  ├──[1]──► POST /api/transactions/<action>           ~0 ms
  │                │
  │          Backend (Express)
  │                ├── buildRaw(): assemble TransactionBuilder
  │                ├── sorobanRpc.simulateTransaction(tx) ─────────────────► Soroban RPC
  │                │                                                               │  ~100 ms
  │                │   ◄──── { minResourceFee, transactionData } ─────────────────┘
  │                └── attach sorobanData; return { xdr, fee, … }
  │
  ◄──[2]── xdr returned to frontend                  ~200 ms total
  │
  ├──[2]──► Freighter.signTransaction(xdr)            user interacts (5 – 30 s)
  │                │
  │          Freighter Extension
  │                └── user approves → returns signedXdr
  │
  ├──[3]──► POST /api/transactions/submit             after user approves
  │                │
  │          Backend
  │                └── sorobanRpc.sendTransaction(signedXdr) ───────────────► Soroban RPC
  │                                                                                │
  │                                                                     broadcasts to peers
  │                                                                                │
  │                         ◄──── { status: "PENDING", hash } ───────────────────┘
  │
  │   ─── [4] Stellar validators close next ledger ───────────────── ~3 – 7 s ───
  │                         Soroban host executes WorkloadGovernor contract
  │                         Contract emits event (applied / assigned / …)
  │
  ├──[5]── Backend polls getTransaction(hash) every 1 s ─────────────► Soroban RPC
  │                         ◄──── { status: "SUCCESS" } (after ledger close)
  │
  ├──[5]── 200 OK returned to frontend                               ~5 – 15 s after submit
  │
  │   ─── [6] EventIndexer polls getEvents() every 5 s ──────────── up to 10 s ──
  │                         ◄──── contract events for new ledger
  │                         INSERT INTO contract_events …
  │
  ├──[7]── Frontend polls GET /api/events?… every ~3 – 5 s ──────────► Backend
  │                         ◄──── { events: […], pagination: {…} }
  │
  └── UI re-renders with updated state                               ~10 – 72 s after sign
```

---

## Stage 1 — XDR Construction (Backend API)

**What happens:**
The frontend calls one of the transaction-build endpoints, providing the
contributor or maintainer address plus the action parameters. The backend's
`SorobanService` builds a raw unsigned `TransactionBuilder` with:

- `fee: "100"` stroops as a placeholder base fee
- `networkPassphrase` from `STELLAR_NETWORK_PASSPHRASE`
- A single `contract.call(fnName, ...args)` operation with arguments
  encoded as `xdr.ScVal` (addresses via `Address.toScVal()`, scalars via
  `nativeToScVal`)

The raw transaction is immediately sent to the Soroban RPC node for a
dry-run simulation (`simulateTransaction`). The simulation returns
`minResourceFee`, instruction count, and the ledger footprint
(`sorobanData`). The backend attaches these to the transaction and returns:

```json
{
  "xdr": "<base64-encoded transaction XDR>",
  "fee": "1234",
  "instructions": 500000,
  "readBytes": 256,
  "writeBytes": 128
}
```

**Endpoints:**

| Action | Endpoint | Key body fields |
|--------|----------|-----------------|
| Apply | `POST /api/transactions/apply` | `contributor, org_id, issue_id, sequence` |
| Withdraw | `POST /api/transactions/withdraw` | `contributor, org_id, issue_id, sequence` |
| Assign | `POST /api/transactions/assign` | `maintainer, contributor, org_id, issue_id, sequence` |
| Complete | `POST /api/transactions/complete` | `maintainer, contributor, org_id, issue_id, sequence` |
| Revoke | `POST /api/transactions/revoke` | `maintainer, contributor, org_id, issue_id, sequence` |

`sequence` is the current sequence number fetched from Horizon:
`GET /accounts/<address>` → `account.sequence`.

**Failure modes:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `400 validation failed` | Missing or malformed body field | Check request body; `sequence` must be a numeric string |
| `400 Simulation failed: GlobalApplicationLimitReached` | Contributor already has 15 pending applications | Withdraw an application first |
| `400 Simulation failed: OrgAssignmentLimitReached` | Contributor has 4 assignments in that org | Maintainer must complete/revoke one |
| `400 Simulation failed: DuplicateApplication` | Same `(contributor, org_id, issue_id)` already applied | Application already exists |
| `500 internal server error` | RPC node unreachable or invalid `CONTRACT_ID` env var | Check `SOROBAN_RPC_URL` and `CONTRACT_ID` |

**Debugging:**
```bash
# Manually test the build endpoint
curl -X POST http://localhost:3000/api/transactions/apply \
  -H 'Content-Type: application/json' \
  -d '{"contributor":"G...","org_id":"myorg","issue_id":42,"sequence":"1234"}'
```

---

## Stage 2 — User Signing in Freighter

**What happens:**
The frontend passes the XDR string to the Freighter browser extension:

```js
const signedXdr = await window.freighter.signTransaction(xdr, {
  networkPassphrase: Networks.TESTNET, // or MAINNET
});
```

Freighter displays a summary of the transaction (contract call, fee,
network). The user reviews and approves. Freighter signs with the user's
secret key and returns the signed XDR — the private key never leaves the
extension.

**Failure modes:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `window.freighter is undefined` | Extension not installed | Show "Install Freighter" prompt |
| `User declined access` | Site not connected | Prompt `window.freighter.requestAccess()` |
| `User declined` (on sign) | User rejected the transaction | Abort cleanly; allow retry |
| Transaction rejected with wrong network passphrase | Freighter set to different network than backend | Ensure both use the same network (testnet vs. mainnet) |
| Session locked | Freighter wallet is locked | Ask user to unlock Freighter |

**Debugging:**
```js
// Check Freighter is installed and connected
if (!window.freighter) {
  // redirect to https://www.freighter.app
}
const isConnected = await window.freighter.isConnected();
const { publicKey } = await window.freighter.getAddress();
console.log('Connected address:', publicKey);
```

**Typical duration:** 5 – 30 seconds (entirely user-gated).

---

## Stage 3 — Transaction Submission to Horizon / RPC

**What happens:**
The frontend sends the signed XDR to the backend submit endpoint (currently
handled inline within the `SorobanService.submitTransaction` method, called
after the transaction action endpoints). The backend calls
`sorobanRpc.sendTransaction(signedXdr)`, which broadcasts the transaction
to the Stellar peer network via the RPC node.

The RPC returns an immediate preliminary response:

| `status` | Meaning |
|----------|---------|
| `PENDING` | Accepted into the mempool; will be included in the next ledger |
| `DUPLICATE` | Already submitted with this hash; safe to poll for result |
| `TRY_AGAIN_LATER` | RPC node overloaded; back off and resubmit |
| `ERROR` | Rejected before reaching the network (auth, fee, seq) |

Note: `PENDING` does not mean success — it means the transaction entered
the queue. Confirmation requires waiting for ledger close (Stage 4).

**Failure modes:**

| `status` / error | Likely cause | Fix |
|-----------------|-------------|-----|
| `ERROR: tx_bad_auth` | Freighter signed with wrong account | Verify Freighter address matches `contributor`/`maintainer` |
| `ERROR: tx_bad_seq` | Sequence number changed between build and submit | Re-fetch sequence from Horizon and rebuild from Stage 1 |
| `ERROR: tx_insufficient_fee` | Fee market spike; fee too low | Increase the base fee multiplier in `buildRaw` |
| `TRY_AGAIN_LATER` | RPC overloaded | Retry after 3 – 5 seconds with exponential backoff |
| Network timeout | RPC node unreachable | Check `SOROBAN_RPC_URL`; try a different RPC endpoint |

**Why `tx_bad_seq` is the most common submission error:**
The sequence number must equal exactly `current_sequence + 1` at the time
the transaction is applied. If another transaction from the same account
landed in the ledger between Step 1 (build) and Step 3 (submit), the
sequence is stale. Always re-fetch sequence just before building.

**Debugging:**
```bash
# Check current sequence number for an account
curl "https://horizon-testnet.stellar.org/accounts/G..."
# Look for "sequence" field

# Manually submit signed XDR via Stellar Lab
# https://laboratory.stellar.org/#txsubmitter
```

---

## Stage 4 — Stellar Network Consensus (Ledger Close)

**What happens:**
Once the transaction is in the mempool, Stellar validators run the
Federated Byzantine Agreement (FBA) protocol to agree on the next ledger.
At ledger close:

1. The Soroban host picks up the transaction.
2. The WorkloadGovernor WASM contract executes (e.g., `apply_for_issue`).
3. The contract reads and writes storage entries.
4. If successful, the contract emits a contract event into the ledger's
   event stream (e.g., `applied`, `assigned`, `completed`, `revoked`).
5. The transaction result is written into the ledger (SUCCESS or FAILED).

**Typical duration:** 3 – 7 seconds per ledger at 5 s/ledger average.

Under high network load, a transaction may be deferred to a later ledger.
With the default `setTimeout(30)` set in `buildRaw`, a transaction that is
not included within 30 seconds is automatically rejected by validators.

**Failure modes:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Transaction FAILED in ledger | Contract logic error at execution time | Inspect `resultXdr` for Soroban error code (see error table below) |
| Transaction never closes | Ledger close stall (rare); fee too low during fee spike | Increase fee; check Stellar network status |
| Contract error code 6 | `GlobalApplicationLimitReached` — 15 pending apps | Withdraw an existing application |
| Contract error code 7 | `OrgAssignmentLimitReached` — 4 assignments in org | Maintainer must complete/revoke one assignment |
| Contract error code 8 | `DuplicateApplication` | Already applied; check `has_applied` |
| Contract error code 9 | `ApplicationNotFound` (assign) | Contributor never applied, or application expired |

See [docs/error-reference.md](./error-reference.md) for the full error
code table.

**Debugging:**
```bash
# Look up a transaction result on Horizon
curl "https://horizon-testnet.stellar.org/transactions/<txHash>"

# Decode resultXdr using Stellar Lab
# https://laboratory.stellar.org/#xdr-viewer
```

---

## Stage 5 — Backend Confirmation Polling

**What happens:**
After submission, `SorobanService.submitTransaction` enters a polling loop:

```
every 1 second, for up to 30 attempts:
  GET sorobanRpc.getTransaction(hash)
  if status == SUCCESS → return { hash, status: "success" }
  if status == FAILED  → parse resultXdr, return { hash, status: "error", error }
  if status == NOT_FOUND → transaction not yet in a ledger, keep polling
```

When the backend receives `SUCCESS`, it returns `200 OK` to the frontend.
The frontend now knows the transaction has been included in a ledger.

**Important:** At this point the contract has run and events have been
emitted on-chain, but the EventIndexer has not necessarily picked them up
yet. See Stage 6.

**Failure modes:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `NOT_FOUND` after 30 polls | Transaction dropped from mempool (TTL expired, or fee spike) | Re-fetch sequence and resubmit from Stage 1 |
| `FAILED` | Contract panicked during execution | Parse `resultXdr`; map error code from README |
| Polling timeout (30 s reached, code returns success) | This is a known code defect — the `SorobanService` assumes success on timeout | Check the transaction hash manually via Horizon |

**Debugging:**
```bash
# Poll for a transaction manually
curl "https://soroban-testnet.stellar.org" \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":{"hash":"<txHash>"}}'
```

---

## Stage 6 — Event Emission and Indexing

**What happens:**
When the contract executes successfully, it emits a contract event into
the Stellar ledger. The `EventIndexer` service picks these up by polling
the Soroban RPC `getEvents` method on a 5-second interval:

```
while (running):
  sorobanRpc.getEvents({
    filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
    cursor: lastSeenPagingToken,
  })
  for each new event:
    parse event type from topic XDR
    INSERT INTO contract_events … ON CONFLICT DO NOTHING
  advance cursor to last event's pagingToken
  sleep 5 seconds
  (on error: sleep 10 seconds and retry)
```

**Event types indexed:**

| Contract function | Event type stored |
|-------------------|------------------|
| `apply_for_issue` | `applied` |
| `withdraw_application` | `withdrawn` |
| `assign_issue` | `assigned` |
| `complete_assignment` | `completed` |
| `revoke_assignment` | `revoked` |

**`contract_events` table columns:**
`event_type`, `ledger_seq`, `timestamp`, `actor`, `org_id`, `issue_id`,
`contributor`, `data` (raw topic/value XDR as JSON)

**Worst-case indexing lag:** An event emitted immediately after a poll
iteration starts will wait up to 5 seconds for the next poll. Combined
with ledger close time (~5 s), an event can take up to 10 seconds to
appear in the database after the transaction is broadcast.

**Failure modes:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Events never appear in DB | EventIndexer not running | Check logs for `Event indexer started`; restart if absent |
| Events stop appearing | RPC connection lost | Indexer retries with 10 s backoff; check `SOROBAN_RPC_URL` |
| Event indexed but with wrong data | XDR parsing error in `extractActor` / `extractOrgId` | These methods do substring extraction on raw XDR — verify with decoded XDR |
| Duplicate events absent (expected) | `ON CONFLICT DO NOTHING` by `(ledger_seq, event_type, actor)` PK | This is correct behaviour |

**Debugging:**
```sql
-- Check if recent events have been indexed
SELECT event_type, ledger_seq, timestamp, actor, org_id, issue_id
FROM contract_events
ORDER BY timestamp DESC
LIMIT 20;

-- Check indexer lag (difference between latest event and now)
SELECT NOW() - MAX(timestamp) AS indexer_lag FROM contract_events;
```

```bash
# Query events via API
curl "http://localhost:3000/api/events?org_id=myorg&limit=10"
```

---

## Stage 7 — UI Update via Polling

**What happens:**
There is no server-sent event (SSE) or WebSocket push for contract events.
The frontend updates by periodically polling the REST endpoint:

```
GET /api/events?org_id=<org>&event_type=<type>&limit=50
→ { events: […], pagination: { total, limit, offset, hasMore } }
```

After a successful transaction (Stage 5 returns `200 OK`), the frontend
should trigger an immediate poll of `/api/events` and then continue polling
on a fixed interval (3 – 5 seconds recommended) until the expected event
appears in the response.

The `EventHistoryTable` component (`src/EventHistoryTable.js`) renders the
event log. It must be re-queried after a transaction to show the new event.

**Supported query parameters:**

| Parameter | Description |
|-----------|-------------|
| `org_id` | Filter by organisation |
| `event_type` | Filter by event type (`applied`, `assigned`, etc.) |
| `start_date` | ISO 8601 timestamp lower bound |
| `end_date` | ISO 8601 timestamp upper bound |
| `limit` | Results per page (1 – 1000, default 50) |
| `offset` | Pagination offset |

**Why the UI might not update even after a successful transaction:**

1. The EventIndexer poll cycle has not run since ledger close (up to 5 s lag).
2. The frontend is not polling frequently enough, or polling stopped after
   Stage 5 returned success.
3. The frontend is polling with a filter that doesn't match the stored event
   (e.g., wrong `org_id` or `event_type`).
4. The EventIndexer failed to parse the event (XDR parse error logged but
   event silently dropped).

**Failure modes:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| UI shows stale data indefinitely | Frontend stopped polling after Stage 5 | Poll `/api/events` for 30 s after success |
| API returns empty events | Wrong filter params or indexer lag | Try without filters; wait 10 s and retry |
| `500 internal server error` from `/api/events` | DB connection issue | Check PostgreSQL connectivity |

**Debugging:**
```bash
# Poll directly to verify event is indexed
curl "http://localhost:3000/api/events?org_id=myorg&event_type=applied"

# Tail backend logs for indexer activity
# Look for lines like: { message: 'Event indexer started' }
# And absence of: { message: 'Event polling error' }
```

---

## Stuck Transaction Debugging Checklist

Use this checklist when a contributor reports "Freighter approved it but
the UI didn't update."

### Step 1 — Confirm the transaction was submitted

```bash
# Lookup transaction on Horizon (testnet)
curl "https://horizon-testnet.stellar.org/transactions/<txHash>"
```

- If 404: transaction never reached the network. Go back to Stage 3.
- If `successful: false`: check `result_xdr` for the failure reason.
- If `successful: true`: continue to Step 2.

### Step 2 — Check for contract error in result

```bash
# Get detailed result via Soroban RPC
curl https://soroban-testnet.stellar.org \
  -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":{"hash":"<txHash>"}}'
```

- `status: "SUCCESS"`: contract executed without error. Continue to Step 3.
- `status: "FAILED"`: contract panicked. Decode `resultXdr` at
  https://laboratory.stellar.org/#xdr-viewer and match the error code
  against [docs/error-reference.md](./error-reference.md).
- `status: "NOT_FOUND"`: transaction was dropped. Sequence number issue
  or mempool TTL expired. Rebuild and resubmit from Stage 1.

### Step 3 — Check event indexer

```sql
-- Did the event land in the database?
SELECT * FROM contract_events
WHERE ledger_seq >= <ledger of tx>
ORDER BY timestamp DESC
LIMIT 10;
```

- Events present: indexer is healthy. The frontend polling is the problem.
  Go to Step 4.
- Events absent:
  1. Check backend logs for `Event polling error`.
  2. Verify `SOROBAN_RPC_URL` and `CONTRACT_ID` env vars.
  3. Verify the EventIndexer process is running (`Event indexer started`
     log line on startup).
  4. Manually call `getEvents` via RPC and check if the event is visible
     there but not in the DB (XDR parse failure).

### Step 4 — Check frontend polling

Open browser DevTools → Network tab. After approving in Freighter:

1. Confirm `POST /api/transactions/submit` returned `200`.
2. Confirm subsequent `GET /api/events?...` requests are firing every few
   seconds.
3. Confirm the query parameters in those requests match the org/issue of
   the transaction.
4. If requests are firing but returning empty arrays: verify the event is
   in the DB (Step 3) and that the filter matches.

### Step 5 — Verify sequence number for retry

If the transaction needs to be rebuilt:

```bash
# Get fresh sequence number
curl "https://horizon-testnet.stellar.org/accounts/<address>"
# Use the value of "sequence" as the sequence parameter
```

Increment by 1 before passing to the build endpoint.

---

## Fee Calculation Reference

```
total_fee_stroops = base_fee + min_resource_fee

base_fee         = 100 stroops (hard-coded in SorobanService.buildRaw)
min_resource_fee = returned by simulateTransaction
                   proportional to:
                     - CPU instructions
                     - readBytes / writeBytes
                     - number of events emitted
                     - transaction envelope size
```

The resource fee is paid to validators. The unused portion (if actual
resource usage is below declared limits) is partially refunded in a
separate fee-bump operation after ledger close.

During fee spikes (network congestion), `base_fee` may need to be
increased. The Soroban RPC `getFeeStats` method returns the current
suggested fee percentiles.

---

## End-to-End Latency Summary

```
Stage 1  XDR construction + simulation   ~200 ms
Stage 2  User approval in Freighter      5 – 30 s   (user-gated)
Stage 3  Submission to RPC               ~500 ms
Stage 4  Ledger close                    3 – 7 s
Stage 5  Backend confirmation polling    1 – 15 s
Stage 6  Event indexer pick-up           0 – 10 s   (up to one 5 s poll cycle)
Stage 7  Frontend poll delivers event    0 – 5 s    (depends on frontend poll interval)
─────────────────────────────────────────────────────
Happy path (fast user + fast ledger)     ~15 s
Worst case (slow user + max poll lags)   ~72 s
```

---

## Further Reading

- [Soroban transaction lifecycle (Stellar docs)](https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle)
- [simulateTransaction RPC method](https://developers.stellar.org/docs/data/rpc/api-reference/methods/simulateTransaction)
- [getEvents RPC method](https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents)
- [Freighter API reference](https://docs.freighter.app/docs/guide/usingFreighterWebApp)
- [docs/error-reference.md](./error-reference.md) — all contract error codes
- [docs/architecture.md](./architecture.md) — component context
- [docs/api-reference.md](./api-reference.md) — full REST API reference

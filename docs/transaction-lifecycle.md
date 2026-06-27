# Soroban Transaction Lifecycle

This document traces every step a Soroban transaction takes from the user's
browser through the backend, the RPC node, and into the smart contract.

---

## Overview Diagram

```
Frontend (React SPA)
  │
  ├─1─► Read wallet address from Freighter
  ├─2─► POST /api/transactions/<action>  ──────────────────────────────┐
  │                                                                    │
  │     Backend API (Express)                                          │
  │       ├─3─► SorobanService.build*Tx() — assemble unsigned TX XDR  │
  │       ├─4─► sorobanRpc.simulateTransaction(tx) ────────────────►  │
  │       │                                               Soroban RPC │
  │       │     ◄──── {minResourceFee, transactionData} ──────────────┘
  │       ├─5─► Attach sorobanData + set fee = base + minResourceFee
  │       └─6─► Return {xdr, fee, instructions, readBytes, writeBytes}
  │
  ├─7─► Pass XDR to Freighter.signTransaction()
  │
  │     Freighter Extension
  │       └─8─► User approves → returns signed XDR
  │
  ├─9─► POST /api/transactions/submit  {signedXdr}
  │
  │     Backend API
  │       └─10► sorobanRpc.sendTransaction(signedXdr) ──────────────►
  │                                                        Soroban RPC
  │                                                            │
  │                                                Stellar Network
  │                                          WorkloadGovernor Contract
  │                                                            │
  │             ◄──── {status, hash} ─────────────────────────┘
  │
  └─11► Frontend polls GET /api/transactions/status?hash=<hash>
        until status = SUCCESS or FAILED
```

---

## Step-by-Step Breakdown

### Step 1 — Read Wallet Address

The frontend calls `window.freighter.getAddress()` to obtain the user's
Stellar public key (`G…`). This address is used as both the transaction
source account and the `contributor` or `maintainer` argument.

**Failure modes:**
- Freighter not installed → `window.freighter` is `undefined`. Show an
  "Install Freighter" prompt.
- User has not connected the site → Freighter returns a permission denied
  error. Prompt the user to connect.
- Wrong network selected in Freighter → the signed transaction will be
  rejected by the RPC node with an invalid network passphrase error.

---

### Step 2 — POST to Backend Transaction Endpoint

The frontend sends a JSON body to one of:

| Endpoint | Required fields |
|---|---|
| `POST /api/transactions/apply` | `contributor, org_id, issue_id, sequence` |
| `POST /api/transactions/withdraw` | `contributor, org_id, issue_id, sequence` |
| `POST /api/transactions/assign` | `maintainer, contributor, org_id, issue_id, sequence` |
| `POST /api/transactions/complete` | `maintainer, contributor, org_id, issue_id, sequence` |
| `POST /api/transactions/revoke` | `maintainer, contributor, org_id, issue_id, sequence` |

`sequence` is the current sequence number of the source account, fetched
from Horizon (`GET /accounts/<address>`).

**Failure modes:**
- Missing fields → backend returns `400 { error: "… required" }`.
- Stale sequence number → simulation succeeds but submission fails with
  `tx_bad_seq`. Re-fetch the sequence and retry.

---

### Step 3 — Build Unsigned Transaction

`SorobanService.buildRaw()` constructs a `TransactionBuilder` with:

- `fee: "100"` (base fee in stroops — will be replaced after simulation)
- `networkPassphrase` from `STELLAR_NETWORK_PASSPHRASE` env var
- A single `contract.call(fnName, ...args)` operation

The arguments are encoded as `xdr.ScVal` using `nativeToScVal` and
`Address.toScVal()`.

**Failure modes:**
- Invalid contract ID in environment → `Contract` constructor throws. The
  backend will return `500`.
- Invalid Stellar address format → `Address` constructor throws `400`.

---

### Step 4 — Simulate Transaction (Dry Run)

`server.simulateTransaction(tx)` sends the unsigned transaction to the
Soroban RPC node for a read-only execution:

- The contract code runs in a sandbox.
- The RPC returns `minResourceFee`, CPU instruction count, and read/write
  byte counts.
- No state is changed on-chain.

**Failure modes:**
- Contract logic error (e.g. `GlobalApplicationLimitReached`) → simulation
  returns a `SimulationError`. The backend throws and returns `400 { error }`.
- RPC node unreachable → network error, backend returns `500`.
- Insufficient base fee for simulation → rare; increase `fee` in `buildRaw`.

---

### Step 5 — Attach Resource Data and Set Final Fee

After a successful simulation, `stellar-sdk` assembles the final transaction:

```
finalFee = BASE_FEE + minResourceFee
```

The `sorobanData` (ledger footprint + resource limits) is attached to the
transaction envelope. This is the XDR that gets signed.

---

### Step 6 — Return XDR and Resource Estimate

The backend responds with:

```json
{
  "xdr": "<base64-encoded transaction XDR>",
  "fee": "1234",
  "instructions": 500000,
  "readBytes": 256,
  "writeBytes": 128
}
```

The frontend can display the fee to the user before prompting for a signature.

---

### Step 7 & 8 — Sign with Freighter

```js
const signedXdr = await window.freighter.signTransaction(xdr, {
  networkPassphrase: Networks.MAINNET, // or TESTNET
});
```

Freighter displays the transaction details to the user. On approval it signs
with the user's secret key and returns the signed XDR without ever exposing
the key to the application.

**Failure modes:**
- User rejects → Freighter throws a `"User declined"` error. Abort and notify.
- Session expired → Freighter prompts the user to unlock their wallet.

---

### Steps 9 & 10 — Submit to Network

The frontend sends the signed XDR to `POST /api/transactions/submit`. The
backend calls `server.sendTransaction(signedXdr)`, which broadcasts to the
Stellar peer network via the RPC node.

The RPC immediately returns a preliminary response:

| `status` | Meaning |
|---|---|
| `PENDING` | Transaction accepted into the queue. |
| `DUPLICATE` | Already submitted; use the existing hash. |
| `TRY_AGAIN_LATER` | Node is overloaded; back off and retry. |
| `ERROR` | Transaction rejected (bad auth, bad seq, contract error). |

**Failure modes:**
- `tx_bad_auth` → wrong signer. Check that Freighter is using the correct
  account for the operation.
- `tx_bad_seq` → sequence number changed between build and submit. Re-fetch
  sequence and rebuild from Step 2.
- `tx_insufficient_fee` → fee market spike. Increase base fee multiplier.
- Contract error (error codes 1–11) → the transaction executed but the
  contract panicked. The `ERROR` status includes the error code. Map it
  using the error table in README.md.

---

### Step 11 — Poll for Confirmation

Soroban transactions are applied in the next ledger (≈5 seconds). Poll
`getTransaction(hash)` until status is `SUCCESS` or `FAILED`.

```
GET /api/transactions/status?hash=<txHash>
  → { status: "SUCCESS" | "FAILED" | "NOT_FOUND" }
```

**Failure modes:**
- `NOT_FOUND` after 30 seconds → transaction was dropped (TTL expired in
  queue). Rebuild and resubmit from Step 2.
- `FAILED` → contract panicked during execution. Inspect `resultXdr` for
  the Soroban error code.

---

## Fee Calculation Reference

```
total_fee = base_fee + min_resource_fee

base_fee        = 100 stroops (hard-coded in buildRaw)
min_resource_fee = returned by simulateTransaction
                  proportional to: instructions, readBytes, writeBytes,
                  events, and transaction size
```

The resource fee is paid to validators and partially refunded if actual
resource usage is less than the declared limit.

---

## Further Reading

- [Soroban transaction lifecycle (Stellar docs)](https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle)
- [simulateTransaction RPC method](https://developers.stellar.org/docs/data/rpc/api-reference/methods/simulateTransaction)
- [Freighter API reference](https://docs.freighter.app/docs/guide/usingFreighterWebApp)
- See [docs/architecture.md](./architecture.md) for the component context.

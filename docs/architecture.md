# Architecture Overview

WorkloadGovernor enforces fairness caps on developer workloads for the
AlignmentDrips Wave platform on Stellar. This document describes every system
component, its responsibility, and how the components interact.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│                                                                 │
│  ┌──────────────┐    Freighter     ┌──────────────────────────┐ │
│  │   React SPA  │◄────sign tx─────►│  Freighter Wallet Ext.   │ │
│  │  (Vite/TSX)  │                  └──────────────────────────┘ │
│  └──────┬───────┘                                               │
│         │ REST (JSON)                                           │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│   Backend API       │  Express 4 / Node.js / TypeScript 5
│                     │
│  /api/transactions  │──── build + simulate ──►┐
│  /api/issues        │                         │
│  /api/contributors  │                         │
│  /api/admin         │                         │
└──────────┬──────────┘                         │
           │ pg (PostgreSQL)                    │ @stellar/stellar-sdk
           ▼                                    ▼
┌──────────────────┐              ┌─────────────────────────┐
│  PostgreSQL 16   │              │  Soroban RPC node        │
│  (RDS / local)   │              │  (simulateTransaction,   │
└──────────────────┘              │   sendTransaction)       │
                                  └────────────┬────────────┘
                                               │
                                               ▼
                                  ┌─────────────────────────┐
                                  │  Stellar Network         │
                                  │  WorkloadGovernor        │
                                  │  Soroban Contract        │
                                  │  (Rust / soroban-sdk 22) │
                                  └─────────────────────────┘
```

---

## Component Responsibilities

### React SPA (frontend)

- Renders the contributor and maintainer UI.
- Connects to Freighter to read the user's Stellar address and request
  transaction signatures.
- Calls the Backend API to build and simulate transactions, then sends the
  signed XDR back for submission.
- Displays real-time application and assignment state by querying the API.

**Tech:** React 19, Vite 8, TypeScript 6, oxlint.

### Freighter Wallet Extension

- Browser extension that holds the user's Stellar secret key.
- Signs XDR-encoded transactions without exposing the key to the application.
- Returns the signed transaction XDR to the SPA.

### Backend API

- Stateless Express service that acts as the bridge between the SPA and the
  Stellar network.
- Builds Soroban transactions using `@stellar/stellar-sdk` and runs
  `simulateTransaction` against the RPC node to attach resource fees.
- Returns the pre-simulated XDR to the frontend for signing.
- Submits the signed XDR to the network and relays the result.
- Stores off-chain metadata (GitHub issue details, org mappings) in PostgreSQL.
- Exposes four route groups: `/api/transactions`, `/api/issues`,
  `/api/contributors`, `/api/admin`.

**Tech:** Express 4.19, Node.js, TypeScript 5.5, pg 8.12.

### Soroban RPC Node

- Provides `simulateTransaction` (dry-run, fee estimation) and
  `sendTransaction` (broadcast) over HTTPS JSON-RPC.
- Horizon is used for account sequence numbers and XLM balance checks.
- Testnet default: `https://soroban-testnet.stellar.org`.
- Mainnet: operator-supplied RPC URL.

### WorkloadGovernor Smart Contract

- Rust Soroban contract compiled to WASM (~32 KB optimised).
- Enforces the two fairness caps (global: 15 pending applications;
  per-org: 4 active assignments).
- Manages all six storage keys across Temporary and Persistent tiers.
- Emits contract events on state changes for indexing.

**Tech:** Rust, soroban-sdk 22.0.0, wasm32v1-none target.

### PostgreSQL

- Off-chain store for GitHub org/repo metadata, issue titles, and
  contributor display names.
- Not the source of truth for caps — the contract is authoritative.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Smart contract language | Rust | stable (edition 2021) |
| Contract SDK | soroban-sdk | 22.0.0 |
| Contract target | wasm32v1-none | — |
| Backend runtime | Node.js | 20 LTS |
| Backend framework | Express | 4.19.2 |
| Backend language | TypeScript | 5.5.3 |
| Stellar SDK (backend) | @stellar/stellar-sdk | 12.3.0 |
| Frontend framework | React | 19.2.7 |
| Frontend build tool | Vite | 8.1.0 |
| Frontend language | TypeScript | 6.0.2 |
| Frontend linter | oxlint | 1.69.0 |
| Database | PostgreSQL | 16 |
| Database client | pg | 8.12.0 |
| Wallet extension | Freighter | — |
| Container | Docker | — |
| IaC | Terraform | — |

---

## User Journey: Apply for Issue

```
Contributor (browser)
  │
  ├─1─► Frontend fetches contributor's Freighter address
  ├─2─► Frontend calls POST /api/transactions/apply
  │       {contributor, org_id, issue_id, sequence}
  │
  │     Backend API
  │       ├─3─► SorobanService.buildApplyTx() constructs unsigned TX
  │       ├─4─► server.simulateTransaction(tx) → fee estimate + resource data
  │       └─5─► Returns {xdr, fee, instructions, readBytes, writeBytes}
  │
  ├─6─► Frontend passes XDR to Freighter → user signs
  ├─7─► Frontend sends signed XDR to POST /api/transactions/submit
  │
  │     Backend API
  │       └─8─► server.sendTransaction(signedXdr) → Stellar Network
  │
  │     Contract (apply_for_issue)
  │       ├─9─► Verify contributor auth
  │       ├─10► Check global app count < 15
  │       ├─11► Check no duplicate application
  │       └─12► Write app entry + increment counter (Temporary storage)
  │
  └─13► Frontend polls /api/issues to reflect updated state
```

## User Journey: Assign Issue

```
Maintainer (browser)
  │
  ├─1─► Frontend calls POST /api/transactions/assign
  │       {maintainer, contributor, org_id, issue_id, sequence}
  │
  │     Backend API
  │       ├─2─► SorobanService.buildAssignTx() constructs unsigned TX
  │       ├─3─► simulateTransaction → fee estimate
  │       └─4─► Returns {xdr, fee, ...}
  │
  ├─5─► Frontend passes XDR to Freighter → maintainer signs
  ├─6─► Frontend submits signed XDR
  │
  │     Contract (assign_issue)
  │       ├─7─► Verify maintainer is registered for org
  │       ├─8─► Verify application exists
  │       ├─9─► Check org assignment count < 4
  │       ├─10► Check issue not already assigned
  │       ├─11► Write assignment entry + increment org counter (Persistent)
  │       └─12► Decrement contributor's global app count
  │
  └─13► UI refreshes contributor's status to "assigned"
```

## User Journey: Complete Assignment

```
Maintainer (browser)
  │
  ├─1─► Frontend calls POST /api/transactions/complete
  │       {maintainer, contributor, org_id, issue_id, sequence}
  │
  │     Backend API
  │       ├─2─► SorobanService.buildCompleteTx() constructs unsigned TX
  │       ├─3─► simulateTransaction → fee estimate
  │       └─4─► Returns {xdr, fee, ...}
  │
  ├─5─► Frontend passes XDR to Freighter → maintainer signs
  ├─6─► Frontend submits signed XDR
  │
  │     Contract (complete_assignment)
  │       ├─7─► Verify maintainer auth for org
  │       ├─8─► Verify assignment exists
  │       ├─9─► Remove assignment entry
  │       └─10► Decrement org assignment counter
  │
  └─11► UI marks the issue as completed
```

# Glossary

Domain-specific terms used in the WorkloadGovernor codebase and documentation.

---

## Core Roles

**Admin**
The address that deployed and initialised the contract via `initialize(admin)`. The admin is the only party authorised to call `register_maintainer` and `upgrade`. Stored as a persistent entry under the key `"admin"`.

**Maintainer**
An address registered by the admin for a specific organisation via `register_maintainer`. A maintainer can call `assign_issue`, `complete_assignment`, and `revoke_assignment` only for the org they were registered against. Stored persistently under the key `("maint", maintainer, org_id)`.

**Contributor**
A developer who submits, withdraws, and holds issue applications. Identified by a Stellar address. Subject to the global application cap (15) and the per-org assignment cap (4). Auth is required for `apply_for_issue` and `withdraw_application`.

---

## Organisational Concepts

**Org (Organisation)**
Represented as a Soroban `Symbol` (e.g. `"acme"`). Scopes assignment limits independently — filling the cap in one org has no effect on another. Used as a key component in maintainer, assignment, and assignment-count storage entries.

**Issue**
A unit of work identified by a `u32` issue ID within an org. An issue progresses through states: unapplied → applied → assigned → completed (or revoked/withdrawn).

---

## Workflow States

**Application**
A pending intent by a contributor to work on an issue. Created by `apply_for_issue`. Stored as a temporary entry under `("app", contributor, org_id, issue_id)`. Counts against the contributor's global application cap. Consumed (removed) when the issue is assigned or withdrawn.

**Assignment**
An active work commitment granted by a maintainer via `assign_issue`. Stored persistently under `("asgn", org_id, issue_id, contributor)`. Counts against the contributor's per-org assignment cap. Removed on `complete_assignment` or `revoke_assignment`.

**Difference between Application and Assignment**
An *application* is a contributor's request to work on an issue — it is unconfirmed and subject to the maintainer's approval. An *assignment* is the confirmed, active work relationship after the maintainer accepts the application. Applications are temporary (TTL-bound); assignments are persistent.

---

## Limits / Caps

**Global Cap**
Maximum number of pending applications a contributor may hold simultaneously across all orgs. Fixed at `15` (`GLOBAL_APP_LIMIT`). Enforced in `apply_for_issue` with the `GlobalApplicationLimitReached` error.

**Org Cap**
Maximum number of active assignments a contributor may hold simultaneously within a single org. Fixed at `4` (`ORG_ASSIGNMENT_LIMIT`). Enforced in `assign_issue` with the `OrgAssignmentLimitReached` error.

---

## TTL / Lifecycle

**Wave TTL**
The time-to-live (in ledgers) for temporary storage entries: the global application count and individual application entries. Defined by `APP_TTL_LEDGERS`, bounded between `APP_TTL_MIN` and `APP_TTL_MAX`. After expiry the Stellar network automatically evicts the entry, effectively cleaning up stale applications. Call `extend_application_ttl` to bump the TTL before it expires.

---

## Infrastructure

**Soroban**
The smart-contract execution environment on the Stellar network. WorkloadGovernor is a Soroban contract compiled to WebAssembly (`wasm32v1-none`). Provides the `Env`, `Address`, `Symbol`, and storage APIs used throughout the codebase.

**Horizon**
The Stellar REST API server used to query network state (ledger data, transactions, account info). Not directly called by this contract but used by off-chain integrations (e.g. the Organisation Selector) to read contract storage via `stellar contract read`.

**Contract ID**
The unique Stellar address that identifies a deployed instance of WorkloadGovernor on the network. Required for all `stellar contract invoke` calls. Determined at deploy time and stored in `.env` or passed as a CLI argument.

---

## Soroban-Specific Terms

**Footprint**
A footprint is the set of ledger keys a Soroban contract invocation declares it will read or write, provided to the network before execution begins. The Stellar validator uses the footprint to pre-fetch the required storage entries and to calculate resource fees. If the contract tries to access a key not listed in the footprint the transaction fails. In this project, the contract's application entries, assignment entries, and counter keys are all part of each invocation's footprint. See the [Soroban storage design](docs/storage-design.md) for key layouts.

**Temporary vs Persistent Storage**
Soroban offers two user-facing storage tiers. *Temporary* storage is cheap and expires automatically after its TTL window elapses — the network evicts the entry without any action from the contract. *Persistent* storage survives ledger archival as long as its TTL is periodically extended; it is more expensive but guarantees the data is never silently deleted. In WorkloadGovernor, application entries and global application counters use Temporary storage (bounded by `APP_TTL_LEDGERS`), while admin, maintainer, and assignment records use Persistent storage. See [docs/storage-design.md](docs/storage-design.md) for the full breakdown.

**TTL (Time To Live)**
In Soroban, TTL is measured in *ledgers* rather than wall-clock time. Each temporary or persistent storage entry carries a TTL value; the network decrements it every ledger close (≈ 5 seconds each). When TTL reaches zero the entry is eligible for eviction. For temporary entries in this contract the TTL is bounded between `APP_TTL_MIN` and `APP_TTL_MAX` ledgers, configurable at deploy time. The `extend_application_ttl` function resets the TTL of an application entry to the maximum. See the [Stellar TTL docs](https://developers.stellar.org/docs/build/smart-contracts/storage-ttl) for the network-level mechanics.

**Ledger Entry / Ledger Sequence**
A *ledger entry* is a single key-value record stored on the Stellar ledger — it may be an account, a trust line, a contract's storage slot, or the contract WASM itself. The *ledger sequence* is a monotonically increasing integer that identifies each closed ledger; it advances by one every ≈ 5 seconds. TTL values are expressed relative to the current ledger sequence, so `ttl_remaining = expiry_ledger - current_ledger_sequence`. This contract uses ledger sequence arithmetic internally when computing whether a TTL extension is needed.

**Invocation (Contract Invocation)**
An invocation is a Stellar transaction that calls a Soroban contract function. It is encoded as an `InvokeContractOp` operation and submitted as XDR to the Soroban RPC. Each invocation specifies the contract ID, the function name, and typed arguments (`ScVal` XDR values). The Soroban host executes the WASM in a metered sandbox, deducts resource fees, and returns a result `ScVal` or an error code. The `stellar contract invoke` CLI command and the `@stellar/js-stellar-sdk` `ContractClient` both construct invocations on your behalf.

**WASM Hash / Contract WASM**
A Soroban contract's logic lives in a WebAssembly binary (WASM) uploaded to the network as a ledger entry identified by its SHA-256 hash — this is the *WASM hash*. Deploying a contract creates a *contract instance* that references this hash; multiple instances can share one WASM binary. The `upgrade` admin function in WorkloadGovernor updates the instance's WASM reference to a new hash without changing the contract address or storage, enabling in-place upgrades. The optimised WASM is built with `stellar contract build` and uploaded with `stellar contract deploy`.

**Simulation vs Submission**
Before a Soroban transaction is submitted, it must be *simulated* against the current ledger state. Simulation runs the contract logic in read-only mode to determine the exact resource usage (instructions, memory, ledger reads/writes, event bytes) and constructs the footprint. The resulting resource limits and fees are injected into the transaction envelope before signing. The Stellar CLI (`stellar contract invoke`) and the JS SDK's `ContractClient` both simulate automatically. Submitting without a valid simulation (or with a stale footprint) results in a `txSorobanInvalid` error from the RPC.

**Authorization Envelope**
A Soroban authorization envelope (`SorobanAuthorizationEntry`) is a signed data structure that proves a specific address consented to a specific contract invocation with specific arguments. It differs from a transaction signature: a transaction signature covers the whole transaction, while an authorization envelope covers only the sub-invocation it authorises. WorkloadGovernor uses `require_auth()` on contributor and maintainer arguments — the caller must provide a valid auth entry (or sign with Freighter) that matches the function, contract, and arguments. Missing or mismatched auth entries produce `UnauthorizedContributor` (error 5) or `UnauthorizedMaintainer` (error 4).

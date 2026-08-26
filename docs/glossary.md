# Glossary

Domain-specific terms used in the WorkloadGovernor codebase, documentation, and API.

---

## Table of Contents

- [Core Roles](#core-roles): Admin · Contributor · Maintainer
- [Organisational Concepts](#organisational-concepts): Issue · Org
- [Workflow States](#workflow-states): Application · Assignment · Difference between Application and Assignment
- [Limits / Caps](#limits--caps): Global Cap · Org Cap · Org Assignment Limit
- [Contract Functions (Quick Reference)](#contract-functions-quick-reference): check_consistency · complete_assignment · extend_application_ttl · has_applied · is_assigned · revoke_assignment · withdraw_application
- [TTL / Lifecycle](#ttl--lifecycle): Wave · Wave TTL
- [Storage Tiers](#storage-tiers): Instance Storage · Ledger Entry · Persistent Storage · Temporary Storage · TTL
- [Soroban Primitives](#soroban-primitives): Contract Address · contracterror · Ledger · Ledger Sequence Number · panic_with_error! · WASM
- [Counter & Integrity Concepts](#counter--integrity-concepts): CounterInconsistency · Global Application Count · Org Assignment Count
- [Stellar Network Concepts](#stellar-network-concepts): Fee Bump Transaction · Friendbot · Horizon API · Network Passphrase · Sequence Number · Stellar Address · StrKey · Testnet · XDR
- [API / Backend Terms](#api--backend-terms): API Key · Freighter · MSW · Unsigned Transaction · Soroban
- [Infrastructure](#infrastructure): Contract ID · Horizon

---

## Core Roles

**Admin**
The address that deployed and initialised the contract via `initialize(admin)`. The admin is the only party authorised to call `register_maintainer` and `upgrade`. Stored as a persistent entry under the key `"admin"`. After deployment, admin authority can be transferred via `transfer_admin`.

*Related: [Maintainer](#maintainer), [Contract ID](#contract-id)*

---

**Contributor**
A developer who submits, withdraws, and holds issue applications. Identified by a Stellar [Stellar Address](#stellar-address). Subject to the [Global Cap](#global-cap) (15 pending applications) and the [Org Cap](#org-cap) (4 active assignments per org). Auth is required for `apply_for_issue` and `withdraw_application`.

*Related: [Application](#application), [Global Cap](#global-cap), [Org Cap](#org-cap)*

---

**Maintainer**
An address registered by the admin for a specific organisation via `register_maintainer`. A maintainer can call `assign_issue`, `complete_assignment`, and `revoke_assignment` only for the org they were registered against. Stored persistently under the key `("maint", maintainer, org_id)`. The same address can be a maintainer for multiple orgs by calling `register_maintainer` once per org.

*Related: [Admin](#admin), [Org](#org-organisation), [Assignment](#assignment)*

---

## Organisational Concepts

**Issue**
A unit of work identified by a `u32` issue ID within an [Org](#org-organisation). An issue progresses through states: unapplied → applied → assigned → completed (or revoked/withdrawn). Issue IDs are not validated by the contract — any `u32` is accepted.

*Related: [Application](#application), [Assignment](#assignment)*

---

**Org (Organisation)**
Represented as a Soroban `Symbol` (e.g. `"acme"`). Scopes assignment limits independently — filling the cap in one org has no effect on another. Used as a key component in maintainer, assignment, and assignment-count storage entries. Org names are case-sensitive symbols up to 32 characters.

*Related: [Org Cap](#org-cap), [Maintainer](#maintainer), [Org Assignment Count](#org-assignment-count)*

---

## Workflow States

**Application**
A pending intent by a contributor to work on an issue. Created by `apply_for_issue`. Stored as a [Temporary Storage](#temporary-storage) entry under `("app", contributor, org_id, issue_id)`. Counts against the contributor's [Global Cap](#global-cap). Consumed (removed) when the issue is assigned via `assign_issue` or cancelled via `withdraw_application`.

*Related: [Assignment](#assignment), [Global Application Count](#global-application-count), [Wave TTL](#wave-ttl)*

---

**Assignment**
An active work commitment granted by a maintainer via `assign_issue`. Stored persistently under `("asgn", org_id, issue_id, contributor)`. Counts against the contributor's [Org Cap](#org-cap). Removed on `complete_assignment` or `revoke_assignment`. Converting an application to an assignment atomically removes the application and decrements the global app count.

*Related: [Application](#application), [Org Assignment Count](#org-assignment-count), [Persistent Storage](#persistent-storage)*

---

**Difference between Application and Assignment**
An *application* is a contributor's request to work on an issue — it is unconfirmed and subject to the maintainer's approval. An *assignment* is the confirmed, active work relationship after the maintainer accepts the application. Applications are temporary ([TTL](#ttl-time-to-live)-bound); assignments are persistent and survive ledger closes indefinitely until explicitly completed or revoked.

---

## Limits / Caps

**Global Cap**
Maximum number of pending [applications](#application) a contributor may hold simultaneously across all orgs. Fixed at `15` (`GLOBAL_APP_LIMIT`). Enforced in `apply_for_issue` with the `GlobalApplicationLimitReached` error (code 6). See also [Global Application Count](#global-application-count).

*Related: [Global Application Count](#global-application-count), [Org Cap](#org-cap)*

---

**Org Assignment Limit**
The default maximum number of active [assignments](#assignment) a contributor may hold in a single [org](#org-organisation). Defaults to `4` (`ORG_ASSIGNMENT_LIMIT`) unless the org has a custom cap stored under `("o_cap", org_id)`. See [Org Cap](#org-cap).

*Related: [Org Cap](#org-cap), [Org Assignment Count](#org-assignment-count)*

---

**Org Cap**
A per-organisation override for the [Org Assignment Limit](#org-assignment-limit). Stored persistently under `("o_cap", org_id)`. If not set, the default `ORG_ASSIGNMENT_LIMIT` (4) applies. Must be in the range `[1, 20]`; setting outside this range returns `InvalidOrgCap` (code 16). Enforced in `assign_issue` with the `OrgAssignmentLimitReached` error (code 7).

*Related: [Org Assignment Limit](#org-assignment-limit), [Org Assignment Count](#org-assignment-count)*

---

## Contract Functions (Quick Reference)

**check_consistency**
Contract query function that accepts a list of `(contributor, org_id)` pairs and a list of issue IDs, then returns the subset of pairs where the stored org assignment counter is inconsistent with actual assignment entries. Useful for detecting post-migration storage corruption. Returns pairs with [CounterInconsistency](#counterinconsistency).

*Related: [CounterInconsistency](#counterinconsistency)*

---

**complete_assignment**
Maintainer-only function that marks an active [assignment](#assignment) as finished. Removes the assignment entry and decrements the [Org Assignment Count](#org-assignment-count). Returns `AssignmentNotFound` (code 10) if no assignment exists. Does not restore a pending application.

*Related: [Assignment](#assignment), [revoke_assignment](#revoke_assignment)*

---

**extend_application_ttl**
Contract function that bumps the [TTL](#ttl-time-to-live) of a contributor's [application](#application) entry and global count entry. Can be called by anyone (no auth required). Used to prevent application entries from expiring before the [wave](#wave) ends.

*Related: [Wave TTL](#wave-ttl), [Application](#application)*

---

**has_applied**
Read-only query function returning `true` if a pending [application](#application) exists for the `(contributor, org_id, issue_id)` triple. Reads [Temporary Storage](#temporary-storage). Returns `false` if the entry has expired.

*Related: [is_assigned](#is_assigned), [Application](#application)*

---

**is_assigned**
Read-only query function returning `true` if an active [assignment](#assignment) exists for the `(contributor, org_id, issue_id)` triple. Reads [Persistent Storage](#persistent-storage).

*Related: [has_applied](#has_applied), [Assignment](#assignment)*

---

**revoke_assignment**
Maintainer-only function that cancels an active [assignment](#assignment) without marking it completed. Removes the assignment entry and decrements the [Org Assignment Count](#org-assignment-count). The contributor's application is not restored — they must re-apply if they want to work on the issue again.

*Related: [complete_assignment](#complete_assignment), [Assignment](#assignment)*

---

**withdraw_application**
Contributor function that cancels a pending [application](#application). Removes the application entry and decrements the [Global Application Count](#global-application-count). Requires contributor auth. Returns `ApplicationNotFound` (code 9) if no application exists.

*Related: [Application](#application), [Global Application Count](#global-application-count)*

---

## TTL / Lifecycle

**Wave**
A recurring funding/work cycle on the AlignmentDrips platform. Applications and global application counts are scoped to a wave via [TTL](#ttl-time-to-live) semantics: temporary entries expire at the end of the wave. A new wave effectively resets pending applications. Assignments are persistent and survive across waves.

*Related: [Wave TTL](#wave-ttl), [Application](#application)*

---

**Wave TTL**
The time-to-live (in ledgers) for [Temporary Storage](#temporary-storage) entries: the [Global Application Count](#global-application-count) and individual [application](#application) entries. Defined by `APP_TTL_LEDGERS`, bounded between `APP_TTL_MIN` and `APP_TTL_MAX`. After expiry the Stellar network automatically evicts the entry, effectively cleaning up stale applications. Call `extend_application_ttl` to bump the TTL before it expires. Approximately one ledger closes every 5 seconds.

*Related: [TTL](#ttl-time-to-live), [Wave](#wave), [extend_application_ttl](#extend_application_ttl)*

---

## Storage Tiers

**Instance Storage**
Soroban storage tied to the contract instance itself. Bumped on every state-changing call (`bump_instance`) to extend the instance's own TTL. Not used for domain data in WorkloadGovernor — domain data uses [Persistent Storage](#persistent-storage) or [Temporary Storage](#temporary-storage).

*Related: [Persistent Storage](#persistent-storage), [Temporary Storage](#temporary-storage)*

---

**Ledger Entry**
A key-value record stored in the Soroban ledger. There are three storage tiers: [Temporary Storage](#temporary-storage), [Persistent Storage](#persistent-storage), and [Instance Storage](#instance-storage). WorkloadGovernor uses temporary storage for applications and persistent storage for assignments. Each entry has a [TTL](#ttl-time-to-live) that determines when the network may evict it.

*Related: [Persistent Storage](#persistent-storage), [Temporary Storage](#temporary-storage)*

---

**Persistent Storage**
Soroban storage tier for long-lived data that survives ledger closes. Used for assignments (`("asgn", ...)`), maintainer registrations (`("maint", ...)`), admin address (`"admin"`), org assignment counts (`("o_asgn", ...)`), and org caps (`("o_cap", ...)`). Entries do not expire unless explicitly removed.

*Related: [Temporary Storage](#temporary-storage), [Assignment](#assignment)*

---

**Temporary Storage**
Soroban storage tier for short-lived data. Entries have a [TTL](#ttl-time-to-live) and are automatically evicted by the network when they expire. Used for [application](#application) entries (`("app", ...)`) and the [Global Application Count](#global-application-count) (`("g_apps", ...)`).

*Related: [Persistent Storage](#persistent-storage), [Wave TTL](#wave-ttl)*

---

**TTL (Time-To-Live)**
Number of ledgers before a storage entry is eligible for archival and eviction. Expressed as a ledger count, not wall-clock time. Ledgers close approximately every 5 seconds on Stellar mainnet. In WorkloadGovernor, temporary entries (applications and global counts) have a TTL defined by `APP_TTL_LEDGERS`. Calling `extend_application_ttl` resets the TTL from the current ledger.

*Related: [Wave TTL](#wave-ttl), [Ledger](#ledger)*

---

## Soroban Primitives

**Contract Address**
The unique Stellar StrKey address (starts with `C`) assigned to a deployed Soroban contract. Used as the `--id` argument in `stellar contract invoke` commands. Determined at deploy time and stored in `.env` or `config/contracts.json`. Different from the [Stellar Address](#stellar-address) of an account (starts with `G`).

*Related: [Contract ID](#contract-id), [StrKey](#strkey)*

---

**contracterror**
Soroban SDK procedural macro that derives the `#[repr(u32)]` error enum used in WorkloadGovernor. Each variant's discriminant is a stable, on-chain encoded numeric code. Clients match against these codes to provide user-friendly error messages. Discriminant values **must not change** after mainnet deployment.

*Related: [panic_with_error!](#panic_with_error)*

---

**Ledger**
A snapshot of the global Stellar network state at a particular sequence number. A new ledger is produced approximately every 5 seconds through validator consensus. Ledger sequence numbers are used in [TTL](#ttl-time-to-live) calculations.

*Related: [Ledger Sequence Number](#ledger-sequence-number), [TTL](#ttl-time-to-live)*

---

**Ledger Sequence Number**
A monotonically increasing integer identifying a specific ledger. Used in TTL calculations: an entry with TTL `N` written at ledger sequence `S` expires at ledger sequence `S + N`. Exposed as `env.ledger().sequence()` in Soroban tests.

*Related: [Ledger](#ledger), [TTL](#ttl-time-to-live)*

---

**panic_with_error!**
Soroban macro that halts contract execution and returns a typed [`ContractError`] to the caller. The host traps WASM execution and encodes the error's `u32` discriminant in the transaction result. Used throughout WorkloadGovernor to return structured errors instead of raw panics.

*Related: [contracterror](#contracterror)*

---

**WASM (WebAssembly)**
The binary format that Soroban contracts are compiled to. WorkloadGovernor targets `wasm32v1-none`. The Stellar network imposes a 64 KB size limit per contract WASM binary. WorkloadGovernor uses `opt-level = 'z'` and `lto = true` to keep the binary under 20 KB after optimization.

*Related: [Contract Address](#contract-address), [Soroban](#soroban)*

---

## Counter & Integrity Concepts

**CounterInconsistency**
Error code 13. Fired by `revoke_assignment` (and `check_consistency`) when an assignment entry exists in storage but the org assignment counter is 0. Indicates post-migration storage corruption where a migration script zeroed counters without removing assignment entries. Operators should run `check_consistency` to detect affected pairs and file a remediation runbook.

*Related: [check_consistency](#check_consistency), [Org Assignment Count](#org-assignment-count)*

---

**Global Application Count**
The total number of pending [applications](#application) a contributor holds across all organisations. Stored as a [Temporary Storage](#temporary-storage) entry under `("g_apps", contributor)`. Maximum value is 15 ([Global Cap](#global-cap)). Decremented when an application is withdrawn or converted to an assignment. Expires with [Wave TTL](#wave-ttl).

*Related: [Global Cap](#global-cap), [Application](#application)*

---

**Org Assignment Count**
The number of active [assignments](#assignment) a contributor holds within a single [org](#org-organisation). Stored as a [Persistent Storage](#persistent-storage) entry under `("o_asgn", contributor, org_id)`. Maximum value is the [Org Cap](#org-cap) (default 4). Incremented on `assign_issue`, decremented on `complete_assignment` or `revoke_assignment`. Uses saturating subtraction to prevent underflow.

*Related: [Org Cap](#org-cap), [Assignment](#assignment), [CounterInconsistency](#counterinconsistency)*

---

## Stellar Network Concepts

**Fee Bump Transaction**
A Stellar transaction wrapper that allows a third party to pay the transaction fee on behalf of another account. Used by the WorkloadGovernor backend to sponsor contributor transactions so contributors don't need to hold XLM to submit applications.

*Related: [XDR](#xdr-external-data-representation), [Unsigned Transaction](#unsigned-transaction-xdr)*

---

**Friendbot**
A Stellar testnet faucet that funds accounts with test XLM. Used to bootstrap accounts for local development and CI deployments. Available at `https://friendbot.stellar.org?addr=<ADDRESS>`. Not available on mainnet.

*Related: [Testnet](#testnet)*

---

**Horizon API**
The Stellar REST API provided by Stellar Core nodes for querying ledger state, submitting transactions, and streaming events. WorkloadGovernor's backend uses Horizon to submit signed transactions and query account state. The backend health check exposes network reachability at `GET /api/health/network`.

*Related: [XDR](#xdr-external-data-representation), [Stellar Address](#stellar-address)*

---

**Network Passphrase**
A string constant that uniquely identifies a Stellar network (e.g. `"Test SDF Network ; September 2015"` for testnet, `"Public Global Stellar Network ; September 2015"` for mainnet). Included in transaction hashes to prevent cross-network replay attacks. Required when constructing or signing transactions.

*Related: [XDR](#xdr-external-data-representation)*

---

**Sequence Number**
A per-account counter on the Stellar network that must be incremented with each transaction to prevent replay attacks. Managed automatically by the Stellar SDK. Relevant when constructing raw transactions or debugging "sequence number too low" errors from Horizon.

*Related: [Stellar Address](#stellar-address), [Horizon API](#horizon-api)*

---

**Stellar Address**
A base32-encoded public key ([StrKey](#strkey)) identifying an account on the Stellar network. Regular accounts start with `G`; contract addresses start with `C`. Required for all contract `Address` arguments in `stellar contract invoke` commands.

*Related: [StrKey](#strkey), [Contract Address](#contract-address)*

---

**StrKey**
Stellar's base32 encoding format for binary data. Prefixes identify the type: `G` for account public keys, `C` for contract addresses, `S` for private keys (seeds), `T` for muxed accounts. All WorkloadGovernor addresses in documentation and API requests use StrKey format.

*Related: [Stellar Address](#stellar-address), [Contract Address](#contract-address)*

---

**Testnet**
Stellar's public test network, running the same software as mainnet but with free test tokens available via [Friendbot](#friendbot). WorkloadGovernor CI runs smoke tests against testnet. Contract IDs and wallet addresses on testnet are not valid on mainnet.

*Related: [Friendbot](#friendbot), [Network Passphrase](#network-passphrase)*

---

**XDR (External Data Representation)**
The binary serialization format used for all Stellar transactions and data structures. Transactions are signed and submitted as base64-encoded XDR strings. The `/api/transactions/apply` and similar endpoints return unsigned XDR envelopes that the [Freighter](#freighter) wallet signs before submission.

*Related: [Unsigned Transaction](#unsigned-transaction-xdr), [Freighter](#freighter)*

---

## API / Backend Terms

**API Key**
An authentication token required for write operations on the WorkloadGovernor REST API. Passed in the `X-API-Key` HTTP header. Created and managed via the `/api/api-keys` endpoint (admin-only). Used by CI pipelines and operator scripts to call the backend without user interaction.

---

**Freighter**
A browser extension wallet for the Stellar network. WorkloadGovernor uses Freighter to request contributor and maintainer signatures on [unsigned transactions](#unsigned-transaction-xdr). Accessed via the `globalThis.__freighter_api__` interface in the frontend. In E2E tests the Freighter extension is replaced by an `addInitScript` shim.

*Related: [XDR](#xdr-external-data-representation), [Unsigned Transaction](#unsigned-transaction-xdr)*

---

**MSW (Mock Service Worker)**
A library used in E2E and unit tests to intercept HTTP requests in the browser and return mocked responses without a live server. In WorkloadGovernor E2E tests, MSW handlers are defined in `tests/e2e/msw-handlers.ts` and injected via `page.addInitScript` or `page.route()`.

*Related: [Freighter](#freighter)*

---

**Soroban**
The smart-contract execution environment on the Stellar network. WorkloadGovernor is a Soroban contract compiled to [WASM](#wasm-webassembly) targeting `wasm32v1-none`. Provides the `Env`, `Address`, `Symbol`, and storage APIs used throughout the codebase.

*Related: [WASM](#wasm-webassembly), [Contract Address](#contract-address)*

---

**Unsigned Transaction (XDR)**
The response payload from `/api/transactions/apply`, `/api/transactions/withdraw`, `/api/transactions/assign`, and related endpoints. Contains the base64-encoded [XDR](#xdr-external-data-representation) envelope of a transaction that has not yet been signed. The frontend passes this to [Freighter](#freighter) for contributor or maintainer signing, then submits the signed XDR back to Horizon.

*Related: [XDR](#xdr-external-data-representation), [Freighter](#freighter), [Fee Bump Transaction](#fee-bump-transaction)*

---

## Infrastructure

**Contract ID**
The unique Stellar address (starts with `C`) that identifies a deployed instance of WorkloadGovernor on the network. Required for all `stellar contract invoke` calls. Determined at deploy time and stored in `.env` or passed as a CLI argument. Example: `stellar contract deploy --wasm ... --network testnet --source <account>`.

*Related: [Contract Address](#contract-address), [Testnet](#testnet)*

---

**Horizon**
The Stellar REST API server used to query network state (ledger data, transactions, account info). Not directly called by this contract but used by off-chain integrations (e.g. the Organisation Selector) to read contract storage via `stellar contract read`. WorkloadGovernor's backend exposes `GET /api/health/network` to report Horizon reachability.

*Related: [Horizon API](#horizon-api), [XDR](#xdr-external-data-representation)*

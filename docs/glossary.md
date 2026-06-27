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

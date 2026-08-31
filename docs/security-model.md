# WorkloadGovernor — Security Model

This document describes the threat model, attack surfaces, mitigations, and residual risks for the WorkloadGovernor Soroban smart contract deployed on the Stellar network for the AlignmentDrips Wave platform.

It is intended for security reviewers, auditors, and contributors evaluating proposed changes.

---

## Scope

| In Scope | Out of Scope |
|---|---|
| Smart contract logic (`src/lib.rs`, `src/events.rs`, `src/storage.rs`) | Stellar consensus protocol |
| Admin / maintainer / contributor key authorization | Wallet software key management |
| Contract storage access patterns | Horizon node internal security |
| Event emission and consumer integrity | GitHub OAuth / SSO of the platform layer |
| On-chain cap enforcement | Off-chain notification delivery |

---

## Threat Actors

### 1. Malicious Contributor

A contributor who holds a valid Stellar keypair but acts in bad faith.

**Goals:**
- Monopolize issue assignments to block other contributors.
- Bypass global application caps (error code `6`) or org assignment caps (error code `7`).
- Flood the contract with low-cost transactions to exhaust others' capacity.

**Capabilities:**
- Can sign transactions with their own keypair.
- Can call any permissionless read function.
- Cannot call maintainer or admin functions without the corresponding keypairs.

---

### 2. Rogue Maintainer

A registered maintainer who acts against platform rules after being legitimately authorized.

**Goals:**
- Assign issues to colluding contributors, bypassing merit-based selection.
- Revoke assignments arbitrarily to punish contributors.
- Complete assignments without actual work being done.

**Capabilities:**
- Can call `assign_issue`, `complete_assignment`, `revoke_assignment` for their registered org.
- Cannot act on orgs they are not registered for (error code `4`).
- Cannot re-assign already-assigned issues (error code `11`).

---

### 3. Compromised Admin Key

An attacker who has obtained the private key of the contract administrator.

**Goals:**
- Register malicious maintainers.
- Upgrade the contract WASM to backdoored logic.
- Take over the entire platform.

**Capabilities:**
- Full control over `initialize`, `register_maintainer`, and `upgrade`.
- Can replace contract logic via `upgrade(new_wasm_hash)`.

**Impact:** Critical — full contract compromise.

---

### 4. Passive Network Observer / Data Harvester

An entity monitoring Soroban event streams or Horizon RPC endpoints.

**Goals:**
- Correlate contributor addresses with work patterns for deanonymization.
- Build unauthorized indexes of contributor productivity data.

**Capabilities:**
- All events are public on-chain by design.
- Can subscribe to events via any Horizon or RPC node.

---

### 5. Horizon RPC Node Operator (Malicious or Compromised)

An operator of the RPC endpoint that the front-end or integrators connect to.

**Goals:**
- Return stale or fabricated query results to mislead the UI.
- Censor transactions to prevent applications or assignments.
- Feed false event data to downstream consumers.

**Capabilities:**
- Controls the response to `getEvents`, `simulateTransaction`, and `sendTransaction`.

---

## Attack Surfaces

| Surface | Entry Point | Actor |
|---|---|---|
| `apply_for_issue` | Contributor transaction | Malicious contributor |
| `withdraw_application` | Contributor transaction | Malicious contributor |
| `assign_issue` | Maintainer transaction | Rogue maintainer |
| `complete_assignment` | Maintainer transaction | Rogue maintainer |
| `revoke_assignment` | Maintainer transaction | Rogue maintainer |
| `register_maintainer` | Admin transaction | Compromised admin |
| `upgrade` | Admin transaction | Compromised admin |
| Horizon RPC endpoint | Network | Compromised node operator |
| Soroban event stream | Network / SDK | Passive observer |

---

## Data Flow Diagram

The diagram below shows where authorization checks occur for each class of caller. `→ ✓` denotes a check that **must pass** before state changes.

```
                         ┌──────────────────────────────────────┐
                         │         Stellar Network               │
                         │                                       │
  ┌──────────────┐        │  ┌────────────────────────────────┐  │
  │  Contributor │─tx────▶│  │  WorkloadGovernor Contract     │  │
  └──────────────┘        │  │                                │  │
                          │  │  apply_for_issue               │  │
                          │  │    → ✓ require_initialized     │  │
                          │  │    → ✓ contributor.require_auth│  │
                          │  │    → ✓ global cap < 15  (EC 6) │  │
                          │  │    → ✓ no duplicate     (EC 8) │  │
                          │  │    → emit app_sub              │  │
                          │  │                                │  │
                          │  │  withdraw_application          │  │
                          │  │    → ✓ require_initialized     │  │
                          │  │    → ✓ contributor.require_auth│  │
                          │  │    → ✓ app exists       (EC 9) │  │
                          │  │    → emit app_wdw              │  │
                          │  │                                │  │
  ┌──────────────┐        │  │  assign_issue                  │  │
  │  Maintainer  │─tx────▶│  │    → ✓ require_initialized     │  │
  └──────────────┘        │  │    → ✓ maintainer.require_auth │  │
                          │  │    → ✓ is_maintainer    (EC 4) │  │
                          │  │    → ✓ app exists       (EC 9) │  │
                          │  │    → ✓ org cap < 4      (EC 7) │  │
                          │  │    → ✓ not assigned    (EC 11) │  │
                          │  │    → emit assigned             │  │
                          │  │                                │  │
                          │  │  complete_assignment           │  │
                          │  │  revoke_assignment             │  │
                          │  │    → ✓ require_initialized     │  │
                          │  │    → ✓ maintainer.require_auth │  │
                          │  │    → ✓ is_maintainer    (EC 4) │  │
                          │  │    → ✓ assignment exists(EC10) │  │
                          │  │    → emit completed/revoked    │  │
                          │  │                                │  │
  ┌──────────────┐        │  │  register_maintainer           │  │
  │    Admin     │─tx────▶│  │    → ✓ require_initialized     │  │
  └──────────────┘        │  │    → ✓ stored_admin.require_auth│ │
                          │  │    → emit maint_reg            │  │
                          │  │                                │  │
                          │  │  upgrade                       │  │
                          │  │    → ✓ require_initialized     │  │
                          │  │    → ✓ stored_admin.require_auth│ │
                          │  │    (no event emitted)          │  │
                          │  └────────────────────────────────┘  │
                          │              │ events                 │
                          │              ▼                        │
                          │       Soroban Event Log              │
                          │              │                        │
                          └──────────────┼────────────────────────┘
                                         │
                          ┌──────────────▼────────────────────────┐
                          │         Horizon / RPC Node             │
                          │   (getEvents, sendTransaction, etc.)   │
                          └──────────────┬────────────────────────┘
                                         │
                          ┌──────────────▼────────────────────────┐
                          │      Integrator / Frontend SDK         │
                          │  Event consumers, UI, notification svc │
                          └───────────────────────────────────────┘
```

---

## Mitigations

### Rate Limiting

| Threat | Mitigation |
|---|---|
| Contributor spam (many applications) | Global cap of 15 applications enforced on-chain (error code `6`). Exceeded attempts are rejected at the contract level before any storage write. |
| Org-level assignment monopoly | Per-org cap of 4 assignments enforced on-chain (error code `7`). |

These caps are **enforced deterministically in WASM**, so no off-chain WAF or middleware can be bypassed to circumvent them.

### Signature Verification

All state-changing functions require cryptographic authorization from the relevant keypair:

| Function | `require_auth()` on |
|---|---|
| `initialize` | `admin` argument |
| `register_maintainer` | stored admin |
| `upgrade` | stored admin |
| `apply_for_issue` | `contributor` argument |
| `withdraw_application` | `contributor` argument |
| `assign_issue` | `maintainer` argument |
| `complete_assignment` | `maintainer` argument |
| `revoke_assignment` | `maintainer` argument |

Soroban's `require_auth()` links the authorization to the **invoking transaction's signature set**. Replaying a valid signature from a different transaction is not possible — each transaction is scoped to a single ledger sequence number.

### Cap Enforcement

Caps are implemented as atomic storage reads and writes within the same contract invocation. There is no TOCTOU (time-of-check/time-of-use) window because Soroban transactions are processed serially within a ledger.

| Cap | Storage Key | Limit |
|---|---|---|
| Global applications | `("g_apps", contributor)` — Temporary storage | 15 (error code `6`) |
| Org assignments | `("o_asgn", contributor, org_id)` — Persistent storage | 4 (error code `7`) |

### WAF / Off-Chain Layer

The contract itself is not exposed via HTTP. Integrators should deploy a WAF in front of any HTTP API that proxies Soroban RPC calls to:

- Block abnormal transaction submission rates per IP/account.
- Reject malformed XDR before forwarding to the node.
- Log all transactions for audit trail.

### Maintainer Registration Audit Trail

Every call to `register_maintainer` emits a `maint_reg` event (see [Event Schema](./event-schema.md#2-maint_reg--maintainer-registered)). Platform operators should monitor this event stream to detect unauthorized maintainer registrations as early indicators of a compromised admin key.

### Upgrade Governance

The `upgrade` function does **not** emit an event. Operators should:

1. Monitor the Stellar network for contract WASM updates via Horizon ledger stream.
2. Use a multisig admin key (e.g., via Stellar's multi-sig capabilities) to require M-of-N approval before upgrades.
3. Implement a timelock or governance vote off-chain before submitting an upgrade transaction.

---

## Error Code to Threat Mapping

| Error Code | Variant | Relevant Threat |
|---|---|---|
| 1 | `AlreadyInitialized` | Prevents re-initialization by any actor |
| 2 | `NotInitialized` | Guards all state-changing calls until setup is complete |
| 3 | `UnauthorizedAdmin` | Blocks non-admin attempts on admin functions |
| 4 | `UnauthorizedMaintainer` | Blocks cross-org maintainer escalation (rogue maintainer) |
| 5 | `UnauthorizedContributor` | Blocks spoofed contributor transactions |
| 6 | `GlobalApplicationLimitReached` | Rate-limits malicious contributor spam |
| 7 | `OrgAssignmentLimitReached` | Prevents org-level monopoly by maintainer collusion |
| 8 | `DuplicateApplication` | Prevents double-spending of application slots |
| 9 | `ApplicationNotFound` | Guards assign/withdraw against non-existent applications |
| 10 | `AssignmentNotFound` | Guards complete/revoke against non-existent assignments |
| 11 | `AlreadyAssigned` | Prevents double-assignment of the same issue |

Full error code definitions are in `src/errors.rs`. See also [docs/api-reference.md](./api-reference.md#error-codes).

---

## Residual Risks

These risks are **not mitigated by the contract** and must be managed at the platform or operational level.

### 1. Stellar Network Downtime

If the Stellar network halts (e.g., quorum failure), no transactions can be submitted or finalized. Applications will not expire faster than their TTL allows, but no new state changes are possible. The platform should surface network status to users during outages.

**Likelihood**: Low (Stellar has strong uptime guarantees).  
**Impact**: Service unavailability; no data loss.

### 2. Horizon RPC Compromise

A compromised or malicious Horizon/RPC node can:
- Return false query results (stale caps, fabricated events).
- Censor transactions silently.
- Delay event delivery to downstream consumers.

**Mitigation**: Integrators should query multiple independent RPC nodes and cross-check results. Critical operations should verify state on-chain before acting.

**Likelihood**: Low for established public nodes; medium for self-hosted nodes.  
**Impact**: UI inconsistency; potential transaction loss (mitigated by retry logic).

### 3. Admin Key Loss or Compromise

If the admin key is lost, no new maintainers can be registered and the contract cannot be upgraded. If it is compromised, the attacker has full control over maintainer registration and WASM upgrades.

**Mitigation**: Use Stellar multi-sig for the admin account. Store key material in HSMs. Rotate keys following any suspected compromise by deploying a new contract instance.

**Likelihood**: Low with proper key hygiene.  
**Impact**: Critical if compromised; permanent lock-out if lost.

### 4. TTL Expiry and Application Silently Disappearing

Pending applications are stored in Temporary storage with a Wave TTL. If `extend_application_ttl` is not called before expiry, the application entry is pruned by the network. The contributor's global count is not automatically decremented on expiry (the count uses a separate Temporary key that also expires).

This is a known design trade-off. Integrators should call `extend_application_ttl` proactively and handle `ApplicationNotFound (9)` gracefully in UI.

**Likelihood**: Medium if integrators do not implement TTL extension.  
**Impact**: Low — data-only; no funds at risk.

### 5. XDR Decoder Drift

If a consumer decodes events using a stale XDR schema after a contract upgrade that changes event structure, it will silently misinterpret data fields. See [Event Schema](./event-schema.md) and [JSON Schema](./schemas/contract-events.json) for the canonical field order.

**Mitigation**: Pin SDK versions; validate decoded events against the JSON Schema in CI.

---

## Related Documents

- [Event Schema](./event-schema.md) — emitted events and field descriptions
- [API Reference](./api-reference.md) — function signatures and error codes
- [Integration Guide](../INTEGRATION_GUIDE.md) — SDK integration patterns
- [README — Security section](../README.md#security) — overview and error codes

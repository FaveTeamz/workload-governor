# WorkloadGovernor — Contract Event Schema

This document is the canonical reference for all events emitted by the WorkloadGovernor Soroban smart contract. Integrators building event-driven services (notification pipelines, indexers, dashboards) should use this reference instead of reverse-engineering `src/events.rs`.

## How Events Are Structured

Every event is published via `env.events().publish(topics, data)`. On Stellar / Soroban:

- **Topics** — a tuple of `ScVal` items that Horizon indexes for fast filtering. The first topic is always the event name (`Symbol`); the second is the primary actor (`Address`).
- **Data** — a tuple of additional `ScVal` items carrying the event payload.

Topics and data are encoded as XDR `ScVal` on-chain. Off-chain SDKs decode them automatically.

---

## Event Types

### 1. `init` — Contract Initialized

| Property | Value |
|---|---|
| Emitted by | `initialize(admin)` |
| Topic 0 | `symbol_short!("init")` |
| Topic 1 | `admin` (Address) |

#### Data Fields

| # | Field | Type | Description |
|---|---|---|---|
| 0 | `admin` | `Address` | The address stored as the contract administrator |

#### Example (decoded)

```json
{
  "topics": ["init", "GADMIN...XYZ"],
  "data": ["GADMIN...XYZ"]
}
```

#### Example XDR (topics)

```
ScVal::Symbol("init"), ScVal::Address(admin_address)
```

---

### 2. `maint_reg` — Maintainer Registered

| Property | Value |
|---|---|
| Emitted by | `register_maintainer(admin, maintainer, org_id)` |
| Topic 0 | `symbol_short!("maint_reg")` |
| Topic 1 | `admin` (Address) |

#### Data Fields

| # | Field | Type | Description |
|---|---|---|---|
| 0 | `maintainer` | `Address` | The address being granted maintainer privileges |
| 1 | `org_id` | `Symbol` | The organization for which the maintainer is registered |

#### Example (decoded)

```json
{
  "topics": ["maint_reg", "GADMIN...XYZ"],
  "data": ["GMAINT...ABC", "stellar-oss"]
}
```

---

### 3. `app_sub` — Application Submitted

| Property | Value |
|---|---|
| Emitted by | `apply_for_issue(contributor, org_id, issue_id)` |
| Topic 0 | `symbol_short!("app_sub")` |
| Topic 1 | `contributor` (Address) |

#### Data Fields

| # | Field | Type | Description |
|---|---|---|---|
| 0 | `contributor` | `Address` | The contributor who submitted the application |
| 1 | `org_id` | `Symbol` | The organization the issue belongs to |
| 2 | `issue_id` | `u32` | The numeric identifier of the issue |

#### Example (decoded)

```json
{
  "topics": ["app_sub", "GCONTR...DEF"],
  "data": ["GCONTR...DEF", "stellar-oss", 42]
}
```

---

### 4. `app_wdw` — Application Withdrawn

| Property | Value |
|---|---|
| Emitted by | `withdraw_application(contributor, org_id, issue_id)` |
| Topic 0 | `symbol_short!("app_wdw")` |
| Topic 1 | `contributor` (Address) |

#### Data Fields

| # | Field | Type | Description |
|---|---|---|---|
| 0 | `contributor` | `Address` | The contributor who withdrew the application |
| 1 | `org_id` | `Symbol` | The organization the issue belongs to |
| 2 | `issue_id` | `u32` | The numeric identifier of the issue |

#### Example (decoded)

```json
{
  "topics": ["app_wdw", "GCONTR...DEF"],
  "data": ["GCONTR...DEF", "stellar-oss", 42]
}
```

---

### 5. `assigned` — Issue Assigned

| Property | Value |
|---|---|
| Emitted by | `assign_issue(maintainer, contributor, org_id, issue_id)` |
| Topic 0 | `symbol_short!("assigned")` |
| Topic 1 | `maintainer` (Address) |

#### Data Fields

| # | Field | Type | Description |
|---|---|---|---|
| 0 | `maintainer` | `Address` | The maintainer who created the assignment |
| 1 | `contributor` | `Address` | The contributor being assigned to the issue |
| 2 | `org_id` | `Symbol` | The organization the issue belongs to |
| 3 | `issue_id` | `u32` | The numeric identifier of the issue |

#### Example (decoded)

```json
{
  "topics": ["assigned", "GMAINT...ABC"],
  "data": ["GMAINT...ABC", "GCONTR...DEF", "stellar-oss", 42]
}
```

---

### 6. `completed` — Assignment Completed

| Property | Value |
|---|---|
| Emitted by | `complete_assignment(maintainer, contributor, org_id, issue_id)` |
| Topic 0 | `symbol_short!("completed")` |
| Topic 1 | `maintainer` (Address) |

#### Data Fields

| # | Field | Type | Description |
|---|---|---|---|
| 0 | `maintainer` | `Address` | The maintainer who marked the assignment complete |
| 1 | `contributor` | `Address` | The contributor who completed the work |
| 2 | `org_id` | `Symbol` | The organization the issue belongs to |
| 3 | `issue_id` | `u32` | The numeric identifier of the issue |

#### Example (decoded)

```json
{
  "topics": ["completed", "GMAINT...ABC"],
  "data": ["GMAINT...ABC", "GCONTR...DEF", "stellar-oss", 42]
}
```

---

### 7. `revoked` — Assignment Revoked

| Property | Value |
|---|---|
| Emitted by | `revoke_assignment(maintainer, contributor, org_id, issue_id)` |
| Topic 0 | `symbol_short!("revoked")` |
| Topic 1 | `maintainer` (Address) |

#### Data Fields

| # | Field | Type | Description |
|---|---|---|---|
| 0 | `maintainer` | `Address` | The maintainer who revoked the assignment |
| 1 | `contributor` | `Address` | The contributor whose assignment was revoked |
| 2 | `org_id` | `Symbol` | The organization the issue belongs to |
| 3 | `issue_id` | `u32` | The numeric identifier of the issue |

#### Example (decoded)

```json
{
  "topics": ["revoked", "GMAINT...ABC"],
  "data": ["GMAINT...ABC", "GCONTR...DEF", "stellar-oss", 42]
}
```

---

## Quick Reference Table

| Event Name | Emitted By | Topics[1] | Data Fields |
|---|---|---|---|
| `init` | `initialize` | admin | (admin) |
| `maint_reg` | `register_maintainer` | admin | (maintainer, org_id) |
| `app_sub` | `apply_for_issue` | contributor | (contributor, org_id, issue_id) |
| `app_wdw` | `withdraw_application` | contributor | (contributor, org_id, issue_id) |
| `assigned` | `assign_issue` | maintainer | (maintainer, contributor, org_id, issue_id) |
| `completed` | `complete_assignment` | maintainer | (maintainer, contributor, org_id, issue_id) |
| `revoked` | `revoke_assignment` | maintainer | (maintainer, contributor, org_id, issue_id) |

---

## Subscribing to Events via the Horizon SDK

The example below uses `@stellar/stellar-sdk` (v12+) to stream contract events from a Horizon server, filter by event type, and process the decoded payload.

```typescript
import {
  Horizon,
  SorobanRpc,
  xdr,
  Address,
  scValToNative,
} from "@stellar/stellar-sdk";

const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

// ── RPC-based event subscription (recommended for real-time) ─────────────────

const rpc = new SorobanRpc.Server("https://soroban-testnet.stellar.org");

/**
 * Poll for contract events starting at a given cursor (ledger sequence).
 * Call this in a loop / setInterval for continuous streaming.
 */
async function pollContractEvents(startLedger: number) {
  const result = await rpc.getEvents({
    startLedger,
    filters: [
      {
        type: "contract",
        contractIds: [CONTRACT_ID],
        // Optional: filter by specific topic — e.g. only "assigned" events:
        // topics: [["AAAADwAAAAhhc3NpZ25lZA=="]],  // base64 XDR for Symbol("assigned")
      },
    ],
  });

  for (const event of result.events) {
    const eventName = scValToNative(event.topic[0]) as string;
    const actor = Address.fromScVal(event.topic[1]).toString();
    const data = event.value.map(scValToNative);

    console.log(`[${event.ledger}] ${eventName}`, { actor, data });
    dispatch(eventName, actor, data);
  }

  // Return the cursor for the next poll
  return result.latestLedger;
}

// ── Event dispatcher ──────────────────────────────────────────────────────────

type AppSubData   = [contributor: string, orgId: string, issueId: number];
type AssignedData = [maintainer: string, contributor: string, orgId: string, issueId: number];

function dispatch(eventName: string, actor: string, data: unknown[]) {
  switch (eventName) {
    case "init":
      onInitialized({ admin: data[0] as string });
      break;

    case "maint_reg":
      onMaintainerRegistered({
        admin: actor,
        maintainer: data[0] as string,
        orgId: data[1] as string,
      });
      break;

    case "app_sub": {
      const [contributor, orgId, issueId] = data as AppSubData;
      onApplicationSubmitted({ contributor, orgId, issueId });
      break;
    }

    case "app_wdw": {
      const [contributor, orgId, issueId] = data as AppSubData;
      onApplicationWithdrawn({ contributor, orgId, issueId });
      break;
    }

    case "assigned": {
      const [maintainer, contributor, orgId, issueId] = data as AssignedData;
      onIssueAssigned({ maintainer, contributor, orgId, issueId });
      break;
    }

    case "completed": {
      const [maintainer, contributor, orgId, issueId] = data as AssignedData;
      onAssignmentCompleted({ maintainer, contributor, orgId, issueId });
      break;
    }

    case "revoked": {
      const [maintainer, contributor, orgId, issueId] = data as AssignedData;
      onAssignmentRevoked({ maintainer, contributor, orgId, issueId });
      break;
    }

    default:
      console.warn("Unknown event", eventName);
  }
}

// ── Application-level handlers (implement as needed) ──────────────────────────

function onInitialized(p: { admin: string }) {
  console.log("Contract initialized by", p.admin);
}

function onMaintainerRegistered(p: { admin: string; maintainer: string; orgId: string }) {
  console.log(`${p.maintainer} registered as maintainer for ${p.orgId}`);
}

function onApplicationSubmitted(p: { contributor: string; orgId: string; issueId: number }) {
  console.log(`Application: ${p.contributor} → ${p.orgId}#${p.issueId}`);
  // e.g. notify the maintainer team, update UI state
}

function onApplicationWithdrawn(p: { contributor: string; orgId: string; issueId: number }) {
  console.log(`Withdrawn: ${p.contributor} ← ${p.orgId}#${p.issueId}`);
}

function onIssueAssigned(p: AssignedData extends infer T ? any : any) {
  // narrow to correct shape inline
  const payload = p as { maintainer: string; contributor: string; orgId: string; issueId: number };
  console.log(`Assigned #${payload.issueId} in ${payload.orgId} to ${payload.contributor}`);
}

function onAssignmentCompleted(p: { maintainer: string; contributor: string; orgId: string; issueId: number }) {
  console.log(`Completed: ${p.contributor} finished ${p.orgId}#${p.issueId}`);
}

function onAssignmentRevoked(p: { maintainer: string; contributor: string; orgId: string; issueId: number }) {
  console.log(`Revoked: ${p.contributor} removed from ${p.orgId}#${p.issueId}`);
}

// ── Bootstrap: start polling from the current ledger ─────────────────────────

async function startEventStream() {
  const info = await rpc.getLatestLedger();
  let cursor = info.sequence;

  setInterval(async () => {
    cursor = await pollContractEvents(cursor);
  }, 6_000); // ~Stellar ledger close time
}

startEventStream().catch(console.error);
```

---

## JSON Schema

A machine-readable JSON Schema is available at [`docs/schemas/contract-events.json`](./schemas/contract-events.json). Use it to validate decoded event payloads in CI pipelines or integration tests.

---

## Related Documents

- [API Reference](./api-reference.md) — full function signatures and return types
- [Integration Guide](../INTEGRATION_GUIDE.md) — end-to-end SDK usage examples
- [README](../README.md) — contract overview and error codes
- [JSON Schema](./schemas/contract-events.json) — machine-readable event schema

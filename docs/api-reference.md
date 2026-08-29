# API Reference

WorkloadGovernor exposes two interfaces:

1. **Soroban contract functions** — called directly on-chain via the Stellar CLI or an SDK.
2. **REST API** — a backend service that builds and simulates Soroban transactions, and exposes read queries over HTTP.

> **OpenAPI / Swagger UI:** When the service is running, interactive REST docs are available at `/docs`.

---

## Contract ID placeholder

All CLI examples below use `<CONTRACT_ID>` as a placeholder for the deployed contract address (e.g. `CCHKV2NFHBZE3WX5DMPCDJXE6YSWCUHLHAVD3BPQ`). Replace it with your actual contract ID for testnet or mainnet.

---

## Authentication — Contract Functions

| Function type | Auth requirement |
|---|---|
| Admin (`initialize`, `register_maintainer`, `upgrade`) | Transaction must be signed by the stored admin address |
| Contributor (`apply_for_issue`, `withdraw_application`) | Transaction must be signed by the `contributor` argument address |
| Maintainer (`assign_issue`, `complete_assignment`, `revoke_assignment`) | Transaction must be signed by a registered maintainer for the target `org_id` |
| Read-only (all `get_*`, `has_*`, `is_*`) | No authentication required |
| TTL management (`extend_application_ttl`) | No authentication required |

---

## Contract Functions

### `initialize`

**Type:** State-changing · Admin-only (first call is open, but enforces admin auth)

**Description**

One-time contract setup. Stores the admin address in persistent storage and emits an `initialized` event. Must be called before any other state-changing function. Calling a second time raises `AlreadyInitialized`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `admin` | `Address` | The address that will hold admin privileges for the lifetime of this contract. Must sign the transaction. |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 1 | [`AlreadyInitialized`](error-reference.md#error-1--alreadyinitialized) | `initialize` has already been called on this contract |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source admin-account \
  -- initialize \
  --admin GDXYZ4RSAQE6SLNHXPK4KFHDPKQJKZWQIAMHUVBDKN7MNP3U2XVTEST
```

---

### `register_maintainer`

**Type:** State-changing · Admin-only

**Description**

Authorises a maintainer address to manage issues within a specific organisation. The operation is idempotent — calling it twice for the same `(maintainer, org_id)` pair is safe. Registration is per-pair: a maintainer registered for `rust_foundation` cannot act on `stellar_core` issues without a separate call.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `admin` | `Address` | The stored admin address. Must sign the transaction. |
| `maintainer` | `Address` | The address to grant maintainer rights to. |
| `org_id` | `Symbol` | Organisation identifier to authorise the maintainer for (case-sensitive, max 32 chars). |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 2 | [`NotInitialized`](error-reference.md#error-2--notinitialized) | Contract has not been initialised |
| 3 | [`UnauthorizedAdmin`](error-reference.md#error-3--unauthorizedadmin) | Transaction not signed by the stored admin address |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source admin-account \
  -- register_maintainer \
  --admin GDXYZ4RSAQE6SLNHXPK4KFHDPKQJKZWQIAMHUVBDKN7MNP3U2XVTEST \
  --maintainer GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST \
  --org_id rust_foundation
```

---

### `upgrade`

**Type:** State-changing · Admin-only

**Description**

Replaces the contract WASM in-place with a new version identified by its hash. The contract address does not change. The new WASM must already be uploaded to the network (`stellar contract upload`) before calling this function.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `new_wasm_hash` | `BytesN<32>` | 32-byte hash of the replacement WASM, as returned by `stellar contract upload`. |

**Return value**

`()` — no return value on success. After the transaction lands, the contract immediately executes the new WASM.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 2 | [`NotInitialized`](error-reference.md#error-2--notinitialized) | Contract has not been initialised |
| 3 | [`UnauthorizedAdmin`](error-reference.md#error-3--unauthorizedadmin) | Transaction not signed by the stored admin address |

**Stellar CLI example**

```bash
# Step 1: upload the new WASM and capture the hash
NEW_HASH=$(stellar contract upload \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --network testnet \
  --source admin-account)

# Step 2: invoke upgrade with the hash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source admin-account \
  -- upgrade \
  --new_wasm_hash "$NEW_HASH"
```

---

### `apply_for_issue`

**Type:** State-changing · Contributor

**Description**

Submits a pending application for a contributor to work on a specific issue. Creates two temporary-storage entries (global app counter and per-issue sentinel), both with the Wave TTL. The global cap of 15 pending applications is enforced atomically.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `contributor` | `Address` | Address submitting the application. Must sign the transaction. |
| `org_id` | `Symbol` | Organisation the issue belongs to (case-sensitive, max 32 chars). |
| `issue_id` | `u32` | Numeric issue identifier. Must be greater than 0. |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 2 | [`NotInitialized`](error-reference.md#error-2--notinitialized) | Contract has not been initialised |
| 5 | [`UnauthorizedContributor`](error-reference.md#error-5--unauthorizedcontributor) | Transaction not signed by the `contributor` address |
| 6 | [`GlobalApplicationLimitReached`](error-reference.md#error-6--globalapplicationlimitreached) | Contributor already has 15 pending applications |
| 8 | [`DuplicateApplication`](error-reference.md#error-8--duplicateapplication) | Application for this triple already exists |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source alice-account \
  -- apply_for_issue \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

### `withdraw_application`

**Type:** State-changing · Contributor

**Description**

Cancels a contributor's pending application for a specific issue. Removes the application sentinel from temporary storage and decrements the global application counter. If the counter reaches zero the counter entry is also removed to free storage.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `contributor` | `Address` | Address whose application is being withdrawn. Must sign the transaction. |
| `org_id` | `Symbol` | Organisation the issue belongs to. |
| `issue_id` | `u32` | Numeric issue identifier. |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 2 | [`NotInitialized`](error-reference.md#error-2--notinitialized) | Contract has not been initialised |
| 5 | [`UnauthorizedContributor`](error-reference.md#error-5--unauthorizedcontributor) | Transaction not signed by the `contributor` address |
| 9 | [`ApplicationNotFound`](error-reference.md#error-9--applicationnotfound) | No pending application exists for the triple |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source alice-account \
  -- withdraw_application \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

### `assign_issue`

**Type:** State-changing · Maintainer

**Description**

Converts a pending application into an active assignment. Atomically:
1. Removes the application entry and decrements the global app counter.
2. Increments the contributor's org-level assignment counter.
3. Creates the persistent assignment sentinel.

The contributor must have a pending application for the issue before this function can be called.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `maintainer` | `Address` | Registered maintainer address. Must sign the transaction. |
| `contributor` | `Address` | Contributor being assigned. Must have a pending application. |
| `org_id` | `Symbol` | Organisation the issue belongs to. The maintainer must be registered for this org. |
| `issue_id` | `u32` | Numeric issue identifier. |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 2 | [`NotInitialized`](error-reference.md#error-2--notinitialized) | Contract has not been initialised |
| 4 | [`UnauthorizedMaintainer`](error-reference.md#error-4--unauthorizedmaintainer) | Caller is not registered as maintainer for `org_id` |
| 9 | [`ApplicationNotFound`](error-reference.md#error-9--applicationnotfound) | Contributor has no pending application for this issue |
| 7 | [`OrgAssignmentLimitReached`](error-reference.md#error-7--orgassignmentlimitreached) | Contributor already has 4 active assignments in `org_id` |
| 11 | [`AlreadyAssigned`](error-reference.md#error-11--alreadyassigned) | An active assignment already exists for this triple |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source maintainer-account \
  -- assign_issue \
  --maintainer GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

### `complete_assignment`

**Type:** State-changing · Maintainer

**Description**

Marks an active assignment as completed and frees the assignment slot. Removes the assignment sentinel from persistent storage and decrements the contributor's org-level assignment counter. If the counter reaches zero the counter entry is also removed.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `maintainer` | `Address` | Registered maintainer address. Must sign the transaction. |
| `contributor` | `Address` | Contributor whose assignment is being completed. |
| `org_id` | `Symbol` | Organisation the issue belongs to. The maintainer must be registered for this org. |
| `issue_id` | `u32` | Numeric issue identifier. |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 2 | [`NotInitialized`](error-reference.md#error-2--notinitialized) | Contract has not been initialised |
| 4 | [`UnauthorizedMaintainer`](error-reference.md#error-4--unauthorizedmaintainer) | Caller is not registered as maintainer for `org_id` |
| 10 | [`AssignmentNotFound`](error-reference.md#error-10--assignmentnotfound) | No active assignment exists for the triple |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source maintainer-account \
  -- complete_assignment \
  --maintainer GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

### `revoke_assignment`

**Type:** State-changing · Maintainer

**Description**

Cancels an active assignment and frees the assignment slot. Semantically identical to `complete_assignment` except the emitted event is `assignment_revoked` rather than `assignment_completed`. Use this when a contributor's work is being cancelled rather than accepted.

Also raises `CounterInconsistency` (code 13) if the assignment entry exists but the org counter is 0, which indicates storage corruption from a prior migration.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `maintainer` | `Address` | Registered maintainer address. Must sign the transaction. |
| `contributor` | `Address` | Contributor whose assignment is being revoked. |
| `org_id` | `Symbol` | Organisation the issue belongs to. The maintainer must be registered for this org. |
| `issue_id` | `u32` | Numeric issue identifier. |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 2 | [`NotInitialized`](error-reference.md#error-2--notinitialized) | Contract has not been initialised |
| 4 | [`UnauthorizedMaintainer`](error-reference.md#error-4--unauthorizedmaintainer) | Caller is not registered as maintainer for `org_id` |
| 10 | [`AssignmentNotFound`](error-reference.md#error-10--assignmentnotfound) | No active assignment exists for the triple |
| 13 | [`CounterInconsistency`](error-reference.md#error-13--counterinconsistency) | Assignment entry present but org counter is 0 — storage corruption |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source maintainer-account \
  -- revoke_assignment \
  --maintainer GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

### `extend_application_ttl`

**Type:** State-changing (TTL only) · No authentication required

**Description**

Resets the TTL of a contributor's pending application entries to the full Wave duration. Anyone can call this — no authentication required. Useful for preventing an application from expiring before a maintainer can act on it. Extends both the per-issue application sentinel and the global application counter (the counter extension is skipped silently if the counter key is absent).

**Parameters**

| Name | Type | Description |
|---|---|---|
| `contributor` | `Address` | Owner of the application whose TTL is being extended. |
| `org_id` | `Symbol` | Organisation the issue belongs to. |
| `issue_id` | `u32` | Numeric issue identifier. |

**Return value**

`()` — no return value on success.

**Errors**

| Code | Variant | Condition |
|---|---|---|
| 9 | [`ApplicationNotFound`](error-reference.md#error-9--applicationnotfound) | No pending application exists for the triple; nothing to extend |

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source any-account \
  -- extend_application_ttl \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

### `get_global_application_count`

**Type:** Read-only · No authentication required

**Description**

Returns the contributor's current global pending-application count. Returns `0` if the contributor has never applied or if all entries have expired.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `contributor` | `Address` | Address to query. |

**Return value**

`u32` in the range `[0, 15]`. A value of `15` means the contributor has reached the global cap.

**Errors**

None — this function never panics.

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_global_application_count \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST
```

---

### `get_org_assignment_count`

**Type:** Read-only · No authentication required

**Description**

Returns the contributor's active assignment count for the given organisation. Returns `0` if the contributor has no active assignments in `org_id`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `contributor` | `Address` | Address to query. |
| `org_id` | `Symbol` | Organisation to query within. |

**Return value**

`u32` in the range `[0, 4]`. A value of `4` means the contributor has reached the per-org cap.

**Errors**

None — this function never panics.

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_org_assignment_count \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation
```

---

### `has_applied`

**Type:** Read-only · No authentication required

**Description**

Returns `true` if the contributor has a pending application for the given issue. Returns `false` if the application is absent or has expired.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `contributor` | `Address` | Address to query. |
| `org_id` | `Symbol` | Organisation the issue belongs to. |
| `issue_id` | `u32` | Numeric issue identifier. |

**Return value**

`bool` — `true` if a pending application exists, `false` otherwise.

**Errors**

None — this function never panics.

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- has_applied \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

### `is_assigned`

**Type:** Read-only · No authentication required

**Description**

Returns `true` if the contributor is actively assigned to the given issue. Assignments are stored in persistent storage and do not expire, so `false` definitively means no active assignment exists.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `contributor` | `Address` | Address to query. |
| `org_id` | `Symbol` | Organisation the issue belongs to. |
| `issue_id` | `u32` | Numeric issue identifier. |

**Return value**

`bool` — `true` if an active assignment exists, `false` otherwise.

**Errors**

None — this function never panics.

**Stellar CLI example**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- is_assigned \
  --contributor GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST \
  --org_id rust_foundation \
  --issue_id 1024
```

---

## REST API

The WorkloadGovernor backend exposes a REST API for querying issues, contributor state, and building Soroban transactions. The API is mounted at the root of the deployed service.

### Authentication

Most read endpoints are unauthenticated. Admin endpoints require the `x-admin-token` header:

```
x-admin-token: <ADMIN_TOKEN>
```

The token value must match the `ADMIN_TOKEN` environment variable on the server. Missing or incorrect tokens receive `401 Unauthorized`.

---

### Health

#### `GET /health`

Returns service liveness status. No authentication required.

**Response `200`**
```json
{ "status": "ok" }
```

---

### Issues

#### `GET /api/issues`

List issues, optionally filtered by organisation or status.

**Auth:** None

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `org_id` | string | No | Filter by organisation ID |
| `status` | string | No | Filter by issue status (`open`, `assigned`, `completed`) |

**Example request**
```
GET /api/issues?org_id=rust_foundation&status=open
```

**Response `200`**
```json
[
  {
    "id": 1024,
    "org_id": "rust_foundation",
    "title": "Fix async executor hang on drop",
    "status": "open",
    "created_at": "2026-06-01T10:00:00Z"
  }
]
```

---

### Contributors

#### `GET /api/contributors/:address/applications`

List all pending applications submitted by a contributor.

**Auth:** None

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `address` | string | Stellar address of the contributor |

**Example request**
```
GET /api/contributors/GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST/applications
```

**Response `200`**
```json
[
  {
    "id": 7,
    "contributor": "GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST",
    "issue_id": 1024,
    "title": "Fix async executor hang on drop",
    "status": "open",
    "created_at": "2026-06-10T08:30:00Z"
  }
]
```

---

#### `GET /api/contributors/:address/assignments`

List all active assignments for a contributor.

**Auth:** None

**Response `200`**
```json
[
  {
    "id": 3,
    "contributor": "GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST",
    "issue_id": 1024,
    "title": "Fix async executor hang on drop",
    "status": "assigned",
    "created_at": "2026-06-11T09:00:00Z"
  }
]
```

---

### Admin

#### `POST /api/admin/maintainers`

Register a maintainer address for an organisation.

**Auth:** `x-admin-token` header required

**Request body**

```json
{
  "address": "GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST",
  "org_id": "rust_foundation"
}
```

**Response `201`**
```json
{
  "address": "GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST",
  "org_id": "rust_foundation"
}
```

**Response `401`** — bad or missing token
```json
{ "error": "unauthorized" }
```

---

### Transactions

Transaction endpoints build and simulate Soroban XDR. The client receives a serialised transaction and fee estimate; the client signs and submits it to the Stellar network directly.

All transaction endpoints:
- **Method:** `POST`
- **Auth:** None (signing happens client-side)
- **Content-Type:** `application/json`

**Common success response `200`**
```json
{
  "xdr": "<base64-encoded transaction XDR>",
  "fee": 100,
  "minResourceFee": 50
}
```

**Common error response `400`**
```json
{ "error": "<reason>" }
```

Contract-level errors are surfaced in the `400` response body as the `error` string from the Soroban simulation. See [error-reference.md](error-reference.md) for the full list of contract error codes.

---

#### `POST /api/transactions/apply`

Build a transaction to call `apply_for_issue` on the contract.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `contributor` | string | Yes | Stellar address of the contributor |
| `org_id` | string | Yes | Organisation ID |
| `issue_id` | number | Yes | Issue ID |
| `sequence` | string | Yes | Current sequence number of the contributor's account |

**Example request**
```json
{
  "contributor": "GBFZB4ALICEXK2QRSUVWXY3ZCDEJHI4JKLMNO5PQRST6UVWXYTEST",
  "org_id": "rust_foundation",
  "issue_id": 1024,
  "sequence": "123456789"
}
```

---

#### `POST /api/transactions/withdraw`

Build a transaction to call `withdraw_application`.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `contributor` | string | Yes | Stellar address of the contributor |
| `org_id` | string | Yes | Organisation ID |
| `issue_id` | number | Yes | Issue ID |
| `sequence` | string | Yes | Current sequence number |

---

#### `POST /api/transactions/assign`

Build a transaction to call `assign_issue`. Requires a maintainer signer.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `maintainer` | string | Yes | Stellar address of the maintainer |
| `contributor` | string | Yes | Stellar address of the contributor |
| `org_id` | string | Yes | Organisation ID |
| `issue_id` | number | Yes | Issue ID |
| `sequence` | string | Yes | Current sequence number of the maintainer's account |

---

#### `POST /api/transactions/complete`

Build a transaction to call `complete_assignment`.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `maintainer` | string | Yes | Stellar address of the maintainer |
| `contributor` | string | Yes | Stellar address of the contributor |
| `org_id` | string | Yes | Organisation ID |
| `issue_id` | number | Yes | Issue ID |
| `sequence` | string | Yes | Current sequence number |

---

#### `POST /api/transactions/revoke`

Build a transaction to call `revoke_assignment`.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `maintainer` | string | Yes | Stellar address of the maintainer |
| `contributor` | string | Yes | Stellar address of the contributor |
| `org_id` | string | Yes | Organisation ID |
| `issue_id` | number | Yes | Issue ID |
| `sequence` | string | Yes | Current sequence number |

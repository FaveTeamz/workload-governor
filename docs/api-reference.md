# API Reference

The WorkloadGovernor backend exposes a REST API for querying issues, contributor state, and building Soroban transactions. The API is mounted at the root of the deployed service.

> **OpenAPI / Swagger UI:** When the service is running, interactive docs are available at `/docs` (served via Swagger UI, auto-generated from the OpenAPI spec in `openapi.yaml` — see issue #34).

## Authentication

Most read endpoints are unauthenticated. Admin endpoints require the `x-admin-token` header:

```
x-admin-token: <ADMIN_TOKEN>
```

The token value must match the `ADMIN_TOKEN` environment variable on the server. Missing or incorrect tokens receive `401 Unauthorized`.

---

## Endpoints

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
| `status` | string | No | Filter by issue status (e.g. `open`, `assigned`, `completed`) |

**Example request**
```
GET /api/issues?org_id=stellar-org&status=open
```

**Response `200`**
```json
[
  {
    "id": 42,
    "org_id": "stellar-org",
    "title": "Fix fee calculation",
    "status": "open",
    "created_at": "2026-06-01T10:00:00Z"
  }
]
```

**Response `500`**
```json
{ "error": "internal server error" }
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
GET /api/contributors/GBFZB...XK2Q/applications
```

**Response `200`**
```json
[
  {
    "id": 7,
    "contributor": "GBFZB...XK2Q",
    "issue_id": 42,
    "title": "Fix fee calculation",
    "status": "open",
    "created_at": "2026-06-10T08:30:00Z"
  }
]
```

**Response `500`**
```json
{ "error": "internal server error" }
```

---

#### `GET /api/contributors/:address/assignments`

List all active assignments for a contributor.

**Auth:** None

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `address` | string | Stellar address of the contributor |

**Example request**
```
GET /api/contributors/GBFZB...XK2Q/assignments
```

**Response `200`**
```json
[
  {
    "id": 3,
    "contributor": "GBFZB...XK2Q",
    "issue_id": 42,
    "title": "Fix fee calculation",
    "status": "assigned",
    "created_at": "2026-06-11T09:00:00Z"
  }
]
```

**Response `500`**
```json
{ "error": "internal server error" }
```

---

### Admin

#### `POST /api/admin/maintainers`

Register a maintainer address for an organisation.

**Auth:** `x-admin-token` header required

**Request body**

```json
{
  "address": "GABC1...9KLM",
  "org_id": "stellar-org"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `address` | string | Yes | Stellar address of the maintainer |
| `org_id` | string | Yes | Organisation ID to authorise the maintainer for |

**Response `201`**
```json
{
  "address": "GABC1...9KLM",
  "org_id": "stellar-org"
}
```

**Response `400`** — missing fields
```json
{ "error": "address and org_id required" }
```

**Response `401`** — bad or missing token
```json
{ "error": "unauthorized" }
```

**Response `500`**
```json
{ "error": "internal server error" }
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
  "contributor": "GBFZB...XK2Q",
  "org_id": "stellar-org",
  "issue_id": 42,
  "sequence": "123456789"
}
```

---

#### `POST /api/transactions/withdraw`

Build a transaction to call `withdraw_application`.

**Request body**

| Field | Type | Required |
|---|---|---|
| `contributor` | string | Yes |
| `org_id` | string | Yes |
| `issue_id` | number | Yes |
| `sequence` | string | Yes |

---

#### `POST /api/transactions/assign`

Build a transaction to call `assign_issue`. Requires a maintainer signer.

**Request body**

| Field | Type | Required |
|---|---|---|
| `maintainer` | string | Yes |
| `contributor` | string | Yes |
| `org_id` | string | Yes |
| `issue_id` | number | Yes |
| `sequence` | string | Yes |

---

#### `POST /api/transactions/complete`

Build a transaction to call `complete_assignment`.

**Request body**

| Field | Type | Required |
|---|---|---|
| `maintainer` | string | Yes |
| `contributor` | string | Yes |
| `org_id` | string | Yes |
| `issue_id` | number | Yes |
| `sequence` | string | Yes |

---

#### `POST /api/transactions/revoke`

Build a transaction to call `revoke_assignment`.

**Request body**

| Field | Type | Required |
|---|---|---|
| `maintainer` | string | Yes |
| `contributor` | string | Yes |
| `org_id` | string | Yes |
| `issue_id` | number | Yes |
| `sequence` | string | Yes |

---

## Error Codes

HTTP `400` is returned for malformed requests (missing fields, simulation errors). HTTP `401` is returned for admin endpoints with a missing or wrong token. HTTP `500` indicates a database or internal error. Contract-level errors are surfaced in the `400` response body as the `error` string from the Soroban simulation. See [error-reference.md](./error-reference.md) for the full list of contract error codes.

# Workload Governor Admin Guide

## Overview

The Workload Governor contract manages issue assignments and applications for contributors. This guide covers administration tasks including TTL (Time-To-Live) management, admin modes, and error handling.

---

## Admin Transfer

Admin authority moves between addresses in two steps, each signed by a different key:

1. The current admin calls `propose_admin(current_admin, new_admin)`. The nominated address is stored under `"p_admin"`, and the current admin keeps full authority.
2. The nominated address calls `accept_admin(new_admin)`. The stored admin is replaced and the pending entry is cleared in the same invocation.

If step 2 never happens, nothing changes: the current admin stays active. To correct a wrong nomination, call `propose_admin` again with the right address.

- Step-by-step procedure: [Admin key rotation runbook](runbooks/admin-key-rotation.md)
- Design rationale and alternatives considered: [ADR-006: Two-Step Admin Transfer](adr/ADR-006-two-step-admin-transfer.md)

---

## Administrative Authentication & Remediation Endpoints

Administrative endpoints under `/api/admin/*` perform sensitive operations such as force-resynchronizing off-chain database counts with on-chain Soroban storage, registering maintainers, and adjusting governance caps. All `/api/admin/*` endpoints strictly enforce administrator authorization via the `adminAuth` middleware.

### Authentication Mechanisms

Clients must authenticate using one of two methods:

#### 1. Bearer API Key
Pass the configured administrative API key in the `Authorization` header:
```http
Authorization: Bearer <ADMIN_API_KEY>
```

#### 2. Ed25519 Cryptographic Signature
Prove control of the on-chain admin account address by providing cryptographic signature headers:
- `X-Admin-Address`: Stellar public key (`G...`)
- `X-Admin-Timestamp`: Current UTC Unix timestamp (seconds or milliseconds)
- `X-Admin-Signature`: Base64 detached Ed25519 signature of `<METHOD>:<PATH>:<TIMESTAMP>` (or `<TIMESTAMP>`)

**Replay Attack Protection:** Signatures are strictly rejected if the timestamp deviates by more than 300 seconds (5 minutes) from server time.

### Error Responses
- **401 Unauthorized**: Missing required authentication headers.
- **403 Forbidden**: Invalid API key, invalid signature, or timestamp outside the 300-second window.

### Administrative Remediation Endpoints

- `POST /api/admin/reconcile-counts`: Force-resynchronizes off-chain database counts with on-chain Soroban storage.
- `POST /api/admin/sync-contract`: Synchronizes contract state with the database cache.
- `POST /api/admin/maintainers`: Generates unsigned XDR transaction to register an organization maintainer.
- `POST /api/admin/caps`: Updates global and per-org workload limits.
- `GET /api/admin/consistency`: Inspects inconsistency between on-chain and off-chain states.
- `POST /api/admin/consistency/remediate`: Resolves detected state discrepancies.

All invocations produce immutable audit logs capturing the admin actor identity, IP address, and timestamp.

### What is TTL?

TTL (Time-To-Live) is the duration that a storage entry remains valid on the Stellar ledger. After the TTL expires, entries may be archived and become inaccessible.

### Why Extend TTL?

- Long-running assignments can span months
- Prevent archival of active assignments
- Ensure data availability for audits

### TTL Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ASSIGNMENT_TTL` | 30 days | Default TTL for assignments |
| `EXTENDED_ASSIGNMENT_TTL` | 90 days | Extended TTL when manually extended |

### Functions

#### extend_assignment_ttl

Extends the TTL of an assignment entry and related counters.

**Function Signature:**
# Security Model — WorkloadGovernor Backend

**Last updated**: 2026-11-22  
**Covers**: audit log cryptographic integrity (PR #9)

---

## 1. Overview

WorkloadGovernor writes an append-only audit log entry every time a privileged
action occurs: maintainer registration, issue assignment, workload-cap
enforcement, and administrative overrides.

Before this change, audit rows in the `audit_log` table could be silently
modified or deleted by any database user with write permissions.  Attackers
who gain access to the database could alter history without detection.

The hash-chain / HMAC-seal mechanism described here makes every row
cryptographically bound to all rows that precede it.  Altering any field — or
removing any row — causes verification to fail on the first affected link.

---

## 2. Data Model

### `audit_log` table

| Column          | Type        | Description                                              |
|-----------------|-------------|----------------------------------------------------------|
| `id`            | BIGSERIAL   | Monotonically increasing primary key                     |
| `event_type`    | TEXT        | Semantic event name (e.g. `ASSIGN_ISSUE`)                |
| `payload`       | JSONB       | Structured event data                                    |
| `created_at`    | TIMESTAMPTZ | Server-authoritative write timestamp (set by `NOW()`)    |
| `previous_hash` | TEXT        | `entry_hash` of the immediately preceding row            |
| `entry_hash`    | TEXT        | SHA-256 digest binding all data fields                   |
| `signature`     | TEXT        | HMAC-SHA-256 seal over `entry_hash`, keyed with a secret |

The three new columns are added by **migration 9** (`migrations/9_add_audit_signatures.js`).

---

## 3. Cryptographic Design

### 3.1 Genesis hash

The chain starts with a well-known sentinel value:

```
GENESIS_HASH = SHA-256("")
             = e3b0c44298fc1c149afbf4c8996fb924…
```

The first row in the table stores `GENESIS_HASH` as its `previous_hash`.

### 3.2 Entry hash

For every new row the following input string is constructed:

```
input = previous_hash + "|" + event_type + "|" + stable_payload + "|" + created_at_iso
```

where `stable_payload` is `JSON.stringify(payload, sortedKeys)` — keys are
sorted before serialisation so that field insertion order never affects the
digest.

```
entry_hash = SHA-256(input)
```

### 3.3 HMAC signature

```
signature = HMAC-SHA-256(entry_hash, AUDIT_SECRET)
```

`AUDIT_SECRET` is a server-side secret stored as an environment variable (or
injected via AWS Secrets Manager in production).  It is never persisted to the
database.

The dual-layer design means:

* **entry_hash** alone proves data integrity — any field change is detectable
  without knowledge of the secret.
* **signature** proves authenticity — an attacker who can write to the database
  but does not know `AUDIT_SECRET` cannot forge a valid HMAC for a rewritten
  row.

### 3.4 Chain linkage

```
row N+1 .previous_hash  ==  row N .entry_hash
```

This binds the entire sequence.  Deleting row N makes row N+1's
`previous_hash` point to a hash that no longer exists, which verification
detects immediately.

---

## 4. Write Path

```
caller
  │
  ▼
AuditService.append(eventType, payload)
  │
  ├─ BEGIN transaction
  ├─ SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE
  │    (row-level lock prevents concurrent writes from forking the chain)
  ├─ SELECT NOW()   ← server timestamp, not client clock
  ├─ Derive entry_hash = SHA-256(prev|type|payload|ts)
  ├─ Derive signature  = HMAC-SHA-256(entry_hash, AUDIT_SECRET)
  ├─ INSERT INTO audit_log …
  └─ COMMIT
```

The `FOR UPDATE` lock on the previous row guarantees that two concurrent
`append()` calls cannot both read the same tail hash and produce a fork.

---

## 5. Verification

`AuditService.verify()` replays the entire chain in `id ASC` order:

1. Start with `expectedPrevious = GENESIS_HASH`.
2. For each row:
   a. Assert `row.previous_hash == expectedPrevious`.
   b. Re-derive `entry_hash` from the stored fields and assert it matches
      `row.entry_hash`.
   c. Re-derive `signature` and assert it matches `row.signature`.
3. Advance `expectedPrevious = row.entry_hash` and continue.

Any failure is recorded in a `broken` list with the row ID and a human-readable
reason.  Verification continues past failures so all broken links are reported
in a single pass.

### Verification endpoint

```
GET /api/v1/audit/verify
Authorization: X-Admin-Token: <ADMIN_TOKEN>
```

Response (HTTP 200):

```json
{
  "ok":    true,
  "total": 1247,
  "broken": []
}
```

When integrity fails:

```json
{
  "ok":    false,
  "total": 1247,
  "broken": [
    { "id": 42, "reason": "entry_hash mismatch: data has been tampered" },
    { "id": 43, "reason": "previous_hash mismatch: expected abc…, got def…" }
  ]
}
```

The endpoint always returns HTTP 200 for a successful query so callers can
inspect `ok` without special-casing status codes.  HTTP 503 is used only when
the verification query itself fails (database unavailable, etc.).

---

## 6. Configuration

| Environment variable | Required | Description                                                              |
|----------------------|----------|--------------------------------------------------------------------------|
| `AUDIT_SECRET`       | Yes      | Key for HMAC signatures. Minimum 32 random bytes, base64 or hex encoded. |
| `ADMIN_TOKEN`        | Yes      | Bearer token for the `/api/v1/audit/verify` endpoint.                    |

Add these to your deployment secrets store.  For local development copy
`.env.example` to `.env` and set both values.

---

## 7. Migration

### Up (apply)

```bash
node -e "
  const { Pool } = require('pg');
  const { up } = require('./migrations/9_add_audit_signatures');
  up(new Pool({ connectionString: process.env.DATABASE_URL }))
    .then(() => { console.log('migration 9 applied'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
"
```

### Down (rollback)

```bash
# Drop only the three signature columns (safe, retains audit rows):
node -e "
  const { Pool } = require('pg');
  const { down } = require('./migrations/9_add_audit_signatures');
  down(new Pool({ connectionString: process.env.DATABASE_URL }))
    .then(() => { console.log('migration 9 rolled back'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
"

# Drop the entire audit_log table (destructive — use with care):
FULL_ROLLBACK=1 node -e "…same as above…"
```

---

## 8. Threat Model

| Threat                               | Mitigation                                                            |
|--------------------------------------|-----------------------------------------------------------------------|
| DB row field tampered                | entry_hash mismatch detected on next verify()                        |
| DB row deleted                       | Successor row's previous_hash breaks chain                           |
| Row inserted mid-chain               | Successor row's previous_hash does not match the forged entry's hash  |
| Hash rewritten but payload unchanged | Signature mismatch: attacker lacks AUDIT_SECRET                      |
| AUDIT_SECRET rotated without re-seal | All signatures fail — planned rotation requires a re-seal migration  |
| Replay / duplicate events            | Each row's entry_hash covers the server timestamp, so identical events at different times produce distinct hashes |

### Out of scope

* **Key management rotation**: re-sealing an existing chain after key rotation
  requires a one-time migration that re-computes all signatures. This is an
  operational procedure not covered by this implementation.
* **Multi-node clock skew**: `created_at` is set by `NOW()` on the primary
  database node, so it is consistent within a single primary.
* **Long-term archive integrity**: for compliance archives consider periodically
  anchoring the chain tail hash into an external transparency log or immutable
  store (e.g. AWS QLDB or a public blockchain).

---

## 9. Files changed

| Path                                       | Purpose                             |
|--------------------------------------------|-------------------------------------|
| `migrations/9_add_audit_signatures.js`     | DB schema change (up + down)        |
| `src/services/auditService.ts`             | Hash-chain logic and verification   |
| `src/routes/audit.ts`                      | `GET /api/v1/audit/verify` endpoint |
| `src/app.ts`                               | Router registration                 |
| `tests/unit/auditService.test.ts`          | 24-test unit suite                  |
| `docs/security-model.md`                   | This document                       |

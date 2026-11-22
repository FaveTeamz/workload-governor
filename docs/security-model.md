# Security Model — Replay Protection

## Overview

WorkloadGovernor's backend processes signed authorization payloads on behalf of Stellar contributors. A *replay attack* occurs when an intercepted, valid signed payload is re-submitted, causing the same action to execute twice. This document describes the two-layer replay protection system that prevents this.

## Threat Model

| Actor | Capability | Mitigated? |
|---|---|---|
| Network observer | Captures a signed payload in transit | Yes — nonce is single-use |
| Compromised intermediary | Retains and replays a past payload | Yes — nonce + ledger window |
| Fast attacker replaying within seconds | Same payload, same session | Yes — atomic Redis SET NX |
| Attacker replaying a very old payload | Payload from many ledgers ago | Yes — ledger expiry check |

Replay protection does **not** replace signature verification. It is a second, independent layer applied after the cryptographic signature is accepted.

## Signed Payload Fields

Every payload sent to a protected endpoint must include three extra fields alongside its domain data:

| Field | Type | Description |
|---|---|---|
| `nonce` | UUIDv4 or 64-char hex | Random single-use token. Consumed on first acceptance. |
| `ledger_sequence` | `number` | Stellar ledger at which the payload was signed. |
| `max_ledger` | `number` | Expiration ledger. Must satisfy `ledger_sequence < max_ledger ≤ ledger_sequence + 100`. |

### Nonce Format

Clients may supply either:

- A **UUIDv4** string — e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479`
- A **64-character hex string** — e.g. `a3f8...` (32 random bytes encoded as hex)

Both formats carry sufficient entropy (128 bits) to make guessing or collision negligible.

### Ledger Window

Stellar produces approximately one ledger every 5 seconds. A window of 100 ledgers covers roughly **8 minutes**. This is a deliberate trade-off:

- Wide enough to tolerate normal network and browser delays.
- Narrow enough that an intercepted payload expires quickly.

Clients must set `max_ledger = current_ledger + N` where `1 ≤ N ≤ 100`. Requesting a window larger than 100 is rejected at the schema-validation layer before any Redis or Horizon call is made.

## Two-Phase Check

The `replayProtection` middleware (`src/middleware/replayProtection.ts`) runs two independent checks in sequence:

### Phase 1 — Structural validation

`validateSignedPayloadBase` (from `src/schemas/auth.ts`) checks:

1. `nonce` matches the UUID v4 or 64-char hex pattern.
2. `ledger_sequence` is a positive integer.
3. `max_ledger` is a positive integer.
4. `max_ledger > ledger_sequence` (non-zero window).
5. `max_ledger - ledger_sequence ≤ 100` (window does not exceed the cap).

Failure returns **400 Bad Request** with a `details` array identifying which fields are invalid.

### Phase 2 — Live ledger check

The middleware fetches the current Stellar ledger sequence from Horizon:

```
GET https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1
```

If `current_ledger >= max_ledger`, the payload has expired. Returns **400 Bad Request**.

### Phase 3 — Nonce uniqueness (atomic Redis operation)

```
SET nonce:<value> 1 EX 600 NX
```

- `NX` — only set if the key does not already exist.
- `EX 600` — auto-expire after 10 minutes (covers the full validity window plus buffer).
- Returns `"OK"` on first use, `null` on any subsequent attempt with the same nonce.

If `null` is returned, the payload has already been consumed. Returns **409 Conflict** with the message *"Transaction payload already consumed"*.

## Response Codes

| Condition | HTTP Status | Message |
|---|---|---|
| Missing or malformed replay fields | 400 | `Invalid signed payload` |
| Payload's `max_ledger` already passed | 400 | `Signed payload has expired` |
| Nonce already in Redis | 409 | `Transaction payload already consumed` |
| Horizon unreachable | 503 | `Ledger check unavailable: <reason>` |
| Redis unreachable | 503 | `Replay protection unavailable: <reason>` |

## Redis Key Design

```
Key:   nonce:<nonce-value>
Value: 1
TTL:   600 seconds (10 minutes)
```

Keys are namespaced with `nonce:` to avoid collision with other Redis users. The TTL is set unconditionally on write — it is not renewed if a duplicate attempt arrives. Once the TTL expires, Redis purges the key automatically, reclaiming memory without any background job.

## Infrastructure Requirements

- Redis (any version supporting `SET ... EX ... NX`) — provided via `REDIS_URL` environment variable.
- Outbound HTTPS access to the configured `STELLAR_HORIZON_URL` from the backend host.

The module uses `ioredis` for the production Redis client. The client is loaded dynamically so the module can be loaded in test environments that inject a mock without installing ioredis.

## Testing

See `tests/unit/replayProtection.test.ts` for the full unit test suite. The tests cover:

- Double submission of an identical nonce returns 409.
- A payload whose `max_ledger` is at or below the current ledger returns 400.
- Structural validation errors (missing fields, bad formats) return 400.
- Redis errors return 503.
- Ledger-fetcher errors return 503.

Tests inject both a mock Redis client (in-memory `Map`) and a mock ledger fetcher, so no live Redis or Horizon connection is needed.

## Operational Notes

**Key expiry vs. ledger window mismatch**: The nonce TTL is set to 600 seconds (10 minutes) regardless of the actual remaining validity window. This is intentional — it is marginally more wasteful of Redis memory than computing a per-payload TTL, but eliminates a class of clock-drift bugs where a computed TTL slightly undershoots the window.

**Multiple backend replicas**: Because the nonce store is Redis (shared across all instances), the `SET NX` atomicity guarantee holds even when multiple backend replicas race to process the same nonce. Only one will receive `"OK"`.

**Key-space pressure**: Each accepted request writes one Redis key of ~80 bytes. At 1,000 requests per second, Redis holds roughly 600,000 live keys consuming ~50 MB — well within normal deployment limits.

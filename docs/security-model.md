# Security Model

This document describes the abuse-prevention controls applied to the
WorkloadGovernor backend API, with particular attention to the
CPU-intensive `POST /api/verify-xdr` endpoint.

---

## Threat Model

The `POST /api/verify-xdr` endpoint accepts Stellar transaction XDR strings
from unauthenticated frontend clients and parses them before broadcasting.
XDR parsing involves base64 decoding, ASN.1-style deserialization, and
Ed25519 signature verification — all CPU-bound work. Without controls, a
single hostile client can submit a continuous stream of large, malformed XDR
payloads and saturate a Node.js process's event loop, making the entire
service unresponsive.

The controls below address three distinct attack vectors:

| Vector | Control | Response code |
|--------|---------|---------------|
| Request flood (volumetric) | Per-IP rate limit | 429 |
| Oversized body | Body parser size cap | 413 |
| Oversized / pathological XDR | XDR string length check | 413 |
| Event-loop starvation via slow parse | Worker thread + timeout | 503 |

---

## Controls

### 1. Rate Limiting — `POST /api/verify-xdr`

**Limit:** 15 requests per minute per originating IP address.  
**Implementation:** [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit)
v7, applied as dedicated middleware before the route handler.

```
windowMs : 60 000 ms
max      : 15 requests
headers  : RateLimit (draft-7 standard headers)
```

A client that exceeds the threshold receives:

```
HTTP 429 Too Many Requests
{ "error": "Too many requests, please try again later." }
```

The window resets on a rolling basis. Standard `RateLimit-*` headers inform
well-behaved clients of their remaining quota and reset time.

---

### 2. Body Size Cap — 64 KB

**Implementation:** `express.json({ limit: '64kb' })` scoped exclusively to
`/api/verify-xdr`. The global body parser on other routes retains its default
limit.

A Stellar transaction with the maximum operation count is well under 10 KB of
raw XDR. The 64 KB cap provides a generous margin for base64 overhead while
preventing multi-megabyte payloads from ever being buffered into memory.

Payloads exceeding 64 KB are rejected by Express before the route handler
runs:

```
HTTP 413 Payload Too Large
```

---

### 3. XDR String Length Check — 32 KB

Inside the route handler, the submitted `xdr` string is checked before any
parse attempt:

```typescript
if (xdrString.length > 32 * 1024) {
  res.status(413).json({ error: 'XDR string exceeds maximum allowed length ...' });
}
```

This is a belt-and-suspenders guard. Even if the body parser were misconfigured
or the content-type were misidentified, an oversized XDR string is rejected
before it reaches the CPU-intensive parse step.

---

### 4. Worker Thread Offload with 50 ms Timeout

XDR parsing runs in a [Node.js worker thread](https://nodejs.org/api/worker_threads.html),
keeping the main event loop free regardless of parse duration.

A 50 ms wall-clock timeout is enforced on each parse job:

```
timeout  : 50 ms
on breach: worker.terminate() → HTTP 503
```

Legitimate well-formed transactions parse in under 2 ms on commodity hardware.
The 50 ms budget is 25× that — ample for any valid input while tightly
bounding the worst-case CPU exposure from pathological inputs.

If the timeout fires:

```
HTTP 503 Service Unavailable
{ "error": "XDR parsing timed out — transaction may be malformed or oversized" }
```

---

## Other Endpoints

All other API routes (`/api/issues`, `/api/contributors`, `/api/admin`,
`/api/transactions`) inherit the global `express.json()` body parser. They
perform lightweight database lookups and Soroban RPC calls that do not involve
local CPU-intensive cryptographic work, so the XDR-specific controls do not
apply.

Rate limiting for those routes should be applied at the ingress layer (e.g.
ALB / CloudFront WAF rules) rather than in-process.

---

## Testing

The controls are exercised by automated tests in `tests/unit/xdr.test.ts`:

| Test | Expected status |
|------|----------------|
| 30 rapid requests (same IP) | 15 × 200, then 429 |
| Body larger than 64 KB | 413 |
| `xdr` string longer than 32 KB | 413 |
| Valid XDR | 200 with `{ valid, type, operations }` |
| Malformed XDR | 400 |

Run with:

```bash
npm test -- --testPathPattern=xdr
```

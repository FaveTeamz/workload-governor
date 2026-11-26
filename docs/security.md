# Security Runbook

This document covers transport-layer security controls enforced by the backend
and the supporting infrastructure, with investigation steps for every related
alert.

For the smart-contract security audit (authentication checks, integer
overflow, replay attack, storage key predictability) see
[security-checklist.md](security-checklist.md).

---

## Transport security (#1318)

### Design

The backend enforces two complementary layers of HTTPS enforcement:

**Layer 1 — ALB redirect rule (infrastructure)**  
The Application Load Balancer (or Cloudflare) is configured with a redirect
rule that returns HTTP 301 to any client that connects on port 80 before the
request reaches the container.  This is the primary enforcement point.

**Layer 2 — Application middleware (defence in depth)**  
`src/app.ts` adds a second enforcement layer so that a misconfiguration of
the ALB redirect rule can never silently expose traffic in plaintext:

```typescript
// src/app.ts (production only)
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}
```

`app.set('trust proxy', 1)` instructs Express to read `X-Forwarded-Proto`
from the first upstream proxy (the ALB), so `req.header('x-forwarded-proto')`
reflects the original client protocol rather than the container-local TCP
connection (which is always HTTP inside the VPC).

**Layer 3 — HSTS header (browser preload)**  
Helmet is configured with the browser preload list requirements:

```typescript
helmet({
  hsts: {
    maxAge: 31_536_000,      // 1 year
    includeSubDomains: true,
    preload: true,
  },
})
```

The `Strict-Transport-Security` header instructs browsers to refuse to
make plain-HTTP connections to this origin for the next 365 days, even
before the ALB or application redirect fires.  With `preload: true` the
domain can be submitted to the [HSTS preload list](https://hstspreload.org/)
so the protection applies on first visit from any browser.

---

### HTTPS enforcement {#https-enforcement}

**Alert:** `${service_name}-http-plaintext-bypass` (CloudWatch)

| Field | Value |
|---|---|
| Severity | **critical** — security event |
| Threshold | ≥ 1 plain-HTTP request reaches the container in any 60-second window |
| CloudWatch metric | `HttpPlaintextCount` in `${service_name}/Application` |

**What it means**  
A plain-HTTP request bypassed the ALB redirect rule and reached the
application container.  This should never happen in a correctly configured
production deployment.

**Investigation steps**

1. Query the `${service_name}-http-plaintext-requests` Logs Insights saved
   query to identify the source IPs and paths:
   ```
   fields @timestamp, correlationId, method, path, status
   | filter headers["x-forwarded-proto"] = "http"
   | sort @timestamp desc
   | limit 50
   ```
2. Check the ALB listener rules in the AWS Console — verify that port 80 has
   a redirect rule set to `HTTP 301` → `https://#{host}:443/#{path}?#{query}`.
3. Check whether Cloudflare (if in use) is set to "Full (strict)" TLS mode,
   not "Flexible" (which would cause Cloudflare→origin to use HTTP).
4. Verify the ECS security group does not expose port 80 directly to the
   internet, bypassing the ALB.
5. If requests are from internal tooling (health checks, synthetic monitors),
   update those tools to use HTTPS endpoints and confirm the alert resolves.

**Escalation**  
Treat any confirmed external plain-HTTP traffic as a security incident.
Engage the security on-call and open a P1 incident ticket.

---

### Verifying HTTPS enforcement manually

**Check HSTS header**
```bash
curl -sI https://<your-domain>/health | grep -i strict-transport
# Expected:
# strict-transport-security: max-age=31536000; includeSubDomains; preload
```

**Check HTTP→HTTPS redirect**
```bash
curl -sI -H "X-Forwarded-Proto: http" http://<your-domain>/health
# Expected: HTTP/1.1 301 Moved Permanently
# Location: https://<your-domain>/health
```

**Check redirect in production via the ALB**
```bash
curl -sI http://<alb-dns-name>/health
# Expected: HTTP/1.1 301 Moved Permanently
# Location: https://<your-domain>/health
```

---

### Environment behaviour

| Environment | HTTPS redirect middleware | HSTS header |
|---|---|---|
| `production` | ✅ Enabled — returns 301 for `X-Forwarded-Proto: http` | ✅ Always emitted by Helmet |
| `staging` / `development` | ❌ Disabled — traffic may arrive over HTTP without redirect | ✅ Always emitted by Helmet |
| `test` | ❌ Disabled | ✅ Always emitted by Helmet |

The redirect middleware is intentionally off outside production so that
local development and integration tests (which use HTTP) are not broken.
Staging deployments should still sit behind an HTTPS terminator; the
middleware is an additional safety net, not the primary control.

---

## Related documents

- [Security checklist](security-checklist.md) — smart-contract audit
- [Observability runbook](observability.md) — alert definitions
- [Deployment runbook](deployment-runbook.md)
- [Incident response runbook](runbooks/incident-response.md)
## GitHub Webhook Security

### Threat model

The backend exposes `POST /api/github/webhook` to receive issue events from
GitHub. Two classes of attack are relevant:

| Threat | Vector | Mitigation |
|---|---|---|
| **Forged webhooks** | Attacker sends arbitrary POST bodies pretending to be GitHub | HMAC-SHA256 signature verification (`X-Hub-Signature-256`) |
| **Server-Side Request Forgery (SSRF)** | Payload contains a crafted URL pointing to internal infrastructure | Strict URL allowlist (host must be `api.github.com`, protocol must be `https:`) |

### HMAC-SHA256 signature verification

GitHub signs every webhook delivery with a shared secret using HMAC-SHA256.
The digest is sent in the `X-Hub-Signature-256` header as `sha256=<hex>`.

**What the handler does:**

1. The route is mounted with `express.raw({ type: 'application/json' })` so the
   raw bytes reach the handler before Express parses JSON.
2. `verifyWebhookSignature(rawBody, signature, secret)` recomputes
   `HMAC-SHA256(secret, rawBody)` and compares it with `timingSafeEqual` to
   prevent timing-based secret discovery.
3. The JSON body is parsed **only after** the signature passes. Any rejection
   before that point happens before untrusted data is interpreted.

**Configuration:**

Set the `GITHUB_WEBHOOK_SECRET` environment variable to the secret configured
in your GitHub webhook settings. The handler returns HTTP 500 and rejects all
deliveries when this variable is unset, so a misconfigured deployment fails
closed rather than open.

```
GITHUB_WEBHOOK_SECRET=<your-secret>
```

**Operational note:** Rotate the secret by updating GitHub's webhook setting and
the environment variable simultaneously. GitHub delivers both the old and new
signature for a brief overlap period — plan the rotation during low-traffic hours.

### SSRF URL allowlist

After the signature is verified, any URL present in the payload (e.g.
`issue.url`) is validated by `validateGitHubApiUrl` before it is ever fetched.

**Rules enforced:**

| Rule | Reason |
|---|---|
| Protocol must be `https:` | Blocks `http:`, `ftp:`, `file:`, `data:` URI, etc. |
| Hostname must be exactly `api.github.com` | Blocks all internal IPs and other hosts |

This blocks:

- AWS EC2/ECS instance-metadata: `169.254.169.254`, `169.254.170.2`
- Loopback: `localhost`, `127.x.x.x`, `::1`
- RFC-1918 private ranges: `10.x`, `172.16–31.x`, `192.168.x`
- Subdomain spoofing: `api.github.com.evil.com`, `evil.api.github.com`
- Protocol downgrade: `http://api.github.com`

Payloads containing a disallowed URL receive HTTP 400 before any outbound
network request is made.

### Express middleware order

Mount the webhook route **before** the global `express.json()` middleware, using
`express.raw` for the raw body:

```typescript
// app.ts — mount BEFORE express.json()
app.post(
  "/api/github/webhook",
  express.raw({ type: "application/json" }),
  githubWebhookHandler,
);

// Global JSON parser for all other routes
app.use(express.json());
```

Reversing this order causes `req.body` to be a parsed object instead of a
`Buffer`, which makes HMAC verification impossible.

### Testing

The test suite in `backend/src/__tests__/githubWebhook.test.ts` covers:

- All SSRF vectors above (AWS metadata, loopback, RFC-1918, subdomain spoofing)
- Tampered signatures and wrong secrets
- Missing and malformed `X-Hub-Signature-256` headers
- Missing `GITHUB_WEBHOOK_SECRET` environment variable
- Non-Buffer request bodies (middleware misconfiguration)
- Happy-path delivery for `opened`, `closed`, and `labeled` actions

Run the tests with:

```bash
cd backend
npm test
```

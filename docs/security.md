# Security Runbook

This document covers transport-layer security controls enforced by the backend
and the supporting infrastructure, with investigation steps for every related
alert.

For the smart-contract security audit (authentication checks, integer overflow,
replay attack, storage key predictability) see
[security-checklist.md](security-checklist.md).

---

## Transport security (#1311)

### Design

The backend enforces two complementary layers of HTTPS enforcement.

**Layer 1 — ALB redirect rule (infrastructure)**  
The Application Load Balancer (or Cloudflare) is configured with a redirect
rule that returns HTTP 301 to any client that connects on port 80 before the
request reaches the container.  This is the primary enforcement point.

**Layer 2 — Application middleware (defence in depth)**  
`backend/src/app.ts` adds a second enforcement layer so that a misconfiguration
of the ALB redirect rule never silently exposes traffic in plaintext:

```typescript
// backend/src/app.ts
app.set("trust proxy", 1);

if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
      res.redirect(301, `https://${req.header("host")}${req.url}`);
      return;
    }
    next();
  });
}
```

`app.set("trust proxy", 1)` instructs Express to read `X-Forwarded-Proto`
from the first upstream proxy (the ALB), so `req.header("x-forwarded-proto")`
reflects the original client protocol rather than the VPC-internal TCP
connection (which is always HTTP inside the container network).

**Layer 3 — HSTS header (browser preload)**  
Helmet is configured with the browser preload list requirements:

```typescript
app.use(
  helmet({
    hsts: {
      maxAge: 31_536_000,       // 1 year
      includeSubDomains: true,
      preload: true,
    },
  }),
);
```

The `Strict-Transport-Security` header instructs browsers to refuse to make
plain-HTTP connections to this origin for the next 365 days, even before the
ALB or application redirect fires.  With `preload: true` the domain can be
submitted to the [HSTS preload list](https://hstspreload.org/) so the
protection applies on the first visit from any browser.

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
3. If Cloudflare is in use, verify TLS mode is set to "Full (strict)", not
   "Flexible" (which causes Cloudflare→origin to use HTTP).
4. Verify the ECS security group does not expose port 80 directly to the
   internet, bypassing the ALB.
5. If requests are from internal tooling (health checks, synthetic monitors),
   update those tools to use HTTPS endpoints and confirm the alert resolves.

**Escalation**  
Treat any confirmed external plain-HTTP traffic as a security incident.
Engage the security on-call and open a P1 incident ticket immediately.

---

### Verifying HTTPS enforcement manually

**Check HSTS header**
```bash
curl -sI https://<your-domain>/api/health | grep -i strict-transport
# Expected:
# strict-transport-security: max-age=31536000; includeSubDomains; preload
```

**Check HTTP→HTTPS redirect from behind the ALB**
```bash
curl -sI http://<alb-dns-name>/api/health
# Expected: HTTP/1.1 301 Moved Permanently
# location: https://<your-domain>/api/health
```

**Simulate the redirect middleware directly**
```bash
curl -sI -H "X-Forwarded-Proto: http" -H "Host: api.example.com" \
  http://localhost:3000/api/health
# Expected: HTTP/1.1 301 Moved Permanently
# location: https://api.example.com/api/health
```

---

### Environment behaviour

| Environment | HTTPS redirect middleware | HSTS header |
|---|---|---|
| `production` | ✅ Enabled — returns 301 for `X-Forwarded-Proto: http` | ✅ Always emitted by Helmet |
| `staging` / `development` | ❌ Disabled — traffic may arrive over HTTP without redirect | ✅ Always emitted by Helmet |
| `test` | ❌ Disabled | ✅ Always emitted by Helmet |

The redirect middleware is intentionally off outside production so that local
development and integration tests (which use plain HTTP) are not broken.
Staging deployments should still sit behind an HTTPS terminator; the
middleware is an additional safety net, not the primary control.

---

## Related documents

- [Security checklist](security-checklist.md) — smart-contract audit
- [Observability runbook](observability.md) — alert definitions
- [Deployment runbook](deployment-runbook.md)
- [Incident response runbook](runbooks/incident-response.md)

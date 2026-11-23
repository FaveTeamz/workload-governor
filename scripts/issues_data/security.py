# Category 10: Security, Governance & Audit - 10 issues

SECURITY_ISSUES = [
    {
        "title": "fix(security): Enforce authorization checks in all admin consistency remediation endpoints",
        "labels": ["bug", "security"],
        "body": """### 🎯 Summary & Context
In `backend/src/app.ts` and administrative routes, internal consistency remediation endpoints (such as `POST /api/admin/reconcile-counts` and `POST /api/admin/sync-contract`) lack strict administrator authorization middleware.

These endpoints force-resynchronize off-chain database counts with on-chain Soroban storage. If left unauthenticated or protected only by network IP filtering, unauthorized external actors could trigger expensive re-indexing loops or manipulate cached counter states.

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
The `/api/admin/*` route group is mounted without the `adminAuth` middleware. Anyone can send a POST request and trigger full-table counter reconciliations.

### 🛠️ Proposed Solution & Technical Specification
1. Implement `adminAuth` middleware in `backend/src/middleware/adminAuth.ts`:
   - Require `Authorization: Bearer <ADMIN_API_KEY>` or Ed25519 cryptographic signature proving control of the on-chain admin account address.
   - For signature authentication: require headers `X-Admin-Address`, `X-Admin-Signature`, `X-Admin-Timestamp` (within 300s window).
   - Reject unauthenticated requests with `401 Unauthorized` or `403 Forbidden`.
2. Apply `adminAuth` across all `/api/admin/*` endpoints in `backend/src/app.ts`.
3. Log all administrative remediation invocations in the structured security audit trail.

### 📁 Affected Files & Modules
- `backend/src/middleware/adminAuth.ts`: New admin auth middleware
- `backend/src/app.ts`: Route mounting
- `backend/src/routes/admin.ts`: Admin route handlers
- `docs/admin-guide.md`: Administrative authentication guide

### ✅ Acceptance Criteria
- [ ] All `/api/admin/*` endpoints strictly require valid admin credentials.
- [ ] Requests missing authentication return 401 Unauthorized.
- [ ] Requests with invalid credentials return 403 Forbidden.
- [ ] Successful administrative actions logged to audit trail with admin address/IP.

### 🧪 Testing & Verification Plan
- Unit test sending unauthenticated and authenticated requests to `/api/admin/reconcile-counts`.
- Verify signature verification handles timestamp replay attacks.

### 🔒 Security, Reliability & Performance Considerations
Protects core governance endpoints against unauthorized tampering and denial of service."""
    },
    {
        "title": "fix(security): Add rate limiting and abuse prevention on public /verify-xdr endpoint",
        "labels": ["bug", "security"],
        "body": """### 🎯 Summary & Context
The public endpoint `POST /api/verify-xdr` parses and validates Stellar transaction XDR strings submitted by frontend clients before broadcasting.

XDR parsing and cryptographic signature verification are CPU-intensive operations. Currently, this endpoint has no dedicated rate limiting or payload size caps, exposing the backend service to CPU starvation and DoS attacks.

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
`app.post('/api/verify-xdr', ...)` parses JSON bodies up to 10 MB and performs multiple cryptographic curve operations synchronously on the Node.js event loop without rate limiting.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/app.ts`:
   - Apply strict, dedicated rate limiter to `/verify-xdr`: max 15 requests per minute per IP.
   - Enforce payload body size limit: `express.json({ limit: '64kb' })` for this endpoint.
   - Reject any XDR payload exceeding 32 KB string length with `413 Payload Too Large`.
2. Wrap XDR parsing in a timeout or worker thread if parsing exceeds 50ms to prevent event loop blocking.

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Rate limiter and body parser configuration
- `backend/src/routes/xdr.ts`: Endpoint controller
- `docs/security-model.md`: Abuse prevention documentation

### ✅ Acceptance Criteria
- [ ] `/verify-xdr` throttles clients exceeding 15 req/min with HTTP 429.
- [ ] Payloads larger than 64 KB rejected with HTTP 413.
- [ ] Event loop lag remains < 10ms under hostile XDR submission traffic.

### 🧪 Testing & Verification Plan
- Stress test sending 30 rapid requests and assert 429 status.
- Send 100 KB payload and verify 413 status.

### 🔒 Security, Reliability & Performance Considerations
Guarantees event loop responsiveness and mitigates computational denial-of-service vectors."""
    },
    {
        "title": "fix(security): Prevent timing attacks on API key comparison in api-key-auth middleware",
        "labels": ["bug", "security"],
        "body": """### 🎯 Summary & Context
In `backend/src/app.ts` and authentication handlers, incoming API keys are compared using standard JavaScript string equality operators (`===` or `==`).

Standard string comparisons terminate at the first non-matching byte, causing variable execution times proportional to the number of leading matching characters. Attackers can exploit this timing side-channel to recover secret API keys byte-by-byte over high-precision network measurements.

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
`if (req.header('x-api-key') === process.env.API_KEY)`
This is vulnerable to microsecond-level timing analysis.

### 🛠️ Proposed Solution & Technical Specification
1. Use Node.js built-in `crypto.timingSafeEqual`:
   ```typescript
   import crypto from 'crypto';

   function constantTimeCompare(a: string, b: string): boolean {
     const bufA = Buffer.from(a);
     const bufB = Buffer.from(b);
     if (bufA.length !== bufB.length) {
       // Perform dummy comparison to equalize timing
       crypto.timingSafeEqual(bufA, bufA);
       return false;
     }
     return crypto.timingSafeEqual(bufA, bufB);
   }
   ```
2. Replace all sensitive token and API key comparisons across backend with `constantTimeCompare`.

### 📁 Affected Files & Modules
- `backend/src/app.ts`: API key authentication
- `backend/src/github.ts`: Webhook signature comparison
- `backend/src/utils/crypto.ts`: Reusable constant-time utility

### ✅ Acceptance Criteria
- [ ] All API key and HMAC secret comparisons use `crypto.timingSafeEqual`.
- [ ] Comparison executes in constant time regardless of how many leading bytes match.
- [ ] Zero functional regression in valid API key authentication.

### 🧪 Testing & Verification Plan
- Unit test verifying true/false outputs on identical and differing strings.
- Code review verification that no raw `===` is used for authentication credentials.

### 🔒 Security, Reliability & Performance Considerations
Closes cryptographic side-channel vulnerability in compliance with OWASP Top 10."""
    },
    {
        "title": "feat(security): Implement replay attack prevention using nonce or ledger sequence validation",
        "labels": ["enhancement", "security"],
        "body": """### 🎯 Summary & Context
When contributors sign transaction intents or off-chain authorization payloads for backend processing, a malicious observer or compromised intermediary could intercept the signed message and broadcast it repeatedly (replay attack).

Implementing strict replay protection using cryptographic nonces and maximum ledger sequence validity windows guarantees that each signed payload can be executed exactly once.

### 🔍 Current Behavior & Root Cause
Currently, signed auth requests verify the signature against the contributor's public key, but do not assert single-use nonces or time-to-live expiration bounds in off-chain API endpoints.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/schemas/auth.ts`:
   - Require signed payload to include:
     - `nonce`: UUIDv4 or random 32-byte hex string.
     - `ledger_sequence`: Current Stellar ledger sequence.
     - `max_ledger`: Expiration ledger (e.g. `current + 100`, ~8 minutes).
2. In `backend/src/middleware/replayProtection.ts`:
   - Verify current network ledger is `< max_ledger`.
   - Store observed `nonce` in Redis with TTL equal to expiration window.
   - If `nonce` already exists in Redis, reject transaction with `409 Conflict: Transaction payload already consumed`.
3. Atomic check-and-set via Redis `SET nonce 1 EX 600 NX`.

### 📁 Affected Files & Modules
- `backend/src/middleware/replayProtection.ts`: Replay validator
- `backend/src/schemas/auth.ts`: Signed payload schema
- `docs/security-model.md`: Replay protection architecture

### ✅ Acceptance Criteria
- [ ] Signed payloads older than 100 ledgers rejected with 400 Bad Request.
- [ ] Submitting the same signed payload twice rejected with 409 Conflict.
- [ ] Expired nonces automatically purged from Redis memory via TTL.

### 🧪 Testing & Verification Plan
- Unit test sending identical payload twice and asserting second submission fails.
- Test rejection of expired ledger sequences.

### 🔒 Security, Reliability & Performance Considerations
Protects contributors against unauthorized duplicated actions and front-running manipulations."""
    },
    {
        "title": "fix(security): Update Semgrep ruleset in .semgrep.yml to detect hardcoded Stellar secret keys",
        "labels": ["bug", "security"],
        "body": """### 🎯 Summary & Context
In `.semgrep.yml`, static security analysis rules scan for generic API keys and SQL injection patterns, but lack specialized patterns to detect hardcoded Stellar Ed25519 secret seeds (which always start with the character `S` and are 56 uppercase base32 characters: `S[A-Z2-7]{55}`).

Adding a dedicated Semgrep rule prevents developers from accidentally committing real Stellar private keys into source code, test files, or scripts.

### 🔍 Current Behavior & Root Cause
In `.semgrep.yml`:
Generic regex patterns miss Stellar secret key format because it uses RFC 4648 base32 without standard key prefixes like `sk_live_`.

### 🛠️ Proposed Solution & Technical Specification
1. In `.semgrep.yml`:
   - Add rule `stellar-hardcoded-secret-seed`:
     ```yaml
     rules:
       - id: hardcoded-stellar-secret-seed
         patterns:
           - pattern-regex: '(?<![A-Za-z0-9])S[A-Z2-7]{55}(?![A-Za-z0-9])'
         message: "Potential hardcoded Stellar secret key detected! Never commit private keys."
         severity: ERROR
         languages: [javascript, typescript, python, rust, yaml, json]
         paths:
           exclude:
             - "**/__mocks__/**"
             - "**/test_data/**"
     ```
2. Verify rule detects test seed strings and test against repository codebase.

### 📁 Affected Files & Modules
- `.semgrep.yml`: Static analysis ruleset
- `.gitleaks.toml`: Gitleaks regex alignment
- `docs/sast.md`: SAST documentation

### ✅ Acceptance Criteria
- [ ] Semgrep detects 56-char `S...` Stellar secret keys across all source files.
- [ ] Excludes documented public testnet mocks.
- [ ] CI step `security.yml` runs rule on every PR.

### 🧪 Testing & Verification Plan
- Add fake test seed in temporary file and verify `semgrep --config .semgrep.yml` flags error.

### 🔒 Security, Reliability & Performance Considerations
Prevents severe catastrophic private key leakage in open-source git history."""
    },
    {
        "title": "fix(security): Enforce Content Security Policy (CSP) headers in backend response middleware",
        "labels": ["bug", "security"],
        "body": """### 🎯 Summary & Context
HTTP response headers returned by the backend currently lack a Content Security Policy (CSP) header, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.

Without strict CSP headers, browsers accessing backend documentation or web views are vulnerable to Cross-Site Scripting (XSS), clickjacking, and MIME-type confusion attacks.

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
`helmet` is either not installed or invoked with empty default options that omit CSP configuration.

### 🛠️ Proposed Solution & Technical Specification
1. Install and configure `helmet` in `backend/src/app.ts`:
   ```typescript
   app.use(helmet({
     contentSecurityPolicy: {
       directives: {
         defaultSrc: ["'self'"],
         scriptSrc: ["'self'", "'unsafe-inline'"],
         styleSrc: ["'self'", "'unsafe-inline'"],
         imgSrc: ["'self'", "data:", "https://avatars.githubusercontent.com"],
         connectSrc: ["'self'", "https://horizon-testnet.stellar.org", "https://horizon.stellar.org"],
         frameAncestors: ["'none'"],
         objectSrc: ["'none'"],
       },
     },
     referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
     xContentTypeOptions: true,
     xFrameOptions: { action: 'deny' },
   }));
   ```
2. Test Swagger `/docs` endpoint to ensure UI assets load properly under CSP rules.

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Helmet middleware
- `backend/package.json`: Add helmet
- `docs/security-checklist.md`: Header compliance

### ✅ Acceptance Criteria
- [ ] `Content-Security-Policy` header present on all HTTP responses.
- [ ] `X-Frame-Options: DENY` prevents clickjacking.
- [ ] `X-Content-Type-Options: nosniff` enforced.
- [ ] Swagger API documentation UI functions properly without CSP violations.

### 🧪 Testing & Verification Plan
- Send curl request and inspect response headers: `curl -I http://localhost:3000/api/health`.
- Test Mozilla Observatory / securityheaders.com score.

### 🔒 Security, Reliability & Performance Considerations
Hardens defense-in-depth against client-side exploitation vectors."""
    },
    {
        "title": "feat(security): Add audit log signature verification in auditService",
        "labels": ["enhancement", "security"],
        "body": """### 🎯 Summary & Context
In `backend/src/services/auditService.ts`, all administrative, maintainer, and workload cap events are written to an append-only audit log table. However, audit records are not cryptographically sealed.

If an attacker gains unauthorized database access, they could alter historical audit rows or delete entries to cover their tracks. Implementing cryptographic signature chaining (hash chaining / HMAC seal) proves log immutability.

### 🔍 Current Behavior & Root Cause
Audit rows have `id`, `event_type`, `payload`, `timestamp`. Rows can be modified by any database user with write permissions without detection.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/services/auditService.ts`:
   - Implement hash-chaining pattern:
     - Each audit log entry computes: `entry_hash = SHA256(previous_entry_hash + event_type + payload + timestamp)`.
     - Sign the entry hash using server HMAC secret or KMS private key: `signature = HMAC_SHA256(entry_hash, AUDIT_SECRET)`.
   - Store `previous_hash`, `entry_hash`, and `signature` in the database row.
2. Provide verification endpoint `GET /api/v1/audit/verify`:
   - Iterates through log entries, recalculates chain hashes, and asserts zero broken links or tampered signatures.

### 📁 Affected Files & Modules
- `backend/src/services/auditService.ts`: Hash chaining and signing
- `migrations/9_add_audit_signatures.js`: Database migration
- `backend/src/routes/audit.ts`: Verification endpoint
- `docs/security-model.md`: Audit security architecture

### ✅ Acceptance Criteria
- [ ] Every audit log entry is linked to previous entry hash.
- [ ] Modifying any field in a historical audit row causes chain verification to fail.
- [ ] Verification endpoint confirms 100% chain integrity.
- [ ] Down-migration supported cleanly.

### 🧪 Testing & Verification Plan
- Unit test inserting 10 audit records and verifying chain integrity.
- Modify a payload byte in DB and assert verification detects tampering.

### 🔒 Security, Reliability & Performance Considerations
Provides tamper-evident cryptographic compliance records for enterprise governance audits."""
    },
    {
        "title": "fix(security): Sanitize user input in GitHub issue webhook handler to prevent SSRF",
        "labels": ["bug", "security"],
        "body": """### 🎯 Summary & Context
In `backend/src/github.ts`, the GitHub webhook handler processes issue URLs (e.g. `issue.url` or `issue.html_url`) received in webhook event payloads and subsequently makes HTTP fetch requests to retrieve issue metadata or organization details.

Without strict URL domain and IP whitelist validation, an attacker spoofing or triggering webhooks could supply internal addresses (`http://169.254.169.254/latest/meta-data/` or `http://localhost:5432`), causing Server-Side Request Forgery (SSRF) and cloud metadata credential theft.

### 🔍 Current Behavior & Root Cause
In `backend/src/github.ts`:
The code executes `await fetch(payload.issue.url, ...)` directly. If the URL points to AWS metadata or internal microservices, the Node.js server fetches internal sensitive endpoints.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/github.ts`:
   - Implement strict URL validation:
     ```typescript
     function validateGitHubApiUrl(rawUrl: string): URL {
       const parsed = new URL(rawUrl);
       if (parsed.protocol !== 'https:') {
         throw new Error('Only HTTPS protocol allowed');
       }
       if (parsed.hostname !== 'api.github.com') {
         throw new Error('Target host must be api.github.com');
       }
       return parsed;
     }
     ```
   - Block private IP ranges (RFC 1918, link-local 169.254.x.x, loopback).
2. Validate and verify HMAC signature on incoming webhooks (`X-Hub-Signature-256`) *before* parsing JSON payload.

### 📁 Affected Files & Modules
- `backend/src/github.ts`: URL sanitizer and HMAC verification
- `backend/src/__tests__/githubWebhook.test.ts`: SSRF test cases
- `docs/security.md`: Webhook security guidelines

### ✅ Acceptance Criteria
- [ ] Webhook handler rejects non-HTTPS URLs and URLs outside `api.github.com`.
- [ ] Attempts to query AWS metadata service or localhost are blocked immediately.
- [ ] Webhook signature verified before URL resolution.
- [ ] Zero SSRF vulnerabilities flagged in security scans.

### 🧪 Testing & Verification Plan
- Test submitting payload with `http://169.254.169.254` and assert request is rejected.
- Verify legitimate `api.github.com` requests succeed.

### 🔒 Security, Reliability & Performance Considerations
Eliminates critical cloud credential theft risk in containerized AWS environments."""
    },
    {
        "title": "feat(security): Add automated secret rotation runbook for Stellar admin keypair",
        "labels": ["documentation", "security"],
        "body": """### 🎯 Summary & Context
In the event that an administrator private key is suspected of compromise, or as part of scheduled 90-day security key hygiene, the team must execute an emergency admin key rotation.

Soroban smart contracts use a two-step admin transfer pattern (`propose_admin` -> `accept_admin`). Documenting an automated runbook and CLI script ensures the team can execute key rotation safely under high stress without causing platform downtime.

### 🔍 Current Behavior & Root Cause
The two-step functions exist in `src/lib.rs`, but there is no unified CLI script or end-to-end operational runbook documenting the sequence of steps, environment variable updates in AWS Secrets Manager, and backend restart procedures.

### 🛠️ Proposed Solution & Technical Specification
1. Create `docs/runbooks/admin-key-rotation.md`:
   - Phase 1: Generate fresh Ed25519 keypair securely (`stellar keys generate`).
   - Phase 2: Call `proload_admin(current_admin, new_admin)`.
   - Phase 3: Call `accept_admin(new_admin)` from new key.
   - Phase 4: Verify on-chain admin address via `get_admin()`.
   - Phase 5: Update AWS Secrets Manager secret `workload-governor/production`.
   - Phase 6: Gracefully restart backend pods and verify health.
2. Provide executable script `scripts/rotate-admin-key.sh` automating Phase 1–4 with verification checks.

### 📁 Affected Files & Modules
- `docs/runbooks/admin-key-rotation.md`: Step-by-step runbook
- `scripts/rotate-admin-key.sh`: Automation script
- `docs/admin-guide.md`: Cross-link runbook

### ✅ Acceptance Criteria
- [ ] Complete runbook published with error recovery steps and rollback criteria.
- [ ] Automated script executes two-step transfer and validates on-chain storage.
- [ ] Zero downtime for active contributors during rotation.
- [ ] Tested on testnet environment.

### 🧪 Testing & Verification Plan
- Execute `scripts/rotate-admin-key.sh` on testnet and verify contract reflects new admin.

### 🔒 Security, Reliability & Performance Considerations
Two-step propose/accept pattern eliminates risk of accidentally transferring admin rights to an invalid or unrecoverable address."""
    },
    {
        "title": "fix(security): Enforce HTTPS-only transport and HSTS headers in production environment",
        "labels": ["bug", "security"],
        "body": """### 🎯 Summary & Context
When operating in production behind an AWS Application Load Balancer or Cloudflare, HTTP requests must be automatically redirected to HTTPS, and the server must emit HTTP Strict Transport Security (HSTS) headers.

Without HSTS, clients are vulnerable to SSL stripping attacks (e.g. Moxie Marlinspike SSLstrip) and man-in-the-middle packet eavesdropping on public Wi-Fi networks.

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
There is no HSTS header configuration, and requests sent over plain HTTP are processed without redirection if SSL termination is misconfigured.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/app.ts`:
   - Trust reverse proxy headers: `app.set('trust proxy', 1)`.
   - Add HTTPS enforcement middleware in production:
     ```typescript
     if (process.env.NODE_ENV === 'production') {
       app.use((req, res, next) => {
         if (req.header('x-forwarded-proto') !== 'https') {
           return res.redirect(301, `https://${req.header('host')}${req.url}`);
         }
         next();
       });
     }
     ```
   - Configure HSTS header via Helmet:
     ```typescript
     hsts: {
       maxAge: 31536000, // 1 year
       includeSubDomains: true,
       preload: true
     }
     ```

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Middleware and HSTS configuration
- `infra/logs_and_alarms.tf`: ALB redirect verification
- `docs/security.md`: Transport security documentation

### ✅ Acceptance Criteria
- [ ] Plain HTTP requests receive HTTP 301 Permanent Redirect to HTTPS.
- [ ] `Strict-Transport-Security` header emitted with `max-age=31536000; includeSubDomains; preload`.
- [ ] Zero plain-text communication permitted in production.

### 🧪 Testing & Verification Plan
- Send curl with `X-Forwarded-Proto: http` and assert 301 response to https.
- Verify `Strict-Transport-Security` header present.

### 🔒 Security, Reliability & Performance Considerations
Protects user credentials, API keys, and session cookies against transport layer eavesdropping."""
    }
]

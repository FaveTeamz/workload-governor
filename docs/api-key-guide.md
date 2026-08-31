# API Key Management Guide

The WorkloadGovernor REST API uses a static admin token (`x-admin-token`) to
protect privileged endpoints. This guide covers the full lifecycle of that
token: creation, secure storage, rotation, scoping, and incident response.

For the admin endpoints themselves, see [docs/api-reference.md](api-reference.md).
For the admin key rotation runbook (on-chain admin address), see
[docs/runbooks/admin-key-rotation.md](runbooks/admin-key-rotation.md).

---

## Prerequisites

- Access to the server environment where the backend service runs (or the
  secrets manager it reads from).
- Ability to restart or redeploy the backend service after a token change.
- `curl` or equivalent HTTP client to test the new token.

---

## What is the admin token?

The `ADMIN_TOKEN` environment variable is the shared secret that authenticates
REST API calls to admin-only endpoints (e.g. `POST /api/admin/maintainers`).
It is **not** the same as the Stellar admin keypair — it is purely a backend
service credential.

| Concept | What it controls |
|---|---|
| `ADMIN_TOKEN` (REST) | Access to the backend REST admin endpoints |
| Admin Stellar keypair | Authority to call admin contract functions on-chain |

Both must be protected independently. Compromising one does not automatically
compromise the other.

---

## Creating an API Key

An API key is a randomly generated secret string. The backend reads it from the
`ADMIN_TOKEN` environment variable at startup.

### Step 1 — Generate a cryptographically random token

```bash
# Generate a 32-byte (256-bit) token encoded as hex
openssl rand -hex 32
# Example output: a3f1e8c2d9b047e61f5a3c2d8b9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7

# Or base64-encoded (shorter, equally secure)
openssl rand -base64 32
# Example output: 4X+8Rv1mKp3nQs7Yw2Tz6LjNhOdFgCbIeUvWxAqMkZo=
```

Never use guessable values (usernames, project names, UUIDs v4 from non-CSPRNG
sources). Use `openssl rand` or an equivalent CSPRNG.

### Step 2 — Store the token (see [Secure Storage](#secure-storage))

### Step 3 — Set the environment variable and restart the service

```bash
# Example: export directly in the shell where the service runs (non-persistent)
export ADMIN_TOKEN="a3f1e8c2d9b047e61f5a3c2d8b9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7"

# Example: inject via systemd service file
# In /etc/systemd/system/workload-governor.service:
# [Service]
# EnvironmentFile=/run/secrets/workload-governor.env
```

### Step 4 — Verify the token works

```bash
# A correct token returns 201; a wrong token returns 401
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://<your-host>/api/admin/maintainers \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"address":"GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST","org_id":"smoke_test"}'
# Expected: 201
```

---

## Secure Storage

Never commit the token to source control. Choose a storage method appropriate
for your deployment.

### Environment variables (minimum acceptable)

Set `ADMIN_TOKEN` in the process environment. Do not write the value into
`.env` files committed to the repository.

```bash
# .env.example (safe to commit — no real values)
ADMIN_TOKEN=your-secret-token-here
```

Add `.env` to `.gitignore` and verify it is not tracked:

```bash
grep '\.env' .gitignore  # must return at least one matching line
git ls-files .env        # must return nothing
```

### AWS Secrets Manager (recommended for production)

```bash
# Store the token
aws secretsmanager create-secret \
  --name workload-governor/admin-token \
  --secret-string "$ADMIN_TOKEN" \
  --region us-east-1

# Retrieve it in a deployment script
ADMIN_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id workload-governor/admin-token \
  --query SecretString \
  --output text \
  --region us-east-1)
export ADMIN_TOKEN
```

Attach an IAM policy that grants `secretsmanager:GetSecretValue` only to the
backend service's execution role. No human principal should have read access in
production.

### HashiCorp Vault

```bash
# Write the token
vault kv put secret/workload-governor/admin-token value="$ADMIN_TOKEN"

# Read it (e.g. from a deployment pipeline)
ADMIN_TOKEN=$(vault kv get -field=value secret/workload-governor/admin-token)
export ADMIN_TOKEN
```

### Summary — storage options

| Method | Suitable for | Notes |
|---|---|---|
| Environment variable | Local dev, simple VMs | Token lives in process memory; ensure no core dumps |
| `.env` file on disk | Single-server staging | Restrict permissions: `chmod 600 .env` |
| AWS Secrets Manager | Production (AWS) | Rotate without redeployment; audit trail via CloudTrail |
| HashiCorp Vault | Production (multi-cloud) | Dynamic secrets, fine-grained policies |
| GitHub Actions Secrets | CI/CD pipelines | Masked in logs; rotate after any public fork |

---

## Key Permissions and Scope

The `x-admin-token` is a single shared secret — there are no per-scope or
per-user tokens at the REST layer. All holders of the token have full access to
every admin endpoint.

**Endpoints gated by `x-admin-token`**

| Endpoint | Action |
|---|---|
| `POST /api/admin/maintainers` | Register a maintainer for an organisation |
| `DELETE /api/admin/maintainers/:address` | Deregister a maintainer |

Read endpoints (`GET /api/issues`, `GET /api/contributors/…`) do not require
the token.

**Access control recommendations**

- Grant the token only to automated systems (CI/CD, backend service) and
  designated operators.
- Do not paste the token into chat, email, or shared documents.
- Use separate tokens for staging and production environments — never share the
  same value across environments.
- If your deployment supports per-caller audit logging, route admin API calls
  through a proxy that logs the originating identity before forwarding with the
  token.

---

## Key Rotation Procedure

Rotate the `ADMIN_TOKEN` on a regular schedule and immediately after any
suspected compromise. A rotation replaces the live token with zero downtime by
using a brief overlap window.

### When to rotate

| Trigger | Action |
|---|---|
| Routine (every 90 days) | Planned rotation following this procedure |
| Personnel change | Rotate whenever someone with token access leaves |
| Token exposed in logs or source control | Immediate rotation — see [Compromised Key Response](#compromised-key-response) |
| Security audit finding | Rotate within 24 hours of confirmed finding |

### Rotation steps

1. Generate a new token:

   ```bash
   NEW_TOKEN=$(openssl rand -hex 32)
   echo "New token: $NEW_TOKEN"
   ```

2. Store the new token in your secrets manager (do not delete the old one yet):

   ```bash
   # AWS Secrets Manager — update in place
   aws secretsmanager update-secret \
     --secret-id workload-governor/admin-token \
     --secret-string "$NEW_TOKEN" \
     --region us-east-1
   ```

3. Restart or redeploy the backend service so it picks up the new token:

   ```bash
   # Example: rolling restart on ECS
   aws ecs update-service \
     --cluster workload-governor \
     --service backend \
     --force-new-deployment \
     --region us-east-1
   ```

4. Verify the new token works:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -X POST https://<your-host>/api/admin/maintainers \
     -H "Content-Type: application/json" \
     -H "x-admin-token: $NEW_TOKEN" \
     -d '{"address":"GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST","org_id":"rotation_verify"}'
   # Expected: 201
   ```

5. Confirm the old token is rejected:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -X POST https://<your-host>/api/admin/maintainers \
     -H "Content-Type: application/json" \
     -H "x-admin-token: $OLD_TOKEN" \
     -d '{"address":"GMAIN7BFZLPQKRSUVWXY2ACDEJHK3MNO4PQRS5TUVWXYZ6ABCDTEST","org_id":"should_fail"}'
   # Expected: 401
   ```

6. Update any CI/CD pipelines, scripts, and other systems that hold the old
   token. For GitHub Actions:
   - Go to **Settings → Secrets and variables → Actions**.
   - Update `ADMIN_TOKEN` (or the relevant secret name) with `$NEW_TOKEN`.
   - Trigger a smoke-test workflow to confirm it still passes.

7. Delete or archive the old token from your secrets manager.

### Rotation checklist

- [ ] New token generated with CSPRNG (`openssl rand`)
- [ ] New token stored in secrets manager
- [ ] Service restarted and picks up new token
- [ ] New token verified: `201` on a valid admin request
- [ ] Old token verified: `401` on the same request
- [ ] CI/CD secrets updated
- [ ] Old token deleted from secrets manager
- [ ] Rotation recorded in change-management log

---

## Compromised Key Response

If the `ADMIN_TOKEN` is leaked (found in logs, source control, a public paste,
or reported by a third party), treat it as a P1 incident and act immediately.

### Step 1 — Revoke the exposed token now

Do not wait to understand the full scope. Rotate the token immediately using
the [rotation steps](#rotation-steps) above. A new token can be deployed in
under five minutes.

### Step 2 — Audit recent admin API usage

Check your access logs or CloudTrail for calls to admin endpoints made with the
exposed token:

```bash
# Example: grep access logs for admin endpoint calls (adjust path for your setup)
grep 'POST /api/admin' /var/log/workload-governor/access.log | tail -200

# Example: CloudTrail — query API Gateway or ALB access logs via Athena or S3
```

Look for unexpected registrations or deregistrations of maintainers. Note the
timestamps and source IPs of any suspicious requests.

### Step 3 — Audit on-chain state

Cross-reference REST log findings with on-chain maintainer state. Check for
maintainers you did not register:

```bash
# Query whether an unexpected address is registered for a sensitive org
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network mainnet \
  -- is_assigned \
  --contributor <SUSPECT_ADDRESS> \
  --org_id <ORG_ID> \
  --issue_id 1
```

If unauthorised maintainers were registered via the REST API, deregister them
using `deregister_maintainer` — see [docs/admin-guide.md](admin-guide.md#maintainer-offboarding).

### Step 4 — Determine exposure scope

| Question | Where to check |
|---|---|
| When was the token first exposed? | Git history, CI log timestamps, paste-site date |
| Which systems had access to the token? | Secrets manager audit trail |
| Are there unauthorised maintainer registrations? | Step 3 above |
| Were any issues assigned under compromised maintainers? | Contract `is_assigned` queries |

### Step 5 — Remediate and document

1. Remove any unauthorised maintainers from the contract.
2. Review and revoke any assignments made by unauthorised maintainers.
3. File an incident report with: timeline, scope of impact, remediation steps
   taken, and process changes to prevent recurrence.
4. Update your secrets rotation schedule if the exposure resulted from an
   overdue rotation.

### Summary — response timeline

| Time | Action |
|---|---|
| T+0 | Rotate token (Steps 1 of rotation procedure) |
| T+5 min | Confirm old token returns `401` |
| T+15 min | Audit access logs for suspicious calls |
| T+30 min | Audit on-chain maintainer state |
| T+24 h | Incident report filed and process review complete |

---

## Security Best Practices

**Token hygiene**

- Use at least 256 bits of entropy (`openssl rand -hex 32` or `-base64 32`).
- Never reuse tokens across environments (dev / staging / production).
- Never include the token in URL query parameters — HTTP servers log URLs.
  Always pass it as the `x-admin-token` header.
- Treat the token like a password: never print it to stdout in scripts that
  are logged or shared.

**Transport security**

- All admin API calls must use HTTPS. Never send `x-admin-token` over plain
  HTTP. Reject or redirect unencrypted connections at the load balancer.
- Verify TLS certificates; do not use `curl -k` (`--insecure`) in production
  scripts.

**Access control**

- Follow least-privilege: grant `ADMIN_TOKEN` only to systems and people who
  genuinely need to register or deregister maintainers.
- Keep a register of every system and person that holds the token; this
  register is your scope list if the token is ever compromised.
- For staging environments, use a completely different token that has no
  influence on production on-chain state.

**Monitoring and alerting**

- Alert on any `401` spike against admin endpoints — unexpected failures may
  indicate a rotation error or an active brute-force attempt.
- Alert on successful admin requests that originate from unexpected IP ranges.
- Enable CloudTrail or equivalent audit logging for your secrets manager so
  token reads are traceable to a specific principal.

**Rotation cadence**

| Environment | Recommended maximum age |
|---|---|
| Production | 90 days |
| Staging | 180 days |
| CI/CD (GitHub Actions secret) | 90 days, or after every personnel change |

Set calendar reminders. Treat an overdue rotation the same as a suspected
compromise.

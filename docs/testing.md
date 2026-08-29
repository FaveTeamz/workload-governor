# Testing Guide

This document covers the testing strategy and setup for the WorkloadGovernor backend, with a focus on the OpenAPI contract tests introduced in issue #624.

---

## Test Suite Overview

| Suite | Location | Runner | Purpose |
|---|---|---|---|
| Unit | `tests/unit/` | Jest (`unit` project) | Business logic, utilities, XDR verification |
| API integration | `tests/api/` | Jest (`api` project) | Route handlers with in-memory DB mock |
| Contract | `tests/contract/` | Jest (`contract` project) | OpenAPI response-shape validation |
| Route smoke | `tests/routes/` | Jest (`jest.config.ts`) | Basic request/response smoke checks |
| E2E | `tests/e2e/` | Playwright | Full frontend/backend user flows |
| Load | `tests/load/` | k6 | Throughput and latency benchmarks |

---

## Running Tests

```bash
# All jest projects (unit + api + contract)
npm test

# Unit tests only
npm run test:unit

# Contract tests only
npm run test:contract

# Coverage (backend)
npm run coverage:backend
```

---

## OpenAPI Contract Tests

### Purpose

Contract tests ensure that every HTTP response produced by the API conforms to the schemas defined in [`openapi.yaml`](../openapi.yaml). When a backend developer changes a response field name, type, or required field, the contract tests fail — preventing silent schema drift from reaching the frontend.

### How It Works

The setup uses [`express-openapi-validator`](https://github.com/cdimascio/express-openapi-validator) as a **response-validation middleware** wrapped around the real Express application. Supertest sends requests through the validated app in-process — no running server or network is required.

```
Supertest request
      │
      ▼
┌─────────────────────────────────────────┐
│  express-openapi-validator (wrapper)    │
│  validateRequests: false                │
│  validateResponses: true  ◄─ enforces  │
│           │               openapi.yaml  │
│           ▼                             │
│  Real Express app (createApp())         │
│  (routes/middleware run normally)       │
└─────────────────────────────────────────┘
      │
      ▼
  If response body doesn't match spec:
  → validator emits an error
  → test receives 500 instead of expected 2xx/4xx
  → test fails with a clear schema-mismatch message
```

Request validation is intentionally disabled (`validateRequests: false`) because it is already covered by existing integration tests.

### Test File

**`tests/contract/openapi.contract.test.ts`**

Endpoints covered:

| Endpoint | Success status | Error cases |
|---|---|---|
| `GET /health` | 200 | — |
| `GET /orgs` | 200 | — |
| `GET /orgs/:orgId/issues` | 200 | 404 unknown org |
| `GET /orgs/:orgId/assignments` | 200 | 404 unknown org |
| `GET /orgs/:orgId/applications` | 200 | 404 unknown org |
| `POST /orgs/:orgId/issues/:issueId/apply` | 201 | 400 missing/invalid body, 404 unknown org |
| `DELETE /orgs/:orgId/issues/:issueId/apply` | 204 | 400 missing param, 404 unknown org |
| `GET /orgs/:orgId/events` | 200 | 404 unknown org |
| `GET /contributors/:address/stats` | 200 | — |

### Adding a New Contract Test

1. Identify the endpoint path in `openapi.yaml`.
2. Add a `describe` block in `tests/contract/openapi.contract.test.ts`.
3. Use `request(validatedApp)` — if the response body diverges from the spec, the test will fail automatically.

Example:

```typescript
describe('Contract: GET /orgs/:orgId/assignments', () => {
  it('200 response matches Assignment schema', async () => {
    const res = await request(validatedApp)
      .get('/orgs/stellar-oss/assignments')
      .set({ Authorization: 'Bearer test-token' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // express-openapi-validator has already checked every field — these
    // assertions are additional semantic guards, not schema re-checks.
    for (const asgn of res.body) {
      expect(typeof asgn.assignment_id).toBe('string');
    }
  });
});
```

### Mocking Strategy

The contract tests do **not** require a real PostgreSQL or Redis instance. The following modules are mocked at the top of the test file:

| Module | Mock |
|---|---|
| `../../src/db` | In-memory no-op pool (`pool.query` returns `{ rows: [] }`) |
| `../../src/services/redis` | No-op cache (`getCache` returns `null`, `setCache` is a no-op) |
| `node-pg-migrate` | Jest virtual module (prevents `require` failure at boot) |

Stub data for known organisations and events is hard-coded directly in the route handlers in `src/routes/orgs.ts`, so the tests run against realistic fixture data without touching any external service.

---

## CI Integration

### `ci.yml` (runs on every push/PR to `main`)

```yaml
- run: npm run test:contract
```

This step runs after the main test suite and fails the build if any contract test diverges from the spec.

### `openapi-validate.yml` (runs on PRs that touch routes or the spec)

Two jobs run in parallel:

| Job | What it does |
|---|---|
| `contract-tests` | Runs `npm run test:contract` — fast, in-process, no server needed |
| `validate-api` | Starts the full compiled server and runs Dredd live-request validation |

---

## OpenAPI Spec (`openapi.yaml`)

The spec lives at the root of the repository. Key constraints enforced by the contract tests:

- `Issue.description` is `nullable: true` — the field may be `null` or omitted.
- `Error.code` is `type: string` — human-readable error codes like `NOT_FOUND`.
- `GET /orgs/:orgId/events` returns a **top-level array** of `Event` objects.
- `POST /orgs/:orgId/issues/:issueId/apply` returns **201 Created**.

If you change a response schema in `openapi.yaml`, update the corresponding route handler and re-run `npm run test:contract` to verify alignment.

---

## Schema Drift Prevention Checklist

When adding or modifying an endpoint:

1. Update `openapi.yaml` first (spec-first approach).
2. Implement the route handler to match the spec.
3. Run `npm run test:contract` — all tests must pass.
4. If a new endpoint is added, add a contract test in `tests/contract/openapi.contract.test.ts`.
5. Open a PR — the CI `contract-tests` job will re-verify on every change.

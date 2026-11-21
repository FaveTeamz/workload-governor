# Category 2: Backend API & Middleware (Node.js / Express / TS) - 11 issues

BACKEND_ISSUES = [
    {
        "title": "fix(backend): Handle unhandled client disconnects in rate-limiting middleware",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
In `backend/src/app.ts`, the Express rate-limiting middleware does not monitor client connection termination events (`req.on('close')`). When a client aborts an in-flight HTTP request prematurely (e.g. user closes browser tab or cancels a fetch request), the rate-limiter still counts the request against the client's token bucket or quota, while downstream async handlers may leak memory or attempt to write headers to a closed socket.

### 🔍 Current Behavior & Root Cause
If a client initiates a request and disconnects before the response completes:
1. The rate-limiter consumes one request quota unit regardless of whether work was completed.
2. Downstream handlers continue processing database or RPC calls.
3. Attempting to write response headers causes `ERR_HTTP_HEADERS_SENT` or unhandled socket write errors in logs.

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/app.ts` (or middleware module):
   - Wrap rate-limiting logic with a connection state listener on `req.on('close', ...)`.
   - If `req.destroyed` is true before the request handler finishes, terminate processing cleanly without throwing unhandled exceptions.
   - For idempotent endpoints, adjust rate limiter decrement strategy or log client aborts with `logger.warn({ reqId: req.id }, "Client disconnected before response completed")`.
2. Ensure Express error-handling middleware catches broken pipe / aborted connection socket errors (`ECONNRESET`, `EPIPE`).

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Express application setup and middleware chain
- `backend/src/logger.ts`: Logger formatting for aborted requests
- `backend/src/__tests__/app.test.ts`: Integration tests for client disconnects

### ✅ Acceptance Criteria
- [ ] Client aborts do not cause uncaught `ERR_HTTP_HEADERS_SENT` exceptions.
- [ ] Appropriate warning log with request correlation ID is recorded on abort.
- [ ] Connection resources and socket handles are freed immediately upon client disconnect.
- [ ] Test simulation of aborted requests passes without process crashes.

### 🧪 Testing & Verification Plan
- Run unit test simulating client socket termination during slow response.
- Verify zero unhandled promise rejections in Pino logs.

### 🔒 Security, Reliability & Performance Considerations
Prevents resource exhaustion attacks where malicious clients initiate thousands of slow connections and drop them to exhaust Node.js event loop queues."""
    },
    {
        "title": "fix(backend): Remove stray src/EventHistoryTable.js from backend codebase",
        "labels": ["bug", "backend", "dx"],
        "body": """### 🎯 Summary & Context
A stray compiled JavaScript file `src/EventHistoryTable.js` exists in the backend source tree. This is an orphaned artifact from a previous frontend UI component build that was accidentally committed to the backend directory.

Leaving compiled frontend files inside the backend codebase creates confusion for contributors, pollutes TypeScript compilation outputs, triggers linting warnings, and may cause accidental bundling in Docker images.

### 🔍 Current Behavior & Root Cause
The file `backend/src/EventHistoryTable.js` or `src/EventHistoryTable.js` contains bundled React/JSX logic from the frontend `EventHistoryTable` component. It is not imported by `app.ts` or any backend service, but causes TypeScript compiler (`tsc`) and ESLint to inspect an unmanaged JS file.

### 🛠️ Proposed Solution & Technical Specification
1. Safely delete the orphaned file:
   `git rm src/EventHistoryTable.js` (or `backend/src/EventHistoryTable.js`).
2. Verify that no backend service or test imports this file.
3. Update `.gitignore` and `backend/.gitignore` to prevent compiled JSX/TSX artifacts from being committed into backend source folders.
4. Run `npm run build` and `npm run lint` in `backend/` to verify clean build.

### 📁 Affected Files & Modules
- `backend/src/EventHistoryTable.js` or `src/EventHistoryTable.js`
- `backend/.gitignore` / `.gitignore`
- `backend/package.json` build scripts

### ✅ Acceptance Criteria
- [ ] Stray `EventHistoryTable.js` file is removed from backend directory.
- [ ] `npm run lint` and `npm run build` pass cleanly without stray JS warnings.
- [ ] Git repository clean state verified.

### 🧪 Testing & Verification Plan
- Execute `npm run build` across backend.
- Execute `npm run lint` to verify zero orphan lint errors.

### 🔒 Security, Reliability & Performance Considerations
Reduces Docker container image size and ensures pristine separation between frontend React artifacts and Node.js backend services."""
    },
    {
        "title": "fix(backend): Release idempotency locks reliably on internal errors",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
In `backend/src/app.ts` and mutation handlers, an idempotency middleware prevents duplicate transaction submissions by locking requests using an `Idempotency-Key` header. However, if an unhandled internal exception or database timeout occurs while processing the request, the idempotency lock is never released or updated.

When this happens, any subsequent legitimate retries by the user within the TTL window are rejected with `409 Conflict: Request currently in progress`, permanently locking the user out of submitting their transaction.

### 🔍 Current Behavior & Root Cause
The idempotency locking pattern currently uses:
```typescript
await lockIdempotencyKey(key);
const result = await processRequest(req);
await unlockIdempotencyKey(key, result);
```
If `processRequest` throws an unhandled error or database error, control jumps directly to the global error handler, bypassing `unlockIdempotencyKey`. The key remains locked in Redis/memory until the default 24-hour expiration.

### 🛠️ Proposed Solution & Technical Specification
1. Implement a `try ... finally` block (or RAII lock pattern):
   ```typescript
   try {
     const result = await handler(req, res);
     await recordIdempotencySuccess(key, result);
   } catch (err) {
     await clearIdempotencyLock(key);
     throw err;
   }
   ```
2. For transient failures (5xx, timeouts), explicitly delete the idempotency lock key so the client can safely retry.
3. For deterministic client errors (4xx validation errors), cache the 4xx response against the idempotency key so repeat calls immediately receive the cached client error without re-executing logic.
4. Set an automatic TTL safety release on in-flight locks (e.g. 60 seconds).

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Idempotency middleware
- `backend/src/db.ts`: Database transaction management
- `backend/src/__tests__/idempotency.test.ts`: Idempotency lock recovery tests

### ✅ Acceptance Criteria
- [ ] Internal 500 error causes in-flight idempotency lock to be cleared immediately.
- [ ] Client can successfully retry submission after a server error without encountering false 409 conflicts.
- [ ] In-flight locks have a hard timeout (max 60s) after which they automatically expire.
- [ ] Unit tests verify lock release across both success and failure execution branches.

### 🧪 Testing & Verification Plan
- Simulate a route handler throwing an unhandled Error and assert key is released in Redis.
- Verify retried request with identical `Idempotency-Key` executes successfully after failure.

### 🔒 Security, Reliability & Performance Considerations
Guarantees resilience of critical user actions (such as issue applications and maintainer authorizations) against transient network glitches."""
    },
    {
        "title": "fix(backend): Sanitize and validate cursor pagination query parameters in org routes",
        "labels": ["bug", "backend", "security"],
        "body": """### 🎯 Summary & Context
The backend API endpoint `GET /api/orgs/:orgId/issues` supports cursor-based pagination via query parameters `?cursor=<cursor>&limit=<limit>`. However, input parsing currently casts the cursor and limit parameters without rigorous schema validation.

Passing malformed cursor strings (e.g. invalid base64, SQL injection payloads, or negative limits) causes unhandled database query exceptions or potential slow-query Denial of Service (DoS).

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts` (or route handlers):
`const limit = parseInt(req.query.limit as string) || 20;`
`const cursor = req.query.cursor as string;`
- Limit is not capped to a strict maximum (a user can request `?limit=100000`, causing PostgreSQL out-of-memory).
- Cursor string is decoded directly without verifying JSON/base64 structure or column types before embedding into SQL queries.

### 🛠️ Proposed Solution & Technical Specification
1. Create a Zod / Joi validation schema for pagination query parameters:
   - `limit`: integer, min 1, max 100, default 20.
   - `cursor`: optional string matching base64 regex `^[A-Za-z0-9+/=]+$`, decoding to `{ id: number, createdAt: string }`.
2. Reject invalid query parameters with `400 Bad Request` and detailed error details conforming to RFC 7807 problem details.
3. Sanitize cursor decoding with safe error handling: if cursor cannot be decoded or parsed as valid JSON, return clear 400 error rather than 500 internal server error.

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Route definitions
- `backend/src/routes/orgs.ts` / `src/routes/issues.ts`: Route controllers
- `backend/src/schemas/pagination.ts`: Pagination validation schema
- `backend/src/__tests__/pagination.test.ts`: Unit tests for valid/invalid cursors

### ✅ Acceptance Criteria
- [ ] Limit > 100 is rejected with 400 Bad Request.
- [ ] Non-numeric or negative limit values return 400 Bad Request.
- [ ] Malformed cursor string returns 400 Bad Request instead of 500 error.
- [ ] SQL queries use parameterized cursor offsets safely.

### 🧪 Testing & Verification Plan
- Unit test queries with limit=0, limit=-5, limit=10000.
- Unit test malformed base64 cursor strings and SQL injection payloads (`cursor=\' OR 1=1--`).

### 🔒 Security, Reliability & Performance Considerations
Protects database memory and query planner from unbounded result sets and injection vulnerabilities."""
    },
    {
        "title": "feat(backend): Implement redis-backed distributed token bucket rate limiter",
        "labels": ["enhancement", "backend", "performance"],
        "body": """### 🎯 Summary & Context
The backend currently relies on an in-memory rate limiter (`express-rate-limit` using memory store). As the WorkloadGovernor backend scales horizontally across multiple Kubernetes pod replicas behind an AWS Application Load Balancer, in-memory limits are fragmented: each pod maintains its own isolated counter, allowing clients to exceed global rate limits by rotating requests across pods.

Implementing a distributed Redis-backed token bucket algorithm enforces uniform, accurate rate limiting across all running backend instances.

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
The rate limiter uses default in-memory storage. In a 3-replica deployment, an attacker or bot can send 3x the intended request threshold before being throttled.

### 🛠️ Proposed Solution & Technical Specification
1. Integrate `ioredis` and a distributed token bucket or sliding-window log algorithm via Redis Lua script:
   - Atomic evaluation of current token count and time delta in a single Redis `EVAL` call.
   - Configure tiered limits:
     - Public read endpoints: 120 req/min per IP.
     - Contributor write endpoints (`/apply`, `/withdraw`): 30 req/min per Stellar address.
     - Webhook ingestion endpoint: 300 req/min with HMAC verification.
2. Standard rate limit headers returned in all responses:
   - `X-RateLimit-Limit`
   - `X-RateLimit-Remaining`
   - `X-RateLimit-Reset`
3. Fallback mechanism: if Redis is temporarily unreachable, fall back to localized in-memory rate limiting with warning logs to preserve availability.

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Rate limiter configuration
- `backend/src/services/rateLimiter.ts`: Redis token bucket implementation
- `backend/src/db.ts` / Redis connection manager
- `backend/src/__tests__/rateLimiter.test.ts`: Distributed rate limit tests

### ✅ Acceptance Criteria
- [ ] Rate limits are synchronized accurately across multiple concurrent backend worker processes.
- [ ] Standard HTTP 429 response returned when quota is exceeded, with `Retry-After` header.
- [ ] Graceful fallback to memory limiter if Redis connection is severed.
- [ ] Rate limit headers (`X-RateLimit-*`) present on all API responses.

### 🧪 Testing & Verification Plan
- Run concurrency test sending simultaneous requests across 2 mocked worker processes.
- Verify Redis keys expire correctly after the rate limit window.

### 🔒 Security, Reliability & Performance Considerations
Defends API against automated denial-of-service, brute-force scraping, and griefing attacks while providing transparent rate information to legitimate developers."""
    },
    {
        "title": "fix(backend): Gracefully handle Redis disconnection and automatic reconnect with exponential backoff",
        "labels": ["bug", "backend", "operations"],
        "body": """### 🎯 Summary & Context
When the Redis cache or rate-limiting cluster experiences a restart, network blip, or AWS ElastiCache failover, backend Node.js processes experience uncaught Redis connection errors and may crash or hang in-flight requests.

Building robust connection lifecycle handling with exponential backoff and jitter prevents service crashes and ensures uninterrupted backend availability during transient infrastructure disruptions.

### 🔍 Current Behavior & Root Cause
In `backend/src/db.ts` (or Redis client setup):
The Redis connection event listeners do not implement backoff parameters (`retryStrategy`). When disconnected:
1. Redis client floods server with immediate reconnection attempts.
2. Uncaught `ECONNREFUSED` events trigger unhandled error events if no error listener is bound.
3. Health check endpoints fail instantly, triggering Kubernetes pod restarts during a simple cache blip.

### 🛠️ Proposed Solution & Technical Specification
1. Configure `ioredis` with exponential backoff and jittered retry:
   ```typescript
   retryStrategy(times) {
     const delay = Math.min(times * 100 + Math.random() * 50, 3000);
     return delay;
   }
   ```
2. Attach explicit event handlers for `connect`, `ready`, `error`, `close`, `reconnecting`, and `end`.
3. In `backend/src/health.ts`:
   - Treat Redis as a non-fatal dependency for critical read paths if configured with fallback.
   - Return status `degraded` instead of `503 Service Unavailable` if only Redis is reconnecting while PostgreSQL is healthy.

### 📁 Affected Files & Modules
- `backend/src/db.ts`: Connection pool and Redis client configuration
- `backend/src/health.ts`: Readiness and liveness health probe handlers
- `backend/src/logger.ts`: Connection state log formatting

### ✅ Acceptance Criteria
- [ ] Redis disconnect emits warning logs without crashing Node.js process.
- [ ] Exponential backoff prevents thundering herd reconnection storms.
- [ ] Automatic reconnection succeeds when Redis service is restored.
- [ ] Health check reports `degraded` state during outage without failing Kubernetes liveness probe.

### 🧪 Testing & Verification Plan
- Test killing Redis container and restarting it while backend is under traffic.
- Verify backend resumes normal operation without requiring pod restarts.

### 🔒 Security, Reliability & Performance Considerations
High-availability resilience for production environments during cloud infrastructure maintenance windows."""
    },
    {
        "title": "feat(backend): Add streaming server-sent events (SSE) endpoint for live application updates",
        "labels": ["enhancement", "backend"],
        "body": """### 🎯 Summary & Context
Currently, frontend clients and maintainer dashboards must continuously poll the backend API every 5–10 seconds to detect when a contributor applies for an issue or an assignment status changes. Polling creates substantial database load and introduces a multi-second delay before users see status changes.

Implementing a Server-Sent Events (SSE) streaming endpoint provides a lightweight, real-time push mechanism for live application and assignment updates over standard HTTP.

### 🔍 Current Behavior & Root Cause
Frontend uses `useInterval` or manual refresh to query `GET /api/orgs/:orgId/issues` repeatedly. This consumes database IOPS and bandwidth on idle maintainer browser tabs.

### 🛠️ Proposed Solution & Technical Specification
1. Implement endpoint:
   `GET /api/events/stream?orgId=<orgId>&contributor=<contributor>`
2. Configuration & protocol details:
   - Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
   - Send initial keepalive comment (`: keepalive\n\n`) and periodic heartbeat every 25 seconds to prevent ALB gateway timeouts.
3. Event bus integration:
   - Subscribe to backend event dispatcher (Redis Pub/Sub or internal EventEmitter) powered by the Stellar event indexer.
   - Format messages:
     ```
     event: application_created
     data: {"orgId": "stellar", "issueId": 42, "contributor": "G...", "createdAt": "..."}
     ```
4. Client disconnect management:
   - Listen to `req.on('close')` and cleanly remove listener from event bus.

### 📁 Affected Files & Modules
- `backend/src/routes/events.ts`: SSE endpoint handler
- `backend/src/services/eventStreamService.ts`: Pub/sub and subscriber management
- `backend/src/app.ts`: Route registration
- `docs/api-reference.md`: Document SSE streaming specification

### ✅ Acceptance Criteria
- [ ] Clients can establish persistent SSE connections to `/api/events/stream`.
- [ ] Live contract events (apply, assign, complete, revoke) are pushed to subscribers within 500ms of ingestion.
- [ ] Periodic heartbeat prevents reverse-proxy idle disconnects.
- [ ] Client disconnect releases subscriber listener with zero memory leaks.

### 🧪 Testing & Verification Plan
- Integration test subscribing to SSE stream, publishing an event, and verifying reception.
- Stress test running 200 concurrent SSE connections for 60 seconds.

### 🔒 Security, Reliability & Performance Considerations
Limits max concurrent SSE streams per IP/client to 5 to avoid socket exhaustion. Uses standard HTTP GET compatible with CDNs and proxies."""
    },
    {
        "title": "fix(backend): Add request correlation ID tracing across all HTTP handlers and logs",
        "labels": ["bug", "backend", "observability"],
        "body": """### 🎯 Summary & Context
When debugging production incidents or tracking an asynchronous transaction flow from HTTP request down to database queries and Soroban RPC calls, logs currently lack a unified correlation ID. 

Tracing a specific user\'s failed request across interleaved log lines in AWS CloudWatch is time-consuming and error-prone without consistent correlation metadata.

### 🔍 Current Behavior & Root Cause
Logs output by `logger.ts` contain timestamps and messages, but no `reqId` or `traceId`. Incoming headers such as `X-Request-ID` or `traceparent` are not propagated through the asynchronous execution context (`AsyncLocalStorage`).

### 🛠️ Proposed Solution & Technical Specification
1. In `backend/src/tracing.ts` (or middleware):
   - Check incoming `X-Request-ID` header; if missing, generate a UUIDv4.
   - Set response header `X-Request-ID`.
   - Store correlation context in Node.js `AsyncLocalStorage`.
2. Configure Pino logger in `backend/src/logger.ts`:
   - Automatically inject `reqId` into every log statement emitted during the request lifecycle.
3. Propagate `reqId` to database query comments (`/* reqId: ... */`) and Soroban RPC request headers.

### 📁 Affected Files & Modules
- `backend/src/tracing.ts`: Context middleware and tracing utilities
- `backend/src/logger.ts`: Pino logger configuration
- `backend/src/app.ts`: Global middleware registration
- `backend/src/db.ts`: Database query tagging

### ✅ Acceptance Criteria
- [ ] Every incoming HTTP request is assigned a unique `X-Request-ID`.
- [ ] The `X-Request-ID` is echoed in HTTP response headers.
- [ ] Every log line emitted during the request includes `reqId: "..."`.
- [ ] External client-provided `X-Request-ID` is sanitized and respected.

### 🧪 Testing & Verification Plan
- Unit test sending request with custom `X-Request-ID` and assert response header.
- Verify Pino log output stream contains `reqId` attribute on all log entries.

### 🔒 Security, Reliability & Performance Considerations
Sanitizes incoming correlation IDs to avoid header injection or log formatting manipulation."""
    },
    {
        "title": "fix(backend): Validate organization ID format against strict slug regex in routes",
        "labels": ["bug", "backend"],
        "body": """### 🎯 Summary & Context
API route handlers that accept `:orgId` (such as `GET /api/orgs/:orgId/stats` and `POST /api/orgs/:orgId/maintainers`) do not validate the parameter format before querying the database or interacting with Soroban contract state.

Passing unexpected characters or path traversal strings (`../`, `%20`, emojis) results in database errors, unhandled 500 status codes, or inconsistent cache keys.

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
`const orgId = req.params.orgId;`
This parameter is passed directly into SQL queries or Soroban symbol conversions. If the string contains uppercase letters or invalid symbols, Soroban symbol serialization fails with an unhandled exception.

### 🛠️ Proposed Solution & Technical Specification
1. Define standard organization slug regex:
   `^[a-z0-9][a-z0-9_-]{1,31}$`
2. Create an Express param middleware `router.param('orgId', ...)`:
   - Validate format.
   - If invalid, immediately return `400 Bad Request` with `{ error: "Invalid organization identifier format. Must be lowercase alphanumeric between 2 and 32 characters." }`.
3. Normalize org IDs to lowercase before database query and caching.

### 📁 Affected Files & Modules
- `backend/src/app.ts`: Route param validator
- `backend/src/routes/orgs.ts`: Org route handlers
- `backend/src/__tests__/orgRoutes.test.ts`: Format validation tests

### ✅ Acceptance Criteria
- [ ] Valid slugs (`stellar`, `soroban-governor`, `org_123`) pass validation.
- [ ] Uppercase slugs (`Stellar`), spaces (`org name`), or symbols (`org$`) return 400 Bad Request.
- [ ] Slugs longer than 32 characters return 400 Bad Request.
- [ ] Zero unhandled 500 errors caused by invalid org symbol formats.

### 🧪 Testing & Verification Plan
- Run test suite with parameterized valid and invalid org slug strings.
- Verify response status 400 on all invalid permutations.

### 🔒 Security, Reliability & Performance Considerations
Prevents path traversal, SQL injection fuzzing, and cache poisoning on org-scoped cache keys."""
    },
    {
        "title": "refactor(backend): Replace morgan logger with unified pino HTTP middleware",
        "labels": ["enhancement", "backend"],
        "body": """### 🎯 Summary & Context
The backend currently uses `morgan` for HTTP request logging alongside `pino` for internal service and business logic logging. Morgan outputs unstructured plain-text strings, while Pino outputs structured JSON.

This creates fragmented logs where request logs cannot be parsed or indexed effectively by log aggregation tools (Elasticsearch, Datadog, AWS CloudWatch Insights).

### 🔍 Current Behavior & Root Cause
In `backend/src/app.ts`:
`app.use(morgan('combined'));`
This outputs raw Apache-style log lines. Simultaneously, application logs use `logger.info(...)` from `backend/src/logger.ts`. Parsing logs in CloudWatch requires two different parsing rules, and request metadata is not linked to application error stacks.

### 🛠️ Proposed Solution & Technical Specification
1. Remove `morgan` and `@types/morgan` from `package.json`.
2. Install and configure `pino-http`:
   - Inherit configuration and serializers from `backend/src/logger.ts`.
   - Log request method, URL, status code, response time (`responseTime`), user agent, and IP in structured JSON format.
   - Redact sensitive headers (`authorization`, `cookie`, `x-api-key`).
3. Set appropriate log levels:
   - `info` for 2xx/3xx responses.
   - `warn` for 4xx client errors.
   - `error` for 5xx server errors with error stack trace.

### 📁 Affected Files & Modules
- `backend/package.json`: Remove morgan, add pino-http
- `backend/src/app.ts`: Replace morgan middleware with pino-http
- `backend/src/logger.ts`: Pino HTTP serializers and redaction rules

### ✅ Acceptance Criteria
- [ ] All HTTP access logs are emitted in uniform structured JSON format.
- [ ] Sensitive headers (`authorization`, `x-api-key`) are redacted.
- [ ] Response latency (`responseTime` in ms) is recorded on every request.
- [ ] 5xx errors log the full stack trace and request body (sanitized).

### 🧪 Testing & Verification Plan
- Start backend, send requests, and verify stdout emits pure JSON logs.
- Run `npm test` to verify logging middleware passes all tests.

### 🔒 Security, Reliability & Performance Considerations
Pino is significantly faster than Morgan with minimal overhead on the Node.js event loop. Automated redaction prevents accidental credential leakage into CloudWatch."""
    },
    {
        "title": "feat(backend): Add dead-letter queue (DLQ) for failed GitHub webhook deliveries",
        "labels": ["enhancement", "backend", "operations"],
        "body": """### 🎯 Summary & Context
When organization repositories send GitHub webhooks (e.g. `issues.opened`, `issues.assigned`, `issues.closed`), network blips, database locks, or schema validation failures can cause the webhook handler to fail. Currently, failed deliveries are simply logged and dropped.

Implementing a Dead-Letter Queue (DLQ) with automatic retry and manual replay capabilities ensures zero lost issue events between GitHub and the WorkloadGovernor indexer.

### 🔍 Current Behavior & Root Cause
In `backend/src/github.ts`:
Webhook events that throw errors return a 500 status to GitHub. If GitHub\'s retry window expires, the issue state in WorkloadGovernor permanently diverges from the actual GitHub repository state.

### 🛠️ Proposed Solution & Technical Specification
1. In PostgreSQL, create table `webhook_dead_letter_queue`:
   - `id`: UUID primary key
   - `event_type`: varchar
   - `delivery_id`: varchar (GitHub GUID)
   - `payload`: jsonb
   - `error_message`: text
   - `attempts`: int default 1
   - `status`: enum (`pending`, `reprocessed`, `failed_permanently`)
   - `created_at`: timestamptz
2. When webhook handler catches an error:
   - Persist payload to `webhook_dead_letter_queue`.
   - Return 202 Accepted to GitHub to prevent unnecessary webhook delivery disabling.
3. In `backend/src/scheduler.ts`:
   - Implement a cron job running every 10 minutes to retry pending DLQ records with exponential backoff (max 5 retries).
4. Provide admin management endpoint `POST /api/admin/webhooks/dlq/replay` to trigger manual replay.

### 📁 Affected Files & Modules
- `backend/src/github.ts`: Webhook receiver and DLQ capture
- `backend/src/scheduler.ts`: DLQ retry worker
- `migrations/4_create_webhook_dlq.js`: Database migration
- `docs/admin-guide.md`: DLQ management procedures

### ✅ Acceptance Criteria
- [ ] Failed webhook payloads are reliably persisted to `webhook_dead_letter_queue`.
- [ ] Background worker retries transient failures automatically.
- [ ] Admin endpoint allows selective replay of dead-lettered events.
- [ ] Idempotency ensures replayed events do not produce duplicate assignments.

### 🧪 Testing & Verification Plan
- Unit test simulating failed webhook processing and assert DLQ insertion.
- Test successful replay of stored payload using admin endpoint.

### 🔒 Security, Reliability & Performance Considerations
Protects state consistency across distributed systems. DLQ table includes automatic partition pruning or TTL cleanup for permanently resolved records older than 30 days."""
    }
]

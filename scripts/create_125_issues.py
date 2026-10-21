import os
import sys
import json
import time
import urllib.request
import urllib.error

TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = os.environ.get("GITHUB_REPOSITORY", "FaveTeamz/workload-governor")

if not TOKEN:
    print("ERROR: GITHUB_TOKEN environment variable is missing!", file=sys.stderr)
    sys.exit(1)

ISSUES = [
    # -------------------------------------------------------------
    # Category 1: Smart Contract (Soroban / Rust) - 11 issues
    # -------------------------------------------------------------
    {
        "title": "fix(contract): Eliminate missed mutants in contract upgrade verification",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### Problem Statement
Mutation testing via `scripts/mutation-report.js` reveals that mutant at `src/lib.rs:109:9` (`replace WorkloadGovernor::upgrade with ()`) is missed by the current test suite. Replacing the upgrade function body with an empty unit return does not cause any tests to fail.

### Impact / Root Cause
The test suite in `src/test.rs` currently verifies that the upgrade transaction executes without error, but fails to assert that the contract's new WASM hash actually took effect or that new contract behavior is executed post-upgrade.

### Acceptance Criteria
- Add an explicit assertion in `src/test.rs` checking that `env.deployer().update_current_contract_wasm(...)` changes contract state.
- Ensure `cargo test` fails when `WorkloadGovernor::upgrade` body is replaced with `()`.
- Rerun mutation testing and verify this mutant is caught."""
    },
    {
        "title": "fix(contract): Catch mutation regression in issue assignment duplicate validation",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### Problem Statement
In `src/lib.rs:283:26`, replacing `==` with `!=` in `WorkloadGovernor::assign_issue` was missed during mutation testing. 

### Impact / Root Cause
The validation checking whether an assignment already exists for an issue (`storage::has_assignment(&env, &org_id, issue_id, &contributor)`) is not strictly verified with a negative test case asserting `ContractError::AlreadyAssigned`.

### Acceptance Criteria
- Add unit tests verifying `assign_issue` panics with `ContractError::AlreadyAssigned` when an issue is assigned a second time.
- Verify mutation test at `src/lib.rs:283:26` is caught."""
    },
    {
        "title": "fix(contract): Catch mutation regression in complete_assignment maintainer validation",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### Problem Statement
In `src/lib.rs:333:22`, replacing `==` with `!=` in `WorkloadGovernor::complete_assignment` was missed by the test suite.

### Impact / Root Cause
The authorization check verifying that caller is an authorized maintainer for `org_id` lacks negative assertions verifying that an unauthorized maintainer address attempting to call `complete_assignment` triggers `ContractError::UnauthorizedMaintainer`.

### Acceptance Criteria
- Add unit test asserting `complete_assignment` fails with `ContractError::UnauthorizedMaintainer` when invoked by a non-maintainer address.
- Verify mutant at line 333 is caught."""
    },
    {
        "title": "fix(contract): Catch mutation regression in revoke_assignment state checks",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### Problem Statement
In `src/lib.rs:382:22`, replacing `==` with `!=` in `WorkloadGovernor::revoke_assignment` was missed by mutation tests.

### Impact / Root Cause
The precondition asserting that an assignment exists prior to revocation is not adequately asserted for nonexistent assignment tuples.

### Acceptance Criteria
- Add unit tests asserting `revoke_assignment` fails with `ContractError::AssignmentNotFound` when called for an unassigned issue.
- Verify mutant at line 382 is caught."""
    },
    {
        "title": "fix(contract): Emit event on extend_application_ttl and fix mutation test gap",
        "labels": ["bug", "smart-contract"],
        "body": """### Problem Statement
`WorkloadGovernor::extend_application_ttl` in `src/lib.rs:381` does not emit an event, and three mutants at lines 425:9, 429:62, and 425:12 were missed in mutation tests.

### Impact / Root Cause
Because no event is emitted, off-chain indexers and user interfaces cannot track application TTL bump operations. Furthermore, the condition checking `storage::get_global_app_count(&env, &contributor) > 0` was not tested when count is 0.

### Acceptance Criteria
- Add `events::emit_app_ttl_extended(&env, &contributor, &org_id, issue_id)` in `src/events.rs`.
- Emit the event in `extend_application_ttl`.
- Add test cases covering both count == 0 and count > 0 scenarios."""
    },
    {
        "title": "feat(contract): Add batch application withdrawal to reduce transaction fees",
        "labels": ["enhancement", "smart-contract", "performance"],
        "body": """### Problem Statement
Contributors who have reached the 15-application global cap must submit individual transactions to withdraw applications one by one, incurring multiple transaction fees and network latency.

### Proposed Solution
Implement `batch_withdraw_applications(env: Env, contributor: Address, applications: Vec<(Symbol, u32)>)` in `src/lib.rs`.
- Verify caller authentication once for all withdrawals.
- Update global application counter atomically.
- Emit individual `ApplicationWithdrawn` events or a batch event."""
    },
    {
        "title": "refactor(contract): Optimize storage key footprint to reduce ledger write costs",
        "labels": ["enhancement", "smart-contract", "performance"],
        "body": """### Problem Statement
Storage keys defined in `src/storage.rs` use tuple structures containing full `Symbol` prefixes and `Address` identifiers. On Soroban, ledger entry size impacts network fee calculation.

### Acceptance Criteria
- Profile serialized XDR footprint of storage keys.
- Ensure shortest possible symbols are used without violating collision guarantees validated by `scripts/check-key-collisions.sh`."""
    },
    {
        "title": "feat(contract): Support configurable application TTL duration via admin governance",
        "labels": ["enhancement", "smart-contract", "architecture"],
        "body": """### Problem Statement
Currently, application TTL extension ledgers and thresholds are hardcoded in `src/storage.rs`. Different networks (testnet vs mainnet) or changing network conditions may require adjusting default TTL parameters.

### Acceptance Criteria
- Add admin/governance storage entry for `app_ttl_threshold_ledgers` and `app_ttl_extend_to_ledgers`.
- Provide default values preserving existing behavior."""
    },
    {
        "title": "fix(contract): Validate organization ID characters and length limit",
        "labels": ["bug", "smart-contract", "security"],
        "body": """### Problem Statement
`org_id: Symbol` accepts arbitrary symbols up to 32 characters, potentially allowing invalid formatting, empty strings, or control characters.

### Acceptance Criteria
- Implement validation helper `require_valid_org_id(&env, &org_id)` in `src/lib.rs`.
- Reject empty symbols and enforce minimum length >= 2 characters."""
    },
    {
        "title": "fix(contract): Prevent re-initialization race condition in contract deployments",
        "labels": ["bug", "smart-contract", "security"],
        "body": """### Problem Statement
If contract deployment and initialization do not occur atomically in the same transaction, a malicious actor could observe the uninitialized contract and call `initialize` with an arbitrary admin address.

### Acceptance Criteria
- Document atomic deployment patterns using factory contracts or constructor initialization.
- Add contract test asserting `initialize` fails when called twice."""
    },
    {
        "title": "test(contract): Add property-based invariant test for global application cap monotonic counter",
        "labels": ["testing", "smart-contract"],
        "body": """### Problem Statement
The global application counter must strictly equal the sum of pending applications for a contributor across all organizations.

### Acceptance Criteria
- Add proptest in `src/test.rs` executing randomized sequences of `apply_for_issue`, `withdraw_application`, and `assign_issue`.
- Assert that `get_global_application_count(contributor)` matches active application count in every state."""
    },

    # -------------------------------------------------------------
    # Category 2: Backend API & Middleware (Node.js / Express / TS) - 11 issues
    # -------------------------------------------------------------
    {
        "title": "fix(backend): Handle unhandled client disconnects in rate-limiting middleware",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
In `src/middleware/rate-limit.ts`, when a client prematurely closes the HTTP connection before response headers are sent, connection tracking tokens remain decremented without proper cleanup.

### Acceptance Criteria
- Attach `req.on('close', ...)` listener in rate limiter middleware.
- Ensure in-flight connection counters are decremented if request is aborted."""
    },
    {
        "title": "fix(backend): Remove stray src/EventHistoryTable.js from backend codebase",
        "labels": ["bug", "backend", "dx"],
        "body": """### Problem Statement
A browser DOM component `src/EventHistoryTable.js` was placed directly in the backend `src/` directory.

### Impact / Root Cause
This file belongs in the frontend client code (`frontend/src/`) and should not reside among backend Node.js TypeScript sources.

### Acceptance Criteria
- Move `src/EventHistoryTable.js` to `frontend/src/utils/EventHistoryTable.js`.
- Remove from backend `src/` and update any import references."""
    },
    {
        "title": "fix(backend): Release idempotency locks reliably on internal errors",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
In `src/middleware/idempotency.ts`, if downstream route processing throws an unexpected error, the idempotency lock key in Redis may persist until TTL expiration, blocking subsequent retries.

### Acceptance Criteria
- Add `try...finally` block in idempotency middleware.
- Delete in-flight lock key immediately on unhandled exceptions so clients can retry safely."""
    },
    {
        "title": "fix(backend): Sanitize and validate cursor pagination query parameters in org routes",
        "labels": ["bug", "backend", "security"],
        "body": """### Problem Statement
`src/routes/orgs.ts` decodes `cursor` query parameters from base64 without verifying that the decoded string contains valid ledger and ID components.

### Acceptance Criteria
- Add schema validation for cursor formats using zod/joi.
- Return HTTP 400 Bad Request with descriptive error code on malformed cursor strings."""
    },
    {
        "title": "feat(backend): Implement redis-backed distributed token bucket rate limiter",
        "labels": ["enhancement", "backend", "performance"],
        "body": """### Problem Statement
In multi-instance backend deployments, memory-based rate limiting allows clients to bypass rate limits by distributing requests across instances.

### Acceptance Criteria
- Implement Redis Lua script executing atomic token bucket rate limiting.
- Provide automatic fallback to local memory limiter if Redis is unreachable."""
    },
    {
        "title": "fix(backend): Gracefully handle Redis disconnection and automatic reconnect with exponential backoff",
        "labels": ["bug", "backend", "operations"],
        "body": """### Problem Statement
In `src/services/redis.ts`, if Redis connection drops, unhandled error events can cause the Node.js process to exit or leak reconnection timers.

### Acceptance Criteria
- Configure `retryStrategy` with exponential backoff and jitter.
- Emit structured log events on reconnect attempts."""
    },
    {
        "title": "feat(backend): Add streaming server-sent events (SSE) endpoint for live application updates",
        "labels": ["enhancement", "backend"],
        "body": """### Problem Statement
Frontends currently poll `/api/contributors/:address/applications` every few seconds to detect assignment status changes.

### Acceptance Criteria
- Implement `GET /api/v1/contributors/:address/events/stream` using Server-Sent Events (SSE).
- Push real-time event updates when indexer records relevant contract events."""
    },
    {
        "title": "fix(backend): Add request correlation ID tracing across all HTTP handlers and logs",
        "labels": ["bug", "backend", "observability"],
        "body": """### Problem Statement
Incoming requests lack a unified `X-Request-ID` correlation identifier passed through middleware, database queries, and Pino logging.

### Acceptance Criteria
- Add middleware generating `X-Request-ID` (or adopting incoming header).
- Bind request ID to AsyncLocalStorage for automatic inclusion in all Pino log entries."""
    },
    {
        "title": "fix(backend): Validate organization ID format against strict slug regex in routes",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
Routes in `src/routes/issues.ts` and `src/routes/orgs.ts` accept arbitrary string lengths and characters for `:orgId`.

### Acceptance Criteria
- Enforce regex validation `^[a-z0-9_-]{2,32}$` on organization parameters in path parameters.
- Return standardized 400 Bad Request on invalid format."""
    },
    {
        "title": "refactor(backend): Replace morgan logger with unified pino HTTP middleware",
        "labels": ["enhancement", "backend"],
        "body": """### Problem Statement
Backend uses `morgan` for HTTP access logging and `pino` for application logging, producing mismatched log formats in stdout.

### Acceptance Criteria
- Replace `morgan` with `pino-http` in `src/app.ts`.
- Ensure all HTTP logs are formatted as structured JSON."""
    },
    {
        "title": "feat(backend): Add dead-letter queue (DLQ) for failed GitHub webhook deliveries",
        "labels": ["enhancement", "backend", "operations"],
        "body": """### Problem Statement
In `src/services/webhook-dispatcher.ts`, when external webhook endpoints fail after 3 retries, payloads are permanently discarded without audit trails.

### Acceptance Criteria
- Store failed webhook events in a `failed_webhooks` database table or Redis dead-letter queue.
- Provide admin endpoint to inspect and replay failed webhook payloads."""
    },

    # -------------------------------------------------------------
    # Category 3: Event Indexer & Ingestion (Stellar / Horizon) - 10 issues
    # -------------------------------------------------------------
    {
        "title": "fix(indexer): Handle Horizon ledger reorganization and fork rollbacks cleanly",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
If Horizon reports a ledger reorganization or rollback, `src/eventIndexer.ts` does not revert stored checkpoint entries, potentially causing duplicate or missed event ingestion.

### Acceptance Criteria
- Implement ledger continuity checks comparing parent hash of current ledger with previous checkpoint hash.
- Rewind checkpoint state to last confirmed common ancestor on detected reorg."""
    },
    {
        "title": "fix(indexer): Prevent event deduplication race condition under concurrent ingestion workers",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
In multi-worker environments, parallel ingestion workers processing adjacent ledger batches can race on `events(tx_hash, event_idx)` insertion.

### Acceptance Criteria
- Use `ON CONFLICT (tx_hash, event_idx) DO NOTHING` in event persistence queries.
- Add integration test reproducing concurrent worker insertion."""
    },
    {
        "title": "feat(indexer): Implement batch insert for contract events in indexer service",
        "labels": ["enhancement", "backend", "performance"],
        "body": """### Problem Statement
`src/sync.ts` inserts decoded events sequentially row-by-row, limiting ingestion throughput during high-traffic ledger periods.

### Acceptance Criteria
- Group events into multi-row parameterized `INSERT INTO events VALUES (...)` batches.
- Benchmark throughput improvement."""
    },
    {
        "title": "fix(indexer): Add circuit breaker for failing Soroban RPC endpoints",
        "labels": ["bug", "backend", "operations"],
        "body": """### Problem Statement
When configured Soroban RPC endpoints become unresponsive, requests in `src/soroban.ts` timeout repeatedly, exhausting connection pools.

### Acceptance Criteria
- Integrate circuit breaker pattern (e.g. cockatiel or opossum).
- Fail fast and switch to fallback RPC endpoint when error threshold is breached."""
    },
    {
        "title": "feat(indexer): Support backfilling events from specific starting ledger range via CLI",
        "labels": ["enhancement", "backend", "dx"],
        "body": """### Problem Statement
`src/scripts/backfill-events.ts` only supports scanning backwards from current ledger, making targeted historic backfills difficult.

### Acceptance Criteria
- Add CLI arguments `--from-ledger <number>` and `--to-ledger <number>` to backfill script.
- Support `--dry-run` flag reporting event count without database writes."""
    },
    {
        "title": "fix(indexer): Track and persist checkpoint metrics to Prometheus",
        "labels": ["bug", "backend", "observability"],
        "body": """### Problem Statement
The indexer's current ledger processing position and ledger lag are not exported to Prometheus metrics.

### Acceptance Criteria
- Add gauge `indexer_last_processed_ledger` and `indexer_ledger_lag`.
- Update gauges after each successful ledger batch commit."""
    },
    {
        "title": "fix(indexer): Handle RPC rate-limiting (429) with jittered exponential backoff",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
When public Stellar Horizon nodes return HTTP 429 Too Many Requests, `src/horizon.ts` fails abruptly without respecting `Retry-After` response headers.

### Acceptance Criteria
- Inspect `Retry-After` header on HTTP 429 responses.
- Implement exponential backoff with full jitter before retrying request."""
    },
    {
        "title": "refactor(indexer): Decouple event decoding logic from database persistence transactions",
        "labels": ["enhancement", "backend", "architecture"],
        "body": """### Problem Statement
`src/eventIndexer.ts` parses raw Soroban XDR values inside an open database transaction, increasing connection hold duration.

### Acceptance Criteria
- Parse and validate all XDR events in memory before opening database transaction.
- Keep database transactions as short as possible."""
    },
    {
        "title": "fix(indexer): Validate contract event schema against ABI before inserting into database",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
Unexpected event formats from contract upgrades or third-party contract interactions can cause unhandled JSON parsing exceptions in the indexer.

### Acceptance Criteria
- Add schema validation for event payload topics and data tuples before database write.
- Log invalid events to an `indexer_quarantine` table for inspection."""
    },
    {
        "title": "test(indexer): Add integration test for checkpoint recovery after worker sudden termination",
        "labels": ["testing", "backend"],
        "body": """### Problem Statement
There is no automated test verifying that killing the indexer process mid-ledger batch resumes cleanly from the last committed checkpoint.

### Acceptance Criteria
- Create integration test simulating process termination during batch ingestion.
- Verify no duplicate events are created and no ledgers are skipped upon restart."""
    },

    # -------------------------------------------------------------
    # Category 4: Database & Migrations (PostgreSQL) - 9 issues
    # -------------------------------------------------------------
    {
        "title": "fix(db): Add missing down-migration for 3_indexer_checkpoints.js",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
Running `npm run migrate:down` fails when rolling back `migrations/3_indexer_checkpoints.js` because the `down` function is incomplete.

### Acceptance Criteria
- Implement `exports.down = (pgm) => { pgm.dropTable('indexer_checkpoints'); }`.
- Test migration up and down cycles in CI."""
    },
    {
        "title": "fix(db): Add down-migration for 3_add_events_org_created_idx.js index",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
`migrations/3_add_events_org_created_idx.js` lacks an explicit drop index statement in its `down` export.

### Acceptance Criteria
- Implement `exports.down = (pgm) => { pgm.dropIndex('events', ['org_id', 'created_at'], { name: 'idx_events_org_created' }); }`.
- Verify rollback succeeds without error."""
    },
    {
        "title": "perf(db): Add composite index for contributor applications query on (contributor, status, created_at)",
        "labels": ["performance", "backend"],
        "body": """### Problem Statement
Queries filtering active contributor applications in `src/routes/contributors.ts` perform sequential scans as the applications table grows.

### Acceptance Criteria
- Create migration adding index `idx_applications_contributor_status_created` on `(contributor, status, created_at DESC)`.
- Verify query execution plan uses index scan."""
    },
    {
        "title": "fix(db): Configure connection pool idle timeout and connection reap intervals",
        "labels": ["bug", "backend", "operations"],
        "body": """### Problem Statement
In `src/db.ts`, default node-pg pool configuration does not configure `idleTimeoutMillis` and `connectionTimeoutMillis`, risking leaked zombie connections in serverless/container environments.

### Acceptance Criteria
- Explicitly configure `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`, and `max: 20` via environment variables.
- Add pool error event handler logging unexpected client disconnections."""
    },
    {
        "title": "feat(db): Add migration for soft-deletion and archival of stale applications",
        "labels": ["enhancement", "backend"],
        "body": """### Problem Statement
Withdrawn and completed applications remain in the active `applications` table indefinitely, impacting query latency.

### Acceptance Criteria
- Create archival migration introducing `archived_applications` table or partitioning scheme.
- Add scheduled maintenance task moving applications completed > 90 days ago to archive."""
    },
    {
        "title": "fix(db): Enforce foreign key constraints between assignments and applications",
        "labels": ["bug", "backend"],
        "body": """### Problem Statement
The `assignments` table does not enforce a foreign key referencing `applications(id)`.

### Acceptance Criteria
- Add migration creating foreign key `fk_assignments_application_id` with appropriate `ON DELETE RESTRICT` semantics.
- Add test verifying integrity constraint."""
    },
    {
        "title": "perf(db): Add EXPLAIN ANALYZE benchmark tests for all leaderboard query endpoints",
        "labels": ["performance", "testing"],
        "body": """### Problem Statement
Leaderboard queries in `src/routes/leaderboard.ts` aggregate across multiple tables without benchmark verification.

### Acceptance Criteria
- Write benchmark test running `EXPLAIN (ANALYZE, BUFFERS)` on leaderboard query with 100,000 synthetic rows.
- Ensure query cost remains below threshold."""
    },
    {
        "title": "fix(db): Ensure advisory locks are used during database migration runs",
        "labels": ["bug", "backend", "devops"],
        "body": """### Problem Statement
When multiple backend replicas start simultaneously, concurrent `node-pg-migrate up` executions can encounter race conditions.

### Acceptance Criteria
- Wrap migration execution in PostgreSQL advisory locks (`pg_advisory_lock`).
- Verify second instance waits gracefully until first instance completes migration."""
    },
    {
        "title": "feat(db): Add database health check probe verifying read and write replicas",
        "labels": ["enhancement", "backend", "operations"],
        "body": """### Problem Statement
The `/api/health` endpoint currently verifies connectivity only to the primary database.

### Acceptance Criteria
- Extend health check probe to test read-replica query connectivity and replication lag.
- Return 503 Service Unavailable if replication lag exceeds configured threshold."""
    },

    # -------------------------------------------------------------
    # Category 5: Frontend Application & State Management - 11 issues
    # -------------------------------------------------------------
    {
        "title": "fix(frontend): Resolve React 18 and @types/react 19 version mismatch in package.json",
        "labels": ["bug", "frontend"],
        "body": """### Problem Statement
In `frontend/package.json`, runtime dependency `react` is `18.3.1`, but devDependency `@types/react` is `^19.2.17`.

### Impact / Root Cause
This version mismatch leads to TypeScript compilation errors where React 19 types reference APIs not present in React 18.

### Acceptance Criteria
- Align `@types/react` and `@types/react-dom` to `^18.3.0` matching React 18.
- Verify `npm --prefix frontend run typecheck` succeeds without errors."""
    },
    {
        "title": "fix(frontend): Deduplicate duplicate vitest dependency in frontend package.json",
        "labels": ["bug", "frontend"],
        "body": """### Problem Statement
`vitest` is declared in both `dependencies` (`^4.1.10`) and `devDependencies` (`4.1.11`) in `frontend/package.json`.

### Acceptance Criteria
- Remove `vitest` from `dependencies` and keep it only in `devDependencies`.
- Update `package-lock.json` cleanly."""
    },
    {
        "title": "fix(frontend): Consolidate split components directory between frontend/components and frontend/src/components",
        "labels": ["bug", "frontend", "architecture"],
        "body": """### Problem Statement
Component files are duplicated across both `frontend/components/` and `frontend/src/components/` (e.g. `EventHistoryTable.tsx`, `IssueCard.tsx`, `NavBar.tsx`, `TxConfirmModal.tsx`).

### Impact / Root Cause
Developers updating one copy leave the other out of date, leading to inconsistent UI behavior depending on import path.

### Acceptance Criteria
- Consolidate all components into `frontend/src/components/`.
- Remove redundant `frontend/components/` directory and update all import statements."""
    },
    {
        "title": "fix(frontend): Consolidate Next.js and Vite configuration into single unified build pipeline",
        "labels": ["bug", "frontend", "architecture"],
        "body": """### Problem Statement
The frontend directory contains conflicting build tool configurations: `next.config.js` and `vite.config.ts`, alongside React Router and Next.js App Router files.

### Acceptance Criteria
- Standardize on single unified build setup (Vite with React Router or Next.js App Router).
- Remove obsolete build config files and dependencies."""
    },
    {
        "title": "fix(frontend): Replace dummy maintainer auth mock with real Soroban contract view call",
        "labels": ["bug", "frontend"],
        "body": """### Problem Statement
In `frontend/src/hooks/useMaintainerAuth.ts:16`, maintainer status verification is hardcoded with a TODO comment.

### Acceptance Criteria
- Wire `useMaintainerAuth` hook to query the Soroban contract method `is_maintainer(maintainer, org_id)`.
- Cache authorization response in React Query / SWR with appropriate invalidation."""
    },
    {
        "title": "feat(frontend): Implement optimistic UI updates when applying for issues",
        "labels": ["enhancement", "frontend", "ui-ux"],
        "body": """### Problem Statement
Clicking Apply triggers a blockchain transaction which takes 3-6 seconds, during which user has no visual feedback of pending application state.

### Acceptance Criteria
- Update issue button to immediate 'Applying...' state with optimistic counter increment.
- Revert state and display toast if transaction is rejected or fails."""
    },
    {
        "title": "fix(frontend): Prevent infinite re-render loop in useWallet hook on network change",
        "labels": ["bug", "frontend"],
        "body": """### Problem Statement
`frontend/src/hooks/useWallet.ts` re-attaches network change listeners without memoizing event handler callbacks, causing excessive re-renders.

### Acceptance Criteria
- Memoize listener callbacks with `useCallback`.
- Clean up listeners in `useEffect` return function."""
    },
    {
        "title": "feat(frontend): Add local storage caching for organization bookmark list",
        "labels": ["enhancement", "frontend"],
        "body": """### Problem Statement
`OrgBookmarkList.tsx` stores bookmarked organizations in ephemeral React component state, which is lost on browser refresh.

### Acceptance Criteria
- Synchronize bookmarked organizations with browser `localStorage`.
- Support offline restoration on initial page load."""
    },
    {
        "title": "fix(frontend): Improve error boundary fallback UI with retry button and error telemetry",
        "labels": ["bug", "frontend", "ui-ux"],
        "body": """### Problem Statement
`ErrorBoundary.tsx` renders a basic unstyled error string when a subcomponent fails.

### Acceptance Criteria
- Render user-friendly ErrorState component with 'Try Again' action button.
- Forward error stack trace to telemetry logger."""
    },
    {
        "title": "perf(frontend): Code-split route bundles and lazy-load heavy transaction modal components",
        "labels": ["performance", "frontend"],
        "body": """### Problem Statement
Initial bundle size includes `TxConfirmModal` and Stellar XDR serialization libraries, increasing Initial Load Time.

### Acceptance Criteria
- Wrap `TxConfirmModal` and `WithdrawConfirmModal` with `React.lazy()` and `Suspense`.
- Verify reduced initial bundle size."""
    },
    {
        "title": "fix(frontend): Handle Freighter wallet disconnection gracefully across active browser tabs",
        "labels": ["bug", "frontend"],
        "body": """### Problem Statement
Disconnecting the wallet extension in one tab leaves remaining active tabs in an authenticated state, causing failed transactions.

### Acceptance Criteria
- Broadcast wallet state changes using `BroadcastChannel` or `storage` event listener.
- Synchronize connected address across all open tabs."""
    },

    # -------------------------------------------------------------
    # Category 6: Design System, UI/UX & Storybook - 10 issues
    # -------------------------------------------------------------
    {
        "title": "fix(design-system): Ensure Storybook builds cleanly with all autodocs tags enabled",
        "labels": ["bug", "storybook", "frontend"],
        "body": """### Problem Statement
Running `npm --prefix frontend run build-storybook` encounters TypeScript errors on autodocs tag definitions across several `.stories.tsx` files.

### Acceptance Criteria
- Resolve story type definitions for `tags: ['autodocs']`.
- Verify `build-storybook` exits with code 0 in CI."""
    },
    {
        "title": "fix(ui-ux): Address WCAG 2.1 AA accessibility contrast failures on WorkloadGauge text",
        "labels": ["bug", "ui-ux", "accessibility"],
        "body": """### Problem Statement
`docs/ACCESSIBILITY_AUDIT.md` highlighted contrast ratio failures (< 4.5:1) for secondary text and threshold labels in `WorkloadGauge.tsx`.

### Acceptance Criteria
- Update theme color tokens in `tokens.json` to meet minimum 4.5:1 contrast against background colors.
- Verify with `axe-core` accessibility test suite."""
    },
    {
        "title": "feat(design-system): Add keyboard navigation and focus trapping to TxConfirmModal",
        "labels": ["enhancement", "design-system", "accessibility"],
        "body": """### Problem Statement
When `TxConfirmModal` opens, focus is not trapped within modal dialog, allowing tab navigation to interact with background page elements.

### Acceptance Criteria
- Implement focus trap trapping focus between Confirm and Cancel buttons.
- Support closing modal via Escape key press."""
    },
    {
        "title": "fix(ui-ux): Fix mobile viewport layout distortion on EventHistoryTable cards",
        "labels": ["bug", "ui-ux", "frontend"],
        "body": """### Problem Statement
On screen widths <= 375px, table rows converted to card layout overflow viewport horizontally due to unformatted transaction hashes.

### Acceptance Criteria
- Apply CSS `overflow-wrap: break-word` and text truncation on Stellar addresses and transaction hashes.
- Test across mobile viewports in Playwright responsive tests."""
    },
    {
        "title": "feat(design-system): Add dark mode / high contrast color tokens to tokens.json",
        "labels": ["enhancement", "design-system"],
        "body": """### Problem Statement
`tokens.json` only contains single-theme color values without dark mode variants or high-contrast support.

### Acceptance Criteria
- Add semantic color structure with `light` and `dark` mode token sets.
- Bind tokens to CSS custom properties in `tokens.css`."""
    },
    {
        "title": "fix(ui-ux): Prevent layout shift during Skeleton screen loading transitions",
        "labels": ["bug", "ui-ux", "performance"],
        "body": """### Problem Statement
`SkeletonScreens.tsx` elements have different heights and padding compared to rendered `IssueCard` components, triggering Cumulative Layout Shift (CLS).

### Acceptance Criteria
- Match Skeleton card height, margins, and borders exactly to loaded card component dimensions.
- Verify CLS score is below 0.05 in Lighthouse performance audits."""
    },
    {
        "title": "feat(design-system): Implement animated progress ring for ContributorActivity streak badge",
        "labels": ["enhancement", "design-system"],
        "body": """### Problem Statement
The streak badge in `StreakBadge.tsx` displays static text without visual progress indicators.

### Acceptance Criteria
- Implement animated SVG circular progress ring indicating current streak tier.
- Provide accessible screen reader text describing streak progress."""
    },
    {
        "title": "fix(storybook): Fix broken Chromatic visual regression test baseline on Button stories",
        "labels": ["bug", "storybook", "ci"],
        "body": """### Problem Statement
Chromatic visual regression workflow in `.github/workflows/chromatic.yml` flags unreviewed visual regressions on `Button.stories.tsx`.

### Acceptance Criteria
- Review visual diffs and establish stable baseline snapshots.
- Ensure Chromatic workflow completes successfully."""
    },
    {
        "title": "feat(ui-ux): Add toast notification queue with auto-dismiss countdown timer",
        "labels": ["enhancement", "ui-ux"],
        "body": """### Problem Statement
Multiple rapid state notifications overwrite the current toast in `Toast.tsx`, causing users to miss confirmation messages.

### Acceptance Criteria
- Implement toast queue supporting up to 3 concurrent stacked notifications.
- Add visual countdown progress bar for auto-dismissal."""
    },
    {
        "title": "fix(ui-ux): Ensure all interactive icon buttons have explicit aria-label attributes",
        "labels": ["bug", "ui-ux", "accessibility"],
        "body": """### Problem Statement
Several icon buttons (e.g. copy address, bookmark toggle, modal close) lack `aria-label` or accessible names, failing automated a11y tests.

### Acceptance Criteria
- Audit `Icon.tsx`, `CopyButton.tsx`, and modal close buttons.
- Add mandatory `aria-label` props and unit test verification."""
    },

    # -------------------------------------------------------------
    # Category 7: Testing, Fuzzing & Mutation Testing - 11 issues
    # -------------------------------------------------------------
    {
        "title": "fix(testing): Raise mutation testing score from 75% to above 90% threshold",
        "labels": ["bug", "testing"],
        "body": """### Problem Statement
Running `node scripts/mutation-report.js` outputs:
`Score: 75% FAIL (threshold: 90%) - 21 caught, 7 missed`.

### Acceptance Criteria
- Add test cases in `src/test.rs` covering all 7 missed mutants in `src/lib.rs`.
- Verify `scripts/mutation-report.js` passes with score >= 90% and exits with code 0."""
    },
    {
        "title": "test(fuzz): Add libFuzzer target for XDR signature payload decoding",
        "labels": ["testing", "security"],
        "body": """### Problem Statement
The `fuzz/` crate currently tests contract storage keys and corpus generation, but lacks a fuzzer target for arbitrary/malformed XDR envelope parsing.

### Acceptance Criteria
- Add `fuzz/fuzz_targets/fuzz_xdr_envelope.rs`.
- Feed random byte buffers into XDR decoder and verify no unexpected panic or memory leak occurs."""
    },
    {
        "title": "test(contract): Add fuzzing test for simultaneous global cap and org cap saturation",
        "labels": ["testing", "smart-contract"],
        "body": """### Problem Statement
Fuzz testing in `fuzz/` should test boundary conditions where a contributor reaches exactly 15 global applications and 4 org assignments simultaneously.

### Acceptance Criteria
- Create fuzzing scenario verifying that boundary edge cases correctly enforce `GlobalApplicationLimitReached` and `OrgAssignmentLimitReached`."""
    },
    {
        "title": "fix(testing): Fix flaky Playwright e2e test in admin-maintainer-flow.spec.ts",
        "labels": ["bug", "testing"],
        "body": """### Problem Statement
In `tests/e2e/admin-maintainer-flow.spec.ts`, race conditions between MSW handler responses and DOM element assertions cause sporadic CI test timeouts.

### Acceptance Criteria
- Replace fixed timeouts with `expect.poll` or explicit web assertions (`toBeVisible()`).
- Verify 10 consecutive test runs pass without flakiness."""
    },
    {
        "title": "test(api): Add end-to-end integration tests for multi-org application limits",
        "labels": ["testing", "backend"],
        "body": """### Problem Statement
Expand `tests/multi-org.test.ts` to test cross-organization limit scenarios with multiple distinct organizations and contributors.

### Acceptance Criteria
- Test contributor submitting applications across 5 different organizations until 15th application succeeds and 16th is rejected.
- Verify accurate snapshot counts returned by `/api/contributors/:address/summary`."""
    },
    {
        "title": "fix(testing): Mock external Horizon RPC calls in vitest unit test suite",
        "labels": ["bug", "testing"],
        "body": """### Problem Statement
Running `npm run test:unit` when offline fails because several unit tests attempt real HTTP connections to Horizon testnet.

### Acceptance Criteria
- Configure MSW or vi.mock() across all unit tests to mock network calls by default.
- Ensure test suite passes completely without internet connectivity."""
    },
    {
        "title": "test(load): Create k6 load testing script for high-concurrency issue application spikes",
        "labels": ["testing", "performance"],
        "body": """### Problem Statement
The repository lacks an automated load test validating backend response times under traffic spikes.

### Acceptance Criteria
- Create `tests/load/k6-application-spike.js` simulating 200 concurrent contributors submitting applications.
- Assert p95 response latency < 300ms and error rate < 1%."""
    },
    {
        "title": "fix(testing): Update obsolete snapshots in tests/unit/__snapshots__/snapshots.test.tsx.snap",
        "labels": ["bug", "testing"],
        "body": """### Problem Statement
Jest and Vitest snapshot tests fail when executed due to minor HTML class changes in `snapshots.test.tsx.snap`.

### Acceptance Criteria
- Review diff in snapshot file against component specifications.
- Update snapshots cleanly and ensure `npm test` passes."""
    },
    {
        "title": "test(fuzz): Expand corpus generator with edge-case Stellar public key formats",
        "labels": ["testing", "dx"],
        "body": """### Problem Statement
`scripts/generate-corpus.py` only generates standard G-addresses, omitting M-muxed addresses and contract C-addresses.

### Acceptance Criteria
- Update `generate-corpus.py` to include M-address and C-address test vectors.
- Regenerate seed corpus in `fuzz/corpus/`."""
    },
    {
        "title": "test(backend): Add unit tests for API key authentication middleware edge cases",
        "labels": ["testing", "backend"],
        "body": """### Problem Statement
`src/middleware/api-key-auth.ts` lacks test coverage for empty Authorization headers, expired API keys, and revoked keys.

### Acceptance Criteria
- Create `tests/unit/api-key-auth.test.ts`.
- Test all rejection paths returning 401 Unauthorized with appropriate error payloads."""
    },
    {
        "title": "test(frontend): Add visual regression tests for responsive navigation bar across mobile and desktop",
        "labels": ["testing", "frontend"],
        "body": """### Problem Statement
The mobile hamburger menu and desktop navigation bar lack automated screenshot comparison tests.

### Acceptance Criteria
- Add Playwright visual regression test comparing navigation screenshots across 375px, 768px, and 1280px viewports."""
    },

    # -------------------------------------------------------------
    # Category 8: CI/CD Workflows & GitHub Actions - 10 issues
    # -------------------------------------------------------------
    {
        "title": "fix(ci): Update outdated GitHub Action versions flagged by Dependabot",
        "labels": ["bug", "ci"],
        "body": """### Problem Statement
Dependabot opened PRs for several outdated action versions: `chromaui/action` (v11 -> v18), `setup-terraform` (v3 -> v4), `cargo-deny-action` (v1 -> v2), `audit-check` (v1 -> v2).

### Acceptance Criteria
- Upgrade actions across all `.github/workflows/*.yml` files.
- Verify workflows run cleanly on new versions."""
    },
    {
        "title": "fix(ci): Cache cargo dependencies and sccache artifacts in contract-ci.yml",
        "labels": ["bug", "ci", "performance"],
        "body": """### Problem Statement
`.github/workflows/contract-ci.yml` recompiles all Rust crates from scratch on every run, taking over 10 minutes.

### Acceptance Criteria
- Add `Swatinem/rust-cache` or `actions/cache` for `~/.cargo` and `target/` directories.
- Reduce workflow runtime by >= 50%."""
    },
    {
        "title": "fix(ci): Fix frontend-ci.yml workflow path triggers and node version matrix",
        "labels": ["bug", "ci"],
        "body": """### Problem Statement
`frontend-ci.yml` triggers on backend-only changes and runs against a single Node.js version.

### Acceptance Criteria
- Configure path filters: `paths: ['frontend/**', '.github/workflows/frontend*.yml']`.
- Add test matrix testing Node.js 20 and 22."""
    },
    {
        "title": "feat(ci): Add automated OpenAPI documentation sync check to PR pull request workflow",
        "labels": ["enhancement", "ci"],
        "body": """### Problem Statement
API documentation in `docs/api-reference.md` easily falls out of sync with `openapi.yaml` without CI enforcement.

### Acceptance Criteria
- Add step in `ci.yml` running `node scripts/check-api-docs-sync.js --strict`.
- Fail PR check if endpoints are missing or mismatched."""
    },
    {
        "title": "fix(ci): Set security permissions blocks with minimal required privileges on all workflows",
        "labels": ["bug", "ci", "security"],
        "body": """### Problem Statement
Several workflows in `.github/workflows/` do not declare top-level `permissions:` blocks, leaving default write-all permissions enabled.

### Acceptance Criteria
- Declare `permissions: contents: read` by default on all workflows.
- Grant specific write scopes only where strictly required (e.g. releases, packages)."""
    },
    {
        "title": "feat(ci): Add automatic contract WASM byte size check on pull requests",
        "labels": ["enhancement", "ci", "smart-contract"],
        "body": """### Problem Statement
Soroban smart contracts must stay under the network WASM size limit (64KB). PRs adding dependencies could exceed this limit unnoticed.

### Acceptance Criteria
- Add step to `contract-ci.yml` compiling release WASM and checking file size.
- Post PR comment with size breakdown and fail check if size exceeds 64KB."""
    },
    {
        "title": "fix(ci): Ensure semantic-release workflow only publishes tags on main branch merges",
        "labels": ["bug", "ci"],
        "body": """### Problem Statement
`.github/workflows/release.yml` could run on feature branches if trigger filters are not strictly scoped.

### Acceptance Criteria
- Set `branches: [main]` on release workflow trigger.
- Add environment protection rule for production release deployments."""
    },
    {
        "title": "feat(ci): Add automated security vulnerability scanner for container images in docker-publish.yml",
        "labels": ["enhancement", "ci", "security"],
        "body": """### Problem Statement
`docker-publish.yml` pushes container images to registry without running container vulnerability scans.

### Acceptance Criteria
- Integrate Trivy action scanning built Docker image before push.
- Fail build on CRITICAL severity vulnerabilities."""
    },
    {
        "title": "fix(ci): Fix concurrency cancellation rules in PR workflows to prevent wasteful runner usage",
        "labels": ["bug", "ci"],
        "body": """### Problem Statement
Pushing new commits to open PRs leaves obsolete CI runs executing in parallel, consuming GitHub Actions minutes.

### Acceptance Criteria
- Add `concurrency: { group: '${{ github.workflow }}-${{ github.ref }}', cancel-in-progress: true }` across all PR workflows."""
    },
    {
        "title": "feat(ci): Add automated changelog validation check on pull requests",
        "labels": ["enhancement", "ci"],
        "body": """### Problem Statement
Changelog formatting errors can break release automation during tagging.

### Acceptance Criteria
- Add step running `node scripts/lint-changelog.js` to PR validation pipeline."""
    },

    # -------------------------------------------------------------
    # Category 9: DevOps, Containers & Infrastructure - 10 issues
    # -------------------------------------------------------------
    {
        "title": "fix(helm): Rename vesting-backend chart to workload-governor and update metadata",
        "labels": ["bug", "devops"],
        "body": """### Problem Statement
The Helm chart directory is named `helm/vesting-backend/` and `Chart.yaml` contains `name: vesting-backend` and references 'vesting' keywords.

### Impact / Root Cause
This is a legacy naming defect from earlier project templates. The chart should reflect `workload-governor`.

### Acceptance Criteria
- Rename directory to `helm/workload-governor/`.
- Update `Chart.yaml` name, description, and keywords to WorkloadGovernor.
- Update Helm release workflow references."""
    },
    {
        "title": "fix(docker): Enforce non-root user in production Dockerfile",
        "labels": ["bug", "devops", "security"],
        "body": """### Problem Statement
The production `Dockerfile` runs container processes as `root`.

### Acceptance Criteria
- Add `USER node` (or custom unprivileged user) before `CMD [\"node\", \"dist/index.js\"]`.
- Ensure directory permissions allow node user to run application."""
    },
    {
        "title": "feat(docker): Add multi-stage Docker build separating dev dependencies from runtime image",
        "labels": ["enhancement", "devops", "performance"],
        "body": """### Problem Statement
Current Docker image includes TypeScript compiler, devDependencies, and build caches, inflating image size.

### Acceptance Criteria
- Refactor `Dockerfile` with multi-stage build: `builder` stage for compilation, lightweight `runner` stage for production.
- Reduce final image size below 200MB."""
    },
    {
        "title": "fix(terraform): Enable customer-managed KMS key encryption on RDS PostgreSQL database",
        "labels": ["bug", "devops", "security"],
        "body": """### Problem Statement
`terraform/modules/rds/main.tf` relies on default AWS KMS keys for storage encryption instead of dedicated customer-managed keys.

### Acceptance Criteria
- Parameterize `kms_key_id` in RDS Terraform module.
- Enable storage encryption by default across staging and production environments."""
    },
    {
        "title": "feat(helm): Add HorizontalPodAutoscaler (HPA) resource metrics and scaling thresholds",
        "labels": ["enhancement", "devops"],
        "body": """### Problem Statement
`helm/vesting-backend/templates/hpa.yaml` lacks memory utilization scaling targets.

### Acceptance Criteria
- Configure HPA to scale on both CPU utilization (70%) and Memory utilization (80%).
- Set minReplicas: 2, maxReplicas: 10."""
    },
    {
        "title": "fix(terraform): Enable S3 bucket versioning and public access block on state bucket",
        "labels": ["bug", "devops", "security"],
        "body": """### Problem Statement
`terraform/bootstrap.sh` does not explicitly apply `aws_s3_bucket_public_access_block` to the Terraform state storage bucket.

### Acceptance Criteria
- Add public access block resource blocking all public ACLs and bucket policies.
- Enable S3 object versioning and default server-side encryption."""
    },
    {
        "title": "feat(devops): Add healthcheck instruction to Dockerfile and docker-compose.yml",
        "labels": ["enhancement", "devops"],
        "body": """### Problem Statement
Docker containers lack native `HEALTHCHECK` instructions, preventing Docker engine and orchestration agents from detecting hung services.

### Acceptance Criteria
- Add `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/api/health || exit 1` to `Dockerfile`.
- Add healthcheck block in `docker-compose.yml`."""
    },
    {
        "title": "fix(terraform): Configure DynamoDB state locking table for Terraform remote backend",
        "labels": ["bug", "devops"],
        "body": """### Problem Statement
`terraform/backend-production.hcl` omits `dynamodb_table` configuration, allowing concurrent terraform runs to corrupt state.

### Acceptance Criteria
- Add DynamoDB table resource `workload-governor-terraform-locks`.
- Update backend configurations to reference locking table."""
    },
    {
        "title": "feat(helm): Support external secret management via HashiCorp Vault / AWS Secrets Manager",
        "labels": ["enhancement", "devops", "security"],
        "body": """### Problem Statement
Helm deployment currently requires manual Secret creation in cluster namespaces.

### Acceptance Criteria
- Provide ExternalSecret template integrating with External Secrets Operator (ESO).
- Add guide in `docs/helm-charts` explaining secret sync."""
    },
    {
        "title": "fix(docker): Optimize .dockerignore to exclude git history, tests, and temporary artifacts",
        "labels": ["bug", "devops"],
        "body": """### Problem Statement
`.dockerignore` does not exclude `.git/`, `mutants.out/`, and test snapshot directories, increasing Docker build context transfer time.

### Acceptance Criteria
- Update `.dockerignore` to exclude `.git`, `tests`, `mutants.out*`, `fuzz/target`, and `coverage/`."""
    },

    # -------------------------------------------------------------
    # Category 10: Security, Governance & Audit - 10 issues
    # -------------------------------------------------------------
    {
        "title": "fix(security): Enforce authorization checks in all admin consistency remediation endpoints",
        "labels": ["bug", "security"],
        "body": """### Problem Statement
In `src/routes/admin.ts`, `POST /admin/consistency/remediate` permits triggering state remediation without verifying admin signature authentication.

### Acceptance Criteria
- Apply `maintainer-auth` or admin signature verification middleware to `/admin/consistency/remediate`.
- Return 403 Forbidden when invoked without valid admin credentials."""
    },
    {
        "title": "fix(security): Add rate limiting and abuse prevention on public /verify-xdr endpoint",
        "labels": ["bug", "security"],
        "body": """### Problem Statement
`POST /verify-xdr` performs CPU-intensive cryptographic signature verifications and currently has no IP-based rate limiting.

### Acceptance Criteria
- Apply strict rate limit (e.g. 10 requests/minute/IP) to `/verify-xdr`.
- Reject payloads larger than 64KB with 413 Payload Too Large."""
    },
    {
        "title": "fix(security): Prevent timing attacks on API key comparison in api-key-auth middleware",
        "labels": ["bug", "security"],
        "body": """### Problem Statement
In `src/middleware/api-key-auth.ts`, incoming API keys are compared with stored keys using standard `===` string equality.

### Acceptance Criteria
- Replace string equality with `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`.
- Handle unequal length buffers safely without leaking timing information."""
    },
    {
        "title": "feat(security): Implement replay attack prevention using nonce or ledger sequence validation",
        "labels": ["enhancement", "security"],
        "body": """### Problem Statement
Signed XDR transaction envelopes submitted to backend proxy endpoints could be replayed if ledger sequence numbers are not checked.

### Acceptance Criteria
- Validate that transaction sequence number matches current account sequence before forwarding.
- Reject stale or expired transactions with 400 Bad Request."""
    },
    {
        "title": "fix(security): Update Semgrep ruleset in .semgrep.yml to detect hardcoded Stellar secret keys",
        "labels": ["bug", "security"],
        "body": """### Problem Statement
`.semgrep.yml` does not contain rules targeting accidental leakage of Stellar private seed keys.

### Acceptance Criteria
- Add Semgrep rule detecting pattern `S[A-Z0-9]{55}` in code and test files.
- Verify rule triggers on test vectors in `tests/`."""
    },
    {
        "title": "fix(security): Enforce Content Security Policy (CSP) headers in backend response middleware",
        "labels": ["bug", "security"],
        "body": """### Problem Statement
Backend HTTP responses lack Content Security Policy (CSP), Strict-Transport-Security (HSTS), and X-Frame-Options security headers.

### Acceptance Criteria
- Configure `helmet` middleware in `src/app.ts`.
- Set strict HSTS headers (`max-age=31536000; includeSubDomains; preload`)."""
    },
    {
        "title": "feat(security): Add audit log signature verification in auditService",
        "labels": ["enhancement", "security"],
        "body": """### Problem Statement
`src/services/auditService.ts` records audit logs into PostgreSQL, but entries lack cryptographic tamper-evidence hashing.

### Acceptance Criteria
- Implement merkle/chained SHA-256 hash pointer linking each audit log entry to the previous entry hash.
- Add audit verification utility checking log chain integrity."""
    },
    {
        "title": "fix(security): Sanitize user input in GitHub issue webhook handler to prevent SSRF",
        "labels": ["bug", "security"],
        "body": """### Problem Statement
`src/routes/webhooks.ts` processes issue URLs received from webhooks without verifying that target URLs belong to legitimate GitHub API hosts.

### Acceptance Criteria
- Validate repository and issue URLs against strict GitHub API domain whitelist (`api.github.com`).
- Reject unexpected hosts or internal private IP addresses."""
    },
    {
        "title": "feat(security): Add automated secret rotation runbook for Stellar admin keypair",
        "labels": ["documentation", "security"],
        "body": """### Problem Statement
Rotating admin credentials requires multi-step contract calls (`propose_admin` followed by `accept_admin`) and backend environment variable updates.

### Acceptance Criteria
- Document step-by-step key rotation process in `docs/runbooks/admin-key-rotation.md`.
- Include verification checklist ensuring zero downtime during key rollover."""
    },
    {
        "title": "fix(security): Enforce HTTPS-only transport and HSTS headers in production environment",
        "labels": ["bug", "security"],
        "body": """### Problem Statement
If reverse proxies misroute HTTP traffic, unencrypted plain HTTP requests could reach backend API routes.

### Acceptance Criteria
- Add middleware redirecting plain HTTP requests to HTTPS when `x-forwarded-proto !== 'https'` in production."""
    },

    # -------------------------------------------------------------
    # Category 11: Observability, Metrics & Telemetry - 10 issues
    # -------------------------------------------------------------
    {
        "title": "feat(observability): Export Soroban RPC latency histogram metrics in src/metrics.ts",
        "labels": ["enhancement", "backend", "observability"],
        "body": """### Problem Statement
Backend makes multiple RPC queries to Stellar network, but call latency and error counts are not measured as Prometheus metrics.

### Acceptance Criteria
- Create `soroban_rpc_duration_seconds` histogram labeled by `rpc_method` and `status`.
- Record timing across all Soroban RPC client invocations."""
    },
    {
        "title": "fix(observability): Track contract TTL extension count and remaining ledgers as Prometheus gauge",
        "labels": ["bug", "observability"],
        "body": """### Problem Statement
Application entries on Soroban expire if TTL is not extended. Without metric alerts, operators cannot detect expiring entries.

### Acceptance Criteria
- Export gauge `soroban_min_application_ttl_ledgers`.
- Trigger Prometheus alert when minimum remaining application TTL drops below 10,000 ledgers."""
    },
    {
        "title": "feat(observability): Add OpenTelemetry tracing spans to database query execution",
        "labels": ["enhancement", "observability"],
        "body": """### Problem Statement
Distributed traces in OpenTelemetry do not break down database query duration, making slow SQL query diagnosis difficult.

### Acceptance Criteria
- Instrument `pg` database client with `@opentelemetry/instrumentation-pg`.
- Ensure SQL query text and execution spans appear in OpenTelemetry collector traces."""
    },
    {
        "title": "fix(observability): Add error rate alerts and threshold definitions in Prometheus alerting rules",
        "labels": ["bug", "observability", "operations"],
        "body": """### Problem Statement
`otel-collector-config.yaml` and Prometheus alerting configs lack alert definitions for sustained 5xx HTTP response spikes.

### Acceptance Criteria
- Define Prometheus alert rule firing when 5xx error rate exceeds 1% of total requests over 5-minute rolling window."""
    },
    {
        "title": "feat(observability): Implement structured JSON logging for all audit trail events",
        "labels": ["enhancement", "observability"],
        "body": """### Problem Statement
`src/services/auditService.ts` logs unstructured log strings alongside database writes.

### Acceptance Criteria
- Format all audit trail log messages as structured JSON compliant with Elastic Common Schema (ECS).
- Include `event.action`, `user.name`, `client.ip`, and `service.name` fields."""
    },
    {
        "title": "fix(observability): Export active connection count gauge from PostgreSQL pool",
        "labels": ["bug", "observability"],
        "body": """### Problem Statement
Connection pool saturation can cause request queuing without operator visibility.

### Acceptance Criteria
- Export gauges `pg_pool_total_connections`, `pg_pool_idle_connections`, and `pg_pool_waiting_requests`.
- Update gauges periodically or on pool events."""
    },
    {
        "title": "feat(observability): Add Grafana dashboard definitions for WorkloadGovernor service KPIs",
        "labels": ["enhancement", "observability", "devops"],
        "body": """### Problem Statement
Operators currently have to write custom Prometheus queries to monitor system health.

### Acceptance Criteria
- Provide JSON Grafana dashboard definition in `docs/dashboards/workload-governor.json`.
- Visualize request rate, error rate, p95 latency, RPC lag, and global application saturation."""
    },
    {
        "title": "fix(observability): Mask sensitive contributor metadata and auth tokens in log outputs",
        "labels": ["bug", "observability", "security"],
        "body": """### Problem Statement
`src/logger.ts` does not redact authorization headers, potentially logging bearer tokens or secret keys in debug mode.

### Acceptance Criteria
- Add Pino redact paths: `['req.headers.authorization', 'req.headers.cookie', 'body.secret']`.
- Verify sensitive strings are replaced with `[REDACTED]`."""
    },
    {
        "title": "feat(observability): Export webhook delivery success and failure metrics",
        "labels": ["enhancement", "observability"],
        "body": """### Problem Statement
Outbound webhooks in `src/services/webhook-dispatcher.ts` do not report Prometheus counter metrics on delivery attempts.

### Acceptance Criteria
- Add counters `webhook_deliveries_total` and `webhook_delivery_failures_total` labeled by `org_id` and `event_type`."""
    },
    {
        "title": "fix(observability): Configure OpenTelemetry collector trace sampling rate for production",
        "labels": ["bug", "observability"],
        "body": """### Problem Statement
`otel-collector-config.yaml` configures 100% trace sampling, which causes high telemetry egress costs under production traffic.

### Acceptance Criteria
- Configure probabilistic trace sampler sampling 5% of healthy requests and 100% of error traces."""
    },

    # -------------------------------------------------------------
    # Category 12: Documentation, Specifications & DX - 12 issues
    # -------------------------------------------------------------
    {
        "title": "fix(docs): Synchronize openapi.yaml with undocumented endpoints in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### Problem Statement
Running `node scripts/check-api-docs-sync.js` fails with:
`Checked 13 operations in openapi.yaml against 27 endpoint headings in docs/api-reference.md.`
- 5 operations in `openapi.yaml` are not documented in `docs/api-reference.md`.
- 19 endpoints in `docs/api-reference.md` are not defined in `openapi.yaml`.

### Acceptance Criteria
- Synchronize all operations between `openapi.yaml` and `docs/api-reference.md`.
- Ensure `node scripts/check-api-docs-sync.js --strict` exits 0."""
    },
    {
        "title": "fix(docs): Document GET /api/contributors endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### Problem Statement
`GET /api/contributors` is defined in `openapi.yaml` but missing from `docs/api-reference.md`, failing the API sync check.

### Acceptance Criteria
- Add `#### `GET /api/contributors`` section to `docs/api-reference.md`.
- Document query parameters, response schema, and example responses."""
    },
    {
        "title": "fix(docs): Document GET /api/events endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### Problem Statement
`GET /api/events` is defined in `openapi.yaml` but missing from `docs/api-reference.md`.

### Acceptance Criteria
- Add `#### `GET /api/events`` heading and documentation in `docs/api-reference.md`."""
    },
    {
        "title": "fix(docs): Document GET /api/v1/leaderboard endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### Problem Statement
`GET /api/v1/leaderboard` is defined in `openapi.yaml` but missing from `docs/api-reference.md`.

### Acceptance Criteria
- Add `#### `GET /api/v1/leaderboard`` heading and documentation in `docs/api-reference.md`."""
    },
    {
        "title": "fix(docs): Document GET /api/v1/audit/logs endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### Problem Statement
`GET /api/v1/audit/logs` is defined in `openapi.yaml` but missing from `docs/api-reference.md`.

### Acceptance Criteria
- Add `#### `GET /api/v1/audit/logs`` heading and documentation in `docs/api-reference.md`."""
    },
    {
        "title": "fix(docs): Document GET /docs Swagger endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### Problem Statement
`GET /docs` is defined in `openapi.yaml` but missing from `docs/api-reference.md`.

### Acceptance Criteria
- Add `#### `GET /docs`` heading and documentation in `docs/api-reference.md`."""
    },
    {
        "title": "feat(dx): Add pre-commit git hooks using shell script for automated lint and format checks",
        "labels": ["enhancement", "dx"],
        "body": """### Problem Statement
Contributors occasionally commit code that fails formatting or linting, resulting in failed CI runs.

### Acceptance Criteria
- Add pre-commit hook script in `scripts/pre-commit.sh` running lint, format check, and `check-api-docs-sync.js`.
- Provide setup instructions in `CONTRIBUTING.md`."""
    },
    {
        "title": "fix(docs): Correct outdated Stellar SDK and Soroban CLI version references in README.md",
        "labels": ["bug", "documentation"],
        "body": """### Problem Statement
`README.md` references older Soroban CLI command syntax (`soroban contract invoke`) instead of current `stellar contract invoke`.

### Acceptance Criteria
- Update all CLI references to `stellar` CLI syntax.
- Verify installation instructions match Soroban SDK v22+."""
    },
    {
        "title": "docs(adr): Add Architecture Decision Record (ADR) for event indexer deduplication strategy",
        "labels": ["documentation", "architecture"],
        "body": """### Problem Statement
The decision to utilize composite unique database constraints alongside checkpoint tables for deduplication is not formally documented.

### Acceptance Criteria
- Create `docs/adr/ADR-009-indexer-event-deduplication.md`.
- Detail context, considered alternatives, and decision rationale."""
    },
    {
        "title": "fix(dx): Provide mock environment seed script for local database testing",
        "labels": ["enhancement", "dx"],
        "body": """### Problem Statement
New contributors setting up the project locally start with an empty database, making frontend testing tedious.

### Acceptance Criteria
- Add `npm run db:seed` script in `scripts/seed-mock-data.ts`.
- Insert sample organizations, open issues, pending applications, and assignments."""
    },
    {
        "title": "docs(runbooks): Add detailed runbook for Stellar network protocol upgrade handling",
        "labels": ["documentation", "operations"],
        "body": """### Problem Statement
Network protocol upgrades on Stellar can introduce new cost models or XDR breaking changes.

### Acceptance Criteria
- Create `docs/runbooks/protocol-upgrade.md`.
- Detail testnet verification steps, WASM rebuild procedures, and emergency rollback safeguards."""
    },
    {
        "title": "fix(dx): Fix devcontainer configuration to install Node.js and Rust toolchain automatically",
        "labels": ["bug", "dx"],
        "body": """### Problem Statement
`.devcontainer/devcontainer.json` does not guarantee `node`, `npm`, and `cargo` are immediately present in standard PATH for all terminal sessions.

### Acceptance Criteria
- Update `.devcontainer/devcontainer.json` features to include node and rust devcontainer features.
- Ensure automated workspace setup on Codespaces and local VS Code dev containers."""
    }
]

print(f"Total issues defined: {len(ISSUES)}")
assert len(ISSUES) == 125, f"Expected exactly 125 issues, found {len(ISSUES)}"

PROGRESS_FILE = "issues_progress.json"

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)

def create_issue(issue_data, idx, total):
    url = f"https://api.github.com/repos/{REPO}/issues"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "WorkloadGovernor-Issue-Creator"
    }
    payload = json.dumps({
        "title": issue_data["title"],
        "body": issue_data["body"],
        "labels": issue_data["labels"]
    }).encode("utf-8")

    max_retries = 5
    for attempt in range(max_retries):
        req = urllib.request.Request(url, data=payload, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 201:
                    data = json.loads(resp.read().decode())
                    return data
        except urllib.error.HTTPError as e:
            error_body = e.read().decode() if e.fp else ""
            print(f"[{idx+1}/{total}] HTTP {e.code} on attempt {attempt+1}: {error_body[:200]}", file=sys.stderr)
            if e.code == 429 or "rate limit" in error_body.lower() or "secondary rate" in error_body.lower():
                retry_after = int(e.headers.get("Retry-After", 10))
                print(f"Rate limited. Sleeping for {retry_after}s...", file=sys.stderr)
                time.sleep(retry_after)
            elif e.code >= 500:
                time.sleep(3 * (attempt + 1))
            else:
                print(f"Non-retryable error: {e.code} - {error_body}", file=sys.stderr)
                raise
        except Exception as e:
            print(f"Network error on attempt {attempt+1}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))

    raise RuntimeError(f"Failed to create issue after {max_retries} attempts: {issue_data['title']}")

def main():
    progress = load_progress()
    created_issues = progress.get("created", [])
    already_created_titles = {item["title"] for item in created_issues}

    print(f"Starting submission to {REPO}...")
    print(f"Already created: {len(created_issues)} / {len(ISSUES)}")

    for idx, issue in enumerate(ISSUES):
        if issue["title"] in already_created_titles:
            continue

        print(f"[{idx+1}/{len(ISSUES)}] Creating: {issue['title']}...")
        result = create_issue(issue, idx, len(ISSUES))
        
        issue_record = {
            "index": idx + 1,
            "number": result.get("number"),
            "html_url": result.get("html_url"),
            "title": issue["title"],
            "labels": issue["labels"],
            "category": issue["title"].split(":")[0]
        }
        created_issues.append(issue_record)
        progress["created"] = created_issues
        save_progress(progress)
        print(f"  -> Created #{result.get('number')}: {result.get('html_url')}")
        
        # Gentle pacing between POST requests to respect secondary rate limits
        time.sleep(0.8)

    print(f"\nAll {len(created_issues)} issues successfully created on GitHub!")

    # Generate docs/ISSUES_CATALOG.md
    catalog_path = "docs/ISSUES_CATALOG.md"
    os.makedirs("docs", exist_ok=True)
    
    with open(catalog_path, "w") as f:
        f.write("# WorkloadGovernor — Project Issues Catalog (125 Issues)\n\n")
        f.write("This document provides a comprehensive index of the 125 issues tracking defects, architectural improvements, performance enhancements, security hardening, and test coverage across all subsystems of the WorkloadGovernor repository.\n\n")
        f.write("## Overview by Subsystem\n\n")
        f.write("| Subsystem | Focus Area | Issue Count |\n")
        f.write("|---|---|---|\n")
        f.write("| Smart Contract | Soroban Rust Contract, Storage, Invariants, Events | 11 |\n")
        f.write("| Backend API | Express, Middleware, Rate Limiting, Idempotency | 11 |\n")
        f.write("| Event Indexer | Stellar RPC, Horizon, Ingestion, Reorg Handling | 10 |\n")
        f.write("| Database & Migrations | PostgreSQL, Connection Pooling, Indices, Migrations | 9 |\n")
        f.write("| Frontend Application | React, Next.js / Vite, Wallet Integration, State | 11 |\n")
        f.write("| Design System & UI/UX | Storybook, Accessibility (WCAG), Components, Tokens | 10 |\n")
        f.write("| Testing & QA | Mutation Testing, Fuzzing, E2E Playwright, Unit Tests | 11 |\n")
        f.write("| CI/CD & Workflows | GitHub Actions, Security Permissions, Caching | 10 |\n")
        f.write("| DevOps & Infrastructure | Docker, Helm Chart, Terraform, Kubernetes | 10 |\n")
        f.write("| Security & Governance | Auth, Secret Scanning, Semgrep, Replay Protection | 10 |\n")
        f.write("| Observability & Metrics | OpenTelemetry, Prometheus, Pino, Alerting | 10 |\n")
        f.write("| Documentation & DX | OpenAPI Specs, Sync Validation, ADRs, Devcontainer | 12 |\n")
        f.write("| **Total** | **All Repository Subsystems** | **125** |\n\n")
        f.write("## Complete Issues Register\n\n")
        f.write("| # | Issue Number | Subsystem / Prefix | Title | Labels |\n")
        f.write("|---|---|---|---|---|\n")
        
        for item in created_issues:
            labels_str = ", ".join(f"`{l}`" for l in item["labels"])
            link = f"[#{item['number']}]({item['html_url']})"
            f.write(f"| {item['index']} | {link} | `{item['category']}` | [{item['title']}]({item['html_url']}) | {labels_str} |\n")

    print(f"Generated {catalog_path}")

if __name__ == "__main__":
    main()


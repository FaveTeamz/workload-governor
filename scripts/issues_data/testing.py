# Category 7: Testing, Fuzzing & Mutation Testing - 11 issues

TESTING_ISSUES = [
    {
        "title": "fix(testing): Raise mutation testing score from 75% to above 90% threshold",
        "labels": ["bug", "testing"],
        "body": """### 🎯 Summary & Context
Running `cargo mutants --features testutils -- src/lib.rs` and generating the report via `node scripts/mutation-report.js mutants.out/` shows that our mutation score currently stands at 75% (21 mutants caught out of 28).

Our repository quality policy documented in `README.md` and enforced by `scripts/mutation-report.js --threshold=90` mandates a minimum mutation score of 90%. Uncaught mutants represent latent gaps in contract test coverage where logical flaws could be introduced unnoticed.

### 🔍 Current Behavior & Root Cause
Inspection of `mutants.out/missed.txt` reveals 7 missed mutants:
- 1 mutant in `WorkloadGovernor::upgrade` (bypassing deployer call)
- 2 mutants in `WorkloadGovernor::assign_issue` (duplicate assignment boundary check)
- 2 mutants in `WorkloadGovernor::complete_assignment` (maintainer auth verification)
- 1 mutant in `WorkloadGovernor::revoke_assignment` (assignment existence check)
- 1 mutant in `WorkloadGovernor::extend_application_ttl` (counter check comparison)

### 🛠️ Proposed Solution & Technical Specification
1. In `src/test.rs`:
   - Add negative and boundary tests targeting each missed mutant.
   - Assert exact `ContractError` enum variants rather than checking for generic panics.
   - Test extreme boundary values (e.g. 0 applications, exactly 15 applications, max u32 issue IDs).
2. Re-run `cargo mutants` on `src/lib.rs` and verify that all 7 missed mutants are killed.
3. Update `README.md` badge and `mutants.out/` results directory.
4. Add enforcement step in `contract-ci.yml`: `node scripts/mutation-report.js --threshold=90 --text-only`.

### 📁 Affected Files & Modules
- `src/test.rs`: Unit and invariant test cases
- `scripts/mutation-report.js`: Score validator
- `mutants.out/`: Baseline recorded mutant outputs
- `README.md`: Mutation score badge

### ✅ Acceptance Criteria
- [ ] Mutation score on `src/lib.rs` is >= 90% (at least 26/28 mutants caught).
- [ ] `node scripts/mutation-report.js --threshold=90 --text-only` exits with code 0.
- [ ] README.md mutation score badge updated to reflect passing status.

### 🧪 Testing & Verification Plan
- Run `cargo mutants --features testutils -- src/lib.rs`
- Run `node scripts/mutation-report.js mutants.out/` and inspect HTML/text report.

### 🔒 Security, Reliability & Performance Considerations
Guarantees that any accidental modification to contract business logic causes instant test failure."""
    },
    {
        "title": "test(fuzz): Add libFuzzer target for XDR signature payload decoding",
        "labels": ["testing", "security"],
        "body": """### 🎯 Summary & Context
The backend and indexer decode binary and base64-encoded Stellar `TransactionEnvelope` and signature payloads received from untrusted external sources (webhooks, client submissions).

A malformed, deeply nested, or cyclically referenced XDR payload could trigger memory safety issues, stack overflows, or unhandled panics in the decoding pipeline. Building an automated libFuzzer target continuously tests the parser against hostile byte streams.

### 🔍 Current Behavior & Root Cause
Existing fuzz targets in `fuzz/fuzz_targets/` test contract entry points (`fuzz_apply`, `fuzz_assign`, `fuzz_lifecycle`), but there is no dedicated target fuzzing raw XDR envelope decoding routines against arbitrary byte sequences.

### 🛠️ Proposed Solution & Technical Specification
1. Create `fuzz/fuzz_targets/fuzz_xdr_envelope.rs`:
   - Accept arbitrary `&[u8]` slice from libFuzzer.
   - Feed bytes into Stellar XDR decoder:
     `TransactionEnvelope::from_xdr_base64(...)` and `TransactionEnvelope::from_xdr(...)`.
   - Assert that invalid inputs return clean `Err` results and never panic, leak memory, or cause SIGSEGV/SIGBUS.
2. In `fuzz/Cargo.toml`, register the new binary target `fuzz_xdr_envelope`.
3. Seed the target with valid and near-valid base64 envelope strings in `fuzz/corpus/fuzz_xdr_envelope/`.

### 📁 Affected Files & Modules
- `fuzz/fuzz_targets/fuzz_xdr_envelope.rs`: Fuzz target implementation
- `fuzz/Cargo.toml`: Target declaration
- `fuzz/corpus/fuzz_xdr_envelope/`: Initial seed corpus

### ✅ Acceptance Criteria
- [ ] Fuzz target runs under `cargo +nightly fuzz run fuzz_xdr_envelope`.
- [ ] Sustains at least 5,000 executions per second with zero crashes.
- [ ] Handles arbitrary malformed byte buffers safely without unhandled panics.
- [ ] Documented in README.md fuzz testing table.

### 🧪 Testing & Verification Plan
- Run `cargo +nightly fuzz run fuzz_xdr_envelope -- -max_total_time=60`.
- Verify corpus generation and crash reporting.

### 🔒 Security, Reliability & Performance Considerations
Protects backend and contract infrastructure against zero-day parser vulnerabilities and remote denial of service."""
    },
    {
        "title": "test(contract): Add fuzzing test for simultaneous global cap and org cap saturation",
        "labels": ["testing", "smart-contract"],
        "body": """### 🎯 Summary & Context
WorkloadGovernor has two distinct caps:
1. Global cap: max 15 pending applications across all orgs.
2. Org cap: max 4 active assignments in any single org.

While both caps are tested independently, edge cases occur when a contributor is simultaneously near or at both limits across multiple organizations (e.g. 15 pending applications, 4 assignments in Org A, 4 assignments in Org B), and transactions to apply, assign, revoke, and complete are interleaved concurrently.

### 🔍 Current Behavior & Root Cause
Existing fuzz targets test either application caps (`fuzz_batch_apply`) or assignment lifecycles independently, without testing the complex combinatorial state where both caps are saturated simultaneously.

### 🛠️ Proposed Solution & Technical Specification
1. Create `fuzz/fuzz_targets/fuzz_dual_cap_saturation.rs`:
   - Generate random sequences of actions across 5 distinct org IDs.
   - Maintain track of global pending applications and per-org active assignments.
   - At each step, verify:
     - If pending apps == 15, any further `apply_for_issue` returns `ContractError::GlobalApplicationLimitReached`.
     - If org assignments == 4, any further `assign_issue` returns `ContractError::OrgAssignmentLimitReached`.
     - Completing or revoking an assignment strictly decrements that org's count without altering other orgs' counters or global pending counts.
2. Seed with high-boundary edge cases (contributors with 14 apps and 3 assignments applying and being assigned in the same block).

### 📁 Affected Files & Modules
- `fuzz/fuzz_targets/fuzz_dual_cap_saturation.rs`: Fuzz target
- `fuzz/Cargo.toml`: Cargo configuration
- `src/test.rs`: Unit test regression fixtures

### ✅ Acceptance Criteria
- [ ] Dual cap saturation fuzz target compiles and runs cleanly.
- [ ] Invariants hold across 1,000,000 generated state transitions.
- [ ] Zero cap bypasses or unexpected state corruption detected.

### 🧪 Testing & Verification Plan
- Run `cargo +nightly fuzz run fuzz_dual_cap_saturation -- -max_total_time=120`.

### 🔒 Security, Reliability & Performance Considerations
Provides formal verification that cross-org cap mechanics remain robust under adversarial transaction patterns."""
    },
    {
        "title": "fix(testing): Fix flaky Playwright e2e test in admin-maintainer-flow.spec.ts",
        "labels": ["bug", "testing"],
        "body": """### 🎯 Summary & Context
The end-to-end integration test `tests/e2e/admin-maintainer-flow.spec.ts` occasionally fails intermittently in CI with `TimeoutError: locator.click: Timeout 5000ms exceeded waiting for button:has-text('Confirm Registration')`.

Flaky tests slow down development velocity, cause false-alarm CI failures, and erode developer trust in automated test suites.

### 🔍 Current Behavior & Root Cause
In `tests/e2e/admin-maintainer-flow.spec.ts`:
The test attempts to click the confirm button immediately after typing the maintainer address into the input field. On slower CI virtual machines, the async address validation debouncing (300ms) and button disabled-state transition take longer than expected, causing Playwright to attempt clicking a temporarily disabled button.

### 🛠️ Proposed Solution & Technical Specification
1. In `tests/e2e/admin-maintainer-flow.spec.ts`:
   - Replace brittle hardcoded timeouts with explicit condition assertions:
     ```typescript
     await expect(page.locator('input[name="maintainerAddress"]')).toHaveValue(targetAddress);
     await expect(page.locator('button:has-text("Confirm Registration")')).toBeEnabled({ timeout: 10000 });
     await page.locator('button:has-text("Confirm Registration")').click();
     ```
   - Wait for transaction confirmation toast: `await expect(page.locator('.toast-success')).toBeVisible()`.
2. Configure Playwright retry policy: 1 retry in CI environment.

### 📁 Affected Files & Modules
- `tests/e2e/admin-maintainer-flow.spec.ts`: E2E test file
- `playwright.config.ts`: Timeout and retry configuration

### ✅ Acceptance Criteria
- [ ] `admin-maintainer-flow.spec.ts` passes consistently 20 times in a row without timeouts.
- [ ] Uses Playwright web-first assertions (`toBeEnabled`, `toBeVisible`) instead of arbitrary sleeps.
- [ ] Flakiness rate in CI reduced to 0%.

### 🧪 Testing & Verification Plan
- Run test repeatedly locally: `npx playwright test admin-maintainer-flow.spec.ts --repeat-each=20`.

### 🔒 Security, Reliability & Performance Considerations
Guarantees reliable PR validation and eliminates CI pipeline delays."""
    },
    {
        "title": "test(api): Add end-to-end integration tests for multi-org application limits",
        "labels": ["testing", "backend"],
        "body": """### 🎯 Summary & Context
WorkloadGovernor allows contributors to distribute their 15 pending applications across multiple organizations (e.g. 5 in Org A, 5 in Org B, 5 in Org C). 

While unit tests check single-organization scenarios, an end-to-end API integration test is required to verify that the backend REST API, database indices, and Soroban mock accurately enforce the global limit across multiple organizations concurrently.

### 🔍 Current Behavior & Root Cause
Current API integration tests in `tests/api/issues.test.ts` only test single-organization workflows. There are no tests verifying that applying in Org 2 correctly respects the quota consumed by prior applications in Org 1.

### 🛠️ Proposed Solution & Technical Specification
1. In `tests/api/multiOrgLimits.test.ts`:
   - Set up 3 distinct organizations (`org-alpha`, `org-beta`, `org-gamma`).
   - Contributor applies for 6 issues in `org-alpha`.
   - Contributor applies for 6 issues in `org-beta`.
   - Contributor applies for 3 issues in `org-gamma` (total: 15).
   - Verify `GET /api/contributors/:address/workload` returns `totalPending: 15`, `isCapped: true`.
   - Attempt 16th application in `org-gamma`: assert HTTP 400 / 422 with `GLOBAL_CAP_REACHED`.
   - Withdraw 1 application from `org-alpha`: assert 16th application in `org-gamma` now succeeds.

### 📁 Affected Files & Modules
- `tests/api/multiOrgLimits.test.ts`: New integration test file
- `backend/src/routes/issues.ts`: API route logic
- `backend/src/services/issueService.ts`: Cap enforcement check

### ✅ Acceptance Criteria
- [ ] Integration test suite covers multi-org cap distribution.
- [ ] Enforces global 15-application cap across disparate orgs.
- [ ] Verifies withdrawal in one org immediately restores quota for other orgs.
- [ ] Runs in standard `npm test` pipeline.

### 🧪 Testing & Verification Plan
- Execute `npm test -- multiOrgLimits.test.ts` in root/backend.

### 🔒 Security, Reliability & Performance Considerations
Validates end-to-end user journeys before deployment."""
    },
    {
        "title": "fix(testing): Mock external Horizon RPC calls in vitest unit test suite",
        "labels": ["bug", "testing"],
        "body": """### 🎯 Summary & Context
Several unit tests in `frontend/src/` and `backend/src/` make real network HTTP requests to public Stellar Horizon servers (`https://horizon-testnet.stellar.org`) when testing balance checks and transaction status lookups.

When public Horizon servers experience rate limits, latency, or outages, local and CI unit tests fail even though application code is completely healthy.

### 🔍 Current Behavior & Root Cause
In `frontend/src/horizon.ts` and associated test files:
Tests call `horizonService.loadAccount(...)` without mocking `fetch` or `Server` instances from `stellar-sdk`. Tests take up to 4 seconds each waiting for live network responses.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/test-setup.ts` and `backend/src/__mocks__/horizon.ts`:
   - Use `msw` (Mock Service Worker) or `vitest.mock('stellar-sdk')` to intercept all outbound Horizon calls.
   - Provide standard JSON fixtures for:
     - `AccountResponse`: valid account with balances and sequence numbers.
     - `TransactionResponse`: successful transaction result XDR.
     - `LedgerResponse`: latest ledger sequence.
2. Enforce strict offline mode in test runner: fail tests immediately if an unmocked network request is initiated.

### 📁 Affected Files & Modules
- `frontend/src/test-setup.ts`: Global test setup
- `frontend/src/horizon.ts`: Client service
- `backend/src/__mocks__/horizon.ts`: Reusable test mocks
- `vitest.config.ts`: Mock configuration

### ✅ Acceptance Criteria
- [ ] Unit tests execute 100% offline without network connectivity.
- [ ] Test execution time reduced by >50%.
- [ ] Zero flakiness caused by public Horizon RPC rate limits or outages.
- [ ] Unmocked network requests trigger explicit test errors.

### 🧪 Testing & Verification Plan
- Disconnect internet / disable network and run `npm test`.
- All unit test suites must pass 100%.

### 🔒 Security, Reliability & Performance Considerations
Ensures deterministic, hermetic test runs across all development environments."""
    },
    {
        "title": "test(load): Create k6 load testing script for high-concurrency issue application spikes",
        "labels": ["testing", "performance"],
        "body": """### 🎯 Summary & Context
During popular Wave kickoff events, hundreds of developers simultaneously access the platform, query open issues, and submit application transactions.

A realistic load testing script using `k6` is required to stress test backend endpoints, measure database connection pool behavior, and identify p95/p99 latency bottlenecks before mainnet launch.

### 🔍 Current Behavior & Root Cause
There is currently no automated load testing harness. Performance limits and scaling thresholds in Helm and Terraform have not been validated under realistic synthetic traffic.

### 🛠️ Proposed Solution & Technical Specification
1. Create `tests/load/k6-application-spike.js`:
   - Scenarios:
     - Ramp up from 10 to 250 Virtual Users (VUs) over 2 minutes.
     - Maintain 250 VUs for 5 minutes.
     - Ramp down to 0 over 1 minute.
   - Traffic mix:
     - 70% `GET /api/orgs/:orgId/issues`
     - 15% `GET /api/contributors/:address/workload`
     - 10% `POST /api/verify-xdr`
     - 5% `GET /api/v1/leaderboard`
   - Thresholds:
     - `http_req_duration`: p95 < 200ms, p99 < 500ms
     - `http_req_failed`: < 1% (non-429 errors)
2. Add npm script: `npm run test:load`.

### 📁 Affected Files & Modules
- `tests/load/k6-application-spike.js`: Load script
- `package.json`: Add k6 test script
- `docs/performance-tuning.md`: Load test findings and benchmark targets

### ✅ Acceptance Criteria
- [ ] k6 script accurately simulates realistic user browsing and application flows.
- [ ] Enforces p95 < 200ms and error rate < 1% thresholds.
- [ ] Generates detailed HTML/JSON performance report.
- [ ] Documented in `docs/performance-tuning.md`.

### 🧪 Testing & Verification Plan
- Execute `k6 run tests/load/k6-application-spike.js` against local Docker compose environment.

### 🔒 Security, Reliability & Performance Considerations
Identifies database indexing gaps, memory leaks, and connection pool starvation before public production traffic."""
    },
    {
        "title": "fix(testing): Update obsolete snapshots in tests/unit/__snapshots__/snapshots.test.tsx.snap",
        "labels": ["bug", "testing"],
        "body": """### 🎯 Summary & Context
Recent visual updates to the contributor workload gauge and badge components modified the rendered HTML structure, causing snapshot tests in `tests/unit/__snapshots__/snapshots.test.tsx.snap` to fail.

Failing snapshot tests block local development and break CI pipeline verification until updated and reviewed.

### 🔍 Current Behavior & Root Cause
Running `npm test` in `frontend/` reports 3 failing tests due to snapshot mismatches:
`Snapshot name: WorkloadGauge renders correctly with 5 pending applications 1`
The snapshot contains outdated CSS class names (`gauge-inner-legacy`) that were replaced in recent design token refactoring.

### 🛠️ Proposed Solution & Technical Specification
1. Review snapshot differences carefully to verify that all markup changes are intended design improvements and not unintended regressions.
2. Update snapshots using Vitest update flag:
   `npm test -- -u` in `frontend/`.
3. Verify that all 15 snapshot tests pass cleanly.
4. Commit updated snapshots to repository.

### 📁 Affected Files & Modules
- `frontend/tests/unit/__snapshots__/snapshots.test.tsx.snap`: Snapshot file
- `frontend/src/components/__snapshots__/IssueCard.test.tsx.snap`

### ✅ Acceptance Criteria
- [ ] All snapshot tests pass with 0 failures on clean checkout.
- [ ] Snapshot markup contains updated semantic HTML and ARIA attributes.
- [ ] CI pipeline `frontend-ci.yml` passes without snapshot errors.

### 🧪 Testing & Verification Plan
- Execute `npm test` in `frontend/` and verify 100% test pass rate.

### 🔒 Security, Reliability & Performance Considerations
Maintains pristine CI build status and prevents test decay."""
    },
    {
        "title": "test(fuzz): Expand corpus generator with edge-case Stellar public key formats",
        "labels": ["testing", "dx"],
        "body": """### 🎯 Summary & Context
The seed corpus generator script `scripts/generate-corpus.py` creates structured binary inputs for our libFuzzer targets. Currently, the corpus generator only creates valid StrKey G-addresses (standard ed25519 public keys) and simple ASCII org names.

Expanding the generator to craft edge-case Stellar keys (M-multiplexed addresses, C-contract addresses, minimum/maximum hash bytes) improves fuzzing discovery of unexpected boundary panics.

### 🔍 Current Behavior & Root Cause
In `scripts/generate-corpus.py`:
The address generation function only generates 56-character Ed25519 public keys beginning with `G`. It does not generate Soroban contract addresses (beginning with `C`) or boundary byte buffers (all 0x00, all 0xFF).

### 🛠️ Proposed Solution & Technical Specification
1. In `scripts/generate-corpus.py`:
   - Add generators for:
     - Soroban contract addresses (`C...`)
     - Multiplexed Stellar addresses (`M...`)
     - Max and min raw 32-byte public key buffers (`[0x00; 32]`, `[0xFF; 32]`)
     - Invalid base32 checksum corruptions (single-bit flips in StrKey CRC16)
     - Empty, Unicode, and max-length (32-byte) symbol inputs
2. Output new corpus files to `fuzz/corpus/fuzz_apply/` and `fuzz/corpus/fuzz_lifecycle/`.
3. Ensure script remains idempotent: re-running overwrites seeds deterministically.

### 📁 Affected Files & Modules
- `scripts/generate-corpus.py`: Corpus generation script
- `fuzz/corpus/`: Generated seed corpus files
- `README.md`: Corpus generation documentation

### ✅ Acceptance Criteria
- [ ] `python3 scripts/generate-corpus.py` successfully generates expanded seed corpus.
- [ ] Corpus includes C-contract addresses, boundary keys, and CRC-corrupted test vectors.
- [ ] Fuzz targets run on new corpus without initial crashes.

### 🧪 Testing & Verification Plan
- Run `python3 scripts/generate-corpus.py`.
- Run `cargo +nightly fuzz run fuzz_apply fuzz/corpus/fuzz_apply -- -max_total_time=30`.

### 🔒 Security, Reliability & Performance Considerations
Maximizes code coverage during fuzz testing and surfaces obscure parser edge cases."""
    },
    {
        "title": "test(backend): Add unit tests for API key authentication middleware edge cases",
        "labels": ["testing", "backend"],
        "body": """### 🎯 Summary & Context
The backend middleware `apiKeyAuth` in `backend/src/app.ts` authenticates external organization maintainers and automated webhook publishers. 

Comprehensive unit tests are needed to verify edge cases: missing authorization headers, malformed Bearer schemes, revoked API keys, timing attack resistance, and rate limit tagging.

### 🔍 Current Behavior & Root Cause
Unit tests only test valid API key scenarios and a generic missing header test. Edge cases like empty strings, non-ASCII keys, expired keys, or malformed prefix tokens are not asserted.

### 🛠️ Proposed Solution & Technical Specification
1. Create `backend/src/__tests__/apiKeyAuth.test.ts`:
   - Test cases:
     1. Valid API key succeeds and populates `req.org` and `req.apiKeyScopes`.
     2. Missing `X-API-Key` or `Authorization: Bearer` header returns 401 Unauthorized.
     3. Invalid format (e.g. `Bearer` with no token) returns 401.
     4. Revoked API key returns 403 Forbidden.
     5. Constant-time comparison ensures timing attacks are mitigated.
     6. Key with read-only scope blocked from POST/mutation routes.

### 📁 Affected Files & Modules
- `backend/src/__tests__/apiKeyAuth.test.ts`: New unit tests
- `backend/src/app.ts`: Middleware logic
- `docs/api-key-guide.md`: API key security specification

### ✅ Acceptance Criteria
- [ ] 100% branch and statement coverage on `apiKeyAuth` middleware.
- [ ] Tests verify all HTTP 401 and 403 rejection scenarios.
- [ ] Timing attack constant-time comparison verified.

### 🧪 Testing & Verification Plan
- Execute `npm test -- apiKeyAuth.test.ts` in `backend/`.

### 🔒 Security, Reliability & Performance Considerations
Guarantees administrative and write endpoints are securely guarded against authentication bypasses."""
    },
    {
        "title": "test(frontend): Add visual regression tests for responsive navigation bar across mobile and desktop",
        "labels": ["testing", "frontend"],
        "body": """### 🎯 Summary & Context
The application navigation bar (`Navbar.tsx`) adapts across desktop, tablet, and mobile viewports, toggling a hamburger drawer, wallet status indicator, and network switcher.

Adding visual regression tests using Playwright ensures that navigation layout, alignment, and mobile drawer transitions do not regress across UI updates.

### 🔍 Current Behavior & Root Cause
Currently, only functional unit tests exist for `Navbar.tsx`. CSS regressions (e.g. wallet address overlapping with menu button on 390px screens) are not detected by standard unit tests.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/tests/visual/navbar.visual.spec.ts`:
   - Capture screenshot baselines for:
     - Desktop (1280x720): Expanded navigation links, network badge, connected wallet.
     - Tablet (768x1024): Condensed view.
     - Mobile (375x667): Closed hamburger menu and open mobile drawer overlay.
     - Both light mode and dark mode themes.
   - Use `expect(page).toHaveScreenshot('navbar-desktop.png')`.
2. Configure 0.2% max pixel difference threshold in `playwright.config.ts`.

### 📁 Affected Files & Modules
- `frontend/tests/visual/navbar.visual.spec.ts`: Visual regression test
- `frontend/src/components/Navbar.tsx`: Navigation bar markup
- `playwright.config.ts`: Visual test settings

### ✅ Acceptance Criteria
- [ ] Visual regression tests cover Desktop, Tablet, and Mobile viewports.
- [ ] Light and dark mode visual baselines established.
- [ ] Tests run cleanly in headless Chromium.

### 🧪 Testing & Verification Plan
- Run `npx playwright test tests/visual/navbar.visual.spec.ts --update-snapshots`.
- Verify snapshot comparisons pass on subsequent test runs.

### 🔒 Security, Reliability & Performance Considerations
Protects user brand experience and prevents visual bugs on mobile devices."""
    }
]

# Category 1: Smart Contract (Soroban / Rust) - 11 issues

SMART_CONTRACT_ISSUES = [
    {
        "title": "fix(contract): Eliminate missed mutants in contract upgrade verification",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### 🎯 Summary & Context
Mutation testing executed via `cargo mutants --features testutils -- src/lib.rs` and reported by `scripts/mutation-report.js` reveals a critical test blind spot: the mutant at `src/lib.rs:109:9` (which replaces `WorkloadGovernor::upgrade` implementation with a no-op unit `()`) is missed by the current contract test suite.

Contract upgrades are an administrative security-critical lifecycle operation on Soroban. The upgrade mechanism allows the authorized contract administrator to replace the contract executable bytecode with a newly deployed WASM hash. If tests do not detect when the function body is completely bypassed, regression tests provide zero assurance against accidental disabling or failure of live contract upgrades.

### 🔍 Current Behavior & Root Cause
In `src/test.rs`, the existing upgrade test only invokes the admin authorization mock and verifies that `upgrade(&new_wasm_hash)` completes without panicking. It fails to assert that:
1. `env.deployer().update_current_contract_wasm(...)` was actually invoked with the supplied hash.
2. Subsequent calls to the contract execute the new bytecode or reflect updated state/behavior.
3. Non-admin callers are strictly rejected with `ContractError::UnauthorizedAdmin`.

Because the test only verifies absence of panics without checking deployment side-effects, replacing the upgrade implementation with `()` still allows all test assertions in `src/test.rs` to pass.

### 🛠️ Proposed Solution & Technical Specification
1. Update `src/test.rs` with explicit state verification tests for `upgrade`:
   - Mock a secondary test contract or updated WASM hash using `env.deployer()`.
   - Call `WorkloadGovernorClient::upgrade(&admin, &new_wasm_hash)`.
   - Verify that the contract code hash retrieved from the environment matches `new_wasm_hash`.
2. Add negative tests:
   - Ensure a non-admin address attempting to invoke `upgrade` immediately triggers `ContractError::UnauthorizedAdmin` (Error code 3).
   - Ensure an empty or invalid WASM hash triggers validation failure before calling deployer.
3. Verify that running `cargo mutants --features testutils -- src/lib.rs` catches mutant `src/lib.rs:109:9`.

### 📁 Affected Files & Modules
- `contracts/src/lib.rs` (or `src/lib.rs`): `WorkloadGovernor::upgrade` implementation
- `contracts/src/test.rs` (or `src/test.rs`): Contract upgrade test cases
- `scripts/mutation-report.js`: Mutation testing validation suite

### ✅ Acceptance Criteria
- [ ] Unit test explicitly verifies WASM hash update upon successful `upgrade` invocation by admin.
- [ ] Negative test verifies unauthorized non-admin address receives `ContractError::UnauthorizedAdmin`.
- [ ] Replacing `WorkloadGovernor::upgrade` body with `()` causes `cargo test` to fail immediately.
- [ ] Mutation score on `src/lib.rs` reflects that mutant `src/lib.rs:109:9` is caught.

### 🧪 Testing & Verification Plan
- Run `cargo test --features testutils test_upgrade_success`
- Run `cargo test --features testutils test_upgrade_unauthorized_fails`
- Run `cargo mutants --features testutils -- src/lib.rs` and verify mutant at line 109 is killed.

### 🔒 Security, Reliability & Performance Considerations
Upgrades must maintain authorization integrity to prevent unauthorized contract hijacking. Gas consumption during upgrade calls should remain well below Stellar ledger invocation limits."""
    },
    {
        "title": "fix(contract): Catch mutation regression in issue assignment duplicate validation",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### 🎯 Summary & Context
In `src/lib.rs:283:26`, mutation testing identified that replacing equality checks (`==` with `!=`) or bypassing `storage::has_assignment(&env, &org_id, issue_id, &contributor)` in `WorkloadGovernor::assign_issue` is not caught by the test suite. 

WorkloadGovernor exists specifically to enforce assignment caps and ensure that task allocations cannot be duplicated or monopolized. A failure in duplicate assignment validation breaks the core invariant of the protocol.

### 🔍 Current Behavior & Root Cause
In `assign_issue(env, maintainer, contributor, org_id, issue_id)`:
The logic checks whether an assignment already exists. If `storage::has_assignment(...)` is true, it should immediately panic with `ContractError::AlreadyAssigned` (Error Code 11).
However, tests in `src/test.rs` only test the happy path of assigning an applied issue once. There is no explicit test case that attempts to assign the exact same issue a second time to verify that `ContractError::AlreadyAssigned` is thrown.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/test.rs`, implement `test_assign_issue_duplicate_fails`:
   - Set up admin, maintainer, contributor, and org.
   - Contributor applies for `issue_id = 101`.
   - Maintainer calls `assign_issue(&maintainer, &contributor, &org_id, 101)`.
   - Maintainer attempts a second `assign_issue(&maintainer, &contributor, &org_id, 101)`.
   - Assert `should_panic(expected = "AlreadyAssigned")` or check error code 11.
2. In addition, test cross-contributor duplicate assignment:
   - Contributor B applies for `issue_id = 101`.
   - Maintainer attempts to assign `issue_id = 101` to Contributor B while it is already assigned to Contributor A.
   - Assert failure with `ContractError::AlreadyAssigned`.

### 📁 Affected Files & Modules
- `src/lib.rs`: `assign_issue` function and state validations
- `src/storage.rs`: `has_assignment` key checks
- `src/test.rs`: Unit test suite

### ✅ Acceptance Criteria
- [ ] Calling `assign_issue` on an already-assigned issue to the same contributor fails with `ContractError::AlreadyAssigned`.
- [ ] Calling `assign_issue` on an already-assigned issue to a different contributor fails with `ContractError::AlreadyAssigned`.
- [ ] Mutation at `src/lib.rs:283:26` is killed during mutation testing.
- [ ] All property-based tests in `prop_` continue to pass.

### 🧪 Testing & Verification Plan
- Run `cargo test --features testutils test_assign_issue_duplicate`
- Run `cargo mutants --features testutils -- src/lib.rs`

### 🔒 Security, Reliability & Performance Considerations
Prevents race conditions in maintainer dashboards where concurrent assignment approvals could result in duplicate ledger writes and distorted org assignment metrics."""
    },
    {
        "title": "fix(contract): Catch mutation regression in complete_assignment maintainer validation",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### 🎯 Summary & Context
In `src/lib.rs:333:22`, mutation testing caught a missed mutant where replacing maintainer authorization verification with a no-op or inverted comparison (`==` to `!=`) passed all existing unit tests.

Only authorized organization maintainers registered via `register_maintainer` are permitted to transition an active assignment to `completed`. Allowing unauthorized addresses or arbitrary callers to trigger completion would allow contributors to self-certify completion or unauthorized third parties to manipulate contributor caps.

### 🔍 Current Behavior & Root Cause
`WorkloadGovernor::complete_assignment` validates that:
1. Maintainer has authenticated: `maintainer.require_auth()`.
2. Maintainer is registered for `org_id`: `storage::is_maintainer(&env, &maintainer, &org_id)`.
If `is_maintainer` returns false, it returns `ContractError::UnauthorizedMaintainer` (Error code 4).
However, `src/test.rs` lacks a negative test where an unauthorized address calls `complete_assignment`.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/test.rs`, add `test_complete_assignment_unauthorized_maintainer`:
   - Register `maintainer_1` for `org_1`.
   - Setup an active assignment for `contributor` on `org_1`, `issue_id = 42`.
   - Create an unauthorized address `random_user`.
   - Mock auth for `random_user`.
   - Call `complete_assignment(&random_user, &contributor, &org_1, 42)`.
   - Assert that the call fails with error code 4 (`UnauthorizedMaintainer`).
2. Add a cross-org test:
   - Register `maintainer_2` for `org_2` (not `org_1`).
   - `maintainer_2` attempts to complete assignment on `org_1`.
   - Assert failure with `ContractError::UnauthorizedMaintainer`.

### 📁 Affected Files & Modules
- `src/lib.rs`: `complete_assignment` method
- `src/test.rs`: Maintainer authorization test cases

### ✅ Acceptance Criteria
- [ ] Calling `complete_assignment` with an unregistered maintainer fails with `ContractError::UnauthorizedMaintainer`.
- [ ] Calling `complete_assignment` with a maintainer registered for a different org fails with `ContractError::UnauthorizedMaintainer`.
- [ ] Mutant at line 333 is killed in `cargo mutants`.

### 🧪 Testing & Verification Plan
- `cargo test --features testutils test_complete_assignment_unauthorized_maintainer`
- `cargo mutants --features testutils -- src/lib.rs`

### 🔒 Security, Reliability & Performance Considerations
Strict maintainer authorization guarantees the integrity of task completion records and ensures contributor workload caps decrement only when authorized org leads sign off."""
    },
    {
        "title": "fix(contract): Catch mutation regression in revoke_assignment state checks",
        "labels": ["bug", "smart-contract", "testing"],
        "body": """### 🎯 Summary & Context
In `src/lib.rs:382:22`, mutation testing revealed that mutating the precondition check verifying that an assignment exists prior to revocation is not caught by the test suite.

Revoking an assignment frees up a contributor's org assignment capacity (decrementing `o_asgn` counter by 1) and removes the assignment record. If `revoke_assignment` can be called on non-existent assignments without failing, an attacker could underflow or artificially decrement the contributor's active assignment count below zero.

### 🔍 Current Behavior & Root Cause
In `revoke_assignment(env, maintainer, contributor, org_id, issue_id)`:
The contract checks `storage::has_assignment(...)`. If false, it should fail with `ContractError::AssignmentNotFound` (Error Code 10).
The test suite currently only tests revocation of valid, active assignments. There are no tests invoking `revoke_assignment` with:
- An issue that was never applied for or assigned.
- An issue that was already completed.
- An issue that was already revoked.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/test.rs`, implement `test_revoke_nonexistent_assignment_fails`:
   - Initialize contract and register maintainer.
   - Invoke `revoke_assignment` for a non-existent `issue_id = 999`.
   - Assert `ContractError::AssignmentNotFound`.
2. Implement `test_revoke_already_revoked_assignment_fails`:
   - Create assignment, revoke it successfully.
   - Attempt to revoke it a second time.
   - Assert `ContractError::AssignmentNotFound`.
3. Implement `test_revoke_completed_assignment_fails`:
   - Create assignment, complete it successfully.
   - Attempt to revoke it.
   - Assert `ContractError::AssignmentNotFound`.

### 📁 Affected Files & Modules
- `src/lib.rs`: `revoke_assignment` implementation
- `src/storage.rs`: Assignment storage keys and count management
- `src/test.rs`: Revocation edge case tests

### ✅ Acceptance Criteria
- [ ] Revoking non-existent assignment returns `ContractError::AssignmentNotFound`.
- [ ] Double-revoking an assignment returns `ContractError::AssignmentNotFound`.
- [ ] Attempting to revoke a completed assignment returns `ContractError::AssignmentNotFound`.
- [ ] Mutant at line 382 is killed by `cargo mutants`.

### 🧪 Testing & Verification Plan
- `cargo test --features testutils test_revoke_`
- `cargo mutants --features testutils -- src/lib.rs`

### 🔒 Security, Reliability & Performance Considerations
Protects against integer underflow attacks on `o_asgn` counters and guarantees that org assignment metrics remain mathematically sound."""
    },
    {
        "title": "fix(contract): Emit event on extend_application_ttl and fix mutation test gap",
        "labels": ["bug", "smart-contract"],
        "body": """### 🎯 Summary & Context
`WorkloadGovernor::extend_application_ttl` in `src/lib.rs:381` currently extends the ledger lifetime (TTL) of a pending application in temporary storage, but fails to emit an event. Mutation testing also showed that mutations at lines 425:9, 429:62, and 425:12 were missed.

Off-chain services (such as the event indexer and frontend UI) need real-time notifications when an application's TTL is bumped so they can refresh UI countdown badges and update TTL monitoring metrics in Prometheus.

### 🔍 Current Behavior & Root Cause
1. `extend_application_ttl` performs `env.storage().temporary().extend_ttl(...)` for the key `("app", contributor, org_id, issue_id)`.
2. No contract event is emitted via `env.events().publish(...)`.
3. The check verifying that `storage::get_global_app_count(&env, &contributor) > 0` was not tested for the zero-count condition in `src/test.rs`.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/events.rs`:
   Define `emit_app_ttl_extended(env: &Env, contributor: &Address, org_id: &Symbol, issue_id: u32, new_ttl: u32)`.
   Topics: `(Symbol::new(env, "app_ttl_extended"), contributor, org_id)`.
   Data: `(issue_id, new_ttl)`.
2. In `src/lib.rs`:
   Call `events::emit_app_ttl_extended(...)` inside `extend_application_ttl`.
3. In `src/test.rs`:
   - Add assertion verifying event emission and topics on `extend_application_ttl`.
   - Add negative test asserting failure when contributor has 0 applications.

### 📁 Affected Files & Modules
- `src/events.rs`: Event emitter definition
- `src/lib.rs`: `extend_application_ttl` logic
- `src/test.rs`: Unit test for TTL extension and event verification
- `docs/event-schema.md`: Document schema for `app_ttl_extended`

### ✅ Acceptance Criteria
- [ ] `extend_application_ttl` emits `app_ttl_extended` event with correct topics and payload.
- [ ] Unit tests verify event is published with correct contributor, org, issue, and ledger TTL.
- [ ] Mutants at lines 425:9, 429:62, and 425:12 are killed.
- [ ] Event schema documentation is updated in `docs/event-schema.md`.

### 🧪 Testing & Verification Plan
- `cargo test --features testutils test_extend_application_ttl_emits_event`
- Inspect emitted event logs in test environment.

### 🔒 Security, Reliability & Performance Considerations
Temporary storage entries must have predictable TTL management to avoid accidental expiration while issues are undergoing review."""
    },
    {
        "title": "feat(contract): Add batch application withdrawal to reduce transaction fees",
        "labels": ["enhancement", "smart-contract", "performance"],
        "body": """### 🎯 Summary & Context
Contributors who reach the global cap of 15 pending applications often wish to withdraw multiple stale applications simultaneously to free up quota for new high-priority issues. Currently, withdrawing requires separate transactions for each application.

Submitting up to 15 separate Stellar transactions creates unnecessary gas fees, ledger congestion, and poor developer experience. A native batch withdrawal function allows contributors to clean up their pending applications in a single atomic transaction.

### 🔍 Current Behavior & Root Cause
`WorkloadGovernor` only exposes:
`withdraw_application(env: Env, contributor: Address, org_id: Symbol, issue_id: u32)`
To withdraw 5 applications, a contributor must sign and broadcast 5 separate Soroban transactions, costing ~5x base fees and requiring sequential nonce management.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/lib.rs`, add:
   ```rust
   pub fn batch_withdraw_applications(
       env: Env,
       contributor: Address,
       withdrawals: Vec<(Symbol, u32)>
   ) -> Result<u32, ContractError>
   ```
2. Implementation steps:
   - Authenticate `contributor.require_auth()`.
   - Enforce maximum batch size limit (e.g. `withdrawals.len() <= 15`).
   - Iterate through each `(org_id, issue_id)` pair:
     - Verify application exists via `storage::has_application(&env, &contributor, &org_id, issue_id)`.
     - Remove application entry from temporary storage.
     - Emit individual `ApplicationWithdrawn` event or `BatchApplicationsWithdrawn`.
   - Decrement `storage::get_global_app_count` by the number of successfully withdrawn applications.
   - Return total count of withdrawn applications.

### 📁 Affected Files & Modules
- `src/lib.rs`: Function interface and batch processing
- `src/storage.rs`: Atomic counter decrement helper
- `src/events.rs`: Batch event emission
- `src/test.rs`: Batch withdrawal unit and invariant tests

### ✅ Acceptance Criteria
- [ ] `batch_withdraw_applications` successfully removes all specified applications in a single transaction.
- [ ] Contributor global application count is accurately decremented.
- [ ] Fails gracefully or skips if a specified application does not exist.
- [ ] Batch size exceeding 15 items returns `ContractError::BatchSizeExceeded`.
- [ ] Contributor authentication is verified once at transaction root.

### 🧪 Testing & Verification Plan
- Test batch withdrawal of 1, 5, and 15 applications.
- Verify global application counter decreases monotonically.
- Bench test CPU instructions and RAM usage against single transactions.

### 🔒 Security, Reliability & Performance Considerations
Atomic updates ensure that a failure midway does not leave the global counter out of sync with stored application keys."""
    },
    {
        "title": "refactor(contract): Optimize storage key footprint to reduce ledger write costs",
        "labels": ["enhancement", "smart-contract", "performance"],
        "body": """### 🎯 Summary & Context
Soroban charges transaction fees and storage rent proportional to ledger storage entry byte size. Analysis of the current storage key patterns in `src/storage.rs` shows that verbose tuple structures and duplicate string identifiers consume unnecessary ledger bytes.

Optimizing the key design lowers deployment costs, reduces invocation gas fees for all contributors, and maintains zero key collision guarantees.

### 🔍 Current Behavior & Root Cause
Current keys use combinations of string symbols such as:
- `("app", contributor, org_id, issue_id)`
- `("asgn", org_id, issue_id, contributor)`
- `("o_asgn", contributor, org_id)`
- `("g_apps", contributor)`
Using multi-element tuples with verbose prefix symbols incurs serialization overhead in Soroban's XDR encoding.

### 🛠️ Proposed Solution & Technical Specification
1. Benchmark current XDR key sizes using `scripts/check-key-collisions.sh` and Soroban testutils.
2. Refactor storage keys in `src/storage.rs`:
   - Use compact integer enum tags or 1-byte prefixes (`Symbol::short("a")`, `Symbol::short("g")`) instead of full strings.
   - Ensure canonical ordering of compound keys: `(Prefix, Contributor, OrgId, IssueId)`.
3. Verify zero key collision via automated collision check script.
4. Update `docs/storage-design.md` with new byte size benchmarks and comparison matrix.

### 📁 Affected Files & Modules
- `src/storage.rs`: Storage key constructors and type definitions
- `scripts/check-key-collisions.sh`: Collision freedom verification script
- `docs/storage-design.md`: Storage architecture documentation

### ✅ Acceptance Criteria
- [ ] Storage key byte footprint reduced by at least 15% across all entry types.
- [ ] `scripts/check-key-collisions.sh` passes 100% with zero key collisions across 1,000,000 synthetic keys.
- [ ] All existing contract unit tests and fuzz tests pass without regression.
- [ ] Updated storage key reference table in `docs/storage-design.md`.

### 🧪 Testing & Verification Plan
- Run `cargo test --features testutils`
- Run `bash scripts/check-key-collisions.sh`
- Measure serialized XDR byte size before and after refactoring.

### 🔒 Security, Reliability & Performance Considerations
Any change in key serialization must guarantee mathematical distinctness across temporary and persistent storage tiers to prevent key collision attacks."""
    },
    {
        "title": "feat(contract): Support configurable application TTL duration via admin governance",
        "labels": ["enhancement", "smart-contract", "architecture"],
        "body": """### 🎯 Summary & Context
Currently, pending application TTLs are hardcoded to a fixed ledger constant in `src/lib.rs`. During high-volume hackathons or extended review cycles, the default TTL may be either too short (causing premature expiration) or too long (locking quota unnecessarily).

Providing a governance-controlled parameter allows contract administrators to tune TTL durations to match the operational pace of active waves without requiring full contract bytecode upgrades.

### 🔍 Current Behavior & Root Cause
In `src/lib.rs`:
`const DEFAULT_APP_TTL_LEDGERS: u32 = 17280; // ~1 day`
This value is compiled directly into the WASM binary. If maintainers need a 3-day or 7-day application window, the entire contract must undergo a governance upgrade and new WASM deployment.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/storage.rs`:
   - Add persistent storage key `DataKey::AppTtlLedgers`.
   - Add helper functions `get_app_ttl_ledgers(env: &Env) -> u32` (defaulting to 17280 if unset) and `set_app_ttl_ledgers(env: &Env, ledgers: u32)`.
2. In `src/lib.rs`:
   - Add admin function:
     ```rust
     pub fn set_application_ttl_duration(env: Env, admin: Address, ttl_ledgers: u32) -> Result<(), ContractError>
     ```
   - Authenticate `admin.require_auth()` and verify caller matches stored admin.
   - Enforce sanity bounds: `MIN_TTL (1,000 ledgers) <= ttl_ledgers <= MAX_TTL (518,400 ledgers / ~30 days)`.
   - Update `apply_for_issue` and `extend_application_ttl` to use the dynamic value.
3. Emit event `AdminConfigUpdated(Symbol::new(&env, "app_ttl"), ttl_ledgers)`.

### 📁 Affected Files & Modules
- `src/lib.rs`: Admin configuration endpoint
- `src/storage.rs`: Storage getter/setter for TTL duration
- `src/events.rs`: Config update event emission
- `src/test.rs`: Admin configuration tests

### ✅ Acceptance Criteria
- [ ] Admin can configure application TTL within allowed bounds [1,000, 518,400].
- [ ] Non-admin callers attempting to set TTL duration receive `ContractError::UnauthorizedAdmin`.
- [ ] `apply_for_issue` sets temporary storage TTL according to the dynamic configured value.
- [ ] Event is emitted upon successful configuration update.

### 🧪 Testing & Verification Plan
- Unit test configuring TTL to valid, min, and max values.
- Verify negative test for out-of-bounds TTL and unauthorized callers.
- Test that new applications receive the updated TTL.

### 🔒 Security, Reliability & Performance Considerations
Upper and lower bounds prevent administrators from accidentally setting TTL to 0 (immediate expiration) or unreasonably large values that exceed Soroban temporary storage limits."""
    },
    {
        "title": "fix(contract): Validate organization ID characters and length limit",
        "labels": ["bug", "smart-contract", "security"],
        "body": """### 🎯 Summary & Context
Organization identifiers (`org_id`) in `WorkloadGovernor` are represented as `Symbol` types. Currently, arbitrary symbol values—including empty symbols or symbols with control characters—are accepted without validation during maintainer registration or issue application.

Allowing malformed organization identifiers leads to storage fragmentation, off-chain database indexing errors, and potential cross-site scripting (XSS) or URL injection risks in downstream frontend clients.

### 🔍 Current Behavior & Root Cause
Functions taking `org_id: Symbol` (such as `register_maintainer`, `apply_for_issue`, `assign_issue`) do not inspect symbol character length or validate alphanumeric slug formatting. A client can supply an empty symbol `""` or special characters that fail regex validation on the backend or in PostgreSQL migrations.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/validation.rs` (or `src/lib.rs`):
   Create `validate_org_id(env: &Env, org_id: &Symbol) -> Result<(), ContractError>`:
   - Check symbol length: `1 <= len <= 32`.
   - Check character set: only ASCII alphanumeric characters and hyphens/underscores (`[a-zA-Z0-9_-]`).
   - If invalid, return `ContractError::InvalidOrgId` (define new error code 13).
2. Apply `validate_org_id` across:
   - `register_maintainer`
   - `deregister_maintainer`
   - `apply_for_issue`
   - `assign_issue`
   - `complete_assignment`
   - `revoke_assignment`
3. Add error variant `InvalidOrgId = 13` to `ContractError` in `src/errors.rs`.

### 📁 Affected Files & Modules
- `src/errors.rs`: New `InvalidOrgId` error code
- `src/validation.rs`: Org validation logic
- `src/lib.rs`: Endpoint validation hooks
- `src/test.rs`: Unit tests for valid and invalid org IDs

### ✅ Acceptance Criteria
- [ ] Org IDs between 1 and 32 valid characters succeed.
- [ ] Empty org ID symbol fails with `ContractError::InvalidOrgId`.
- [ ] Org IDs with spaces, slashes, or special symbols fail with `ContractError::InvalidOrgId`.
- [ ] Org IDs exceeding 32 characters fail validation.

### 🧪 Testing & Verification Plan
- Property test random symbol inputs against validator.
- Unit test edge cases: empty symbol, 1 character, 32 characters, 33 characters, whitespace.

### 🔒 Security, Reliability & Performance Considerations
Ensures 100% interoperability between Soroban storage symbols, PostgreSQL schema constraints, and frontend routing slugs."""
    },
    {
        "title": "fix(contract): Prevent re-initialization race condition in contract deployments",
        "labels": ["bug", "smart-contract", "security"],
        "body": """### 🎯 Summary & Context
In `WorkloadGovernor::initialize(env, admin)`, the contract checks whether the contract has already been initialized by checking `storage::has_admin(&env)`. However, if the deployment and initialization steps are performed in separate transactions on the public network, front-running attacks can occur where an attacker initializes the contract before the legitimate deployer.

Securing the initialization phase is essential to ensure that the initial admin address is immutably and safely established during deployment.

### 🔍 Current Behavior & Root Cause
In `src/lib.rs`:
`initialize` requires no authorization if called for the first time, because no admin exists yet. If a deployer uploads the contract WASM and creates the contract instance without bundling `initialize` in the same transaction envelope, an observer can monitor the mempool and front-run the `initialize` call with their own address as admin.

### 🛠️ Proposed Solution & Technical Specification
1. Support atomic factory initialization pattern or require deployer authentication:
   - Allow optional deployer address verification: `admin.require_auth()` during `initialize` to prove ownership of the private key.
   - Enforce that `initialize` asserts `!storage::has_admin(&env)`.
   - Emit `ContractInitialized(admin)` event immediately upon initialization.
2. In documentation and deploy scripts (`docs/runbooks/contract-upgrade.md` and `scripts/deploy.sh`):
   - Mandate bundling contract creation and `initialize` invocation in a single atomic Stellar `TransactionEnvelope`.
   - Provide CLI examples using `stellar contract deploy` with `--constructor-args` or bundled invocations.

### 📁 Affected Files & Modules
- `src/lib.rs`: `initialize` implementation and auth verification
- `src/test.rs`: Double-initialization and unauthorized initialization tests
- `docs/admin-guide.md`: Deployment procedure and atomic initialization guidelines

### ✅ Acceptance Criteria
- [ ] Calling `initialize` twice strictly reverts with `ContractError::AlreadyInitialized`.
- [ ] `admin.require_auth()` is enforced during `initialize`.
- [ ] Event `ContractInitialized` is published with the initialized admin address.
- [ ] Deployment runbook details atomic transaction bundling.

### 🧪 Testing & Verification Plan
- Unit test `test_double_initialize_fails`
- Test auth rejection when admin private key signature is absent.

### 🔒 Security, Reliability & Performance Considerations
Eliminates admin takeover vulnerabilities during fresh testnet and mainnet contract deployments."""
    },
    {
        "title": "test(contract): Add property-based invariant test for global application cap monotonic counter",
        "labels": ["testing", "smart-contract"],
        "body": """### 🎯 Summary & Context
The central invariant of WorkloadGovernor is:
**For any contributor C, `global_application_count(C) <= 15` at all times, and `global_application_count(C)` equals the exact count of active entries `("app", C, org_id, issue_id)` in temporary storage.**

While unit tests check individual transitions, property-based testing using `proptest` is required to prove that arbitrary permutations of applies, withdrawals, assignments, and expirations never violate counter monotonicity or cause counter drift.

### 🔍 Current Behavior & Root Cause
Existing unit tests in `src/test.rs` execute deterministic linear sequences (e.g. apply 15 times, check cap error). They do not test chaotic interleaved sequences involving multiple orgs, repeated withdrawals, random issue IDs, or concurrent operations across contributors.

### 🛠️ Proposed Solution & Technical Specification
1. In `src/test.rs` (or `contracts/src/proptest.rs`):
   Define a proptest state machine model:
   - Generate random sequences of actions: `Apply(org, issue)`, `Withdraw(org, issue)`, `Assign(maintainer, org, issue)`.
   - Maintain a shadow model of expected active applications.
2. After every step in the generated sequence, assert:
   - `client.get_global_application_count(&contributor) <= 15`.
   - `client.get_global_application_count(&contributor) == shadow_model.count()`.
   - For every `(org, issue)` in shadow model, `client.has_applied(&contributor, &org, issue) == true`.
3. Configure `proptest` to run at least 500 cases per test suite execution.

### 📁 Affected Files & Modules
- `src/test.rs`: Property-based test module
- `Cargo.toml`: Add `proptest = \"1.11\"` under `[dev-dependencies]`

### ✅ Acceptance Criteria
- [ ] Proptest suite runs at least 500 randomized lifecycle sequences without failure.
- [ ] Invariant `count <= 15` holds across all permutations.
- [ ] Shadow model and on-chain contract state match 100% on active application entries.
- [ ] Counter underflow or negative drift is impossible under arbitrary withdrawal orderings.

### 🧪 Testing & Verification Plan
- Run `cargo test --features testutils prop_global_cap_invariants`
- Verify proptest runs in CI pipeline under `contract-ci.yml`.

### 🔒 Security, Reliability & Performance Considerations
Guarantees mathematical correctness of state transitions and provides formal regression safety against counter corruption."""
    }
]

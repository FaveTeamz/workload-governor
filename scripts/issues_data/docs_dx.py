# Category 12: Documentation, Specifications & DX - 12 issues

DOCS_DX_ISSUES = [
    {
        "title": "fix(docs): Synchronize openapi.yaml with undocumented endpoints in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### 🎯 Summary & Context
Discrepancies currently exist between the OpenAPI 3.0 specification in `openapi.yaml` and the markdown reference guide in `docs/api-reference.md`. Several endpoints defined in OpenAPI lack markdown examples, while certain query parameters described in markdown are missing from YAML schemas.

Synchronizing both references ensures client SDK generators, API consumers, and external integrators have complete, consistent documentation.

### 🔍 Current Behavior & Root Cause
In `docs/api-reference.md`:
Endpoints like `POST /api/verify-xdr` and cursor pagination query parameters (`cursor`, `limit`) have slight parameter name differences from `openapi.yaml`. Running `scripts/check-api-docs-sync.js` reports 4 schema divergence warnings.

### 🛠️ Proposed Solution & Technical Specification
1. Run `node scripts/check-api-docs-sync.js` to identify all divergence points.
2. Update `openapi.yaml`:
   - Ensure all parameters, request bodies, response schemas, and error codes (400, 401, 404, 409, 429, 500) match backend implementation.
3. Update `docs/api-reference.md`:
   - Provide concrete JSON request/response payloads, curl command snippets, and TypeScript SDK usage examples.
4. Ensure `check-api-docs-sync.js` passes with zero warnings.

### 📁 Affected Files & Modules
- `openapi.yaml`: OpenAPI 3.0 specification
- `docs/api-reference.md`: Markdown documentation
- `scripts/check-api-docs-sync.js`: Verification script

### ✅ Acceptance Criteria
- [ ] `node scripts/check-api-docs-sync.js` passes with 0 errors/warnings.
- [ ] All API endpoints have matching definitions in both YAML and Markdown.
- [ ] Swagger UI at `/docs` displays complete schemas without validation errors.

### 🧪 Testing & Verification Plan
- Run `node scripts/check-api-docs-sync.js`.
- Validate `openapi.yaml` using Swagger CLI / Redocly.

### 🔒 Security, Reliability & Performance Considerations
Guarantees developer trust and smooth third-party ecosystem integration."""
    },
    {
        "title": "fix(docs): Document GET /api/contributors endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### 🎯 Summary & Context
The backend exposes `GET /api/contributors/:address` to query a contributor's current application workload, completed tasks, and active organizations. This core endpoint is missing from `docs/api-reference.md`.

Frontend developers and third-party dashboard builders cannot easily discover or integrate contributor profile endpoints without digging through backend source code.

### 🔍 Current Behavior & Root Cause
`backend/src/routes/contributors.ts` implements the endpoint, but `docs/api-reference.md` omits it from the table of contents and reference sections.

### 🛠️ Proposed Solution & Technical Specification
1. In `docs/api-reference.md`:
   - Add section: `### GET /api/contributors/:address`.
   - Document path parameter: `address` (Stellar G-address).
   - Document response payload schema:
     ```json
     {
       "address": "GB7B5432...",
       "globalPendingApplications": 7,
       "globalCap": 15,
       "remainingQuota": 8,
       "activeAssignmentsCount": 2,
       "organizations": [
         { "orgId": "stellar", "activeAssignments": 1, "orgCap": 4 }
       ],
       "completedAssignmentsTotal": 14
     }
     ```
   - Provide curl example and error responses (400 Invalid Address, 404 Not Found).

### 📁 Affected Files & Modules
- `docs/api-reference.md`: API documentation
- `openapi.yaml`: Schema verification

### ✅ Acceptance Criteria
- [ ] `GET /api/contributors/:address` documented with full parameters and response schemas.
- [ ] Working curl and JavaScript fetch examples provided.
- [ ] Added to table of contents and navigation index.

### 🧪 Testing & Verification Plan
- Verify markdown rendering in GitHub preview.
- Run `node scripts/check-api-docs-sync.js`.

### 🔒 Security, Reliability & Performance Considerations
Improves developer experience and eliminates ambiguity in contributor profile queries."""
    },
    {
        "title": "fix(docs): Document GET /api/events endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### 🎯 Summary & Context
The event query endpoint `GET /api/events` allows clients to filter historical contract events by `orgId`, `contributor`, `eventType`, and date range. 

Because this endpoint is omitted from `docs/api-reference.md`, external analytics tools and community dashboards have difficulty querying historical audit events.

### 🔍 Current Behavior & Root Cause
In `backend/src/routes/events.ts`:
The endpoint is implemented and queried by the frontend, but completely absent from the official documentation guide.

### 🛠️ Proposed Solution & Technical Specification
1. In `docs/api-reference.md`:
   - Add section: `### GET /api/events`.
   - Document query parameters:
     - `orgId`: optional filter by organization slug.
     - `contributor`: optional filter by Stellar address.
     - `eventType`: optional filter (`applied`, `withdrawn`, `assigned`, `completed`, `revoked`).
     - `fromLedger` / `toLedger`: optional ledger sequence range.
     - `limit` (default 20, max 100) and `cursor`.
   - Document JSON response array and pagination cursor.
2. Cross-link to `docs/EVENT_SCHEMAS.md`.

### 📁 Affected Files & Modules
- `docs/api-reference.md`: API reference documentation
- `docs/EVENT_SCHEMAS.md`: Event schemas guide

### ✅ Acceptance Criteria
- [ ] `GET /api/events` documented with all query parameters and filters.
- [ ] Request and response payload examples included.
- [ ] Pagination mechanics clearly explained.

### 🧪 Testing & Verification Plan
- Verify links and formatting in documentation reader.

### 🔒 Security, Reliability & Performance Considerations
Facilitates open-source data analytics and transparency into governance actions."""
    },
    {
        "title": "fix(docs): Document GET /api/v1/leaderboard endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### 🎯 Summary & Context
The leaderboard endpoint `GET /api/v1/leaderboard` returns aggregated contributor rankings, completed task counts, and organization activity scores for active Waves.

This high-value endpoint is undocumented in `docs/api-reference.md`, preventing community hackathon organizers from integrating leaderboard widgets into external websites.

### 🔍 Current Behavior & Root Cause
Implemented in `backend/src/routes/leaderboard.ts` but omitted from `docs/api-reference.md`.

### 🛠️ Proposed Solution & Technical Specification
1. In `docs/api-reference.md`:
   - Add section: `### GET /api/v1/leaderboard`.
   - Document query parameters: `timeframe` (`all_time`, `monthly`, `weekly`), `limit` (max 50), `offset`.
   - Provide example response payload including contributor ranks, completed counts, and avatar URLs.
   - Document caching semantics (`Cache-Control: public, max-age=60`).

### 📁 Affected Files & Modules
- `docs/api-reference.md`: API documentation
- `openapi.yaml`: Ensure alignment

### ✅ Acceptance Criteria
- [ ] Complete documentation of leaderboard endpoint, parameters, and cache behaviors.
- [ ] Includes copy-pasteable curl and fetch examples.

### 🧪 Testing & Verification Plan
- Verify API docs sync script passes.

### 🔒 Security, Reliability & Performance Considerations
Encourages platform adoption and transparent gamification."""
    },
    {
        "title": "fix(docs): Document GET /api/v1/audit/logs endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### 🎯 Summary & Context
The compliance audit log endpoint `GET /api/v1/audit/logs` allows auditors and administrators to query tamper-evident governance actions.

Because this endpoint is undocumented, operators and compliance reviewers lack clear guidance on how to programmatically extract audit logs.

### 🔍 Current Behavior & Root Cause
Omitted from `docs/api-reference.md`. Authentication requirements (`adminAuth`) and signature verification headers are not explained.

### 🛠️ Proposed Solution & Technical Specification
1. In `docs/api-reference.md`:
   - Add section: `### GET /api/v1/audit/logs`.
   - Specify required authentication headers (`Authorization: Bearer <ADMIN_KEY>`).
   - Document query filters (`action`, `actor`, `startDate`, `endDate`, `limit`).
   - Explain cryptographic hash chain fields (`previous_hash`, `entry_hash`, `signature`).

### 📁 Affected Files & Modules
- `docs/api-reference.md`: Documentation update
- `docs/admin-guide.md`: Cross-link from admin guide

### ✅ Acceptance Criteria
- [ ] Authentication, query parameters, and hash chain fields fully documented.
- [ ] Security requirements highlighted with alerts.

### 🧪 Testing & Verification Plan
- Verify markdown rendering and curl example validity.

### 🔒 Security, Reliability & Performance Considerations
Ensures clear documentation for SOC 2 and institutional governance compliance."""
    },
    {
        "title": "fix(docs): Document GET /docs Swagger endpoint in docs/api-reference.md",
        "labels": ["bug", "documentation"],
        "body": """### 🎯 Summary & Context
The backend mounts interactive Swagger UI documentation at `/docs` (and raw OpenAPI spec at `/docs/json`). 

Documenting this interactive exploration UI in the main developer documentation helps new contributors test API endpoints directly from their web browser.

### 🔍 Current Behavior & Root Cause
`docs/api-reference.md` and `README.md` do not mention the `/docs` Swagger UI interactive explorer.

### 🛠️ Proposed Solution & Technical Specification
1. In `docs/api-reference.md` and `README.md`:
   - Add 'Interactive API Explorer' callout at the top of the API Reference:
     'An interactive Swagger UI explorer is hosted locally at `http://localhost:3000/docs` and in staging at `https://staging-api.workload-governor.com/docs`.'
   - Document how to test authenticated endpoints in Swagger using the 'Authorize' button.

### 📁 Affected Files & Modules
- `docs/api-reference.md`: Add Swagger section
- `README.md`: Quick links update

### ✅ Acceptance Criteria
- [ ] Interactive Swagger UI link and instructions featured prominently.
- [ ] Steps to authorize via API key in Swagger UI documented.

### 🧪 Testing & Verification Plan
- Verify link and instructions navigate to working Swagger interface.

### 🔒 Security, Reliability & Performance Considerations
Accelerates developer onboarding and lowers barriers to entry."""
    },
    {
        "title": "feat(dx): Add pre-commit git hooks using shell script for automated lint and format checks",
        "labels": ["enhancement", "dx"],
        "body": """### 🎯 Summary & Context
Developers frequently push commits that fail CI due to minor formatting discrepancies, missed ESLint semicolons, or unformatted Rust files (`cargo fmt`).

Providing a lightweight, zero-dependency git pre-commit hook script prevents broken commits before they reach GitHub.

### 🔍 Current Behavior & Root Cause
A basic script `scripts/pre-commit.sh` exists, but is not automatically installed into `.git/hooks/pre-commit` when developers run `npm install` or `make setup`.

### 🛠️ Proposed Solution & Technical Specification
1. Update `scripts/pre-commit.sh`:
   - Run `cargo fmt -- --check` on modified Rust files.
   - Run `npm run lint` on modified TypeScript/JavaScript files.
   - Run `scripts/lint-changelog.js` if source files changed.
   - Execute in < 3 seconds.
2. In `package.json`:
   - Add `"prepare": "node scripts/install-hooks.js"` or configure simple copy to `.git/hooks/pre-commit`.
3. Add `make hooks` target in root `Makefile`.

### 📁 Affected Files & Modules
- `scripts/pre-commit.sh`: Pre-commit hook script
- `scripts/install-hooks.js`: Hook installer
- `package.json`: Prepare script
- `Makefile`: `make hooks` target

### ✅ Acceptance Criteria
- [ ] Running `make setup` installs pre-commit hook automatically.
- [ ] Committing unformatted Rust or TypeScript files is caught and blocked locally.
- [ ] Fast execution (<3 seconds on staged diffs).
- [ ] Supports `git commit --no-verify` bypass when necessary.

### 🧪 Testing & Verification Plan
- Stage an unformatted file and verify `git commit` triggers warning and fails.

### 🔒 Security, Reliability & Performance Considerations
Saves CI runner hours and keeps git commit history clean and uniform."""
    },
    {
        "title": "fix(docs): Correct outdated Stellar SDK and Soroban CLI version references in README.md",
        "labels": ["bug", "documentation"],
        "body": """### 🎯 Summary & Context
`README.md` and `docs/contributor-guide.md` currently reference outdated versions of the Stellar CLI and Soroban SDK (e.g. `soroban-cli v20.0.0` instead of `stellar-cli v22+`).

Following outdated installation instructions causes new contributors to install incompatible toolchains that fail to compile or deploy the contract.

### 🔍 Current Behavior & Root Cause
In `README.md:120`:
`cargo install --locked soroban-cli`
Stellar rebranded the tool from `soroban-cli` to `stellar-cli`, and SDK v22 introduced breaking API changes for test utilities.

### 🛠️ Proposed Solution & Technical Specification
1. Audit and update all toolchain commands across documentation:
   - Replace `soroban-cli` with `stellar-cli` (v22+).
   - Update installation command: `cargo install --locked stellar-cli`.
   - Update Rust target references: `rustup target add wasm32v1-none`.
2. Update `docs/contributor-guide.md`, `docs/local-dev-guide.md`, and `README.md`.

### 📁 Affected Files & Modules
- `README.md`: Prerequisites and build instructions
- `docs/contributor-guide.md`: Onboarding guide
- `docs/local-dev-guide.md`: Local setup guide

### ✅ Acceptance Criteria
- [ ] All references updated to `stellar-cli` (v22+).
- [ ] Build and deployment commands verified against fresh toolchain.
- [ ] Zero deprecated `soroban-cli` references in documentation.

### 🧪 Testing & Verification Plan
- Follow updated instructions on a clean environment and verify successful build.

### 🔒 Security, Reliability & Performance Considerations
Eliminates onboarding friction and ensures compatibility with current Stellar testnet protocol."""
    },
    {
        "title": "docs(adr): Add Architecture Decision Record (ADR) for event indexer deduplication strategy",
        "labels": ["documentation", "architecture"],
        "body": """### 🎯 Summary & Context
The event indexer deduplication architecture relies on a composite unique database constraint combined with a checkpoint tracking table and rollback handlers.

Formally documenting this architectural decision as `docs/adr/ADR-009-indexer-event-deduplication.md` preserves technical reasoning, evaluated alternatives (Kafka, Redis streams, block polling), and failure recovery modes for future maintainers.

### 🔍 Current Behavior & Root Cause
ADR-009 is accepted and referenced in `README.md:101`, but the detailed ADR document file is missing or contains placeholder text.

### 🛠️ Proposed Solution & Technical Specification
1. Author `docs/adr/ADR-009-indexer-event-deduplication.md`:
   - **Status**: Accepted
   - **Context**: High-velocity Soroban event streaming across multiple worker replicas with potential ledger reorgs and network disconnects.
   - **Decision**: Use PostgreSQL composite unique constraint `(tx_hash, event_index)` with transactional checkpoint cursors and atomic `ON CONFLICT DO NOTHING`.
   - **Alternatives Considered**:
     1. In-memory deduplication cache (rejected: lost on worker restarts).
     2. Distributed message queue like Kafka/RabbitMQ (rejected: unnecessary infrastructure operational complexity for current scale).
     3. Periodic batch reconciliation (rejected: high latency).
   - **Consequences**: Strong ACID consistency, zero duplicate event handling, slight write overhead on unique index.

### 📁 Affected Files & Modules
- `docs/adr/ADR-009-indexer-event-deduplication.md`: New ADR document
- `README.md`: ADR register table

### ✅ Acceptance Criteria
- [ ] Comprehensive ADR document authored following Michael Nygard format.
- [ ] Details decision rationale, trade-offs, and failure recovery modes.
- [ ] Cross-linked in `README.md` and `docs/architecture.md`.

### 🧪 Testing & Verification Plan
- Verify markdown formatting and table of contents links.

### 🔒 Security, Reliability & Performance Considerations
Preserves institutional knowledge and architecture governance."""
    },
    {
        "title": "fix(dx): Provide mock environment seed script for local database testing",
        "labels": ["enhancement", "dx"],
        "body": """### 🎯 Summary & Context
When frontend or backend developers spin up a new local development environment (`make dev`), the PostgreSQL database starts completely empty.

Developing UI features (e.g. testing the leaderboard, browsing organization task cards, inspecting workload gauges) requires populated realistic data. A fast seed script `scripts/seed-mock-data.ts` creates realistic organizations, issues, contributors, and active assignments with a single command.

### 🔍 Current Behavior & Root Cause
Developers must manually create mock records or run complex curls to populate local data, taking 20+ minutes of manual setup.

### 🛠️ Proposed Solution & Technical Specification
1. Update `scripts/seed-mock-data.ts`:
   - Seed 5 organizations (`stellar`, `soroban-governor`, `wave-builders`, `defi-alliance`, `open-tools`).
   - Seed 30 issues across various difficulty tags and categories.
   - Seed 10 contributors with realistic workload states (e.g. Contributor A at 14/15 applications, Contributor B with 3 assignments).
   - Seed historical event timeline records for charts and activity feeds.
2. Add npm command: `npm run db:seed` in `backend/` and root `package.json`.
3. Wire into `make setup` and devcontainer initialization.

### 📁 Affected Files & Modules
- `scripts/seed-mock-data.ts`: Seed script
- `backend/package.json`: Add seed script
- `Makefile`: Integrate with `make setup`
- `docs/local-dev-guide.md`: Document seed command

### ✅ Acceptance Criteria
- [ ] `npm run db:seed` populates local database in < 3 seconds.
- [ ] Frontend immediately displays realistic issues, cards, and activity metrics.
- [ ] Seed script is idempotent (can be run repeatedly without constraint crashes).
- [ ] Documented in local dev guide.

### 🧪 Testing & Verification Plan
- Run `npm run db:seed` on fresh database and open frontend dashboard.

### 🔒 Security, Reliability & Performance Considerations
Greatly accelerates developer onboarding and frontend feature testing."""
    },
    {
        "title": "docs(runbooks): Add detailed runbook for Stellar network protocol upgrade handling",
        "labels": ["documentation", "operations"],
        "body": """### 🎯 Summary & Context
Stellar network protocol upgrades (such as Protocol 20 to Protocol 21/22) introduce updated Soroban VM host functions, modified fee structures, and altered storage rent algorithms.

An operational runbook `docs/runbooks/protocol-upgrade.md` guides operators through verifying testnet compatibility, updating stellar-cli dependencies, recompiling contracts, and verifying backward compatibility before mainnet network votes.

### 🔍 Current Behavior & Root Cause
Protocol upgrades are managed ad-hoc. Without a formal runbook, team members may miss critical testnet testing windows or fail to update client SDK libraries before protocol cutovers.

### 🛠️ Proposed Solution & Technical Specification
1. Create `docs/runbooks/protocol-upgrade.md`:
   - Phase 1: Pre-Upgrade Monitoring (SDF announcement channels, testnet validator upgrade schedule).
   - Phase 2: Local & Testnet Verification (Run test suite against new protocol testnet, verify contract compilation).
   - Phase 3: SDK & Dependency Alignment (Update `stellar-sdk`, `soroban-sdk`, and `stellar-cli`).
   - Phase 4: Mainnet Protocol Cutover (Monitor ledger inclusion, check indexer lag, verify contract view functions).
   - Phase 5: Rollback & Emergency Contingency Procedures.
2. Link runbook in `README.md` under Operations table.

### 📁 Affected Files & Modules
- `docs/runbooks/protocol-upgrade.md`: New operator runbook
- `README.md`: Operations section table
- `docs/admin-guide.md`: Governance references

### ✅ Acceptance Criteria
- [ ] Step-by-step protocol upgrade procedure documented.
- [ ] Includes pre-flight verification checklist and post-upgrade health checks.
- [ ] Rollback and failover criteria defined.

### 🧪 Testing & Verification Plan
- Review runbook procedures against recent Protocol 21/22 testnet notes.

### 🔒 Security, Reliability & Performance Considerations
Ensures 100% operational readiness during major Stellar consensus protocol transitions."""
    },
    {
        "title": "fix(dx): Fix devcontainer configuration to install Node.js and Rust toolchain automatically",
        "labels": ["bug", "dx"],
        "body": """### 🎯 Summary & Context
In `.devcontainer/devcontainer.json`, developers opening the repository in GitHub Codespaces or VS Code Remote Containers occasionally encounter missing Rust `wasm32v1-none` targets or outdated Node.js versions.

A seamless devcontainer setup should automatically provision Node.js 20 LTS, Rust stable, the wasm target, and necessary VS Code extensions so developers can start coding in 60 seconds without manual toolchain installations.

### 🔍 Current Behavior & Root Cause
In `.devcontainer/devcontainer.json`:
The features configuration lacks `ghcr.io/devcontainers/features/rust:1` or omits `postCreateCommand` for adding the wasm compilation target. New codespaces require manual `rustup target add`.

### 🛠️ Proposed Solution & Technical Specification
1. Update `.devcontainer/devcontainer.json`:
   - Configure features:
     ```json
     "features": {
       "ghcr.io/devcontainers/features/node:1": { "version": "20" },
       "ghcr.io/devcontainers/features/rust:1": { "version": "latest", "profile": "default" }
     }
     ```
   - In `postCreateCommand`:
     ```bash
     rustup target add wasm32v1-none && npm install && cd frontend && npm install && cd ../backend && npm install
     ```
   - Recommend extensions: `rust-lang.rust-analyzer`, `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`.

### 📁 Affected Files & Modules
- `.devcontainer/devcontainer.json`: Devcontainer specification
- `docs/local-dev-guide.md`: Codespaces documentation

### ✅ Acceptance Criteria
- [ ] Codespaces builds cleanly with Node 20 and Rust toolchains pre-installed.
- [ ] `wasm32v1-none` target available immediately without manual `rustup` commands.
- [ ] All npm workspace dependencies installed on startup.
- [ ] `make test-all` succeeds out of the box in new containers.

### 🧪 Testing & Verification Plan
- Launch new container build and verify tool versions: `node -v`, `cargo --version`, `rustup target list | grep wasm32v1-none`.

### 🔒 Security, Reliability & Performance Considerations
Provides instant onboarding for new open-source contributors and hackathon participants."""
    }
]

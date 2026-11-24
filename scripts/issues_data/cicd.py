# Category 8: CI/CD Workflows & GitHub Actions - 10 issues

CICD_ISSUES = [
    {
        "title": "fix(ci): Update outdated GitHub Action versions flagged by Dependabot",
        "labels": ["bug", "ci"],
        "body": """### 🎯 Summary & Context
In `.github/workflows/`, several core workflow files reference deprecated versions of third-party and official GitHub Actions, including `actions/checkout@v3`, `actions/setup-node@v3`, and `actions/cache@v3`.

GitHub is deprecating Node 16-based actions runners, and Dependabot has flagged security and stability alerts urging updates to current v4 releases.

### 🔍 Current Behavior & Root Cause
Workflows across `.github/workflows/` (`contract-ci.yml`, `backend-ci.yml`, `frontend-ci.yml`, `security.yml`) trigger deprecation warnings in CI run annotations:
`Node.js 16 actions are deprecated. Please update the following actions to use Node.js 20: actions/checkout@v3, actions/setup-node@v3...`

### 🛠️ Proposed Solution & Technical Specification
1. Update action versions across all `.github/workflows/*.yml` files:
   - `actions/checkout@v3` -> `actions/checkout@v4`
   - `actions/setup-node@v3` -> `actions/setup-node@v4`
   - `actions/cache@v3` -> `actions/cache@v4`
   - `actions/upload-artifact@v3` -> `actions/upload-artifact@v4`
   - `actions/download-artifact@v3` -> `actions/download-artifact@v4`
2. Test workflows on a pull request branch to ensure environment caching and artifact uploads function properly under v4.

### 📁 Affected Files & Modules
- `.github/workflows/contract-ci.yml`
- `.github/workflows/backend-ci.yml`
- `.github/workflows/frontend-ci.yml`
- `.github/workflows/security.yml`
- `.github/dependabot.yml`: Ensure automated PR rules keep actions updated

### ✅ Acceptance Criteria
- [ ] All workflows upgraded to latest major action versions (v4).
- [ ] Zero Node.js 16 deprecation warning annotations in GitHub Actions logs.
- [ ] CI pipelines pass completely on pull requests and main branch.

### 🧪 Testing & Verification Plan
- Inspect GitHub Actions run logs and verify absence of deprecation warnings.

### 🔒 Security, Reliability & Performance Considerations
Node 20 runtime actions offer improved execution speed and security vulnerability fixes."""
    },
    {
        "title": "fix(ci): Cache cargo dependencies and sccache artifacts in contract-ci.yml",
        "labels": ["bug", "ci", "performance"],
        "body": """### 🎯 Summary & Context
The smart contract CI workflow `.github/workflows/contract-ci.yml` compiles Soroban contracts, runs unit tests, executes property tests, and runs mutation tests. Currently, each workflow run builds the entire Rust dependency tree from scratch, taking 8–12 minutes per pull request.

Implementing `sccache` and `actions/cache` for Cargo registry, git index, and build target artifacts reduces contract CI build times to under 3 minutes.

### 🔍 Current Behavior & Root Cause
In `contract-ci.yml`:
There is no `actions/cache` or `mozilla-actions/sccache-action` step. Every commit re-downloads crates (`soroban-sdk`, `stellar-xdr`, `proptest`) and recompiles all dependencies.

### 🛠️ Proposed Solution & Technical Specification
1. In `.github/workflows/contract-ci.yml`:
   - Integrate `mozilla-actions/sccache-action@v0.0.5`:
     ```yaml
     - name: Run sccache-cache
       uses: mozilla-actions/sccache-action@v0.0.5
     - name: Set Environment Variables
       run: |
         echo "RUSTC_WRAPPER=sccache" >> $GITHUB_ENV
         echo "SCCACHE_GHA_ENABLED=true" >> $GITHUB_ENV
     ```
   - Cache Cargo directories:
     - `~/.cargo/registry/index/`
     - `~/.cargo/registry/cache/`
     - `~/.cargo/git/db/`
     - `target/`
     Using cache key: `${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}`.

### 📁 Affected Files & Modules
- `.github/workflows/contract-ci.yml`: Workflow caching configuration
- `Cargo.lock`: Key hash dependency

### ✅ Acceptance Criteria
- [ ] Cargo cache and sccache active in `contract-ci.yml`.
- [ ] Subsequent workflow runs achieve >80% cache hit rate.
- [ ] Total contract CI runtime reduced from ~10m to <3m.
- [ ] Cache invalidates automatically when `Cargo.lock` changes.

### 🧪 Testing & Verification Plan
- Trigger workflow on test commit and check cache hit ratio in post-run summary.

### 🔒 Security, Reliability & Performance Considerations
Saves substantial GitHub Actions runner minutes and improves developer feedback cycles."""
    },
    {
        "title": "fix(ci): Fix frontend-ci.yml workflow path triggers and node version matrix",
        "labels": ["bug", "ci"],
        "body": """### 🎯 Summary & Context
In `.github/workflows/frontend-ci.yml`, the workflow trigger paths only match `frontend/**`. Changes to root files that impact the frontend (such as `package.json`, root `tsconfig.json`, `tokens.json`, or shared mocks) do not trigger the frontend CI suite.

Furthermore, the Node.js test matrix only tests Node 18, whereas production deployments run on Node 20 LTS.

### 🔍 Current Behavior & Root Cause
A change to the root lockfile or shared schema does not run frontend tests. When PRs merge, subtle frontend regressions are only caught in staging.

### 🛠️ Proposed Solution & Technical Specification
1. In `.github/workflows/frontend-ci.yml`:
   - Expand `paths` trigger list:
     ```yaml
     paths:
       - 'frontend/**'
       - 'package.json'
       - 'package-lock.json'
       - 'tsconfig*.json'
       - 'openapi.yaml'
       - '.github/workflows/frontend-ci.yml'
     ```
   - Update matrix strategy: test on Node.js `20.x` and `22.x`.
   - Ensure caching uses `cache: 'npm'` in `actions/setup-node`.

### 📁 Affected Files & Modules
- `.github/workflows/frontend-ci.yml`: Path filters and matrix configuration
- `docs/ci-cd.md`: CI pipeline documentation

### ✅ Acceptance Criteria
- [ ] Workflow triggers on changes to frontend files and root shared configuration files.
- [ ] Test matrix passes on Node 20 LTS and Node 22.
- [ ] npm dependency cache configured properly.

### 🧪 Testing & Verification Plan
- Submit PR touching root `package.json` and verify `frontend-ci.yml` triggers automatically.

### 🔒 Security, Reliability & Performance Considerations
Prevents broken builds caused by hidden dependency mismatches between root and frontend workspaces."""
    },
    {
        "title": "feat(ci): Add automated OpenAPI documentation sync check to PR pull request workflow",
        "labels": ["enhancement", "ci"],
        "body": """### 🎯 Summary & Context
When developers add or modify backend Express endpoints, they often forget to update the corresponding definitions in `openapi.yaml` and `docs/api-reference.md`. Over time, the API documentation drifts from reality.

Adding an automated CI check that runs `scripts/check-api-docs-sync.js` on every pull request guarantees that code changes and API documentation remain 100% synchronized.

### 🔍 Current Behavior & Root Cause
The script `scripts/check-api-docs-sync.js` exists in the repository, but is not wired into `.github/workflows/backend-ci.yml`. PRs modifying route files can merge without running the sync check.

### 🛠️ Proposed Solution & Technical Specification
1. In `.github/workflows/backend-ci.yml`:
   - Add a dedicated CI step:
     ```yaml
     - name: Validate OpenAPI & API Reference Synchronization
       run: node scripts/check-api-docs-sync.js
     ```
2. In `scripts/check-api-docs-sync.js`:
   - Parse all route definitions in `backend/src/routes/` and `src/routes/`.
   - Compare discovered HTTP methods and paths against paths defined in `openapi.yaml`.
   - Exit non-zero with a clear diff if an endpoint is missing from documentation.

### 📁 Affected Files & Modules
- `.github/workflows/backend-ci.yml`: Add validation step
- `scripts/check-api-docs-sync.js`: Sync validator script
- `openapi.yaml`: Canonical API spec
- `docs/api-reference.md`: Markdown reference

### ✅ Acceptance Criteria
- [ ] CI step executes on every PR touching backend route files.
- [ ] Fails build if a backend route exists that is not defined in `openapi.yaml`.
- [ ] Provides helpful error message telling the developer which endpoint to document.
- [ ] Passes cleanly when code and documentation are synchronized.

### 🧪 Testing & Verification Plan
- Add dummy route to test branch and assert CI check fails.
- Document dummy route and assert CI check passes.

### 🔒 Security, Reliability & Performance Considerations
Ensures frontend and third-party developers always have accurate, up-to-date API contract documentation."""
    },
    {
        "title": "fix(ci): Set security permissions blocks with minimal required privileges on all workflows",
        "labels": ["bug", "ci", "security"],
        "body": """### 🎯 Summary & Context
A security audit of our GitHub Actions workflows revealed that several workflows lack an explicit top-level `permissions:` block. By default, GitHub Actions grants broad read/write permissions (`GITHUB_TOKEN` has write access to repository contents, packages, issues, and checks).

Adhering to the Principle of Least Privilege requires restricting workflow tokens to read-only access by default, granting write permissions only to specific jobs that strictly require them (e.g. releases, container publishing).

### 🔍 Current Behavior & Root Cause
In `.github/workflows/`:
`contract-ci.yml`, `backend-ci.yml`, and `frontend-ci.yml` do not specify `permissions:`. Compromised third-party actions or malicious pull requests could potentially use the token to push commits or delete branches.

### 🛠️ Proposed Solution & Technical Specification
1. Add explicit top-level permissions to all CI workflows:
   ```yaml
   permissions:
     contents: read
   ```
2. For specific release/publishing workflows:
   - `docker-publish.yml`:
     ```yaml
     permissions:
       contents: read
       packages: write
     ```
   - `release.yml`:
     ```yaml
     permissions:
       contents: write
       pull-requests: write
       issues: write
     ```
3. Verify all workflows conform to OpenSSF Scorecard security standards.

### 📁 Affected Files & Modules
- `.github/workflows/*.yml`: All workflow files
- `docs/security-checklist.md`: Document CI permissions policy

### ✅ Acceptance Criteria
- [ ] Every workflow in `.github/workflows/` defines an explicit `permissions:` block.
- [ ] PR test workflows only have `contents: read` permissions.
- [ ] Write permissions restricted solely to authenticated publishing jobs.
- [ ] OpenSSF Scorecard security score improved.

### 🧪 Testing & Verification Plan
- Run GitHub Actions security lint tool (`actionlint`, `zizmor`, or Semgrep CI rules).
- Verify all workflows run successfully under restricted permissions.

### 🔒 Security, Reliability & Performance Considerations
Mitigates CI supply chain attacks and prevents token exfiltration exploits."""
    },
    {
        "title": "feat(ci): Add automatic contract WASM byte size check on pull requests",
        "labels": ["enhancement", "ci", "smart-contract"],
        "body": """### 🎯 Summary & Context
Soroban smart contracts have strict ledger bytecode limits (hard limit of 64 KB for deployed contracts). Currently, developers compiling locally must manually check binary size using `ls -lh`.

Adding an automated CI check that compiles, optimizes, and measures the WASM binary on every pull request prevents accidental size regressions and posts size metrics directly in PR comments.

### 🔍 Current Behavior & Root Cause
No automated check verifies contract WASM size in `contract-ci.yml`. An inadvertent dependency addition could push binary size above 64 KB, blocking deployment on testnet/mainnet.

### 🛠️ Proposed Solution & Technical Specification
1. In `.github/workflows/contract-ci.yml`:
   - Add step:
     ```yaml
     - name: Build & Optimize Contract WASM
       run: |
         rustup target add wasm32v1-none
         cargo build --target wasm32v1-none --release
         stellar contract optimize --wasm target/wasm32v1-none/release/workload_governor.wasm
         WASM_SIZE=$(stat -c%s target/wasm32v1-none/release/workload_governor.optimized.wasm)
         echo "WASM Size: ${WASM_SIZE} bytes"
         if [ $WASM_SIZE -gt 65536 ]; then
           echo "Error: WASM size exceeds 64 KB limit!" && exit 1
         fi
     ```
2. Post binary size summary table in GitHub Actions job step summary (`$GITHUB_STEP_SUMMARY`).

### 📁 Affected Files & Modules
- `.github/workflows/contract-ci.yml`: Size check step
- `Cargo.toml`: Optimization profile settings (`opt-level = 'z'`, `lto = true`)
- `README.md`: Document binary size targets (<20 KB optimized)

### ✅ Acceptance Criteria
- [ ] CI step compiles and optimizes contract WASM.
- [ ] Fails build if optimized WASM exceeds 64 KB.
- [ ] Emits detailed size breakdown in GitHub Actions job summary.
- [ ] Target size remains <20 KB for production release profile.

### 🧪 Testing & Verification Plan
- Verify build step succeeds on current contract code (~18 KB optimized).
- Test failure condition by simulating oversized file check.

### 🔒 Security, Reliability & Performance Considerations
Guarantees contract deployability on Stellar network at all times."""
    },
    {
        "title": "fix(ci): Ensure semantic-release workflow only publishes tags on main branch merges",
        "labels": ["bug", "ci"],
        "body": """### 🎯 Summary & Context
In `.github/workflows/release.yml`, the semantic-release workflow trigger conditions currently allow runs on feature branches or push events to non-main branches under certain conditions.

This risks accidentally generating premature git release tags (e.g. `v1.2.0`), publishing unverified packages, or polluting the GitHub release page with dirty pre-release artifacts.

### 🔍 Current Behavior & Root Cause
In `release.yml`:
The `on: push` trigger lacks branch restriction or has ambiguous branch matching (`branches: ['*']`). Release jobs attempt dry-run releases or create draft tags on push to feature branches.

### 🛠️ Proposed Solution & Technical Specification
1. Restrict trigger in `.github/workflows/release.yml`:
   ```yaml
   on:
     push:
       branches:
         - main
   ```
2. Add explicit condition check in job definition: `if: github.repository == 'FaveTeamz/workload-governor' && github.ref == 'refs/heads/main'`.
3. Ensure dry-run mode is used for PR preview without creating remote git tags.

### 📁 Affected Files & Modules
- `.github/workflows/release.yml`: Branch trigger restrictions
- `.releaserc.json`: Semantic release configuration

### ✅ Acceptance Criteria
- [ ] Semantic release only runs on successful merges to `main`.
- [ ] Pushing to feature branches never creates git tags or GitHub releases.
- [ ] Verified branch condition protects against fork runs.

### 🧪 Testing & Verification Plan
- Push to a feature branch and verify release workflow does not execute.
- Merge pull request to main and verify orderly release execution.

### 🔒 Security, Reliability & Performance Considerations
Protects versioning integrity and prevents unintended package deployments."""
    },
    {
        "title": "feat(ci): Add automated security vulnerability scanner for container images in docker-publish.yml",
        "labels": ["enhancement", "ci", "security"],
        "body": """### 🎯 Summary & Context
When production Docker images are built and pushed to GitHub Container Registry (GHCR) in `.github/workflows/docker-publish.yml`, they are not scanned for underlying operating system or base image vulnerabilities (CVEs).

Integrating automated image vulnerability scanning using Trivy or Grype blocks publishing images with known Critical or High severity vulnerabilities.

### 🔍 Current Behavior & Root Cause
In `docker-publish.yml`:
The workflow builds the Docker image and pushes it immediately without running a vulnerability scan step.

### 🛠️ Proposed Solution & Technical Specification
1. In `.github/workflows/docker-publish.yml`:
   - Add step using `aquasecurity/trivy-action`:
     ```yaml
     - name: Run Trivy Vulnerability Scanner
       uses: aquasecurity/trivy-action@master
       with:
         image-ref: ${{ env.IMAGE_NAME }}:${{ github.sha }}
         format: 'table'
         exit-code: '1'
         ignore-unfixed: true
         vuln-type: 'os,library'
         severity: 'CRITICAL,HIGH'
     ```
2. Upload SARIF scan results to GitHub Code Scanning via `github/codeql-action/upload-sarif`.
3. Support `.trivyignore` for documenting accepted false positives with expiration dates.

### 📁 Affected Files & Modules
- `.github/workflows/docker-publish.yml`: Trivy scanning step
- `.trivyignore`: Accepted CVE exceptions
- `docs/security-checklist.md`: Container scanning documentation

### ✅ Acceptance Criteria
- [ ] Container image is scanned for CVEs before push to GHCR.
- [ ] Publishing fails if unmitigated Critical or High CVEs are discovered.
- [ ] SARIF report uploaded to GitHub Security tab.
- [ ] Clean scans permit normal image publishing.

### 🧪 Testing & Verification Plan
- Run Trivy locally: `docker run aquasec/trivy image workload-governor:latest`.
- Verify clean result on current Alpine/Node base image.

### 🔒 Security, Reliability & Performance Considerations
Prevents deploying vulnerable Linux packages or compromised node dependencies into production Kubernetes clusters."""
    },
    {
        "title": "fix(ci): Fix concurrency cancellation rules in PR workflows to prevent wasteful runner usage",
        "labels": ["bug", "ci"],
        "body": """### 🎯 Summary & Context
When a developer pushes multiple commits in quick succession to an open pull request (e.g. pushing 3 commits within 1 minute), GitHub Actions runs all workflow jobs concurrently for each commit instead of cancelling obsolete runs.

This wastes GitHub Actions runner minutes, increases wait queues for other developers, and wastes electricity.

### 🔍 Current Behavior & Root Cause
Workflows lack a `concurrency:` group specification. If a job takes 8 minutes, pushing 3 commits consumes 24 minutes of runner time on outdated code.

### 🛠️ Proposed Solution & Technical Specification
1. Add standard concurrency cancel-in-progress blocks to all PR workflows:
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
     cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
   ```
2. Ensure that pushes to `main` do not cancel in-progress builds, ensuring deployments and release steps run to completion.

### 📁 Affected Files & Modules
- `.github/workflows/contract-ci.yml`
- `.github/workflows/backend-ci.yml`
- `.github/workflows/frontend-ci.yml`
- `.github/workflows/security.yml`

### ✅ Acceptance Criteria
- [ ] Pushing a new commit to an active PR automatically cancels previous in-flight runs for that PR.
- [ ] Pushes to `main` queue and complete without cancellation.
- [ ] Substantial reduction in total consumed GitHub Actions runner minutes.

### 🧪 Testing & Verification Plan
- Push 2 commits back-to-back to test branch; assert first workflow run transitions to 'cancelled'.

### 🔒 Security, Reliability & Performance Considerations
Maximizes CI efficiency and decreases build queue latency across the organization."""
    },
    {
        "title": "feat(ci): Add automated changelog validation check on pull requests",
        "labels": ["enhancement", "ci"],
        "body": """### 🎯 Summary & Context
The repository maintains `CHANGELOG.md` following the Keep a Changelog standard and Semantic Versioning. Frequently, pull requests that add features or fix bugs merge without documenting their changes in the `[Unreleased]` section.

An automated CI check running `scripts/lint-changelog.js` verifies that PRs modifying source code include a corresponding entry in `CHANGELOG.md`.

### 🔍 Current Behavior & Root Cause
Developers forget to update `CHANGELOG.md`. Release managers must manually review git commits to reconstruct release notes during deployment.

### 🛠️ Proposed Solution & Technical Specification
1. In `scripts/lint-changelog.js`:
   - Inspect git diff between target branch (`origin/main`) and PR head.
   - If PR modifies files under `src/`, `contracts/`, `frontend/src/`, or `backend/src/`:
     - Assert that `CHANGELOG.md` is also modified.
     - Verify modified lines follow Keep a Changelog categories (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).
2. Add step in PR workflow:
   ```yaml
   - name: Lint Changelog Entry
     run: node scripts/lint-changelog.js
   ```
3. Support skipping changelog requirement for bot PRs (e.g. dependabot) or PRs with label `skip-changelog`.

### 📁 Affected Files & Modules
- `scripts/lint-changelog.js`: Validator script
- `.github/workflows/backend-ci.yml` / PR workflows
- `CHANGELOG.md`: Project changelog
- `docs/changelog-guide.md`: Guidelines update

### ✅ Acceptance Criteria
- [ ] PR modifying core source code requires a changelog update in `[Unreleased]`.
- [ ] Validates changelog formatting against standard Keep a Changelog categories.
- [ ] PRs labeled with `skip-changelog` or documentation-only PRs are exempt.
- [ ] Provides clear feedback explaining how to add a changelog entry.

### 🧪 Testing & Verification Plan
- Test on PR without changelog entry and verify failure.
- Add entry under `### Fixed` and verify CI pass.

### 🔒 Security, Reliability & Performance Considerations
Maintains high documentation standards and simplifies release note generation."""
    }
]

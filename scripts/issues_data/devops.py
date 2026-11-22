# Category 9: DevOps, Containers & Infrastructure - 10 issues

DEVOPS_ISSUES = [
    {
        "title": "fix(helm): Rename vesting-backend chart to workload-governor and update metadata",
        "labels": ["bug", "devops"],
        "body": """### 🎯 Summary & Context
In `helm/workload-governor/Chart.yaml`, the Helm chart definition still references legacy project identifiers (`name: vesting-backend`, `description: Helm chart for vesting-backend service`).

This causes naming mismatches during Kubernetes deployments, where Helm releases and service annotations appear as `vesting-backend` instead of `workload-governor`.

### 🔍 Current Behavior & Root Cause
In `helm/workload-governor/Chart.yaml`:
- `name: vesting-backend`
- `description: Helm chart for Vesting backend service`
Templates and labels in `templates/_helpers.tpl` inherit this name, causing Kubernetes pods and services to be labeled `app.kubernetes.io/name: vesting-backend`.

### 🛠️ Proposed Solution & Technical Specification
1. In `helm/workload-governor/Chart.yaml`:
   - Set `name: workload-governor`.
   - Set `description: Helm chart for WorkloadGovernor - Stellar / Soroban workload cap service`.
   - Update `appVersion: "1.0.0"`.
2. In `helm/workload-governor/templates/_helpers.tpl`:
   - Update helper templates (`workload-governor.name`, `workload-governor.fullname`, `workload-governor.chart`).
3. Update `values.yaml` and docs in `docs/helm-charts/`.

### 📁 Affected Files & Modules
- `helm/workload-governor/Chart.yaml`: Chart metadata
- `helm/workload-governor/values.yaml`: Default values
- `helm/workload-governor/templates/_helpers.tpl`: Helper functions
- `docs/helm-charts/README.md`: Documentation

### ✅ Acceptance Criteria
- [ ] Helm chart name is `workload-governor`.
- [ ] `helm lint helm/workload-governor` passes with 0 errors.
- [ ] Rendered Kubernetes manifests use correct resource names and labels.
- [ ] Documentation updated to reflect chart name.

### 🧪 Testing & Verification Plan
- Run `helm lint helm/workload-governor`.
- Run `helm template test-release helm/workload-governor` and verify labels.

### 🔒 Security, Reliability & Performance Considerations
Avoids deployment confusion and aligns Kubernetes telemetry with repository identity."""
    },
    {
        "title": "fix(docker): Enforce non-root user in production Dockerfile",
        "labels": ["bug", "devops", "security"],
        "body": """### 🎯 Summary & Context
In `Dockerfile`, the container process currently executes as the default `root` user (UID 0). Running containerized Node.js applications as `root` in production violates container security standards (CIS Docker Benchmark, NIST SP 800-190).

If an attacker achieves remote code execution via a web vulnerability or npm package exploit, running as root grants them root permissions inside the container namespace and significantly increases container breakout risks.

### 🔍 Current Behavior & Root Cause
In `Dockerfile`:
The final runtime stage copies built artifacts and specifies `CMD ["node", "dist/app.js"]` without declaring a `USER` directive. The process runs as `root`.

### 🛠️ Proposed Solution & Technical Specification
1. In `Dockerfile`:
   - Create a dedicated non-root user and group (or use Alpine's built-in `node` user, UID 1000):
     ```dockerfile
     RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
     ```
   - Set directory ownership:
     ```dockerfile
     RUN chown -R nodejs:nodejs /app
     USER nodejs
     ```
2. Ensure temporary directories (`/tmp`, log outputs) have appropriate write permissions for UID 1001.
3. Test container startup and ensure it can bind to unprivileged port `3000` (non-root cannot bind to ports <1024).

### 📁 Affected Files & Modules
- `Dockerfile`: Production image definition
- `Dockerfile.dev`: Development image alignment
- `docs/security-checklist.md`: Security compliance verification

### ✅ Acceptance Criteria
- [ ] Production container runs as unprivileged user (UID 1001 / nodejs).
- [ ] `docker run workload-governor whoami` outputs `nodejs` (not `root`).
- [ ] Application starts, binds port 3000, and serves traffic normally.
- [ ] Passes Trivy / Docker CIS benchmark checks.

### 🧪 Testing & Verification Plan
- Build image: `docker build -t test-governor .`
- Verify user: `docker run --rm test-governor id` (asserts uid=1001).

### 🔒 Security, Reliability & Performance Considerations
Blocks privilege escalation attacks and hardens runtime environment."""
    },
    {
        "title": "feat(docker): Add multi-stage Docker build separating dev dependencies from runtime image",
        "labels": ["enhancement", "devops", "performance"],
        "body": """### 🎯 Summary & Context
The current production Docker image includes compilers, build tools (`python3`, `make`, `gcc`), and development dependencies (`devDependencies` like TypeScript, Vitest, Storybook, linters).

This bloats the final image size to over 850 MB, slows down deployment download times in Kubernetes, and increases the attack surface with unneeded build utilities.

### 🔍 Current Behavior & Root Cause
A single-stage build executes `npm install` and compiles code, leaving dev dependencies and build toolchains inside the final layer.

### 🛠️ Proposed Solution & Technical Specification
1. Refactor `Dockerfile` into a multi-stage build:
   - **Stage 1 (`builder`)**: Base Alpine image with Node.js and build tools; runs `npm ci`, compiles TypeScript (`npm run build`).
   - **Stage 2 (`pruner`)**: Runs `npm prune --production` to retain only production `node_modules`.
   - **Stage 3 (`runner`)**: Minimal distroless or lightweight Alpine Node runtime; copies only `/dist`, production `/node_modules`, and `/package.json`.
2. Image size target: reduce final compressed image to <150 MB.

### 📁 Affected Files & Modules
- `Dockerfile`: Multi-stage build refactor
- `.dockerignore`: Ensure local node_modules excluded
- `Makefile`: Docker build targets

### ✅ Acceptance Criteria
- [ ] Final production Docker image size is <150 MB compressed.
- [ ] Contains zero development dependencies (`devDependencies`).
- [ ] Compilers (`gcc`, `make`, `python3`) are excluded from runtime image.
- [ ] Container starts and passes all health check endpoints.

### 🧪 Testing & Verification Plan
- Build image and inspect size: `docker images workload-governor`.
- Test running container and hitting `/health`.

### 🔒 Security, Reliability & Performance Considerations
Faster deployment rollouts in Kubernetes and minimal CVE attack surface."""
    },
    {
        "title": "fix(terraform): Enable customer-managed KMS key encryption on RDS PostgreSQL database",
        "labels": ["bug", "devops", "security"],
        "body": """### 🎯 Summary & Context
In `terraform/modules/rds/main.tf` and `infra/rds-backup.tf`, the Amazon RDS PostgreSQL instance is configured with default AWS-managed KMS key encryption (`storage_encrypted = true`, but `kms_key_id` is unset).

Security compliance policies (SOC 2, ISO 27001) require utilizing a Customer-Managed Key (CMK) with automated annual key rotation for all production database storage volumes and automated snapshot backups.

### 🔍 Current Behavior & Root Cause
In `terraform/modules/rds/main.tf`:
`kms_key_id = null` defaults to the generic `aws/rds` account-level key. Key policy, IAM access logs, and rotation cannot be managed independently by the platform security team.

### 🛠️ Proposed Solution & Technical Specification
1. In `terraform/modules/kms/` (or RDS module):
   - Create a dedicated AWS KMS Key for RDS encryption:
     ```hcl
     resource "aws_kms_key" "rds" {
       description             = "KMS key for WorkloadGovernor RDS storage encryption"
       deletion_window_in_days = 30
       enable_key_rotation     = true
     }
     resource "aws_kms_alias" "rds" {
       name          = "alias/workload-governor-rds-${var.environment}"
       target_key_id = aws_kms_key.rds.key_id
     }
     ```
2. Update RDS resource:
   `kms_key_id = aws_kms_key.rds.arn`
3. Ensure automated backups and snapshot exports inherit the CMK.

### 📁 Affected Files & Modules
- `terraform/modules/rds/main.tf`: KMS key configuration
- `infra/rds-backup.tf`: Backup encryption
- `terraform/variables.tf`: Environment variables

### ✅ Acceptance Criteria
- [ ] Dedicated Customer-Managed KMS Key created with automated annual key rotation.
- [ ] RDS storage volume and automated snapshots encrypted with the CMK.
- [ ] `terraform validate` passes with zero errors.
- [ ] Documented in `docs/security-checklist.md`.

### 🧪 Testing & Verification Plan
- Run `terraform plan` in staging and verify KMS resource creation and RDS attachment.

### 🔒 Security, Reliability & Performance Considerations
Protects at-rest data confidentiality with customer-controlled cryptographic lifecycle management."""
    },
    {
        "title": "feat(helm): Add HorizontalPodAutoscaler (HPA) resource metrics and scaling thresholds",
        "labels": ["enhancement", "devops"],
        "body": """### 🎯 Summary & Context
During traffic surges (e.g. Wave launches or hackathon deadlines), the backend service experiences spikes in CPU and memory usage. The Helm chart currently deploys a static replica count (`replicaCount: 2`).

Deploying a Kubernetes Horizontal Pod Autoscaler (HPA) automatically scales pod replicas dynamically from 2 to 10 based on CPU and memory utilization thresholds.

### 🔍 Current Behavior & Root Cause
In `helm/workload-governor/values.yaml`:
`autoscaling.enabled: false`. If CPU reaches 100%, existing pods degrade and drop requests rather than spawning additional replicas.

### 🛠️ Proposed Solution & Technical Specification
1. In `helm/workload-governor/templates/hpa.yaml`:
   - Enable `autoscaling/v2` HorizontalPodAutoscaler:
     - `minReplicas`: 2
     - `maxReplicas`: 10
     - Metrics:
       - CPU utilization: target average 75%
       - Memory utilization: target average 80%
     - Behavior policies:
       - Scale up: immediately (stabilizationWindow: 0s, 100% or +2 pods every 15s)
       - Scale down: gentle stabilization window (300s) to prevent pod flapping.
2. Ensure container `resources.requests` and `resources.limits` are configured in `values.yaml` (required for HPA calculation).

### 📁 Affected Files & Modules
- `helm/workload-governor/templates/hpa.yaml`: HPA manifest
- `helm/workload-governor/values.yaml`: Autoscaling parameters
- `docs/helm-charts/README.md`: Configuration docs

### ✅ Acceptance Criteria
- [ ] HPA resource manifest renders cleanly when `autoscaling.enabled: true`.
- [ ] Scales up pods automatically when CPU exceeds 75%.
- [ ] Stabilization window prevents scale-down flapping.
- [ ] `helm lint` passes without warnings.

### 🧪 Testing & Verification Plan
- Deploy chart to minikube/test cluster and generate synthetic CPU load via `stress-ng` or `k6`.
- Verify `kubectl get hpa` reflects replica scaling.

### 🔒 Security, Reliability & Performance Considerations
Ensures platform responsiveness and automatic cost-effective down-scaling during low-traffic periods."""
    },
    {
        "title": "fix(terraform): Enable S3 bucket versioning and public access block on state bucket",
        "labels": ["bug", "devops", "security"],
        "body": """### 🎯 Summary & Context
In `terraform/remote_state.tf`, the S3 bucket used for Terraform remote state storage (`terraform-state-workload-governor`) does not have explicit S3 Public Access Block or Bucket Versioning enabled in code.

Unversioned state buckets risk catastrophic data loss if a developer accidentally overwrites state, while missing public access blocks trigger AWS Security Hub critical findings.

### 🔍 Current Behavior & Root Cause
In `terraform/remote_state.tf`:
The S3 bucket resource definition lacks `aws_s3_bucket_versioning` and `aws_s3_bucket_public_access_block` resources.

### 🛠️ Proposed Solution & Technical Specification
1. In `terraform/remote_state.tf`:
   - Add versioning configuration:
     ```hcl
     resource "aws_s3_bucket_versioning" "state" {
       bucket = aws_s3_bucket.state.id
       versioning_configuration {
         status = "Enabled"
       }
     }
     ```
   - Add public access block:
     ```hcl
     resource "aws_s3_bucket_public_access_block" "state" {
       bucket                  = aws_s3_bucket.state.id
       block_public_acls       = true
       block_public_policy     = true
       ignore_public_acls      = true
       restrict_public_buckets = true
     }
     ```
   - Enable default SSE-S3 or KMS encryption on the bucket.

### 📁 Affected Files & Modules
- `terraform/remote_state.tf`: S3 security resources
- `terraform/bootstrap.sh`: Bootstrap automation script

### ✅ Acceptance Criteria
- [ ] S3 bucket versioning enabled (allows rolling back corrupted state files).
- [ ] All 4 S3 Public Access Block settings enabled.
- [ ] Server-Side Encryption (SSE) enforced.
- [ ] Passes Checkov / tfsec infrastructure security scanners.

### 🧪 Testing & Verification Plan
- Run `terraform validate` and `tfsec terraform/`.
- Verify S3 bucket properties in AWS console.

### 🔒 Security, Reliability & Performance Considerations
Guarantees remote state file safety and prevents public exposure of sensitive infrastructure secrets."""
    },
    {
        "title": "feat(devops): Add healthcheck instruction to Dockerfile and docker-compose.yml",
        "labels": ["enhancement", "devops"],
        "body": """### 🎯 Summary & Context
Currently, neither `Dockerfile` nor `docker-compose.yml` defines a container-level `HEALTHCHECK` instruction. If the Node.js process enters an event loop deadlock, unhandled hang, or memory leak, the container stays running (`UP` status), and Docker or container orchestrators continue routing traffic to the dead container.

Adding a native `HEALTHCHECK` enables Docker engine and Kubernetes to automatically restart unresponsive containers.

### 🔍 Current Behavior & Root Cause
`docker ps` displays container status as `Up 2 hours` without health assessment. Container runtimes cannot distinguish between a healthy app and an app frozen in an infinite loop.

### 🛠️ Proposed Solution & Technical Specification
1. In `Dockerfile`:
   - Add native healthcheck instruction:
     ```dockerfile
     HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
       CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1
     ```
2. In `docker-compose.yml`:
   - Configure healthcheck block on `backend` service:
     ```yaml
     healthcheck:
       test: ["CMD", "wget", "--spider", "-q", "http://127.0.0.1:3000/health"]
       interval: 15s
       timeout: 5s
       retries: 3
       start_period: 10s
     ```
   - Make `frontend` depend on `backend: condition: service_healthy`.

### 📁 Affected Files & Modules
- `Dockerfile`: Production healthcheck
- `docker-compose.yml`: Local compose healthcheck
- `infra/health-check.tf`: Cloud health check alignment

### ✅ Acceptance Criteria
- [ ] `docker ps` reports status as `healthy` (or `unhealthy`).
- [ ] Failing healthcheck triggers container restart after 3 failed retries.
- [ ] `docker-compose up` waits for backend health before starting dependent services.

### 🧪 Testing & Verification Plan
- Run `docker-compose up -d` and monitor `docker ps` until status changes to `(healthy)`.
- Test failure by simulating endpoint 500 error and verify status transitions to `unhealthy`.

### 🔒 Security, Reliability & Performance Considerations
Ensures fast self-healing of deadlocked containers without manual DevOps intervention."""
    },
    {
        "title": "fix(terraform): Configure DynamoDB state locking table for Terraform remote backend",
        "labels": ["bug", "devops"],
        "body": """### 🎯 Summary & Context
In `terraform/remote_state.tf` and `terraform/backend-*.hcl`, the Terraform S3 remote backend configuration specifies `bucket` and `key`, but lacks a `dynamodb_table` configuration for distributed state locking.

Without state locking, two engineers or concurrent CI pipelines running `terraform apply` simultaneously will corrupt the state file or cause race conditions that deploy duplicate resources.

### 🔍 Current Behavior & Root Cause
In `terraform/remote_state.tf`:
There is no `aws_dynamodb_table` for locking, and `backend.hcl` files omit `dynamodb_table`. Running `terraform apply` emits a warning:
`Remote state backend does not support locking or locking is not configured.`

### 🛠️ Proposed Solution & Technical Specification
1. In `terraform/remote_state.tf`:
   - Create DynamoDB state locking table:
     ```hcl
     resource "aws_dynamodb_table" "locks" {
       name         = "workload-governor-tflocks"
       billing_mode = "PAY_PER_REQUEST"
       hash_key     = "LockID"
       attribute {
         name = "LockID"
         type = "S"
       }
     }
     ```
2. In `terraform/backend-production.hcl` and `backend-staging.hcl`:
   - Add `dynamodb_table = "workload-governor-tflocks"`.
3. Update `terraform/bootstrap.sh` to initialize the table before first run.

### 📁 Affected Files & Modules
- `terraform/remote_state.tf`: DynamoDB lock resource
- `terraform/backend-production.hcl`: Backend lock parameter
- `terraform/backend-staging.hcl`: Backend lock parameter
- `terraform/bootstrap.sh`: Bootstrap script

### ✅ Acceptance Criteria
- [ ] DynamoDB locking table created with primary key `LockID`.
- [ ] `terraform init` successfully acquires and validates state locks.
- [ ] Concurrent `terraform apply` commands are safely blocked until active run finishes.

### 🧪 Testing & Verification Plan
- Run `terraform init` with updated backend config.
- Verify state locking message in terminal output during `terraform plan`.

### 🔒 Security, Reliability & Performance Considerations
Prevents split-brain state file corruption across team members and automated CI runners."""
    },
    {
        "title": "feat(helm): Support external secret management via HashiCorp Vault / AWS Secrets Manager",
        "labels": ["enhancement", "devops", "security"],
        "body": """### 🎯 Summary & Context
Currently, sensitive credentials (database passwords, Stellar admin private keys, GitHub webhook secrets) in the Helm chart are provided as base64-encoded plain text Kubernetes Secrets in `values.yaml`.

Integrating an External Secrets Operator (ESO) pattern supporting AWS Secrets Manager and HashiCorp Vault allows secrets to be retrieved dynamically at runtime without committing secrets into git.

### 🔍 Current Behavior & Root Cause
In `helm/workload-governor/templates/secrets.yaml`:
Secrets are mapped from `values.secrets.databasePassword`. Operators must manually manage secret values during deployments or risk accidental git leaks.

### 🛠️ Proposed Solution & Technical Specification
1. In `helm/workload-governor/templates/`:
   - Add `externalsecret.yaml`:
     - Support `external-secrets.io/v1beta1` `ExternalSecret` resource.
     - Support `SecretStore` / `ClusterSecretStore` reference.
     - Map keys: `DATABASE_URL`, `ADMIN_SECRET_KEY`, `GITHUB_WEBHOOK_SECRET`.
2. In `values.yaml`:
   - Add configuration flag:
     ```yaml
     externalSecrets:
       enabled: false
       secretStoreRef:
         name: aws-secretsmanager
         kind: ClusterSecretStore
       remoteKey: workload-governor/production
     ```
3. Maintain backward compatibility with standard Kubernetes secrets when `externalSecrets.enabled` is false.

### 📁 Affected Files & Modules
- `helm/workload-governor/templates/externalsecret.yaml`: New ESO template
- `helm/workload-governor/values.yaml`: Secret management config
- `docs/BRANCH-SECRETS.md`: Secrets management guide

### ✅ Acceptance Criteria
- [ ] Supports automated synchronization of secrets from AWS Secrets Manager / Vault.
- [ ] Zero plain-text secrets required in Helm values files.
- [ ] Seamless fallback to standard Secret manifests when disabled.
- [ ] Documentation updated in `docs/BRANCH-SECRETS.md`.

### 🧪 Testing & Verification Plan
- Test template generation with `helm template --set externalSecrets.enabled=true`.
- Verify manifest syntax against Kubernetes CRD.

### 🔒 Security, Reliability & Performance Considerations
Protects production private keys from developer workstations and repository history."""
    },
    {
        "title": "fix(docker): Optimize .dockerignore to exclude git history, tests, and temporary artifacts",
        "labels": ["bug", "devops"],
        "body": """### 🎯 Summary & Context
The repository `.dockerignore` currently lacks entries for several heavy, non-essential development directories: `.git/`, `fuzz/corpus/`, `mutants.out/`, `test_snapshots/`, and local temporary files.

When running `docker build`, the Docker daemon copies over 250 MB of unnecessary build context across the daemon socket, drastically slowing down container build times in CI.

### 🔍 Current Behavior & Root Cause
In `.dockerignore`:
`.git` and `fuzz/` are not excluded. Building the backend image uploads git history, binary fuzzing test vectors, and mutation testing logs into the build context.

### 🛠️ Proposed Solution & Technical Specification
1. Update `.dockerignore` with comprehensive exclusions:
   ```
   .git
   .github
   fuzz/corpus
   mutants.out*
   test_snapshots
   docs
   *.md
   .devcontainer
   .claude
   coverage
   .nyc_output
   npm-debug.log*
   ```
2. Verify that Docker build context size drops from ~300 MB to <25 MB.

### 📁 Affected Files & Modules
- `.dockerignore`: Root ignore rules
- `backend/.dockerignore`: Backend-specific ignore rules

### ✅ Acceptance Criteria
- [ ] Docker build context transfer size reduced by >90%.
- [ ] `docker build` completes significantly faster locally and in CI.
- [ ] Git commit history and fuzz test artifacts excluded from images.
- [ ] All necessary application source files remain included.

### 🧪 Testing & Verification Plan
- Run `docker build .` and inspect initial line: `[internal] load build context`.
- Assert context size is <25 MB.

### 🔒 Security, Reliability & Performance Considerations
Prevents accidental leakage of git metadata, branch names, and commit logs into deployed images."""
    }
]

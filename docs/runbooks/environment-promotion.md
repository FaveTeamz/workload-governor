# Runbook: Environment Promotion

This document describes how infrastructure changes are promoted from staging to
production and how to safely manage the two Terraform environments.

---

## Environment Overview

| Environment | Terraform directory | State location (S3) | Apply method |
|---|---|---|---|
| `staging` | `terraform/environments/staging/` | `staging/terraform.tfstate` | Automatic on push to `main` |
| `production` | `terraform/environments/production/` | `production/terraform.tfstate` | Manual approval required |

Both environments share the same DynamoDB lock table (`workload-governor-tfstate-lock`)
to prevent concurrent applies across environments.

---

## State Isolation

Each environment uses a separate S3 key prefix in the same backend bucket:

```
s3://workload-governor-tfstate/
  staging/terraform.tfstate
  production/terraform.tfstate
```

Backend configs live at:
- `terraform/backend-staging.hcl`
- `terraform/backend-production.hcl`

---

## Local Workflow

### 1. Initialise for an environment

```bash
# Staging
make tf-init ENV=staging

# Production
make tf-init ENV=production
```

### 2. Plan changes

```bash
make tf-plan ENV=staging
make tf-plan ENV=production
```

The plan output is saved to `terraform/environments/<ENV>/<ENV>.tfplan`.

### 3. Apply to staging

Staging applies run automatically in CI on every push to `main` that touches
`terraform/**`. To apply manually:

```bash
make tf-plan ENV=staging
make tf-apply ENV=staging
```

### 4. Promote to production

Production applies require `APPROVE=yes` locally and a manual reviewer approval
in the GitHub Actions `production` environment.

```bash
make tf-plan ENV=production
make tf-apply ENV=production APPROVE=yes
```

Or trigger via GitHub Actions → **Terraform Deploy** → **Run workflow** →
select `production`.

---

## CI/CD Promotion Flow

```
PR opened
  └── plan-staging (auto)
  └── plan-production (auto)

Push to main
  └── apply-staging (auto, no approval needed)
        └── apply-production (waits for manual approval via GitHub Environment)
```

The `production` GitHub Environment must have at least one **required reviewer**
configured. Navigate to:

> **Repository → Settings → Environments → production → Required reviewers**

The deployment is blocked until an approved reviewer clicks **Approve and deploy**.

---

## Preventing Concurrent Applies

The shared DynamoDB table `workload-governor-tfstate-lock` holds state locks.
If two applies run simultaneously (e.g. a manual apply while CI is running),
Terraform will refuse the second one with:

```
Error: Error acquiring the state lock
```

Wait for the first apply to complete, or use `terraform force-unlock <LOCK_ID>`
only if you are certain the lock is stale (e.g. after a CI runner crash).

---

## Rolling Back a Production Apply

If a production apply introduces a problem:

1. Identify the last good commit: `git log --oneline terraform/`
2. Revert or create a fix branch and open a PR.
3. After the PR merges to `main`, the CI pipeline plans + applies staging automatically.
4. Approve the production apply in GitHub Actions once staging looks healthy.

For ECS rollbacks (image-level), see `docs/runbooks/incident-response.md`.

---

## Adding a New Environment

1. Create `terraform/environments/<env>/` by copying the staging directory.
2. Add `terraform/backend-<env>.hcl` with a unique `key` prefix.
3. Add `make tf-plan ENV=<env>` / `make tf-apply ENV=<env>` — they work automatically.
4. Create a GitHub Environment named `<env>` with appropriate reviewers.
5. Add plan/apply jobs to `.github/workflows/terraform-deploy.yml`.

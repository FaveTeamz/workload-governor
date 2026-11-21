# KMS Key Rotation — Documentation

**Branch:** `infra/863-kms-key-rotation`
**Issue:** [#863 [INFRA-001] Automated KMS key rotation in Terraform secrets module](https://github.com/FaveTeamz/workload-governor/issues/863)

## Overview

This document describes the automated annual KMS key rotation enabled on all customer-managed KMS keys (CMKs) in the `terraform/modules/secrets/` module, satisfying **CIS AWS Benchmark recommendation 2.8**.

## What Was Changed

### `terraform/modules/secrets/main.tf`
- Added three `aws_kms_key` resources (one per secret: `db_password`, `github_token`, `jwt_secret`), each with:
  - `enable_key_rotation = true` — AWS rotates the key material annually in-place
  - `deletion_window_in_days` — 30 days for production, 7 days for all other environments
- Added `aws_kms_alias` resources for human-readable key identification in the AWS console
- Updated `aws_secretsmanager_secret` resources to reference their corresponding CMK via `kms_key_id`

### `terraform/modules/secrets/outputs.tf`
- Added `kms_rotation_status` output — exposes `enable_key_rotation` status per key so CI pipelines can assert it is always `true`
- Added `kms_key_arns` output — exposes all CMK ARNs for use by other modules or for IAM policy references

## How Automatic Rotation Works

When `enable_key_rotation = true`:
1. AWS KMS automatically rotates the key material **once per year**
2. The key ID and ARN **do not change** — Terraform shows an **in-place** update (no resource replacement)
3. All previously encrypted data remains decryptable using the older key material versions, which AWS retains automatically
4. New encryption operations use the latest key material

## Verification

Run the following to verify rotation is enabled after applying:

```bash
aws kms describe-key --key-id alias/<project>-<environment>-db-password \
  --query 'KeyMetadata.KeyRotationStatus'
# Expected: true

aws kms get-key-rotation-status --key-id alias/<project>-<environment>-db-password
# Expected: { "KeyRotationEnabled": true }
```

## Terraform Plan Behaviour

- **New deployments**: creates `aws_kms_key`, `aws_kms_alias`, updates `aws_secretsmanager_secret` in-place to add `kms_key_id`
- **Existing deployments**: modifies `aws_kms_key.enable_key_rotation` from `false` to `true` **in-place** — no secret or key ARN changes; no re-encryption required

## Environment Defaults

| Environment | `deletion_window_in_days` | `enable_key_rotation` |
|-------------|--------------------------|----------------------|
| production  | 30                       | `true`               |
| staging     | 7                        | `true`               |

## Previous Secrets Rotation (Application-level)

The `infra/secrets.tf` file separately manages **Secrets Manager rotation Lambdas** for `DATABASE_URL` and `API_KEYS` (30-day rotation schedules). This is distinct from KMS key rotation — both mechanisms coexist:

- **KMS key rotation** (this document): rotates the _encryption key material_ used to protect secrets at rest
- **Secrets Manager rotation** (`infra/secrets.tf`): rotates the _secret values_ (credentials, tokens) on a configurable schedule

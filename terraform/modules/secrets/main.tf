locals {
  name = "${var.project}-${var.environment}"
}

# ── KMS Customer-Managed Keys ─────────────────────────────────────────────────
# Annual automated key rotation enabled (CIS AWS Benchmark 2.8).
# Rotation replaces the key material in-place; existing ciphertexts remain
# decryptable automatically — no resource replacement required.

resource "aws_kms_key" "db_password" {
  description             = "CMK for ${local.name} DB password secret"
  enable_key_rotation     = true
  deletion_window_in_days = var.environment == "production" ? 30 : 7
}

resource "aws_kms_alias" "db_password" {
  name          = "alias/${local.name}-db-password"
  target_key_id = aws_kms_key.db_password.key_id
}

resource "aws_kms_key" "github_token" {
  description             = "CMK for ${local.name} GitHub token secret"
  enable_key_rotation     = true
  deletion_window_in_days = var.environment == "production" ? 30 : 7
}

resource "aws_kms_alias" "github_token" {
  name          = "alias/${local.name}-github-token"
  target_key_id = aws_kms_key.github_token.key_id
}

resource "aws_kms_key" "jwt_secret" {
  description             = "CMK for ${local.name} JWT secret"
  enable_key_rotation     = true
  deletion_window_in_days = var.environment == "production" ? 30 : 7
}

resource "aws_kms_alias" "jwt_secret" {
  name          = "alias/${local.name}-jwt-secret"
  target_key_id = aws_kms_key.jwt_secret.key_id
}

# ── Secrets Manager resources (encrypted with customer-managed KMS keys) ──────

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name}-db-password"
  kms_key_id              = aws_kms_key.db_password.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "github_token" {
  name                    = "${local.name}-github-token"
  kms_key_id              = aws_kms_key.github_token.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name}-jwt-secret"
  kms_key_id              = aws_kms_key.jwt_secret.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

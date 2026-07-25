locals {
  name = "${var.project}-${var.environment}"
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name}-db-password"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "github_token" {
  name                    = "${local.name}-github-token"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name}-jwt-secret"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

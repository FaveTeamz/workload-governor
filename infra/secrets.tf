variable "service_name" {
  description = "Service name used to prefix secrets"
  type        = string
}

variable "db_rotation_lambda_arn" {
  description = "ARN of the Lambda function to use for RDS credential rotation. Leave empty to skip rotation resource creation."
  type        = string
  default     = ""
}

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${var.service_name}-DATABASE_URL"
  description = "Database connection URL for ${var.service_name}"
}

resource "aws_secretsmanager_secret" "redis_url" {
  name        = "${var.service_name}-REDIS_URL"
  description = "Redis connection URL for ${var.service_name}"
}

resource "aws_secretsmanager_secret" "github_token" {
  name        = "${var.service_name}-GITHUB_TOKEN"
  description = "GitHub token used by ${var.service_name}"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.service_name}-JWT_SECRET"
  description = "JWT signing secret for ${var.service_name}"
}

# Optional rotation for the database secret. Requires a pre-provisioned rotation Lambda.
resource "aws_secretsmanager_secret_rotation" "database_rotation" {
  count               = var.db_rotation_lambda_arn == "" ? 0 : 1
  secret_id           = aws_secretsmanager_secret.database_url.id
  rotation_lambda_arn = var.db_rotation_lambda_arn

  rotation_rules {
    automatically_after_days = 30
  }
}

output "secrets_arn" {
  value = {
    DATABASE_URL = aws_secretsmanager_secret.database_url.arn
    REDIS_URL    = aws_secretsmanager_secret.redis_url.arn
    GITHUB_TOKEN = aws_secretsmanager_secret.github_token.arn
    JWT_SECRET   = aws_secretsmanager_secret.jwt_secret.arn
  }
}

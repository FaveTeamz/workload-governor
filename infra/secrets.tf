# ─── Variables ───────────────────────────────────────────────────────────────

variable "service_name" {
  description = "Service name used to prefix secrets"
  type        = string
}

variable "db_rotation_lambda_arn" {
  description = "ARN of the Lambda function to use for RDS credential rotation. Leave empty to skip rotation resource creation."
  type        = string
  default     = ""
}

variable "api_key_rotation_lambda_arn" {
  description = "ARN of the Lambda that rotates the backend API key secret. Leave empty to skip rotation."
  type        = string
  default     = ""
}

variable "devops_alerts_sns_arn" {
  description = "ARN of the SNS topic to receive rotation failure alerts. Leave empty to skip alarm creation."
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region used for CloudWatch alarm resources."
  type        = string
  default     = "us-east-1"
}

# ─── Secrets ─────────────────────────────────────────────────────────────────

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

resource "aws_secretsmanager_secret" "api_keys" {
  name        = "${var.service_name}-API_KEYS"
  description = "Backend API keys for ${var.service_name} — rotated automatically every 30 days"
}

# ─── Rotation: RDS master password ────────────────────────────────────────────
#
# Uses the built-in SecretsManager Lambda (`SingleUser` strategy).
# `db_rotation_lambda_arn` must point to a pre-provisioned rotation Lambda that
# has permission to call secretsmanager:GetSecretValue and rds:ModifyDBInstance.
#
# Zero-downtime: the `SingleUser` strategy updates the password on the DB and
# then updates the secret value in the same atomic operation.  ECS tasks
# launched after rotation will automatically pick up the new secret via
# `valueFrom` in the task definition (no redeployment required).

resource "aws_secretsmanager_secret_rotation" "database_rotation" {
  count               = var.db_rotation_lambda_arn == "" ? 0 : 1
  secret_id           = aws_secretsmanager_secret.database_url.id
  rotation_lambda_arn = var.db_rotation_lambda_arn

  rotation_rules {
    automatically_after_days = 30
  }
}

# ─── Rotation: API keys secret ────────────────────────────────────────────────
#
# Rotation Lambda responsibilities (implemented outside Terraform):
#   1. Generate a new random API key.
#   2. Hash it and write it to the application database (api_keys table).
#   3. Update the secret value via secretsmanager:PutSecretValue (AWSPENDING).
#   4. Mark the version AWSCURRENT once the DB write succeeds.
#
# On rotation: the next ECS task launch reads the new secret via `valueFrom`.
# The old task continues using the previous key until it is drained and stopped.

resource "aws_secretsmanager_secret_rotation" "api_keys_rotation" {
  count               = var.api_key_rotation_lambda_arn == "" ? 0 : 1
  secret_id           = aws_secretsmanager_secret.api_keys.id
  rotation_lambda_arn = var.api_key_rotation_lambda_arn

  rotation_rules {
    automatically_after_days = 30
  }
}

# ─── CloudWatch alarm: rotation failure → SNS alert ──────────────────────────
#
# Secrets Manager publishes a `RotationFailed` event to CloudTrail when a
# rotation attempt fails.  We use a metric filter on the CloudTrail log group
# (created separately) to catch that event and fire an alarm.
#
# If your environment does not export CloudTrail to CloudWatch Logs, replace
# the filter below with an EventBridge rule targeting the same SNS topic.

resource "aws_cloudwatch_log_metric_filter" "rotation_failure_db" {
  count          = var.devops_alerts_sns_arn == "" ? 0 : 1
  name           = "${var.service_name}-db-rotation-failure"
  log_group_name = "/aws/secretsmanager/rotation"
  pattern        = "{ ($.eventName = RotationFailed) && ($.additionalEventData.SecretId = \"${var.service_name}-DATABASE_URL\") }"

  metric_transformation {
    name          = "${var.service_name}DbRotationFailureCount"
    namespace     = "WorkloadGovernor/Secrets"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "rotation_failure_api_keys" {
  count          = var.devops_alerts_sns_arn == "" ? 0 : 1
  name           = "${var.service_name}-apikeys-rotation-failure"
  log_group_name = "/aws/secretsmanager/rotation"
  pattern        = "{ ($.eventName = RotationFailed) && ($.additionalEventData.SecretId = \"${var.service_name}-API_KEYS\") }"

  metric_transformation {
    name          = "${var.service_name}ApiKeysRotationFailureCount"
    namespace     = "WorkloadGovernor/Secrets"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "db_rotation_failure_alarm" {
  count               = var.devops_alerts_sns_arn == "" ? 0 : 1
  alarm_name          = "${var.service_name}-db-secret-rotation-failure"
  alarm_description   = "RDS master password rotation failed for ${var.service_name}. Immediate investigation required."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "${var.service_name}DbRotationFailureCount"
  namespace           = "WorkloadGovernor/Secrets"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.devops_alerts_sns_arn]
  ok_actions    = [var.devops_alerts_sns_arn]
}

resource "aws_cloudwatch_metric_alarm" "api_keys_rotation_failure_alarm" {
  count               = var.devops_alerts_sns_arn == "" ? 0 : 1
  alarm_name          = "${var.service_name}-api-keys-rotation-failure"
  alarm_description   = "API keys secret rotation failed for ${var.service_name}. Immediate investigation required."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "${var.service_name}ApiKeysRotationFailureCount"
  namespace           = "WorkloadGovernor/Secrets"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.devops_alerts_sns_arn]
  ok_actions    = [var.devops_alerts_sns_arn]
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "secrets_arn" {
  description = "ARN map for all managed secrets — wire these into the ECS task definition as `valueFrom` references."
  value = {
    DATABASE_URL = aws_secretsmanager_secret.database_url.arn
    REDIS_URL    = aws_secretsmanager_secret.redis_url.arn
    GITHUB_TOKEN = aws_secretsmanager_secret.github_token.arn
    JWT_SECRET   = aws_secretsmanager_secret.jwt_secret.arn
    API_KEYS     = aws_secretsmanager_secret.api_keys.arn
  }
}

output "rotation_enabled" {
  description = "Which secrets have automatic rotation configured."
  value = {
    database_url = var.db_rotation_lambda_arn != ""
    api_keys     = var.api_key_rotation_lambda_arn != ""
  }
}

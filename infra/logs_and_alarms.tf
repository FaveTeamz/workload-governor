# =============================================================================
# logs_and_alarms.tf — CloudWatch log groups, Logs Insights queries, dashboard
# Issue #397: structured query support for operational observability
# =============================================================================
#
# Log format (src/logger.ts — pino JSON):
#   info  : { correlationId, method, path, status, duration, timestamp }
#   error : { correlationId, error, stack, timestamp }
#
# All four saved Insights queries target the ECS log group so they work
# against the same structured JSON stream emitted by the backend.

variable "service_name" {
  description = "Service name used for log group names and dashboard"
  type        = string
}

variable "db_instance_identifier" {
  description = "RDS DB instance identifier used to create RDS log group"
  type        = string
  default     = ""
}

variable "alarm_email" {
  description = "Email address to receive SNS alarm notifications"
  type        = string
  default     = ""
}

variable "pagerduty_https_endpoint" {
  description = "PagerDuty HTTPS endpoint URL for SNS subscription (leave empty to skip)"
  type        = string
  default     = ""
}

variable "ecs_cluster_name" {
  description = "ECS cluster name for CPU/memory metrics in dashboard"
  type        = string
  default     = ""
}

variable "rds_instance_identifier" {
  description = "RDS instance identifier for RDS connections metric in dashboard"
  type        = string
  default     = ""
}

# ── Log groups ────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.service_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "rds" {
  count             = var.db_instance_identifier == "" ? 0 : 1
  name              = "/rds/${var.db_instance_identifier}"
  retention_in_days = 30
}

# ── Saved Insights queries ────────────────────────────────────────────────────

resource "aws_cloudwatch_query_definition" "error_rate" {
  name = "${var.service_name}-error-rate"
  query_string = <<-EOT
    fields @timestamp, path, status, correlationId
    | filter status >= 400 or ispresent(error)
    | stats count(*) as error_count by path, bin(1h)
    | sort error_count desc
  EOT
}

resource "aws_cloudwatch_query_definition" "slow_requests" {
  name = "${var.service_name}-slow-requests"
  query_string = <<-EOT
    fields @timestamp, path, duration
    | filter ispresent(duration)
    | stats pct(duration, 95) as p95_ms, count(*) as requests by path
    | sort p95_ms desc
  EOT
}

resource "aws_cloudwatch_query_definition" "contract_submission_failures" {
  name = "${var.service_name}-contract-submission-failures"
  query_string = <<-EOT
    fields @timestamp, correlationId, error, path
    | filter error like /rpc|RPC|failover|timeout|ECONNREFUSED|ETIMEDOUT/
    | stats count(*) as rpc_failures by bin(1h)
    | sort @timestamp desc
  EOT
}

# ── SNS topic for on-call alerts ──────────────────────────────────────────────

resource "aws_sns_topic" "devops_alerts" {
  name = "devops-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.devops_alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_sns_topic_subscription" "pagerduty" {
  count     = var.pagerduty_https_endpoint != "" ? 1 : 0
  topic_arn = aws_sns_topic.devops_alerts.arn
  protocol  = "https"
  endpoint  = var.pagerduty_https_endpoint
}

# ── Metric filter 1: ERROR log count ─────────────────────────────────────────
# Counts log lines containing ERROR/Error/error in the ECS log group.

resource "aws_cloudwatch_log_metric_filter" "error_count" {
  name           = "${var.service_name}-error-count"
  pattern        = "[timestamp, request_id, level=ERROR, ...]"
  log_group_name = aws_cloudwatch_log_group.ecs.name

  metric_transformation {
    name          = "ErrorCount"
    namespace     = "${var.service_name}/Application"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "error_count_alarm" {
  alarm_name          = "${var.service_name}-high-error-rate"
  alarm_description   = "More than 10 ERROR log entries per minute for 2 consecutive periods"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "ErrorCount"
  namespace           = "${var.service_name}/Application"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "breaching" # INSUFFICIENT_DATA treated as ALARM

  alarm_actions             = [aws_sns_topic.devops_alerts.arn]
  ok_actions                = [aws_sns_topic.devops_alerts.arn]
  insufficient_data_actions = [aws_sns_topic.devops_alerts.arn]
}

# ── Metric filter 2: HTTP 5xx response count ──────────────────────────────────
# Counts log lines that record HTTP 5xx status codes.

resource "aws_cloudwatch_log_metric_filter" "http_5xx" {
  name           = "${var.service_name}-http-5xx"
  pattern        = "[..., status_code=5*, ...]"
  log_group_name = aws_cloudwatch_log_group.ecs.name

  metric_transformation {
    name          = "Http5xxCount"
    namespace     = "${var.service_name}/Application"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "http_5xx_alarm" {
  alarm_name          = "${var.service_name}-high-5xx-rate"
  alarm_description   = "More than 5 HTTP 5xx responses per minute for 2 consecutive periods"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "Http5xxCount"
  namespace           = "${var.service_name}/Application"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "breaching"

  alarm_actions             = [aws_sns_topic.devops_alerts.arn]
  ok_actions                = [aws_sns_topic.devops_alerts.arn]
  insufficient_data_actions = [aws_sns_topic.devops_alerts.arn]
}

# ── Metric filter 3: Soroban RPC failover events ──────────────────────────────
# Triggers on any log message indicating a Soroban RPC endpoint failover.

resource "aws_cloudwatch_log_metric_filter" "soroban_rpc_failover" {
  name           = "${var.service_name}-soroban-rpc-failover"
  pattern        = "?\"soroban rpc failover\" ?\"rpc failover\" ?\"switching rpc\" ?\"rpc endpoint switched\""
  log_group_name = aws_cloudwatch_log_group.ecs.name

  metric_transformation {
    name          = "SorobanRpcFailover"
    namespace     = "${var.service_name}/Application"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "soroban_rpc_failover_alarm" {
  alarm_name          = "${var.service_name}-soroban-rpc-failover"
  alarm_description   = "At least one Soroban RPC failover event detected"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "SorobanRpcFailover"
  namespace           = "${var.service_name}/Application"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "breaching"

  alarm_actions             = [aws_sns_topic.devops_alerts.arn]
  ok_actions                = [aws_sns_topic.devops_alerts.arn]
  insufficient_data_actions = [aws_sns_topic.devops_alerts.arn]
}

# ── CloudWatch Dashboard ──────────────────────────────────────────────────────
# Single view: all 3 alarms + ECS CPU/memory + RDS connections.

resource "aws_cloudwatch_dashboard" "service_dashboard" {
  dashboard_name = "${var.service_name}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      # ── Title ──────────────────────────────────────────────────────────────
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 1
        properties = {
          markdown = "# ${var.service_name} — Operations Overview"
        }
      },

      # ── Alarm: Error Count ─────────────────────────────────────────────────
      {
        type   = "alarm"
        x      = 0
        y      = 1
        width  = 8
        height = 3
        properties = {
          title  = "High Error Rate"
          alarms = [aws_cloudwatch_metric_alarm.error_count_alarm.arn]
        }
      },

      # ── Alarm: HTTP 5xx ────────────────────────────────────────────────────
      {
        type   = "alarm"
        x      = 8
        y      = 1
        width  = 8
        height = 3
        properties = {
          title  = "HTTP 5xx Rate"
          alarms = [aws_cloudwatch_metric_alarm.http_5xx_alarm.arn]
        }
      },

      # ── Alarm: Soroban RPC Failover ────────────────────────────────────────
      {
        type   = "alarm"
        x      = 16
        y      = 1
        width  = 8
        height = 3
        properties = {
          title  = "Soroban RPC Failover"
          alarms = [aws_cloudwatch_metric_alarm.soroban_rpc_failover_alarm.arn]
        }
      },

      # ── Error Count metric (time series) ──────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 4
        width  = 12
        height = 6
        properties = {
          title  = "Application Error Count"
          view   = "timeSeries"
          period = 60
          metrics = [
            ["${var.service_name}/Application", "ErrorCount", { stat = "Sum", color = "#d62728" }],
            ["${var.service_name}/Application", "Http5xxCount", { stat = "Sum", color = "#ff7f0e" }],
            ["${var.service_name}/Application", "SorobanRpcFailover", { stat = "Sum", color = "#9467bd" }]
          ]
        }
      },

      # ── ECS CPU & Memory (only shown when cluster name is provided) ────────
      {
        type   = "metric"
        x      = 12
        y      = 4
        width  = 12
        height = 6
        properties = {
          title  = "ECS CPU & Memory Utilization"
          view   = "timeSeries"
          period = 60
          metrics = var.ecs_cluster_name != "" ? [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.service_name, { stat = "Average", color = "#1f77b4" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.service_name, { stat = "Average", color = "#2ca02c" }]
          ] : []
        }
      },

      # ── RDS Connections ────────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 10
        width  = 12
        height = 6
        properties = {
          title  = "RDS Database Connections"
          view   = "timeSeries"
          period = 60
          metrics = var.rds_instance_identifier != "" ? [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.rds_instance_identifier, { stat = "Average", color = "#8c564b" }]
          ] : []
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "ecs_log_group_name" {
  value = aws_cloudwatch_log_group.ecs.name
}

output "rds_log_group_name" {
  value = length(aws_cloudwatch_log_group.rds) > 0 ? aws_cloudwatch_log_group.rds[0].name : ""
}

output "operational_dashboard_name" {
  description = "Name of the operational CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.service_dashboard.dashboard_name
}

output "operational_dashboard_arn" {
  description = "ARN of the operational CloudWatch dashboard (share this with the team)"
  value       = aws_cloudwatch_dashboard.service_dashboard.dashboard_arn
}

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

# ---------------------------------------------------------------------------
# Log groups
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.service_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "rds" {
  count             = var.db_instance_identifier == "" ? 0 : 1
  name              = "/rds/${var.db_instance_identifier}"
  retention_in_days = 30
}

# ---------------------------------------------------------------------------
# Saved Logs Insights queries (issue #397)
# ---------------------------------------------------------------------------

# Query 1 — Error rate by endpoint (last 1 hour)
# Groups HTTP 4xx/5xx responses and logged errors by request path.
# Useful during incidents to quickly identify the most-affected endpoints.
resource "aws_cloudwatch_query_definition" "error_rate_by_endpoint" {
  name = "${var.service_name}-error-rate-by-endpoint"

  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    fields @timestamp, path, status, correlationId
    | filter status >= 400 or ispresent(error)
    | stats count(*) as error_count by path, bin(1h)
    | sort error_count desc
  EOT
}

# Query 2 — p95 latency per endpoint
# Parses the `duration` field (milliseconds) logged on every response and
# computes the 95th-percentile latency per path. Slow requests surface here.
resource "aws_cloudwatch_query_definition" "p95_latency_per_endpoint" {
  name = "${var.service_name}-p95-latency-per-endpoint"

  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    fields @timestamp, path, duration
    | filter ispresent(duration)
    | stats pct(duration, 95) as p95_ms, count(*) as requests by path
    | sort p95_ms desc
  EOT
}

# Query 3 — Failed transactions by error code (last 1 hour)
# Filters log lines that carry an `error` field (backend error handler path)
# and extracts numeric error codes from the error message string.
# Correlates Soroban contract error codes (e.g. 11 = AlreadyAssigned) with
# the paths that trigger them.
resource "aws_cloudwatch_query_definition" "failed_transactions_by_error_code" {
  name = "${var.service_name}-failed-transactions-by-error-code"

  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    fields @timestamp, correlationId, error, path
    | filter ispresent(error)
    | parse error /(?P<error_code>\d+)/
    | stats count(*) as failures by error_code, path
    | sort failures desc
  EOT
}

# Query 4 — RPC failover events in the last 24 hours
# Detects connectivity failures to the Stellar RPC / Horizon endpoints.
# Matches keywords that indicate network-level errors or explicit failover
# log messages emitted when the client switches to a fallback RPC node.
resource "aws_cloudwatch_query_definition" "rpc_failover_events" {
  name = "${var.service_name}-rpc-failover-events"

  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    fields @timestamp, correlationId, error, path
    | filter error like /rpc|RPC|failover|timeout|ECONNREFUSED|ETIMEDOUT/
    | stats count(*) as rpc_failures by bin(1h)
    | sort @timestamp desc
  EOT
}

# ---------------------------------------------------------------------------
# CloudWatch dashboard — one widget per query, 1-hour auto-refresh
# ---------------------------------------------------------------------------
# Layout (each widget 12 wide × 6 tall):
#   Row 0: [error-rate-by-endpoint]  [p95-latency-per-endpoint]
#   Row 1: [failed-txn-by-error-code][rpc-failover-events]

resource "aws_cloudwatch_dashboard" "service_dashboard" {
  dashboard_name = "${var.service_name}-operational"

  dashboard_body = jsonencode({
    widgets = [
      # ---- Row 0, col 0 — Error rate by endpoint -------------------------
      {
        type   = "log"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Error Rate by Endpoint (1 h)"
          region  = "us-east-1"
          view    = "table"
          period  = 3600
          refresh = 3600
          query   = "SOURCE '${aws_cloudwatch_log_group.ecs.name}' | fields @timestamp, path, status, correlationId | filter status >= 400 or ispresent(error) | stats count(*) as error_count by path, bin(1h) | sort error_count desc"
        }
      },
      # ---- Row 0, col 1 — p95 latency per endpoint -----------------------
      {
        type   = "log"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "p95 Latency per Endpoint (ms)"
          region  = "us-east-1"
          view    = "table"
          period  = 3600
          refresh = 3600
          query   = "SOURCE '${aws_cloudwatch_log_group.ecs.name}' | fields @timestamp, path, duration | filter ispresent(duration) | stats pct(duration, 95) as p95_ms, count(*) as requests by path | sort p95_ms desc"
        }
      },
      # ---- Row 1, col 0 — Failed transactions by error code --------------
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Failed Transactions by Error Code"
          region  = "us-east-1"
          view    = "table"
          period  = 3600
          refresh = 3600
          query   = "SOURCE '${aws_cloudwatch_log_group.ecs.name}' | fields @timestamp, correlationId, error, path | filter ispresent(error) | parse error /(?P<error_code>\\d+)/ | stats count(*) as failures by error_code, path | sort failures desc"
        }
      },
      # ---- Row 1, col 1 — RPC failover events ----------------------------
      {
        type   = "log"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "RPC Failover Events (24 h)"
          region  = "us-east-1"
          view    = "table"
          period  = 86400
          refresh = 3600
          query   = "SOURCE '${aws_cloudwatch_log_group.ecs.name}' | fields @timestamp, correlationId, error, path | filter error like /rpc|RPC|failover|timeout|ECONNREFUSED|ETIMEDOUT/ | stats count(*) as rpc_failures by bin(1h) | sort @timestamp desc"
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

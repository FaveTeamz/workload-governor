variable "service_name" {
  description = "Service name used for log group names and dashboard"
  type        = string
}

variable "db_instance_identifier" {
  description = "RDS DB instance identifier used to create RDS log group"
  type        = string
  default     = ""
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.service_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "rds" {
  count             = var.db_instance_identifier == "" ? 0 : 1
  name              = "/rds/${var.db_instance_identifier}"
  retention_in_days = 30
}

# Saved Insights queries
resource "aws_cloudwatch_query_definition" "error_rate" {
  name        = "${var.service_name}-error-rate"
  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /ERROR|Error|error/
    | stats count() as errors by bin(5m)
  EOT
}

resource "aws_cloudwatch_query_definition" "slow_requests" {
  name        = "${var.service_name}-slow-requests"
  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /duration|latency/ and @message like /ms/
    | parse @message "*duration=*ms*" as before, duration
    | filter tonumber(duration) > 1000
    | stats count() as slow by bin(5m)
  EOT
}

resource "aws_cloudwatch_query_definition" "contract_submission_failures" {
  name        = "${var.service_name}-contract-submission-failures"
  query_string = <<-EOT
    fields @timestamp, @message
    | filter @message like /contract.*submit.*fail|submission.*failed/i
    | stats count() by bin(5m)
  EOT
}

# Simple dashboard (consumers can expand as needed)
resource "aws_cloudwatch_dashboard" "service_dashboard" {
  dashboard_name = "${var.service_name}-dashboard"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "text",
        x = 0,
        y = 0,
        width = 24,
        height = 1,
        properties = { markdown = "# ${var.service_name} overview" }
      }
    ]
  })
}

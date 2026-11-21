# ─────────────────────────────────────────────────────────────────────────────
# WorkloadGovernor — CloudWatch Dashboard & Alarms
# Issue #640: ECS Container Insights + unified operational dashboard
#
# Widgets:
#   Row 0 — ECS CPU, ECS Memory, ECS Running Tasks
#   Row 1 — ALB Request Count, ALB 5xx Rate
#   Row 2 — RDS Connections, RDS Read Latency, RDS Write Latency
#   Row 3 — App Prometheus metrics (ContractSubmissions, ContractErrors)
#   Row 4 — WAF Blocked Requests
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

# ── Variables ─────────────────────────────────────────────────────────────────

variable "cluster_name" {
  description = "ECS cluster name (e.g. workload-governor-production)"
  type        = string
  default     = "workload-governor-production"
}

variable "service_name" {
  description = "ECS service name (same as cluster_name for this project)"
  type        = string
  default     = "workload-governor-production"
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metrics (e.g. app/workload-governor-production/abc123)"
  type        = string
  default     = "app/workload-governor-production/REPLACE_WITH_ACTUAL_SUFFIX"
}

variable "tg_arn_suffix" {
  description = "Target group ARN suffix (e.g. targetgroup/workload-governor-production/abc123)"
  type        = string
  default     = "targetgroup/workload-governor-production/REPLACE_WITH_ACTUAL_SUFFIX"
}

variable "rds_instance_id" {
  description = "RDS DB instance identifier"
  type        = string
  default     = "workload-governor-production"
}

variable "waf_acl_id" {
  description = "WAF Web ACL ID (leave blank to skip WAF widget)"
  type        = string
  default     = ""
}

variable "sns_alarm_arn" {
  description = "SNS topic ARN to notify when alarms trigger"
  type        = string
  default     = ""
}

data "aws_region" "current" {}

locals {
  region = data.aws_region.current.name
}

# ── CloudWatch Dashboard ───────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "workload_governor" {
  dashboard_name = "workload-governor"

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
          markdown = "# WorkloadGovernor — Operational Dashboard\nRegion: **${local.region}** | Cluster: **${var.cluster_name}**"
        }
      },

      # ── ECS CPU Utilisation ───────────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 1
        width  = 8
        height = 6
        properties = {
          title  = "ECS CPU Utilisation (%)"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Average"
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.cluster_name, "ServiceName", var.service_name,
              { label = "CPU %", color = "#4a6de0" }]
          ]
          annotations = {
            horizontal = [{ label = "Alert threshold", value = 80, color = "#ef4444" }]
          }
          yAxis = { left = { min = 0, max = 100 } }
          region = local.region
        }
      },

      # ── ECS Memory Utilisation ────────────────────────────────────────────
      {
        type   = "metric"
        x      = 8
        y      = 1
        width  = 8
        height = 6
        properties = {
          title  = "ECS Memory Utilisation (%)"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Average"
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ClusterName", var.cluster_name, "ServiceName", var.service_name,
              { label = "Memory %", color = "#6c8eff" }]
          ]
          annotations = {
            horizontal = [{ label = "Alert threshold", value = 85, color = "#ef4444" }]
          }
          yAxis = { left = { min = 0, max = 100 } }
          region = local.region
        }
      },

      # ── ECS Running Task Count ────────────────────────────────────────────
      {
        type   = "metric"
        x      = 16
        y      = 1
        width  = 8
        height = 6
        properties = {
          title  = "ECS Running Task Count"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Average"
          metrics = [
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", var.cluster_name, "ServiceName", var.service_name,
              { label = "Running Tasks", color = "#22c55e" }]
          ]
          region = local.region
        }
      },

      # ── ALB Request Count ─────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 7
        width  = 12
        height = 6
        properties = {
          title  = "ALB Request Count"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Sum"
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix,
              { label = "Requests/min", color = "#4a6de0" }]
          ]
          region = local.region
        }
      },

      # ── ALB 5xx Error Rate ────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 12
        y      = 7
        width  = 12
        height = 6
        properties = {
          title  = "ALB 5xx Error Count"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Sum"
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", var.alb_arn_suffix,
              { label = "5xx Errors", color = "#ef4444" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix,
              { label = "Target 5xx", color = "#f59e0b" }]
          ]
          annotations = {
            horizontal = [{ label = "Alert threshold", value = 10, color = "#ef4444" }]
          }
          region = local.region
        }
      },

      # ── RDS Connection Count ──────────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 13
        width  = 8
        height = 6
        properties = {
          title  = "RDS Connection Count"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Average"
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.rds_instance_id,
              { label = "Connections", color = "#818cf8" }]
          ]
          region = local.region
        }
      },

      # ── RDS Read Latency ──────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 8
        y      = 13
        width  = 8
        height = 6
        properties = {
          title  = "RDS Read Latency (ms)"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Average"
          metrics = [
            ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", var.rds_instance_id,
              { label = "Read Latency", color = "#22c55e" }]
          ]
          yAxis = { left = { min = 0 } }
          region = local.region
        }
      },

      # ── RDS Write Latency ─────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 16
        y      = 13
        width  = 8
        height = 6
        properties = {
          title  = "RDS Write Latency (ms)"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Average"
          metrics = [
            ["AWS/RDS", "WriteLatency", "DBInstanceIdentifier", var.rds_instance_id,
              { label = "Write Latency", color = "#f59e0b" }]
          ]
          yAxis = { left = { min = 0 } }
          region = local.region
        }
      },

      # ── Application Prometheus metrics (custom namespace) ─────────────────
      {
        type   = "metric"
        x      = 0
        y      = 19
        width  = 12
        height = 6
        properties = {
          title  = "Contract Submissions (Application Metrics)"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Sum"
          metrics = [
            ["WorkloadGovernor", "ContractSubmissions", "Network", "testnet",
              { label = "Testnet Submissions", color = "#4a6de0" }],
            ["WorkloadGovernor", "ContractSubmissions", "Network", "mainnet",
              { label = "Mainnet Submissions", color = "#22c55e" }]
          ]
          region = local.region
        }
      },

      # ── Application Error Rate ────────────────────────────────────────────
      {
        type   = "metric"
        x      = 12
        y      = 19
        width  = 12
        height = 6
        properties = {
          title  = "Contract Errors (Application Metrics)"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Sum"
          metrics = [
            ["WorkloadGovernor", "ContractErrors", "ErrorCode", "GlobalCapReached",
              { label = "Global Cap Reached", color = "#ef4444" }],
            ["WorkloadGovernor", "ContractErrors", "ErrorCode", "OrgCapReached",
              { label = "Org Cap Reached", color = "#f59e0b" }],
            ["WorkloadGovernor", "ContractErrors", "ErrorCode", "UnauthorizedAdmin",
              { label = "Unauthorized Admin", color = "#b91c1c" }]
          ]
          region = local.region
        }
      },

      # ── WAF Blocked Requests ──────────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 25
        width  = 24
        height = 6
        properties = {
          title  = "WAF Blocked Requests"
          view   = "timeSeries"
          stacked = false
          period = 60
          stat   = "Sum"
          metrics = [
            ["AWS/WAFV2", "BlockedRequests", "WebACL", "workload-governor-waf", "Region", local.region, "Rule", "ALL",
              { label = "WAF Blocked Requests", color = "#ef4444" }]
          ]
          region = local.region
        }
      }
    ]
  })
}

# ── CloudWatch Alarms ─────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${var.cluster_name}-cpu-high"
  alarm_description   = "ECS CPU utilisation exceeded 80% for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.service_name
  }

  alarm_actions = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  ok_actions    = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "${var.cluster_name}-memory-high"
  alarm_description   = "ECS memory utilisation exceeded 85% for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.service_name
  }

  alarm_actions = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  ok_actions    = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_high" {
  alarm_name          = "${var.cluster_name}-alb-5xx-high"
  alarm_description   = "ALB 5xx error count exceeded 10 in a 1-minute window"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  alarm_actions = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  ok_actions    = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "ecs_no_tasks" {
  alarm_name          = "${var.cluster_name}-no-running-tasks"
  alarm_description   = "No running ECS tasks detected — service may be down"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.service_name
  }

  alarm_actions = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
  ok_actions    = var.sns_alarm_arn != "" ? [var.sns_alarm_arn] : []
}

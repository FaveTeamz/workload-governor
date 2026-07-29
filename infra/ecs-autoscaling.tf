# =============================================================================
# ecs-autoscaling.tf — ECS Application Auto Scaling
# Issue #387: scale based on ALB request rate and CPU utilisation
#
# Scale-out triggers:
#   - ALB RequestCountPerTarget > 100 req/min per task for 2 min  → add tasks
#   - ECS CPUUtilization > 70% for 2 min                          → add tasks
# Scale-in trigger:
#   - ALB RequestCountPerTarget < 20 req/min for 10 min           → remove tasks
#
# Capacity:   min=2 tasks, max=10 tasks
# Cooldowns:  scale-out 60 s, scale-in 300 s
# =============================================================================

variable "cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "service_name" {
  description = "ECS service name"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ARN suffix of the ALB (e.g. app/my-alb/abc123). Used in CloudWatch metric dimensions."
  type        = string
}

variable "target_group_arn_suffix" {
  description = "ARN suffix of the ALB target group (e.g. targetgroup/my-tg/xyz789). Used in CloudWatch metric dimensions."
  type        = string
}

variable "sns_alarm_topic_arn" {
  description = "SNS topic ARN to send CloudWatch alarm notifications to"
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Autoscaling target
# ---------------------------------------------------------------------------

resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${var.cluster_name}/${var.service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# ---------------------------------------------------------------------------
# Policy 1: CPU target tracking (scale-out >70%, scale-in <30%)
# ---------------------------------------------------------------------------

resource "aws_appautoscaling_policy" "cpu_tracking" {
  name               = "${var.service_name}-cpu-tracking"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# ---------------------------------------------------------------------------
# Policy 2: ALB request count step scaling
#
# Step scaling gives independent control of scale-out and scale-in thresholds
# and cooldowns, which target tracking does not support for ALB metrics.
# Two CloudWatch alarms (scale-out, scale-in) each target one of the two
# step-scaling policies below.
# ---------------------------------------------------------------------------

resource "aws_appautoscaling_policy" "alb_request_scale_out" {
  name               = "${var.service_name}-alb-request-scale-out"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  step_scaling_policy_configuration {
    adjustment_type          = "ChangeInCapacity"
    cooldown                 = 60
    metric_aggregation_type  = "Average"

    # Single step: any breach → add 2 tasks
    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 2
    }
  }
}

resource "aws_appautoscaling_policy" "alb_request_scale_in" {
  name               = "${var.service_name}-alb-request-scale-in"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  step_scaling_policy_configuration {
    adjustment_type          = "ChangeInCapacity"
    cooldown                 = 300
    metric_aggregation_type  = "Average"

    # Single step: any breach → remove 1 task
    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
}

# ---------------------------------------------------------------------------
# CloudWatch alarm: ALB high request rate → scale out
# Fires when RequestCountPerTarget > 100 for 2 consecutive 1-minute periods
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_high_request_rate" {
  alarm_name          = "${var.service_name}-alb-high-request-rate"
  alarm_description   = "ALB RequestCountPerTarget > 100 req/min per task for 2 min — scale out ECS service"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 100
  treat_missing_data  = "notBreaching"

  metric_name = "RequestCountPerTarget"
  namespace   = "AWS/ApplicationELB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }

  alarm_actions = compact([
    aws_appautoscaling_policy.alb_request_scale_out.arn,
    var.sns_alarm_topic_arn,
  ])
}

# ---------------------------------------------------------------------------
# CloudWatch alarm: ALB low request rate → scale in
# Fires when RequestCountPerTarget < 20 for 10 consecutive 1-minute periods
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_low_request_rate" {
  alarm_name          = "${var.service_name}-alb-low-request-rate"
  alarm_description   = "ALB RequestCountPerTarget < 20 req/min per task for 10 min — scale in ECS service"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 10
  threshold           = 20
  treat_missing_data  = "notBreaching"

  metric_name = "RequestCountPerTarget"
  namespace   = "AWS/ApplicationELB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }

  alarm_actions = compact([
    aws_appautoscaling_policy.alb_request_scale_in.arn,
    var.sns_alarm_topic_arn,
  ])
}

# ---------------------------------------------------------------------------
# CloudWatch alarm: CPU high utilisation → scale out
# The target tracking policy manages this automatically, but an explicit alarm
# makes the trigger visible in the CloudWatch dashboard as required by #387.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ecs_high_cpu" {
  alarm_name          = "${var.service_name}-ecs-high-cpu"
  alarm_description   = "ECS CPUUtilization > 70% for 2 min — scale out via CPU target tracking policy"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 70
  treat_missing_data  = "notBreaching"

  metric_name = "CPUUtilization"
  namespace   = "AWS/ECS"
  period      = 60
  statistic   = "Average"

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.service_name
  }

  alarm_actions = compact([var.sns_alarm_topic_arn])
}

# ---------------------------------------------------------------------------
# Outputs — expose policy ARNs so other modules / CI can reference them
# ---------------------------------------------------------------------------

output "ecs_autoscaling_target_resource_id" {
  description = "Application AutoScaling resource ID for the ECS service"
  value       = aws_appautoscaling_target.ecs.resource_id
}

output "cpu_tracking_policy_arn" {
  description = "ARN of the CPU target-tracking autoscaling policy"
  value       = aws_appautoscaling_policy.cpu_tracking.arn
}

output "alb_scale_out_policy_arn" {
  description = "ARN of the ALB request-count scale-out step scaling policy"
  value       = aws_appautoscaling_policy.alb_request_scale_out.arn
}

output "alb_scale_in_policy_arn" {
  description = "ARN of the ALB request-count scale-in step scaling policy"
  value       = aws_appautoscaling_policy.alb_request_scale_in.arn
}

output "alb_high_request_rate_alarm_arn" {
  description = "ARN of the ALB high-request-rate CloudWatch alarm (scale-out trigger)"
  value       = aws_cloudwatch_metric_alarm.alb_high_request_rate.arn
}

output "alb_low_request_rate_alarm_arn" {
  description = "ARN of the ALB low-request-rate CloudWatch alarm (scale-in trigger)"
  value       = aws_cloudwatch_metric_alarm.alb_low_request_rate.arn
}

output "ecs_high_cpu_alarm_arn" {
  description = "ARN of the ECS high-CPU CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.ecs_high_cpu.arn
}

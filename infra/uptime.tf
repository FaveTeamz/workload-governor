# ---------------------------------------------------------------------------
# Uptime monitoring: Route 53 health checks + CloudWatch alarms + SNS alerts
#
# SLA target: 99.5% monthly uptime
#   - Backend /api/health:          checked every 10 s, alert after 2 consecutive failures
#   - Frontend (ALB):               checked every 30 s, alert after 2 consecutive failures
#   - Backend /api/health/network:  checked every 30 s, alert on degraded Horizon status
#
# Alerting: SNS topic 'devops-alerts'
# Status dashboard: https://console.aws.amazon.com/route53/healthchecks/home
# ---------------------------------------------------------------------------

# ── Variables ───────────────────────────────────────────────────────────────

variable "service_name" {
  description = "Short service identifier used as a prefix for all resource names"
  type        = string
  default     = "workload-governor"
}

variable "backend_fqdn" {
  description = "Fully-qualified domain name of the backend (e.g. api.example.com)"
  type        = string
}

variable "frontend_fqdn" {
  description = "Fully-qualified domain name of the frontend ALB DNS name (e.g. example.com)"
  type        = string
}

variable "alert_email" {
  description = "Email address that receives downtime and availability alerts"
  type        = string
}

variable "slack_webhook_url" {
  description = "Slack incoming-webhook URL for downtime alerts"
  type        = string
  sensitive   = true
}

# ── SNS topic: devops-alerts ────────────────────────────────────────────────

resource "aws_sns_topic" "devops_alerts" {
  name = "devops-alerts"

  tags = {
    Name    = "devops-alerts"
    service = var.service_name
  }
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.devops_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_sns_topic_subscription" "slack" {
  topic_arn = aws_sns_topic.devops_alerts.arn
  protocol  = "https"
  endpoint  = var.slack_webhook_url
}

# ── Route 53 health checks ──────────────────────────────────────────────────
# Route 53 distributes health checkers across 15+ AWS regions globally.
# A health check is considered failed when the majority of checkers fail,
# providing built-in multi-region coverage (at least 3 regions as required).
#
# Supported request_interval values: 10 s (standard) or 30 s (reduced cost).

# Check 1: GET /api/health — every 10 s, alert after 2 consecutive failures
resource "aws_route53_health_check" "backend_health" {
  fqdn              = var.backend_fqdn
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health"
  request_interval  = 10   # 10-second interval; failure detected within ~20–30 s
  failure_threshold = 2    # 2 consecutive failures → unhealthy → alarm fires
  measure_latency   = true

  tags = { Name = "${var.service_name}-backend-health" }
}

# Check 2: GET frontend (ALB DNS) — every 30 s (~5 min equivalent), alert after 2 consecutive failures
resource "aws_route53_health_check" "frontend" {
  fqdn              = var.frontend_fqdn
  port              = 443
  type              = "HTTPS"
  resource_path     = "/"
  request_interval  = 30   # 30-second interval (~5 min detection window with threshold=2)
  failure_threshold = 2    # 2 consecutive failures → unhealthy → alarm fires
  measure_latency   = true

  tags = { Name = "${var.service_name}-frontend-health" }
}

# Check 3: GET /api/health/network — Horizon connectivity, every 30 s, alert on degraded status
resource "aws_route53_health_check" "horizon_network" {
  fqdn              = var.backend_fqdn
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health/network"
  request_interval  = 30   # 30-second interval; alert on degraded Horizon connectivity
  failure_threshold = 2    # alert after 2 consecutive non-2xx responses
  measure_latency   = true

  tags = { Name = "${var.service_name}-horizon-network-health" }
}

# ── CloudWatch alarms ───────────────────────────────────────────────────────
# Route 53 health-check metrics are published only in us-east-1.
# Use an aliased provider for this region if your stack is in another region.

# ── Backend /api/health alarms ──────────────────────────────────────────────

# Fires when the backend /api/health check fails (2 consecutive failures)
resource "aws_cloudwatch_metric_alarm" "backend_health_down" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-backend-health-down"
  alarm_description   = "Backend /api/health is unreachable (2 consecutive failures)"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.backend_health.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2   # 2 consecutive 1-min periods below threshold
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.devops_alerts.arn]
  ok_actions          = [aws_sns_topic.devops_alerts.arn]
}

# Fires when backend availability drops below SLA (99.5%) in a 1-hour window
resource "aws_cloudwatch_metric_alarm" "backend_availability" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-backend-availability-low"
  alarm_description   = "Backend availability below 99.5% over 1 hour (SLA breach risk)"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckPercentageHealthy"
  dimensions          = { HealthCheckId = aws_route53_health_check.backend_health.id }
  statistic           = "Average"
  period              = 3600  # 1-hour window for SLA measurement
  evaluation_periods  = 1
  threshold           = 99.5
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.devops_alerts.arn]
  ok_actions          = [aws_sns_topic.devops_alerts.arn]
}

# ── Frontend alarms ─────────────────────────────────────────────────────────

# Fires when the frontend check fails (2 consecutive failures)
resource "aws_cloudwatch_metric_alarm" "frontend_down" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-frontend-down"
  alarm_description   = "Frontend is unreachable (2 consecutive failures)"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.frontend.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.devops_alerts.arn]
  ok_actions          = [aws_sns_topic.devops_alerts.arn]
}

# Fires when frontend availability drops below SLA (99.5%) in a 1-hour window
resource "aws_cloudwatch_metric_alarm" "frontend_availability" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-frontend-availability-low"
  alarm_description   = "Frontend availability below 99.5% over 1 hour (SLA breach risk)"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckPercentageHealthy"
  dimensions          = { HealthCheckId = aws_route53_health_check.frontend.id }
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 99.5
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.devops_alerts.arn]
  ok_actions          = [aws_sns_topic.devops_alerts.arn]
}

# ── Horizon network check alarm ─────────────────────────────────────────────

# Fires when Horizon connectivity is degraded (2 consecutive failures)
resource "aws_cloudwatch_metric_alarm" "horizon_network_degraded" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-horizon-network-degraded"
  alarm_description   = "Backend /api/health/network reports degraded Horizon connectivity (2 consecutive failures)"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.horizon_network.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.devops_alerts.arn]
  ok_actions          = [aws_sns_topic.devops_alerts.arn]
}

# ── Outputs ─────────────────────────────────────────────────────────────────

output "devops_alerts_sns_topic_arn" {
  description = "ARN of the devops-alerts SNS topic"
  value       = aws_sns_topic.devops_alerts.arn
}

output "backend_health_check_id" {
  description = "Route 53 health check ID for backend /api/health"
  value       = aws_route53_health_check.backend_health.id
}

output "frontend_health_check_id" {
  description = "Route 53 health check ID for the frontend"
  value       = aws_route53_health_check.frontend.id
}

output "horizon_network_health_check_id" {
  description = "Route 53 health check ID for backend /api/health/network (Horizon)"
  value       = aws_route53_health_check.horizon_network.id
}

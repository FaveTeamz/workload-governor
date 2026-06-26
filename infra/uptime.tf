# ---------------------------------------------------------------------------
# Uptime monitoring: Route 53 health checks + CloudWatch alarms + SNS alerts
# ---------------------------------------------------------------------------

# ── Variables ───────────────────────────────────────────────────────────────

variable "backend_fqdn" {
  description = "Fully-qualified domain name of the backend (e.g. api.example.com)"
  type        = string
}

variable "frontend_fqdn" {
  description = "Fully-qualified domain name of the frontend (e.g. example.com)"
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

# ── SNS topic ───────────────────────────────────────────────────────────────

resource "aws_sns_topic" "uptime_alerts" {
  name = "${var.service_name}-uptime-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.uptime_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_sns_topic_subscription" "slack" {
  topic_arn = aws_sns_topic.uptime_alerts.arn
  protocol  = "https"
  endpoint  = var.slack_webhook_url
}

# ── Route 53 health checks ──────────────────────────────────────────────────
# Route 53 health checkers are distributed globally; AWS uses 15+ regions by
# default. A check is considered failed when the majority of checkers fail,
# giving inherent multi-region coverage without extra configuration.

resource "aws_route53_health_check" "backend" {
  fqdn              = var.backend_fqdn
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  request_interval  = 10   # 10 s → failure detected within ~30 s; alarms fire within 3 min
  failure_threshold = 3    # 3 consecutive failures before marked unhealthy
  measure_latency   = true

  tags = { Name = "${var.service_name}-backend-health" }
}

resource "aws_route53_health_check" "frontend" {
  fqdn              = var.frontend_fqdn
  port              = 443
  type              = "HTTPS"
  resource_path     = "/"
  request_interval  = 10
  failure_threshold = 3
  measure_latency   = true

  tags = { Name = "${var.service_name}-frontend-health" }
}

# ── CloudWatch alarms ───────────────────────────────────────────────────────
# Route 53 health-check metrics live only in us-east-1.

# Downtime alarm — fires within 3 minutes (1 datapoint of 1-min metric)
resource "aws_cloudwatch_metric_alarm" "backend_down" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-backend-down"
  alarm_description   = "Backend /health is unreachable"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.backend.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3   # 3 consecutive failing minutes → alert within 3 min
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.uptime_alerts.arn]
  ok_actions          = [aws_sns_topic.uptime_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "frontend_down" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-frontend-down"
  alarm_description   = "Frontend is unreachable"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.frontend.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.uptime_alerts.arn]
  ok_actions          = [aws_sns_topic.uptime_alerts.arn]
}

# Availability alarm — fires when availability drops below 99.5% in a 1-hour window.
# HealthCheckPercentageHealthy is the % of Route 53 checkers that see the endpoint as up.
resource "aws_cloudwatch_metric_alarm" "backend_availability" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-backend-availability-low"
  alarm_description   = "Backend availability below 99.5% over 1 hour"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckPercentageHealthy"
  dimensions          = { HealthCheckId = aws_route53_health_check.backend.id }
  statistic           = "Average"
  period              = 3600  # 1-hour window
  evaluation_periods  = 1
  threshold           = 99.5
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.uptime_alerts.arn]
  ok_actions          = [aws_sns_topic.uptime_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "frontend_availability" {
  provider            = aws.us_east_1
  alarm_name          = "${var.service_name}-frontend-availability-low"
  alarm_description   = "Frontend availability below 99.5% over 1 hour"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckPercentageHealthy"
  dimensions          = { HealthCheckId = aws_route53_health_check.frontend.id }
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 99.5
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.uptime_alerts.arn]
  ok_actions          = [aws_sns_topic.uptime_alerts.arn]
}

# ── Outputs ─────────────────────────────────────────────────────────────────

output "uptime_sns_topic_arn" {
  description = "SNS topic ARN for uptime alerts"
  value       = aws_sns_topic.uptime_alerts.arn
}

output "backend_health_check_id" {
  description = "Route 53 health check ID for the backend"
  value       = aws_route53_health_check.backend.id
}

output "frontend_health_check_id" {
  description = "Route 53 health check ID for the frontend"
  value       = aws_route53_health_check.frontend.id
}

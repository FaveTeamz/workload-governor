# cost.tf — AWS Budget alerts and Cost Explorer configuration
#
# Creates:
#   - Monthly cost budget with 80% and 100% alert thresholds
#   - SNS topic for cost alert notifications (email + Slack)
#
# Manual steps required after applying this file:
#   1. Subscribe an email address to the SNS topic (see docs/cost-management.md)
#   2. Activate cost allocation tags in the AWS Billing console
#   3. Create a Cost Explorer saved report filtered by Project=workload-governor
#      (see docs/cost-management.md — this step cannot be automated via Terraform)

# ── SNS topic for budget alerts ───────────────────────────────────────────────

resource "aws_sns_topic" "cost_alerts" {
  name = "${var.project}-cost-alerts"
}

# Allow AWS Budgets service to publish to this topic.
resource "aws_sns_topic_policy" "cost_alerts" {
  arn = aws_sns_topic.cost_alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBudgetsPublish"
        Effect = "Allow"
        Principal = {
          Service = "budgets.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.cost_alerts.arn
      }
    ]
  })
}

# Email subscription — set TF_VAR_budget_alert_email before applying.
# Leave the variable empty to skip the subscription (e.g. in CI environments).
resource "aws_sns_topic_subscription" "cost_alerts_email" {
  count     = var.budget_alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.cost_alerts.arn
  protocol  = "email"
  endpoint  = var.budget_alert_email
}

# Slack subscription via AWS Chatbot is configured outside Terraform
# (see docs/cost-management.md → "Slack integration" section).

# ── Monthly cost budget ───────────────────────────────────────────────────────

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_threshold
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Scope to resources tagged with the project — requires cost allocation tags
  # to be activated first (see docs/cost-management.md).
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$workload-governor"]
  }

  # Alert 1: 80% of monthly threshold (forecasted spend — warns before overage)
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_sns_topic_arns  = [aws_sns_topic.cost_alerts.arn]
  }

  # Alert 2: 100% of monthly threshold (actual spend — fires at breach)
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.cost_alerts.arn]
  }
}

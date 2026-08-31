# ──────────────────────────────────────────────────────────────────────────────
# AWS WAF v2 WebACL for the Application Load Balancer
#
# Rules (evaluated in priority order, lowest number first):
#
#   100 — AWSManagedRulesCommonRuleSet    (OWASP Top 10 core rules)
#   200 — AWSManagedRulesKnownBadInputsRuleSet (Log4Shell, host header injection, etc.)
#   300 — RateLimitTransactions           (100 req / 5 min per IP on /api/transactions/*)
#   400 — RateLimitGlobal                 (500 req / 5 min per IP on all other paths)
#
# Managed rules run in COUNT mode in staging so findings can be reviewed
# before enabling BLOCK mode in production.
# ──────────────────────────────────────────────────────────────────────────────

locals {
  # WAF is regional — must be in the same region as the ALB.
  waf_log_group_name = "/aws/waf/${local.name}"
}

# ── WAF WebACL ────────────────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "this" {
  name        = "${local.name}-webacl"
  description = "WAF WebACL for ${local.name} ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # ── Rule 100: AWS Managed Common Rule Set ──────────────────────────────────
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 100

    override_action {
      # Block in production; count in staging for tuning
      dynamic "none" {
        for_each = var.environment == "production" ? [1] : []
        content {}
      }
      dynamic "count" {
        for_each = var.environment != "production" ? [1] : []
        content {}
      }
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 200: AWS Managed Known Bad Inputs ─────────────────────────────────
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 200

    override_action {
      dynamic "none" {
        for_each = var.environment == "production" ? [1] : []
        content {}
      }
      dynamic "count" {
        for_each = var.environment != "production" ? [1] : []
        content {}
      }
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 300: Rate limit /api/transactions/* — 100 req / 5 min per IP ──────
  rule {
    name     = "RateLimitTransactions"
    priority = 300

    action {
      block {}
    }

    statement {
      rate_based_statement {
        # 100 requests per 5-minute window per originating IP
        limit              = 100
        aggregate_key_type = "IP"
        evaluation_window_sec = 300

        scope_down_statement {
          byte_match_statement {
            search_string = "/api/transactions/"
            field_to_match {
              uri_path {}
            }
            text_transformations {
              priority = 0
              type     = "LOWERCASE"
            }
            positional_constraint = "STARTS_WITH"
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-transactions"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 400: Global rate limit — 500 req / 5 min per IP ──────────────────
  rule {
    name     = "RateLimitGlobal"
    priority = 400

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = 500
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-global"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-webacl"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "${local.name}-webacl"
    environment = var.environment
  }
}

# ── Associate WebACL with the ALB ─────────────────────────────────────────────

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.this.arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}

# ── WAF logging to CloudWatch Logs ───────────────────────────────────────────
# Log group name MUST start with "aws-waf-logs-" per AWS requirement.

resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-${local.name}"
  retention_in_days = 90
}

resource "aws_cloudwatch_log_resource_policy" "waf" {
  policy_name = "${local.name}-waf-log-policy"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "delivery.logs.amazonaws.com"
      }
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = "${aws_cloudwatch_log_group.waf.arn}:*"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
        ArnLike = {
          "aws:SourceArn" = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
        }
      }
    }]
  })
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.this.arn

  # Redact Authorization headers from WAF logs — never log credentials
  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  depends_on = [aws_cloudwatch_log_resource_policy.waf]
}

# ── CloudWatch alarms for WAF block events ────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "waf_blocked_requests" {
  alarm_name          = "${local.name}-waf-blocked-requests"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 100
  alarm_description   = "More than 100 requests blocked by WAF in 5 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.this.name
    Region = data.aws_region.current.name
    Rule   = "ALL"
  }
}

data "aws_caller_identity" "current" {}

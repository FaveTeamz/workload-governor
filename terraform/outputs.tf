output "alb_dns_name" {
  description = "ALB DNS name for the current workspace"
  value       = module.compute.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.compute.ecs_cluster_name
}

output "rds_endpoint" {
  description = "RDS instance endpoint (host:port)"
  value       = module.database.endpoint
  sensitive   = true
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name for the frontend CDN"
  value       = module.cdn.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidation)"
  value       = module.cdn.cloudfront_distribution_id
}

output "frontend_s3_bucket" {
  description = "S3 bucket name for frontend static assets"
  value       = module.cdn.s3_bucket_name
}

output "cost_alerts_sns_topic_arn" {
  description = "SNS topic ARN for cost budget alerts. Subscribe an email or Slack webhook here."
  value       = aws_sns_topic.cost_alerts.arn
}

output "monthly_budget_name" {
  description = "Name of the AWS Budgets monthly cost budget"
  value       = aws_budgets_budget.monthly.name
}

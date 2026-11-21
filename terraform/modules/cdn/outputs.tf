output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "Default domain name of the CloudFront distribution (e.g. d1234abcd.cloudfront.net)."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket used for frontend assets."
  value       = aws_s3_bucket.frontend.bucket
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket."
  value       = aws_s3_bucket.frontend.arn
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF WebACL attached to the CloudFront distribution. Empty string when waf_enabled is false."
  value       = var.waf_enabled ? aws_wafv2_web_acl.frontend_waf[0].arn : ""
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF WebACL attached to the CloudFront distribution. Empty string when waf_enabled is false."
  value       = var.waf_enabled ? aws_wafv2_web_acl.frontend_waf[0].arn : ""
}

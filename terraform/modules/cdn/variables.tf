variable "project" {
  description = "Project name, used as a prefix for resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment (staging, production, etc.)."
  type        = string
}

variable "domain_aliases" {
  description = "List of custom domain aliases for the CloudFront distribution (e.g. [\"app.example.com\"]). Leave empty to use the default CloudFront domain."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate in us-east-1 for HTTPS on custom domains. Required when domain_aliases is non-empty. Leave empty to use the default CloudFront certificate."
  type        = string
  default     = ""
}

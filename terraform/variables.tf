variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name used in resource naming"
  type        = string
  default     = "workload-governor"
}

variable "image_repository" {
  description = "Container image repository (GHCR path)"
  type        = string
}

variable "image_tag" {
  description = "Container image tag (Git SHA)"
  type        = string
}

variable "frontend_domain_aliases" {
  description = "Optional custom domain aliases for the CloudFront distribution (e.g. [\"app.example.com\"])."
  type        = list(string)
  default     = []
}

variable "frontend_acm_certificate_arn" {
  description = "ARN of an ACM certificate in us-east-1 for HTTPS on custom frontend domains. Leave empty to use the default CloudFront certificate."
  type        = string
  default     = ""
}

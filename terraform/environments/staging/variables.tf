variable "aws_region" {
  description = "AWS region for all staging resources"
  type        = string
  default     = "us-east-1"
}

variable "image_repository" {
  description = "Container image repository (e.g. ghcr.io/FaveTeamz/workload-governor)"
  type        = string
}

variable "image_tag" {
  description = "Container image tag (Git SHA or semver)"
  type        = string
}

variable "acm_certificate_domain" {
  description = "Domain name of the ACM certificate to attach to the HTTPS ALB listener (e.g. staging.example.com)"
  type        = string
}

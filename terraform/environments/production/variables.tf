variable "aws_region" {
  description = "AWS region for all production resources"
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
  description = "Domain name of the ACM certificate to attach to the HTTPS ALB listener (e.g. app.example.com)"
  type        = string
}

variable "cpu" {
  description = "ECS task and container CPU units (e.g. 1024 for 1 vCPU)"
  type        = string
  default     = "1024"
}

variable "memory" {
  description = "ECS task and container memory allocation in MB (e.g. 2048 for 2 GB)"
  type        = string
  default     = "2048"
}

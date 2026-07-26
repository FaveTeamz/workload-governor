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

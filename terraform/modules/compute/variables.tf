variable "project"             { type = string }
variable "environment"         { type = string }
variable "vpc_id"              { type = string }
variable "public_subnet_ids"   { type = list(string) }
variable "private_subnet_ids"  { type = list(string) }
variable "image_repository"    { type = string }
variable "image_tag"           { type = string }
variable "database_url_secret" { type = string }
variable "redis_url_secret"    { type = string }
variable "github_token_secret" { type = string }
variable "jwt_secret_arn"      { type = string }
variable "cpu" {
  description = "ECS task and container CPU units (e.g. 512, 1024)"
  type        = string
  default     = null
}
variable "memory" {
  description = "ECS task and container memory allocation in MB (e.g. 1024, 2048)"
  type        = string
  default     = null
}

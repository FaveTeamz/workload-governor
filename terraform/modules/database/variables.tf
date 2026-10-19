variable "project"            { type = string }
variable "environment"        { type = string }
variable "vpc_id"             { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "db_secret_arn"      { type = string }
variable "kms_key_id" {
  description = "Customer-managed KMS key ARN/ID for RDS storage encryption"
  type        = string
  default     = null
}

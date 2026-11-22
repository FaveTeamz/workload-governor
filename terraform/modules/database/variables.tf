variable "project"            { type = string }
variable "environment"        { type = string }
variable "vpc_id"             { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "db_secret_arn"      { type = string }

variable "kms_key_arn" {
  description = "ARN of the Customer-Managed KMS key used to encrypt RDS storage and snapshots"
  type        = string
}

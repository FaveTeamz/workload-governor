output "rds_key_arn" {
  description = "ARN of the RDS Customer-Managed KMS key"
  value       = aws_kms_key.rds.arn
}

output "rds_key_id" {
  description = "ID of the RDS Customer-Managed KMS key"
  value       = aws_kms_key.rds.key_id
}

output "rds_alias_arn" {
  description = "ARN of the RDS KMS alias"
  value       = aws_kms_alias.rds.arn
}

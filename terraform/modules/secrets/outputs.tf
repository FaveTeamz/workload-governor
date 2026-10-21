output "db_password_arn"  { value = aws_secretsmanager_secret.db_password.arn }
output "github_token_arn" { value = aws_secretsmanager_secret.github_token.arn }
output "jwt_secret_arn"   { value = aws_secretsmanager_secret.jwt_secret.arn }

output "kms_rotation_status" {
  description = "KMS automated rotation status for all customer-managed keys"
  value = {
    db_password  = aws_kms_key.db_password.enable_key_rotation
    github_token = aws_kms_key.github_token.enable_key_rotation
    jwt_secret   = aws_kms_key.jwt_secret.enable_key_rotation
  }
}

output "kms_key_arns" {
  description = "ARNs of all customer-managed KMS keys in this module"
  value = {
    db_password  = aws_kms_key.db_password.arn
    github_token = aws_kms_key.github_token.arn
    jwt_secret   = aws_kms_key.jwt_secret.arn
  }
}

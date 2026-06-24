output "db_password_arn"  { value = aws_secretsmanager_secret.db_password.arn }
output "github_token_arn" { value = aws_secretsmanager_secret.github_token.arn }
output "jwt_secret_arn"   { value = aws_secretsmanager_secret.jwt_secret.arn }

Branch: feat/secrets-rotation

Purpose: Enable automatic rotation of the `DATABASE_URL` credentials via AWS Secrets Manager on a 30-day schedule, ensuring rotated credentials are usable by the application without downtime.

Changes in this branch:
- Add optional `aws_secretsmanager_secret_rotation` resource scaffold in `infra/secrets.tf`.
- Document requirements and steps to provision or reuse an RDS-compatible rotation Lambda.

Next steps / how to test:
1. Provision a rotation Lambda (use AWS-provided RDS rotation helper or a custom Lambda).
2. Supply the Lambda ARN to Terraform via `-var='db_rotation_lambda_arn=arn:aws:lambda:...'` and apply.
3. Verify rotation schedule is set to 30 days in the Secrets Manager console.
4. Test a manual rotation and confirm the application continues to authenticate (rotate in staging first).
Branch: feat/secrets-rotation

Purpose: Enable automatic rotation of the `DATABASE_URL` credentials via AWS Secrets Manager on a 30-day schedule, ensuring rotated credentials are usable by the application without downtime.

Changes in this branch:
- Add optional `aws_secretsmanager_secret_rotation` resource scaffold in `infra/secrets.tf`.
- Document requirements and steps to provision or reuse an RDS-compatible rotation Lambda.

Next steps / how to test:
1. Provision a rotation Lambda (use AWS-provided RDS rotation helper or a custom Lambda).
2. Supply the Lambda ARN to Terraform via `-var='db_rotation_lambda_arn=arn:aws:lambda:...'` and apply.
3. Verify rotation schedule is set to 30 days in the Secrets Manager console.
4. Test a manual rotation and confirm the application continues to authenticate (rotate in staging first).

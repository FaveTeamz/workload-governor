Branch: feat/secrets-manager

Purpose: Move application secrets out of environment variables and into AWS Secrets Manager; expose ARNs for use by ECS and CI and remove plaintext secrets from workflows.

Changes in this branch:
- Add `aws_secretsmanager_secret` resources for `DATABASE_URL`, `REDIS_URL`, `GITHUB_TOKEN`, and `JWT_SECRET` in `infra/secrets.tf`.
- Add Terraform outputs with secret ARNs for wiring into ECS task definitions.
- Remove plaintext secrets from CI workflows; CI sets test env values at runtime.

Next steps / how to test:
1. Run `terraform plan` and apply with `-var='service_name=your-service'`.
2. Populate the created secrets in Secrets Manager with initial values (use `aws secretsmanager put-secret-value`).
3. Update ECS task definitions to reference the secret ARNs (see `ecs_task_secrets_example.tf`).
4. Confirm ECS tasks can retrieve secrets (check task role permissions) and the application starts normally.
Branch: feat/secrets-manager

Purpose: Move application secrets out of environment variables and into AWS Secrets Manager; expose ARNs for use by ECS and CI and remove plaintext secrets from workflows.

Changes in this branch:
- Add `aws_secretsmanager_secret` resources for `DATABASE_URL`, `REDIS_URL`, `GITHUB_TOKEN`, and `JWT_SECRET` in `infra/secrets.tf`.
- Add Terraform outputs with secret ARNs for wiring into ECS task definitions.
- Remove plaintext secrets from CI workflows; CI sets test env values at runtime.

Next steps / how to test:
1. Run `terraform plan` and apply with `-var='service_name=your-service'`.
2. Populate the created secrets in Secrets Manager with initial values (use `aws secretsmanager put-secret-value`).
3. Update ECS task definitions to reference the secret ARNs (see `ecs_task_secrets_example.tf`).
4. Confirm ECS tasks can retrieve secrets (check task role permissions) and the application starts normally.
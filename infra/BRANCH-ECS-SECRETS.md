Branch: feat/ecs-task-secrets

Purpose: Update ECS task definitions to inject secrets from AWS Secrets Manager and enable `awslogs` so container logs are shipped to CloudWatch.

Changes in this branch:
- Add example task definition using `secrets` (Secrets Manager ARN via `valueFrom`).
- Configure `logConfiguration` to use `awslogs` with a stream prefix.

Next steps / how to test:
1. Review `infra/ecs_task_secrets_example.tf` and adapt to your real task family and container name.
2. Ensure the ECS task execution/role has `secretsmanager:GetSecretValue` and `logs:CreateLogStream/PutLogEvents` permissions.
3. Deploy the updated task; confirm env vars are injected and logs appear in CloudWatch.
Branch: feat/ecs-task-secrets

Purpose: Update ECS task definitions to inject secrets from AWS Secrets Manager and enable `awslogs` so container logs are shipped to CloudWatch.

Changes in this branch:
- Add example task definition using `secrets` (Secrets Manager ARN via `valueFrom`).
- Configure `logConfiguration` to use `awslogs` with a stream prefix.

Next steps / how to test:
1. Review `infra/ecs_task_secrets_example.tf` and adapt to your real task family and container name.
2. Ensure the ECS task execution/role has `secretsmanager:GetSecretValue` and `logs:CreateLogStream/PutLogEvents` permissions.
3. Deploy the updated task; confirm env vars are injected and logs appear in CloudWatch.

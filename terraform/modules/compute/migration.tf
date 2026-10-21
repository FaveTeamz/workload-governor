# ──────────────────────────────────────────────────────────────────────────────
# Migration runner ECS task definition
#
# This one-shot Fargate task runs `npx prisma migrate deploy` (or the project's
# equivalent migration command) before the main service is updated.
#
# It shares the same:
#   - IAM execution role  (aws_iam_role.task_exec)
#   - VPC / private subnets (var.private_subnet_ids)
#   - ECS cluster          (aws_ecs_cluster.this)
#   - Secrets references   (DATABASE_URL from Secrets Manager)
#
# The task is NOT registered as a service — it is run as a standalone ECS task
# from the GitHub Actions deployment workflow via `aws ecs run-task`.
# ──────────────────────────────────────────────────────────────────────────────

# Security group for the migration runner — allow outbound only (needs DB + internet for npm)
resource "aws_security_group" "migration" {
  name        = "${local.name}-migration"
  description = "Migration runner: outbound-only access to RDS and internet"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-migration" }
}

resource "aws_cloudwatch_log_group" "migration" {
  name              = "/ecs/${local.name}-migration"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name}-migration"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.task_exec.arn

  container_definitions = jsonencode([{
    name    = "migration"
    image   = "${var.image_repository}:${var.image_tag}"
    command = ["npx", "prisma", "migrate", "deploy"]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.migration.name
        awslogs-region        = data.aws_region.current.name
        awslogs-stream-prefix = "migration"
      }
    }

    secrets = [
      { name = "DATABASE_URL", valueFrom = var.database_url_secret }
    ]

    environment = [
      { name = "NODE_ENV", value = var.environment }
    ]
  }])
}

# SSM parameter so the deployment workflow can look up the task definition ARN
# without hard-coding it.
resource "aws_ssm_parameter" "migration_task_def_arn" {
  name        = "/${var.project}/${var.environment}/migration-task-def-arn"
  type        = "String"
  value       = aws_ecs_task_definition.migration.arn
  description = "Migration runner ECS task definition ARN for ${var.environment}"

  tags = { environment = var.environment }
}

resource "aws_ssm_parameter" "migration_subnet" {
  name        = "/${var.project}/${var.environment}/migration-subnet-id"
  type        = "String"
  value       = var.private_subnet_ids[0]
  description = "Subnet ID for the migration runner task"

  tags = { environment = var.environment }
}

resource "aws_ssm_parameter" "migration_security_group" {
  name        = "/${var.project}/${var.environment}/migration-sg-id"
  type        = "String"
  value       = aws_security_group.migration.id
  description = "Security group ID for the migration runner task"

  tags = { environment = var.environment }
}

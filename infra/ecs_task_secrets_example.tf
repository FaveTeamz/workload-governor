/*
  Example: inject Secrets Manager secrets into an ECS task definition (Terraform).

  This shows how to reference secrets created above. Replace the task/container definitions
  with your real values. The `value_from` should be the secret ARN or the specific secret
  version staging (usually "AWSCURRENT").
*/

variable "task_family" {
  type = string
}

variable "container_name" {
  type = string
}

variable "region" {
  type = string
}

variable "secrets_arn_map" {
  type = map(string)
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.task_family
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"

  container_definitions = jsonencode([
    {
      name  = var.container_name
      image = "REPLACE_WITH_IMAGE"
      portMappings = [ { containerPort = 3000 } ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${var.task_family}"
          awslogs-region        = "${var.region}"
          awslogs-stream-prefix = "${var.container_name}"
        }
      }
      secrets = [
        for k, v in var.secrets_arn_map : {
          name      = k
          valueFrom = v
        }
      ]
    }
  ])
}

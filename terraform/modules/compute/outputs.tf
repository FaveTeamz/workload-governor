output "alb_dns_name"          { value = aws_lb.this.dns_name }
output "alb_arn"              { value = aws_lb.this.arn }
output "alb_target_group_arn" { value = aws_lb_target_group.this.arn }
output "alb_http_listener_arn" { value = aws_lb_listener.http.arn }
output "ecs_cluster_name"     { value = aws_ecs_cluster.this.name }
output "ecs_service_name"     { value = aws_ecs_service.this.name }

# Migration runner
output "migration_task_def_arn" {
  description = "ARN of the migration ECS task definition"
  value       = aws_ecs_task_definition.migration.arn
}
output "migration_security_group_id" {
  description = "Security group ID for the migration runner task"
  value       = aws_security_group.migration.id
}

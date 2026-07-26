output "alb_dns_name" {
  description = "ALB DNS name for the current workspace"
  value       = module.compute.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.compute.ecs_cluster_name
}

output "rds_endpoint" {
  description = "RDS instance endpoint (host:port)"
  value       = module.database.endpoint
  sensitive   = true
}

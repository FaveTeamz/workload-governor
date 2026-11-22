output "alb_dns_name" {
  description = "DNS name of the staging ALB — use this as your staging base URL"
  value       = module.compute.alb_dns_name
}

output "ecs_cluster_name" {
  description = "Name of the staging ECS cluster"
  value       = module.compute.ecs_cluster_name
}

output "rds_endpoint" {
  description = "Staging RDS PostgreSQL endpoint (host:port)"
  value       = module.database.endpoint
  sensitive   = true
}

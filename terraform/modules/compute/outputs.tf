output "alb_dns_name"          { value = aws_lb.this.dns_name }
output "alb_arn"              { value = aws_lb.this.arn }
output "alb_target_group_arn" { value = aws_lb_target_group.this.arn }
output "alb_http_listener_arn" { value = aws_lb_listener.http.arn }
output "ecs_cluster_name"     { value = aws_ecs_cluster.this.name }
output "ecs_service_name"     { value = aws_ecs_service.this.name }

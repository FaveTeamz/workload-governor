# ALB target group health check — ensures new ECS tasks pass before receiving traffic.
# Merge these settings into your existing aws_lb_target_group resource.
#
# health_check {
#   path                = "/health"
#   healthy_threshold   = 2
#   unhealthy_threshold = 3
#   interval            = 15
#   timeout             = 5
#   matcher             = "200"
# }
#
# deregistration_delay = 30  # drain in-flight requests before deregistering

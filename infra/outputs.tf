output "ecs_log_group_name" {
  value = aws_cloudwatch_log_group.ecs.name
}

output "rds_log_group_name" {
  value = length(aws_cloudwatch_log_group.rds) > 0 ? aws_cloudwatch_log_group.rds[0].name : ""
}

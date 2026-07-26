# RDS automated backups: 7-day retention + point-in-time recovery
# Merge these settings into your existing aws_db_instance resource.
#
# backup_retention_period = 7           # 7-day automated backup window
# backup_window           = "03:00-04:00"
# maintenance_window      = "Mon:04:00-Mon:05:00"
# deletion_protection     = true
# copy_tags_to_snapshot   = true
# enabled_cloudwatch_logs_exports = ["postgresql"]

variable "db_instance_id" {
  description = "RDS instance identifier"
  type        = string
}

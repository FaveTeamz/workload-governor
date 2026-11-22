# ──────────────────────────────────────────────────────────────────────────────
# RDS backup configuration
#
# Merge these arguments into your existing aws_db_instance resource, or use
# this standalone resource definition as a reference. The settings below enable:
#   • 7-day automated backup window with point-in-time recovery
#   • Deletion protection (prevents accidental drops in production)
#   • CloudWatch Logs export for PostgreSQL slow-query and error logs
# ──────────────────────────────────────────────────────────────────────────────

variable "db_instance_id" {
  description = "RDS instance identifier"
  type        = string
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "workload_governor"
}

variable "db_username" {
  description = "Master DB username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Master DB password"
  type        = string
  sensitive   = true
}

variable "db_subnet_group_name" {
  description = "DB subnet group name"
  type        = string
}

variable "db_vpc_security_group_ids" {
  description = "List of VPC security group IDs"
  type        = list(string)
}

# ── RDS instance with backup and recovery settings ────────────────────────────

resource "aws_db_instance" "main" {
  identifier     = var.db_instance_id
  engine         = "postgres"
  engine_version = var.db_engine_version

  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = var.db_vpc_security_group_ids

  # ── Backup & PITR ─────────────────────────────────────────────────────────
  backup_retention_period = 7                     # 7-day automated backup window
  backup_window           = "03:00-04:00"         # UTC — off-peak for most regions
  maintenance_window      = "Mon:04:00-Mon:05:00" # After backup window

  # ── Safety ────────────────────────────────────────────────────────────────
  deletion_protection      = true  # Prevents accidental delete via Terraform/console
  copy_tags_to_snapshot    = true  # Snapshots inherit instance tags for cost attribution
  skip_final_snapshot      = false # Always create a final snapshot on destroy
  final_snapshot_identifier = "${var.db_instance_id}-final-snapshot"

  # ── Observability ─────────────────────────────────────────────────────────
  enabled_cloudwatch_logs_exports = ["postgresql"]
  monitoring_interval             = 60  # Enhanced monitoring — 60s granularity
  performance_insights_enabled    = true
  performance_insights_retention_period = 7  # days (free tier)

  # ── Misc ──────────────────────────────────────────────────────────────────
  auto_minor_version_upgrade = true
  publicly_accessible        = false
  multi_az                   = false  # Set to true for production HA

  tags = {
    Name    = var.db_instance_id
    Managed = "terraform"
  }
}

output "db_instance_id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.id
}

output "db_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

locals {
  name = "${var.project}-${var.environment}"
}

resource "aws_db_subnet_group" "this" {
  name       = "${local.name}-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "rds" {
  name   = "${local.name}-rds"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "this" {
  identifier             = local.name
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = var.environment == "production" ? "db.t3.small" : "db.t3.micro"
  allocated_storage      = var.environment == "production" ? 50 : 20
  db_name                = "app"
  username               = "app"
  manage_master_user_password = true
  master_user_secret_kms_key_id = var.db_secret_arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"
  deletion_protection    = var.environment == "production"
  storage_encrypted      = true

  tags = { Name = local.name }
}

resource "aws_secretsmanager_secret" "db_url" {
  name = "${local.name}-db-url"
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://app@${aws_db_instance.this.endpoint}/app"
}

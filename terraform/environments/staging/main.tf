# ---------------------------------------------------------------------------
# Staging environment — mirrors production configuration at reduced sizing.
# All secrets are injected from AWS Secrets Manager; nothing is hardcoded.
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  # Staging state is isolated from other environments
  backend "s3" {
    bucket         = "workload-governor-tfstate"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "workload-governor-tflock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      project     = local.project
      environment = local.environment
      managed_by  = "terraform"
    }
  }
}

# Route 53 health-check metrics are only available in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      project     = local.project
      environment = local.environment
      managed_by  = "terraform"
    }
  }
}

locals {
  environment = "staging"
  project     = "workload-governor"
  name        = "${local.project}-${local.environment}"
}

# ── Networking ──────────────────────────────────────────────────────────────

module "networking" {
  source      = "../../modules/networking"
  environment = local.environment
  project     = local.project
}

# ── Secrets (created first; other modules reference their ARNs) ─────────────

module "secrets" {
  source      = "../../modules/secrets"
  environment = local.environment
  project     = local.project
}

# ── Database — db.t3.micro, 7-day automated backups ─────────────────────────

module "database" {
  source             = "../../modules/database"
  environment        = local.environment
  project            = local.project
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  db_secret_arn      = module.secrets.db_password_arn
}

# ── Cache — cache.t3.micro ───────────────────────────────────────────────────

module "cache" {
  source             = "../../modules/cache"
  environment        = local.environment
  project            = local.project
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
}

# ── Compute — 0.5 vCPU / 1 GB RAM Fargate task ──────────────────────────────
# All environment variables are pulled from Secrets Manager at task start;
# no secret values appear in Terraform state or task definitions.

module "compute" {
  source              = "../../modules/compute"
  environment         = local.environment
  project             = local.project
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  private_subnet_ids  = module.networking.private_subnet_ids
  image_repository    = var.image_repository
  image_tag           = var.image_tag
  database_url_secret = module.database.connection_url_secret_arn
  redis_url_secret    = module.cache.connection_url_secret_arn
  github_token_secret = module.secrets.github_token_arn
  jwt_secret_arn      = module.secrets.jwt_secret_arn
}

# ── HTTPS listener (ALB → ECS) with ACM certificate ─────────────────────────

# Look up the ACM certificate by domain name. The cert must already be issued
# in ACM before applying this configuration.
data "aws_acm_certificate" "staging" {
  domain      = var.acm_certificate_domain
  statuses    = ["ISSUED"]
  most_recent = true
}

# HTTPS/443 listener — forwards to the same target group as the HTTP listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = module.compute.alb_arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = data.aws_acm_certificate.staging.arn

  default_action {
    type             = "forward"
    target_group_arn = module.compute.alb_target_group_arn
  }
}

# Override the HTTP listener's default action to redirect to HTTPS.
# We replace the forwarding rule on the existing HTTP listener with a 301 redirect.
resource "aws_lb_listener_rule" "http_to_https_redirect" {
  listener_arn = module.compute.alb_http_listener_arn
  priority     = 1

  action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  condition {
    path_pattern { values = ["/*"] }
  }
}

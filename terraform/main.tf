terraform {
  required_version = ">= 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  backend "s3" {
    bucket         = "workload-governor-tfstate"
    key            = "workload-governor/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "workload-governor-tflock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      project     = "workload-governor"
      environment = terraform.workspace
      managed_by  = "terraform"
    }
  }
}

module "networking" {
  source      = "./modules/networking"
  environment = terraform.workspace
  project     = var.project
}

module "database" {
  source             = "./modules/database"
  environment        = terraform.workspace
  project            = var.project
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  db_secret_arn      = module.secrets.db_password_arn
}

module "cache" {
  source             = "./modules/cache"
  environment        = terraform.workspace
  project            = var.project
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
}

module "compute" {
  source              = "./modules/compute"
  environment         = terraform.workspace
  project             = var.project
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  private_subnet_ids  = module.networking.private_subnet_ids
  image_tag           = var.image_tag
  image_repository    = var.image_repository
  database_url_secret = module.database.connection_url_secret_arn
  redis_url_secret    = module.cache.connection_url_secret_arn
  github_token_secret = module.secrets.github_token_arn
  jwt_secret_arn      = module.secrets.jwt_secret_arn
}

module "secrets" {
  source      = "./modules/secrets"
  environment = terraform.workspace
  project     = var.project
}

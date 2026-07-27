# Staging environment Terraform backend configuration.
# Usage:
#   terraform init -backend-config=terraform/backend-staging.hcl
#   terraform workspace select staging || terraform workspace new staging

bucket         = "workload-governor-tfstate"
key            = "staging/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "workload-governor-tfstate-lock"
encrypt        = true

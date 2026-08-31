# Production environment Terraform backend configuration.
# Usage:
#   terraform init -backend-config=terraform/backend-production.hcl
#   terraform workspace select production || terraform workspace new production

bucket         = "workload-governor-tfstate"
key            = "production/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "workload-governor-tfstate-lock"
encrypt        = true

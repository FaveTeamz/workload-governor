# Terraform environment management
# Usage:
#   make tf-plan ENV=staging
#   make tf-apply ENV=staging
#   make tf-plan ENV=production
#   make tf-apply ENV=production   ← requires APPROVE=yes for safety
#
# Prerequisites:
#   - AWS credentials configured in environment or via IAM role
#   - terraform >= 1.8 installed
#   - Backend S3 bucket bootstrapped (run terraform/bootstrap.sh once)

ENV        ?= staging
APPROVE    ?= no
TF_DIR     := terraform/environments/$(ENV)
BACKEND_HCL := terraform/backend-$(ENV).hcl

.PHONY: tf-init tf-plan tf-apply tf-destroy tf-fmt tf-validate

## tf-init: Initialise Terraform for the given ENV (e.g. make tf-init ENV=staging)
tf-init:
	@echo "==> Initialising Terraform for environment: $(ENV)"
	terraform -chdir=$(TF_DIR) init -backend-config=../../backend-$(ENV).hcl -reconfigure

## tf-validate: Validate Terraform configuration for ENV
tf-validate: tf-init
	@echo "==> Validating Terraform for environment: $(ENV)"
	terraform -chdir=$(TF_DIR) validate

## tf-fmt: Format all Terraform files
tf-fmt:
	terraform fmt -recursive terraform/

## tf-plan: Generate and show an execution plan for ENV
tf-plan: tf-init
	@echo "==> Planning Terraform for environment: $(ENV)"
	terraform -chdir=$(TF_DIR) plan -out=$(ENV).tfplan

## tf-apply: Apply the plan for ENV.
##   Staging:    runs automatically.
##   Production: requires APPROVE=yes to prevent accidental applies.
##     make tf-apply ENV=production APPROVE=yes
tf-apply: tf-init
ifeq ($(ENV),production)
ifneq ($(APPROVE),yes)
	@echo ""
	@echo "ERROR: Production applies require explicit approval."
	@echo "       Re-run with:  make tf-apply ENV=production APPROVE=yes"
	@echo ""
	@exit 1
endif
	@echo "==> Applying Terraform for PRODUCTION (approved)"
else
	@echo "==> Applying Terraform for environment: $(ENV)"
endif
	terraform -chdir=$(TF_DIR) apply $(ENV).tfplan

## tf-destroy: Destroy resources for ENV (requires APPROVE=yes for production)
tf-destroy: tf-init
ifeq ($(ENV),production)
ifneq ($(APPROVE),yes)
	@echo ""
	@echo "ERROR: Production destroys require explicit approval."
	@echo "       Re-run with:  make tf-destroy ENV=production APPROVE=yes"
	@echo ""
	@exit 1
endif
endif
	@echo "==> Destroying Terraform resources for environment: $(ENV)"
	terraform -chdir=$(TF_DIR) destroy -auto-approve

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/^## //'

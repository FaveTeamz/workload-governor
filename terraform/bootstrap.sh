#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh — Create Terraform remote-state infrastructure
# =============================================================================
# Run this script ONCE before the first `terraform init`.
# It is fully idempotent: re-running it on an already-provisioned environment
# is safe and produces no unwanted side-effects.
#
# What it creates:
#   • S3 bucket     workload-governor-tfstate
#       - versioning enabled
#       - all public access blocked
#       - AES-256 server-side encryption (or KMS if KMS_KEY_ARN is set)
#   • DynamoDB table workload-governor-tfstate-lock
#       - LockID (String) primary key
#       - PAY_PER_REQUEST billing (no capacity planning required)
#
# Optional environment variables:
#   AWS_REGION   — target region (default: us-east-1)
#   KMS_KEY_ARN  — if set, use this customer-managed KMS key for S3 encryption
#
# Usage:
#   chmod +x terraform/bootstrap.sh
#   ./terraform/bootstrap.sh
#   # With custom region and KMS key:
#   AWS_REGION=eu-west-1 KMS_KEY_ARN=arn:aws:kms:... ./terraform/bootstrap.sh
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
BUCKET="workload-governor-tfstate"
LOCK_TABLE="workload-governor-tfstate-lock"
PROJECT="workload-governor"

echo "==> Bootstrapping Terraform remote state"
echo "    Region : $REGION"
echo "    Bucket : $BUCKET"
echo "    Table  : $LOCK_TABLE"
echo ""

# ---------------------------------------------------------------------------
# Helper: check if S3 bucket exists
# ---------------------------------------------------------------------------
bucket_exists() {
  aws s3api head-bucket --bucket "$1" --region "$REGION" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Helper: check if DynamoDB table exists
# ---------------------------------------------------------------------------
table_exists() {
  aws dynamodb describe-table \
    --table-name "$1" \
    --region "$REGION" \
    --query "Table.TableStatus" \
    --output text 2>/dev/null | grep -qE "^(ACTIVE|CREATING|UPDATING)$"
}

# ---------------------------------------------------------------------------
# Step 1 — Create S3 bucket (idempotent)
# ---------------------------------------------------------------------------
if bucket_exists "$BUCKET"; then
  echo "[SKIP] S3 bucket '$BUCKET' already exists"
else
  echo "[CREATE] S3 bucket '$BUCKET' in region '$REGION'"
  if [ "$REGION" = "us-east-1" ]; then
    # us-east-1 does NOT accept a LocationConstraint — omit the flag
    aws s3api create-bucket \
      --bucket "$BUCKET" \
      --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
fi

# ---------------------------------------------------------------------------
# Step 2 — Enable versioning (idempotent)
# ---------------------------------------------------------------------------
echo "[CONFIG] Enabling versioning on '$BUCKET'"
aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled \
  --region "$REGION"

# ---------------------------------------------------------------------------
# Step 3 — Block all public access (idempotent)
# ---------------------------------------------------------------------------
echo "[CONFIG] Blocking public access on '$BUCKET'"
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region "$REGION"

# ---------------------------------------------------------------------------
# Step 4 — Enable server-side encryption (idempotent)
#           Use customer-managed KMS key when KMS_KEY_ARN is provided,
#           otherwise fall back to SSE-S3 (AES-256).
# ---------------------------------------------------------------------------
if [ -n "${KMS_KEY_ARN:-}" ]; then
  echo "[CONFIG] Enabling KMS encryption on '$BUCKET' with key $KMS_KEY_ARN"
  aws s3api put-bucket-encryption \
    --bucket "$BUCKET" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms",
          "KMSMasterKeyID": "'"$KMS_KEY_ARN"'"
        },
        "BucketKeyEnabled": true
      }]
    }' \
    --region "$REGION"
else
  echo "[CONFIG] Enabling AES-256 SSE on '$BUCKET' (no KMS_KEY_ARN provided)"
  aws s3api put-bucket-encryption \
    --bucket "$BUCKET" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }]
    }' \
    --region "$REGION"
fi

# ---------------------------------------------------------------------------
# Step 5 — Tag the bucket
# ---------------------------------------------------------------------------
echo "[CONFIG] Tagging bucket '$BUCKET'"
aws s3api put-bucket-tagging \
  --bucket "$BUCKET" \
  --tagging "TagSet=[{Key=project,Value=$PROJECT},{Key=managed-by,Value=terraform},{Key=purpose,Value=terraform-state}]" \
  --region "$REGION"

# ---------------------------------------------------------------------------
# Step 6 — Create DynamoDB table for state locking (idempotent)
# ---------------------------------------------------------------------------
if table_exists "$LOCK_TABLE"; then
  echo "[SKIP] DynamoDB table '$LOCK_TABLE' already exists"
else
  echo "[CREATE] DynamoDB table '$LOCK_TABLE' in region '$REGION'"
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    --tags \
      Key=project,Value="$PROJECT" \
      Key=managed-by,Value=terraform \
      Key=purpose,Value=terraform-state-lock

  echo "[WAIT] Waiting for DynamoDB table '$LOCK_TABLE' to become ACTIVE..."
  aws dynamodb wait table-exists \
    --table-name "$LOCK_TABLE" \
    --region "$REGION"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "==> Bootstrap complete."
echo ""
echo "Next steps:"
echo "  # Staging"
echo "  terraform init -backend-config=terraform/backend-staging.hcl"
echo ""
echo "  # Production"
echo "  terraform init -backend-config=terraform/backend-production.hcl"
echo ""
echo "  # (Optional) KMS-encrypted state:"
echo "  KMS_KEY_ARN=arn:aws:kms:$REGION:ACCOUNT_ID:key/KEY_ID \\"
echo "    terraform init -backend-config=terraform/backend-staging.hcl \\"
echo "    -backend-config=\"kms_key_id=\$KMS_KEY_ARN\""

#!/usr/bin/env bash
# scripts/pre-commit.sh
# Automated local pre-commit hook running lint, formatting, and OpenAPI sync validation.

set -euo pipefail

echo "🔍 Running pre-commit validation checks..."

# 1. Root and TypeScript lint
echo "▶ Running ESLint..."
npm run lint

# 2. Type checking
echo "▶ Running TypeScript typecheck..."
npm run typecheck

# 3. API documentation sync validation
echo "▶ Verifying API documentation sync with openapi.yaml..."
node scripts/check-api-docs-sync.js --strict

# 4. CHANGELOG formatting lint
echo "▶ Validating CHANGELOG.md formatting..."
node scripts/lint-changelog.js

echo "✅ All pre-commit checks passed successfully!"

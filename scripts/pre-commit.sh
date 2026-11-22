#!/usr/bin/env bash
# scripts/pre-commit.sh
# Automated local pre-commit hook running lint, formatting, and OpenAPI sync validation.

set -euo pipefail

echo "🔍 Running pre-commit validation checks..."

# Identify staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM || true)

if [ -z "$STAGED_FILES" ]; then
  echo "ℹ️ No staged files detected. Skipping pre-commit checks."
  exit 0
fi

# 1. Rust files check: cargo fmt -- --check
RUST_FILES=$(echo "$STAGED_FILES" | grep -E '\.rs$' || true)
if [ -n "$RUST_FILES" ]; then
  echo "▶ Checking Rust code formatting (cargo fmt)..."
  if command -v cargo >/dev/null 2>&1; then
    cargo fmt -- --check || {
      echo "❌ Rust formatting errors found. Run 'cargo fmt' to format."
      exit 1
    }
  else
    echo "⚠️ cargo not found in PATH, skipping cargo fmt check."
  fi
fi

# 2. TypeScript / JavaScript lint
TS_JS_FILES=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx|js|jsx)$' || true)
if [ -n "$TS_JS_FILES" ]; then
  echo "▶ Checking TypeScript / JavaScript code with ESLint..."
  if [ -x "./node_modules/.bin/eslint" ] || [ -f "./node_modules/eslint/bin/eslint.js" ] || command -v eslint >/dev/null 2>&1; then
    npm run lint || {
      echo "❌ ESLint failed. Fix lint issues or run 'npm run lint' before committing."
      exit 1
    }
  else
    echo "⚠️ ESLint binary not installed locally, skipping ESLint execution."
  fi
fi

# 3. CHANGELOG formatting lint if source or contract files changed
SRC_FILES=$(echo "$STAGED_FILES" | grep -E '^(src/|backend/src/|contracts/)' || true)
if [ -n "$SRC_FILES" ]; then
  if [ -f "scripts/lint-changelog.js" ]; then
    echo "▶ Validating CHANGELOG.md formatting..."
    node scripts/lint-changelog.js || {
      echo "❌ CHANGELOG validation failed."
      exit 1
    }
  fi
fi

# 4. API documentation sync validation if openapi or api-reference changed
DOCS_SYNC_FILES=$(echo "$STAGED_FILES" | grep -E '^(openapi\.yaml|docs/api-reference\.md)' || true)
if [ -n "$DOCS_SYNC_FILES" ]; then
  if [ -f "scripts/check-api-docs-sync.js" ]; then
    echo "▶ Verifying API documentation sync with openapi.yaml..."
    node scripts/check-api-docs-sync.js --strict || {
      echo "❌ API docs sync validation failed."
      exit 1
    }
  fi
fi

echo "✅ All pre-commit checks passed successfully!"

# Makefile — WorkloadGovernor unified development & testing targets
#
# Standard developer commands for smart contract, backend, and frontend.
# Run 'make help' for a list of all documented targets.

.PHONY: all setup build build-wasm build-all test test-contract test-backend \
        test-frontend test-all lint-all dev fuzz-list fuzz-build fuzz-apply \
        fuzz-ci clean help

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

## Seconds to run the fuzzer locally (override with: make fuzz-apply FUZZ_SECS=120)
FUZZ_SECS ?= 60

## Seconds used in CI (nightly schedule)
FUZZ_CI_SECS ?= 600

## Fuzz target to run
FUZZ_TARGET ?= apply_for_issue

## Corpus directory for the active target
CORPUS_DIR := fuzz/corpus/$(FUZZ_TARGET)

## Artifacts directory
ARTIFACTS_DIR := fuzz/artifacts/$(FUZZ_TARGET)

# ---------------------------------------------------------------------------
# Default
# ---------------------------------------------------------------------------

all: build test ## Build and test contract (default)

# ---------------------------------------------------------------------------
# Setup & Installation
# ---------------------------------------------------------------------------

setup: ## Install backend, frontend, and rust toolchain dependencies
	@echo "==> Installing backend dependencies..."
	npm --prefix backend install
	@echo "==> Installing frontend dependencies..."
	npm --prefix frontend install
	@echo "==> Checking cargo toolchain..."
	cargo check --features testutils

# ---------------------------------------------------------------------------
# Build Targets
# ---------------------------------------------------------------------------

build: ## Compile contract natively (debug with testutils)
	cargo build --features testutils

build-wasm: ## Compile contract to wasm32v1-none (release)
	cargo build --target wasm32v1-none --release

build-all: build build-wasm ## Build contract, backend, and frontend
	@echo "==> Building backend..."
	npm --prefix backend run build
	@echo "==> Building frontend..."
	npm --prefix frontend run build

# ---------------------------------------------------------------------------
# Test Targets
# ---------------------------------------------------------------------------

test: ## Run contract tests with testutils
	cargo test --features testutils

test-contract: ## Run contract tests and verify storage key collision freedom
	cargo test --features testutils
	bash scripts/check-key-collisions.sh

test-backend: ## Run backend unit and integration tests
	npm --prefix backend test

test-frontend: ## Run frontend test suite
	npm --prefix frontend test

test-all: test-contract test-backend test-frontend ## Run all test suites across contract, backend, and frontend

# ---------------------------------------------------------------------------
# Lint Targets
# ---------------------------------------------------------------------------

lint-all: ## Run code formatters and linters across contract, backend, and frontend
	@echo "==> Linting contract..."
	cargo fmt --all -- --check
	cargo clippy --features testutils -- -D warnings
	@echo "==> Linting backend..."
	npm --prefix backend run lint
	@echo "==> Linting frontend..."
	npm --prefix frontend run lint

# ---------------------------------------------------------------------------
# Local Development
# ---------------------------------------------------------------------------

dev: ## Launch backend and frontend development servers concurrently
	@echo "==> Starting backend and frontend in dev mode..."
	npx concurrently -k -n "backend,frontend" -c "blue,green" \
		"npm --prefix backend run dev" \
		"npm --prefix frontend run dev"

# ---------------------------------------------------------------------------
# Fuzz Testing
# ---------------------------------------------------------------------------

fuzz-list: ## List all registered fuzz targets (requires cargo-fuzz on nightly)
	cargo +nightly fuzz list

fuzz-build: ## Build the fuzz harness (two-stage, memory-safe)
	@echo "==> Stage 1: pre-build deps without sancov (avoids OOM on stellar-xdr)"
	RUSTFLAGS="--cfg fuzzing" cargo +nightly build \
	    --manifest-path fuzz/Cargo.toml \
	    --target x86_64-unknown-linux-gnu \
	    --release \
	    --bin $(FUZZ_TARGET)
	@echo "==> Stage 2: build fuzz binary with sancov coverage"
	cargo +nightly fuzz build --sanitizer none $(FUZZ_TARGET) || \
	    echo "WARNING: sancov build failed (OOM?); using plain --cfg fuzzing binary from stage 1"

fuzz-apply: fuzz-build ## Fuzz apply_for_issue for FUZZ_SECS seconds
	mkdir -p $(ARTIFACTS_DIR)
	cargo +nightly fuzz run --sanitizer none $(FUZZ_TARGET) $(CORPUS_DIR) \
		-- -max_total_time=$(FUZZ_SECS) \
		   -print_final_stats=1 \
		   -artifact_prefix=$(ARTIFACTS_DIR)/ \
	|| target/x86_64-unknown-linux-gnu/release/$(FUZZ_TARGET) \
		   $(CORPUS_DIR) \
		   -max_total_time=$(FUZZ_SECS) \
		   -print_final_stats=1 \
		   -artifact_prefix=$(ARTIFACTS_DIR)/

fuzz-ci: ## Fuzz apply_for_issue for FUZZ_CI_SECS seconds (CI budget)
	mkdir -p $(ARTIFACTS_DIR)
	RUSTFLAGS="--cfg fuzzing" cargo +nightly build \
	    --manifest-path fuzz/Cargo.toml \
	    --target x86_64-unknown-linux-gnu \
	    --release \
	    --bin $(FUZZ_TARGET)
	target/x86_64-unknown-linux-gnu/release/$(FUZZ_TARGET) \
		$(CORPUS_DIR) \
		-max_total_time=$(FUZZ_CI_SECS) \
		-print_final_stats=1 \
		-artifact_prefix=$(ARTIFACTS_DIR)/

# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------

clean: ## Remove build artifacts and temporary files
	cargo clean
	rm -rf fuzz/artifacts/
	rm -rf backend/dist frontend/dist

# ---------------------------------------------------------------------------
# Dynamic Help
# ---------------------------------------------------------------------------

help: ## Show this help message
	@echo ""
	@echo "WorkloadGovernor Makefile Targets"
	@echo "================================="
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

#!/usr/bin/env bash
# .devcontainer/post-create.sh
# Runs once after the devcontainer is created.
# Safe to re-run manually: bash .devcontainer/post-create.sh

set -euo pipefail

export CARGO_HOME="${CARGO_HOME:-/usr/local/cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-/usr/local/rustup}"
export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
export PATH="/usr/local/cargo/bin:$HOME/.cargo/bin:/usr/local/share/nvm/current/bin:$PATH"

echo "==> [post-create] Setting up WorkloadGovernor dev environment…"

# ── Persist PATH for interactive & non-interactive shells ────────────────────
PROFILE_SNIPPET='export PATH="/usr/local/cargo/bin:$HOME/.cargo/bin:/usr/local/share/nvm/current/bin:$PATH"'
for rc_file in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc"; do
  if [ -f "$rc_file" ] && ! grep -Fq "/usr/local/share/nvm/current/bin" "$rc_file"; then
    echo "$PROFILE_SNIPPET" >> "$rc_file"
  fi
done

# ── Verify Node.js & Rust toolchains ─────────────────────────────────────────
echo "==> [post-create] Verifying Node.js and Rust toolchains in PATH…"
node --version
npm --version
rustc --version
cargo --version

# ── Rust toolchain ──────────────────────────────────────────────────────────
echo "==> [post-create] Adding wasm32-unknown-unknown and wasm32v1-none targets…"
rustup target add wasm32-unknown-unknown wasm32v1-none

# ── Root package (backend + contract tooling) ────────────────────────────────
echo "==> [post-create] Installing root npm dependencies…"
npm ci

# ── Frontend ─────────────────────────────────────────────────────────────────
if [ -f frontend/package.json ]; then
  echo "==> [post-create] Installing frontend npm dependencies…"
  (cd frontend && npm ci)
fi

# ── Environment files ─────────────────────────────────────────────────────────
if [ ! -f .env ] && [ -f .env.example ]; then
  echo "==> [post-create] Copying .env.example → .env"
  cp .env.example .env
fi

if [ ! -f backend/.env ] && [ -f backend/.env.example ]; then
  echo "==> [post-create] Copying backend/.env.example → backend/.env"
  cp backend/.env.example backend/.env
fi

if [ ! -f frontend/.env ] && [ -f frontend/.env.example ]; then
  echo "==> [post-create] Copying frontend/.env.example → frontend/.env"
  cp frontend/.env.example frontend/.env
fi

echo ""
echo "==> [post-create] Done! Next steps:"
echo "    1. docker compose up -d          (start Postgres + Redis)"
echo "    2. stellar contract build         (compile the WASM)"
echo "    3. npm run dev                    (start backend on :3000)"
echo "    4. cd frontend && npm run dev     (start frontend on :5173)"
echo ""
echo "    See docs/local-dev-guide.md for full instructions."

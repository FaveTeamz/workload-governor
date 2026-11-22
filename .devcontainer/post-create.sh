#!/usr/bin/env bash
# .devcontainer/post-create.sh
# Runs once after the devcontainer is created.
# Safe to re-run manually: bash .devcontainer/post-create.sh

set -euo pipefail

# Ensure Cargo and Node/npm are present in PATH for subshell execution
export CARGO_HOME="${CARGO_HOME:-/usr/local/cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-/usr/local/rustup}"
export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
export PATH="/usr/local/cargo/bin:/usr/local/share/nvm/current/bin:${HOME}/.cargo/bin:${PATH}"

if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "${NVM_DIR}/nvm.sh"
fi

# Ensure user shell configuration files retain standard PATH
for rc in "${HOME}/.bashrc" "${HOME}/.zshrc"; do
  if [ -f "${rc}" ] && ! grep -q "/usr/local/cargo/bin" "${rc}"; then
    echo 'export PATH="/usr/local/cargo/bin:/usr/local/share/nvm/current/bin:$PATH"' >> "${rc}"
  fi
done

echo "==> [post-create] Setting up WorkloadGovernor dev environment…"

# ── Rust toolchain ──────────────────────────────────────────────────────────
echo "==> [post-create] Adding wasm32v1-none target…"
rustup target add wasm32v1-none

# ── Root package (backend + contract tooling) ────────────────────────────────
echo "==> [post-create] Installing root npm dependencies…"
npm ci

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "==> [post-create] Installing frontend npm dependencies…"
cd frontend && npm ci && cd ..

# ── Environment files ─────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "==> [post-create] Copying .env.example → .env"
  cp .env.example .env
fi

if [ ! -f backend/.env ]; then
  echo "==> [post-create] Copying backend/.env.example → backend/.env"
  cp backend/.env.example backend/.env
fi

if [ ! -f frontend/.env ]; then
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

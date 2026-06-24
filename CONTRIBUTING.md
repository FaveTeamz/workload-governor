# Contributing to WorkloadGovernor

Thank you for helping improve WorkloadGovernor! This guide covers everything
you need to know to contribute effectively.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Commit Convention](#commit-convention)
4. [Changelog Requirements](#changelog-requirements)
5. [Versioning Convention (Semver)](#versioning-convention-semver)
6. [Release Process](#release-process)
7. [Code Style](#code-style)
8. [Testing](#testing)

---

## Getting Started

```bash
# 1. Fork the repository and clone your fork
git clone https://github.com/<your-username>/workload-governor.git
cd workload-governor

# 2. Add the upstream remote
git remote add upstream https://github.com/FaveTeamz/workload-governor.git

# 3. Install the Soroban toolchain
rustup target add wasm32v1-none
cargo install --locked stellar-cli

# 4. Verify everything builds and tests pass
cargo build --target wasm32v1-none --release
cargo test --features testutils
```

---

## Development Workflow

1. Sync your fork: `git fetch upstream && git rebase upstream/main`.
2. Create a feature branch: `git checkout -b feat/short-description`.
3. Make your changes — keep commits focused and atomic.
4. Update `CHANGELOG.md` under the `[Unreleased]` section (see below).
5. Open a pull request targeting `main`.

---

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer, e.g. Closes #42]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

---

## Changelog Requirements

**Every pull request to `main` must update `CHANGELOG.md`.**

- Add your entry under the `## [Unreleased]` heading.
- Use the appropriate sub-heading: `Added`, `Changed`, `Deprecated`,
  `Removed`, `Fixed`, or `Security`.
- Reference the issue number in parentheses, e.g. `(#42)`.
- A CI check (`changelog-check`) will fail the PR if `CHANGELOG.md`
  has not been modified.

Example entry:

```markdown
## [Unreleased]

### Fixed
- Correct saturating subtraction in `withdraw_application` (#55).
```

---

## Versioning Convention (Semver)

This project follows [Semantic Versioning 2.0.0](https://semver.org/).

```
MAJOR.MINOR.PATCH
```

| Component | Increment when… |
|-----------|-----------------|
| **MAJOR** | A breaking on-chain change: altered function signatures, changed error discriminants, storage key renames, or removal of a public function. |
| **MINOR** | New backward-compatible functionality: new public functions, new events, new optional parameters. |
| **PATCH** | Backward-compatible bug fixes, documentation updates, refactors with no observable behavior change. |

> **Important:** Because WorkloadGovernor is a Soroban smart contract, any change
> that alters the ABI (function names, parameter types, return types, error codes)
> is a **MAJOR** version bump — even if it seems minor from a traditional software
> perspective. Deployed contracts cannot change their address, so clients depend on
> strict ABI stability.

---

## Release Process

### 1. Prepare the release branch

```bash
git checkout main
git pull upstream main
git checkout -b release/vX.Y.Z
```

### 2. Update the changelog

Move all entries from `[Unreleased]` to a new versioned heading and update the
diff links at the bottom of `CHANGELOG.md`:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

[X.Y.Z]: https://github.com/FaveTeamz/workload-governor/compare/vPREV...vX.Y.Z
[Unreleased]: https://github.com/FaveTeamz/workload-governor/compare/vX.Y.Z...HEAD
```

### 3. Bump the version in Cargo.toml

```toml
[package]
version = "X.Y.Z"
```

Run `cargo build --target wasm32v1-none --release` to confirm the build still passes.

### 4. Open a PR and merge

Open a PR from `release/vX.Y.Z` → `main`. After review and CI passes, merge.

### 5. Tag the release

```bash
git checkout main
git pull upstream main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push upstream vX.Y.Z
```

### 6. Publish GitHub Release

- Go to **Releases → Draft a new release**.
- Select the tag `vX.Y.Z`.
- Copy the changelog section for this version into the release notes.
- Attach the optimised WASM artifact:
  ```bash
  stellar contract optimize \
    --wasm target/wasm32v1-none/release/workload_governor.wasm
  ```
  Attach `target/wasm32v1-none/release/workload_governor.optimized.wasm`.

---

## Code Style

- Run `cargo fmt` before committing.
- Run `cargo clippy --features testutils -- -D warnings` and fix all warnings.
- Every new `pub fn` must have a Rustdoc comment following the style in `src/lib.rs`
  (sections: summary, `# Who can call`, `# Arguments`, `# Returns`, `# Errors`,
  `# Examples` for user-facing functions).

---

## Testing

```bash
# All tests
cargo test --features testutils

# Property-based tests only
cargo test --features testutils prop_

# Unit tests only
cargo test --features testutils unit_

# Check docs build cleanly
cargo doc --no-deps
```

All PRs must pass CI. New functionality requires new tests.

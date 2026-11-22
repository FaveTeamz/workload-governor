# Developer Quickstart Video Script

**Target length:** 10 minutes  
**Audience:** Developers new to WorkloadGovernor and/or Soroban smart contracts  
**Prerequisites shown in video:** None — viewer starts from zero

---

## Companion Text Guide

This document doubles as a companion text guide. Every command shown on-screen
is reproduced here so viewers can copy-paste without pausing the video.

Jump directly to the text steps: [Text Guide](#text-guide)

---

## Video Script

### [0:00 – 2:00] Section 1 — Project Overview

**[SCREEN: slide with project logo and tagline]**

> "Welcome to WorkloadGovernor — a production-ready Soroban smart contract for the
> AlignmentDrips Wave platform on the Stellar network."

**[SCREEN: README.md purpose section]**

> "WorkloadGovernor solves a fairness problem in open-source contribution. When
> tasks are posted publicly, faster contributors can monopolise all the work,
> locking out everyone else."

> "The contract enforces two hard caps:"

**[SCREEN: bullet list animated in]**

> "First — a *global application cap* of 15. No contributor can hold more than
> 15 pending applications across all organisations at once."

> "Second — an *org assignment cap* of 4. No contributor can hold more than 4
> active assignments inside a single organisation."

> "These two numbers are deliberately conservative. The goal isn't to limit
> productive contributors — it's to ensure that a small group of fast movers
> cannot monopolise tasks during a time-bounded Wave."

**[SCREEN: contract function table from README]**

> "The contract exposes about 15 public functions. Today we'll focus on the
> core contributor workflow: apply, check status, and withdraw. We'll also
> look at how a maintainer assigns and completes work."

**[SCREEN: architecture diagram showing frontend → backend → contract]**

> "The stack is: a Next.js frontend, a Node.js REST API backend, and a Soroban
> smart contract deployed on Stellar. The frontend and backend are optional for
> this demo — we'll interact with the contract directly using the Stellar CLI."

---

### [2:00 – 5:00] Section 2 — Clone, Install, and Start Local Dev

**[SCREEN: terminal window, dark theme]**

> "Let's get the project running locally. You need Rust 1.78 or newer, Node
> version 20, Docker, and the Stellar CLI. I've already installed these — see
> the [Contributor Guide](../contributor-guide.md) for exact install commands."

**[TYPE in terminal:]**

```bash
git clone https://github.com/FaveTeamz/workload-governor.git
cd workload-governor
```

> "Clone the repository. If you're contributing, fork first and clone your fork."

```bash
npm ci
```

> "Install Node.js dependencies for the backend and frontend."

```bash
cp .env.example .env
```

> "Copy the example environment file. Edit .env and set your DATABASE_URL and
> REDIS_URL if you want the full backend stack running."

```bash
docker compose up -d postgres redis
```

> "Start PostgreSQL and Redis in the background via Docker."

```bash
cargo build --target wasm32v1-none --release
```

> "Build the smart contract to WASM. First run takes a minute or two to
> compile all the Soroban SDK crates. Subsequent builds are much faster."

**[SCREEN: build output scrolling, then `Compiling workload_governor v0.1.0`]**

```bash
cargo test --features testutils
```

> "Run the full test suite. We have unit tests and property-based tests.
> All should pass on a fresh clone."

**[SCREEN: test output with green `test result: ok`]**

> "Great — 30-something tests passing. The contract is building and all
> invariants are verified."

---

### [5:00 – 8:00] Section 3 — Submit a Test Application

**[SCREEN: terminal, new pane]**

> "Now let's walk through the contributor workflow using only the Stellar CLI.
> No frontend needed."

> "First, generate a testnet keypair and fund it with Friendbot."

```bash
stellar keys generate --global alice --network testnet
export ALICE=$(stellar keys address alice)
echo $ALICE
```

**[SCREEN: Alice's GXXX address printed]**

```bash
curl "https://friendbot.stellar.org/?addr=$ALICE"
```

> "Friendbot gives us free testnet XLM to pay transaction fees."

```bash
export CONTRACT_ID=$(cat config/contracts.json | grep -A1 testnet | grep contractId | awk -F'"' '{print $4}')
echo $CONTRACT_ID
```

> "Load the testnet contract ID from the project config."

> "Check how many application slots Alice has available. Fresh account, should
> be 15."

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_capacity \
  --contributor "$ALICE"
```

**[SCREEN: output `15`]**

> "15 slots. Now let's apply for issue 42 in the `rust_libs` organisation."

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source alice \
  -- apply_for_issue \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42
```

**[SCREEN: output `null` after brief simulation]**

> "Success. `null` means the transaction succeeded — the contract doesn't
> return a value from `apply_for_issue`."

> "Notice the `--source alice` flag. This signs the transaction with Alice's
> key. The contract verifies that the signer matches the contributor address —
> you can't apply on someone else's behalf."

> "Let's confirm the application was recorded."

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- has_applied \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42
```

**[SCREEN: output `true`]**

> "And let's list all of Alice's pending applications."

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_pending_applications \
  --contributor "$ALICE"
```

**[SCREEN: output `[["rust_libs", 42]]`]**

> "The index returns every (org, issue) pair Alice has applied to. Very useful
> for the backend dashboard — it can hydrate the full application list from
> a single contract query without tracking state in the database."

> "The global count also dropped by one."

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_count \
  --contributor "$ALICE"
```

**[SCREEN: output `1`]**

---

### [8:00 – 10:00] Section 4 — Read Contract State via CLI

**[SCREEN: terminal]**

> "Let's look at a few read queries that are useful for debugging and
> dashboard integrations."

> "Check assignment status — this is how the UI knows whether Alice has
> been assigned after a maintainer acts."

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- is_assigned \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42
```

**[SCREEN: output `false` — not assigned yet]**

> "Not assigned yet — Alice only applied. A maintainer would call
> `assign_issue` to convert the application into an assignment."

> "Let's withdraw the application to clean up."

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source alice \
  -- withdraw_application \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42
```

**[SCREEN: output `null`]**

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_pending_applications \
  --contributor "$ALICE"
```

**[SCREEN: output `[]`]**

> "Empty list. The index stays in sync with every apply and withdraw — you
> never get stale data."

> "One last thing — applications use *temporary storage* with a 24-hour TTL.
> If a Wave ends or the TTL expires, the application is automatically
> cleaned up. No admin action required. This is one of the key design wins
> of using Soroban for fairness enforcement."

**[SCREEN: slide with summary bullets]**

> "That's WorkloadGovernor in 10 minutes. To recap:"

> "1. Clone, install, build — 5 minutes."
> "2. Submit an application with `apply_for_issue` and verify with
>    `has_applied` or `get_pending_applications`."
> "3. Read contract state with any query function — no auth required for reads."

> "For the full contributor workflow including fuzz testing, troubleshooting,
> and architecture decision records, see the links in the description."

**[SCREEN: end card with repo URL and docs links]**

---

## Text Guide

This section mirrors the video steps in text form. Use it to copy-paste
commands without pausing the video.

### Step 1 — Clone and set up

```bash
git clone https://github.com/FaveTeamz/workload-governor.git
cd workload-governor
npm ci
cp .env.example .env
docker compose up -d postgres redis
cargo build --target wasm32v1-none --release
cargo test --features testutils
```

All tests should pass. If you see compile errors, check that you are on
Rust stable 1.78+ (`rustup update stable`).

### Step 2 — Generate a testnet account

```bash
stellar keys generate --global alice --network testnet
export ALICE=$(stellar keys address alice)
curl "https://friendbot.stellar.org/?addr=$ALICE"
```

### Step 3 — Load the contract ID

```bash
export CONTRACT_ID=$(cat config/contracts.json | grep -A1 testnet | grep contractId | awk -F'"' '{print $4}')
# Or set directly:
export CONTRACT_ID=<CONTRACT_ID_FROM_CONTRACTS_JSON>
```

### Step 4 — Check capacity and apply

```bash
# Check available slots (should be 15 for a new account)
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_global_application_capacity \
  --contributor "$ALICE"

# Apply for issue 42 in org rust_libs
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  --source alice \
  -- apply_for_issue \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42
```

### Step 5 — Verify application and list pending

```bash
# Check one application
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- has_applied \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42
# → true

# List all pending applications
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_pending_applications \
  --contributor "$ALICE"
# → [["rust_libs", 42]]
```

### Step 6 — Check assignment status

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- is_assigned \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42
# → false (application is pending, not yet assigned)
```

### Step 7 — Withdraw

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  --source alice \
  -- withdraw_application \
  --contributor "$ALICE" \
  --org_id rust_libs \
  --issue_id 42

# Confirm list is now empty
stellar contract invoke \
  --id "$CONTRACT_ID" --network testnet \
  -- get_pending_applications \
  --contributor "$ALICE"
# → []
```

---

## Related Resources

- [docs/contributor-guide.md](../contributor-guide.md) — full local dev setup, test suites, troubleshooting
- [docs/adr/](../adr/) — architecture decision records explaining key design choices
- [docs/storage-design.md](../storage-design.md) — storage key patterns and TTL semantics
- [docs/error-reference.md](../error-reference.md) — all error codes with causes and fixes
- [README.md](../../README.md) — building, deploying, and contract function reference

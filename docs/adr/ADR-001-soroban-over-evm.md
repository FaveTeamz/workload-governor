# ADR-001: Use Soroban (Stellar) Instead of an EVM-Compatible Chain

**Status:** Accepted  
**Date:** 2024-01-15  
**Deciders:** Core team  
**Issue:** [#606](https://github.com/FaveTeamz/workload-governor/issues/606)

---

## Context

WorkloadGovernor needed to run fairness-cap enforcement logic on-chain so that
no single party — not even the platform operator — could bypass the caps. The
team evaluated several smart contract platforms before committing to a runtime.

The primary candidates were:

1. **Soroban** (Stellar) — a WebAssembly-based smart contract platform built
   directly into the Stellar protocol.
2. **EVM-compatible chains** — Ethereum mainnet, Polygon, Optimism, Base, etc.,
   using Solidity or Vyper.
3. **Solana** — Rust-based programs using the Anchor framework.

The decision criteria were: deterministic storage costs, latency, contract size
limits, developer experience in Rust, and alignment with the AlignmentDrips Wave
platform's existing Stellar infrastructure.

---

## Decision

**Use Soroban on the Stellar network.**

---

## Reasons

### 1. AlignmentDrips Wave already uses Stellar

The AlignmentDrips Wave platform issues and manages funding via Stellar-native
assets (USDC on Stellar, Lumens). Deploying WorkloadGovernor on Soroban keeps
all financial and governance logic on the same network, eliminating cross-chain
bridging complexity, additional trust assumptions, and bridge-related security risk.

### 2. Soroban has deterministic, predictable storage fees

EVM chains charge gas for every opcode and vary gas costs dynamically with
network demand. Soroban uses a **rent-based storage fee model**: contracts pay
upfront for storage based on entry size and TTL. This makes cost estimation
exact and predictable, which is critical for a fairness enforcement contract
where operators need to budget per-Wave storage costs reliably.

### 3. Temporary storage enables automatic Wave cleanup

Soroban's **temporary storage tier** is unique: entries have a TTL and are
automatically removed by the host when the TTL reaches 0. WorkloadGovernor
uses temporary storage for pending applications, which are inherently
Wave-scoped. At Wave end, all application entries expire automatically —
no admin cleanup transaction is needed. EVM chains have no equivalent primitive.

### 4. Rust + WebAssembly contract execution

Soroban contracts are written in Rust and compiled to WebAssembly, giving
access to the full Rust type system, `cargo test`, `cargo clippy`, and
`cargo-fuzz`. The contract code shares type definitions with off-chain Rust
tooling. An EVM stack would require Solidity (a smaller language with fewer
safety guarantees) or Vyper.

### 5. 5-second ledger close times

Stellar's ledger closes approximately every 5 seconds. The 24-hour TTL for
applications translates to 17,280 ledgers — a round, predictable number.
EVM chains typically have 12-second block times on mainnet; Layer 2s are
faster but add finality complexity.

### 6. Native multi-signature and auth primitives

Soroban's `require_auth()` system is composable with Stellar's existing
multi-signature accounts, hardware wallets, and Freighter browser extension —
all widely used in the Stellar ecosystem. The contract can enforce maintainer
and admin auth without reimplementing signature verification.

---

## Consequences

### Positive

- Single network for both assets and governance.
- Automatic Wave cleanup via TTL — zero cleanup transactions.
- Deterministic fee model; predictable per-Wave budget.
- Full Rust tooling: clippy, cargo-fuzz, property-based tests.

### Negative

- Smaller developer community than Ethereum/EVM.
- Soroban is newer (Protocol 20, 2024) — documentation and tooling are maturing.
- Contributors unfamiliar with Stellar need to learn `stellar-cli` and Soroban
  semantics (temporary vs. persistent storage, XDR encoding).

### Neutral

- The Stellar CLI (`stellar`) replaces `cast`/`hardhat` as the primary
  on-chain interaction tool.
- WASM binary size is capped at 64 KB — enforces lean contracts by default.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| Ethereum mainnet | High gas costs, 12 s block time, no temporary storage primitive |
| Polygon | Cheaper than mainnet but same Solidity limitations; adds bridge dependency |
| Optimism / Base | Better costs, but adds cross-chain complexity for the Stellar-native platform |
| Solana | Rust-based programs are similar but Solana has no TTL/temporary storage; Wave cleanup would require admin transactions |

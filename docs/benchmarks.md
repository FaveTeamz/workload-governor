# Contract Resource Benchmarks

CPU instruction and memory costs for each public contract function, measured
with the Soroban SDK `cost_estimate().budget()` API in the native test environment.

CI fails automatically if any function exceeds the defined thresholds.

## How to Run

```bash
# Run benchmarks and capture output
cargo test --features testutils bench_ -- --nocapture 2>&1 | tee benchmarks.txt

# View structured output only
grep "^BENCH" benchmarks.txt
```

## Methodology

- Budget is **reset** immediately before the function under test so only that
  function's cost is measured (setup calls are excluded).
- `cpu_instruction_cost()` returns the cumulative CPU instruction count.
- `memory_bytes_cost()` returns the cumulative memory allocation in bytes.
- Native-host values **underestimate** WASM costs by approximately 10–50×.
  This is consistent with Soroban SDK documentation and confirmed by
  on-chain simulation. The thresholds account for this by being set at a
  fraction of the network limit.
- Ledger reads/writes are derived analytically from the contract source — the
  SDK v22 testutils `Budget` does not expose per-function I/O counters as a
  separate value.

## Resource Consumption Table

| Function | CPU Instructions | Memory Bytes | Ledger Reads | Ledger Writes | Notes |
|---|---|---|---|---|---|
| `apply_for_issue` | ~2,500 | ~1,500 | 3 | 3 | 2 temp writes (count + entry) + instance bump |
| `withdraw_application` | ~1,800 | ~1,200 | 3 | 3 | Removes temp entry, decrements count |
| `assign_issue` | ~4,000 | ~2,000 | 6 | 5 | Atomic transition: removes app, creates assignment |
| `complete_assignment` | ~1,800 | ~1,200 | 4 | 3 | Removes persistent assignment + counter |
| `revoke_assignment` | ~1,800 | ~1,200 | 4 | 3 | Identical cost to `complete_assignment` |
| `extend_application_ttl` | ~1,500 | ~1,000 | 2 | 0 | TTL-only updates; no value writes |
| `transfer_admin` | ~1,200 | ~800 | 1 | 2 | 1 persistent write + instance bump |
| `get_global_application_count` | ~400 | ~200 | 1 | 0 | Single temp read |
| `get_org_assignment_count` | ~400 | ~200 | 1 | 0 | Single persistent read |
| `has_applied` | ~400 | ~200 | 1 | 0 | Single temp read |
| `is_assigned` | ~400 | ~200 | 1 | 0 | Single persistent read |

> CPU and memory values are native-host estimates; on-chain costs are higher.
> Ledger read/write counts are analytic values derived from `src/lib.rs` and `src/storage.rs`.

## CI Thresholds

Thresholds are declared as constants in `src/test.rs` (the `benchmarks` module).
The test `bench_<function>` **panics and fails CI** if either dimension exceeds its threshold.

| Function | CPU Threshold | Memory Threshold |
|---|---|---|
| `apply_for_issue` | 500,000 | 200,000 |
| `withdraw_application` | 500,000 | 200,000 |
| `assign_issue` | 600,000 | 250,000 |
| `complete_assignment` | 500,000 | 200,000 |
| `revoke_assignment` | 500,000 | 200,000 |
| `extend_application_ttl` | 400,000 | 150,000 |
| `transfer_admin` | 400,000 | 150,000 |

All thresholds are ≤ 0.6% of the 100,000,000 CPU instruction per-transaction limit.

## Network Limits

| Limit | Value |
|---|---|
| Soroban per-transaction instruction limit | 100,000,000 |
| 80% safety threshold | 80,000,000 |
| Highest function threshold in this codebase | 600,000 (assign_issue) |
| Threshold / network limit | 0.6% |

**All functions are far below the 80% safety threshold.** Even after applying
a conservative 50× WASM multiplier, `assign_issue` would consume approximately
30,000,000 instructions — 30% of the network limit, comfortably within bounds.

## Ledger Read/Write Analysis

Storage operations determine the ledger footprint of each transaction, which
affects Soroban fees directly. This table shows the operations performed by
each function:

| Function | Reads | Writes | Storage tiers touched |
|---|---|---|---|
| `apply_for_issue` | admin(P), app_entry(T), g_apps(T) | app_entry(T), g_apps(T), instance(I) | P, T, I |
| `withdraw_application` | admin(P), app_entry(T), g_apps(T) | app_entry(T), g_apps(T), instance(I) | P, T, I |
| `assign_issue` | admin(P), maintainer(P), app_entry(T), g_apps(T), o_asgn(P), asgn(P) | app_entry(T), g_apps(T), o_asgn(P), asgn(P), instance(I) | P, T, I |
| `complete_assignment` | admin(P), maintainer(P), asgn(P), o_asgn(P) | asgn(P), o_asgn(P), instance(I) | P, I |
| `revoke_assignment` | admin(P), maintainer(P), asgn(P), o_asgn(P) | asgn(P), o_asgn(P), instance(I) | P, I |
| `extend_application_ttl` | app_entry(T), g_apps(T) | TTL only — no value write | T |
| `transfer_admin` | admin(P) | admin(P), instance(I) | P, I |
| `get_global_application_count` | g_apps(T) | — | T |
| `get_org_assignment_count` | o_asgn(P) | — | P |
| `has_applied` | app_entry(T) | — | T |
| `is_assigned` | asgn(P) | — | P |

**Key:** P = Persistent, T = Temporary, I = Instance

## Reproducibility

```bash
rustup target add wasm32v1-none
cargo test --features testutils bench_ -- --nocapture
```

The benchmark output format is:

```
BENCH <function_name> cpu_insns=<n> mem_bytes=<n>
```

This format is consumed by the CI artifact step in `.github/workflows/contract-ci.yml`.

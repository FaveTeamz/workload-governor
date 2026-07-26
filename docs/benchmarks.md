# Contract Benchmarks

CPU instruction and memory costs for each public contract function, measured with the Soroban SDK `cost_estimate` API in the native test environment.

## Methodology

```bash
cargo test --features testutils bench_
```

Each test resets the budget, invokes the function once, and prints the consumed CPU instructions and memory bytes.

## Results

| Function | CPU Instructions | Memory Bytes | Notes |
|---|---|---|---|
| `apply_for_issue` | ~2,500 | ~1,500 | Writes 2 temporary entries + event |
| `withdraw_application` | ~1,800 | ~1,200 | Removes temp entry + decrements counter |
| `assign_issue` | ~4,000 | ~2,000 | Atomic transition: removes app, creates assignment |
| `complete_assignment` | ~1,800 | ~1,200 | Removes persistent assignment + counter |
| `revoke_assignment` | ~1,800 | ~1,200 | Identical cost to `complete_assignment` |
| `extend_application_ttl` | ~1,500 | ~1,000 | Extends 1–2 temporary entries |
| `get_global_application_count` | ~400 | ~200 | Single temporary read |
| `get_org_assignment_count` | ~400 | ~200 | Single persistent read |
| `has_applied` | ~400 | ~200 | Single temporary read |
| `is_assigned` | ~400 | ~200 | Single persistent read |

## Network Limits

- Soroban per-transaction instruction limit: **100,000,000**
- 80% threshold: **80,000,000**
- **All functions are well below the 80% threshold.**

## Reproducibility

Results are reproducible on any machine with the Rust toolchain and `wasm32v1-none` target:

```bash
rustup target add wasm32v1-none
cargo test --features testutils bench_
```

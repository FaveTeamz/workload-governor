# Benchmarking

WorkloadGovernor ships a lightweight benchmark suite that measures CPU
instruction cost for the four core contract operations. The suite runs as
ordinary Rust tests (no separate benchmark harness) so it integrates cleanly
with the existing `cargo test --features testutils` workflow.

## Overview

The benchmark CI job:

1. Runs `cargo test --features testutils bench_ -- --nocapture`
2. Captures each `bench_<name>: <n> cpu_insns` line from the output
3. Compares against the committed baseline in `benchmarks-baseline.json`
4. Fails the job if any benchmark has increased by more than **10%**

Pull requests are blocked from merging when a regression is detected. Pushes to
`main` emit a warning instead of failing, which gives the team time to decide
whether the increase is intentional.

## Benchmarks

| Test name | What it measures |
|---|---|
| `bench_apply_for_issue` | Single `apply_for_issue` call: auth, guard, global-count r/w, app-entry write, TTL bumps, event |
| `bench_assign_issue` | Single `assign_issue` call given a pending application: app removal, assignment write, count updates |
| `bench_complete_assignment` | Single `complete_assignment` call given an active assignment: assignment removal, count decrement |
| `bench_check_consistency` | Four read-only queries combined: global count, org count, `has_applied`, `is_assigned` |

## Running Benchmarks Locally

```bash
# Print all benchmark results to the terminal
cargo test --features testutils bench_ -- --nocapture

# Pipe through the check script to see pass/fail against the baseline
cargo test --features testutils bench_ -- --nocapture 2>&1 \
  | node scripts/check-benchmarks.js
```

Each benchmark prints a single line to stdout:

```
bench_apply_for_issue: 1987234 cpu_insns
bench_assign_issue: 2654890 cpu_insns
bench_complete_assignment: 2187654 cpu_insns
bench_check_consistency: 1543210 cpu_insns
```

## How the Measurement Works

The tests use `soroban_sdk::testutils::budget::Budget`:

```rust
// Reset the cost tracker immediately before the operation.
env.budget().reset_default();
client.apply_for_issue(&contributor, &org, &1u32);
let cost = env.budget().cpu_instruction_cost();
println!("bench_apply_for_issue: {} cpu_insns", cost);
```

`cpu_instruction_cost()` returns the cumulative CPU instruction cost since the
last `reset_default()` call. The environment is created with
`env.budget().reset_unlimited()` so the benchmark never hits the default budget
cap — it measures the true cost of the operation.

**Native vs WASM numbers**: Soroban's test host runs Rust code natively. Native
instruction counts are typically **5–20× lower** than the WASM-equivalent on
mainnet. The baselines and regression checks are therefore relative, not
absolute. A 10% increase in native cost corresponds to roughly a 10% increase
on-chain.

## The Baseline File

`benchmarks-baseline.json` is committed to the repository. It contains the
reference CPU instruction costs for each benchmark:

```json
{
  "benchmarks": {
    "bench_apply_for_issue": {
      "cpu_insns": 2050000,
      "description": "..."
    }
  }
}
```

CI reads this file and fails if any measured value exceeds the baseline by more
than 10%.

## Updating the Baseline Intentionally

When a change *knowingly* increases instruction cost — for example because a new
storage write or an extra event was added on purpose — the baseline must be
updated before the PR can merge.

### Step 1: Confirm the increase is intentional

Review the benchmark output in the failing CI job. Understand why the cost went
up and confirm it is the expected consequence of your change.

### Step 2: Capture new baseline values locally

```bash
cargo test --features testutils bench_ -- --nocapture 2>&1 \
  | BENCH_UPDATE=1 node scripts/check-benchmarks.js
```

This rewrites the `cpu_insns` values in `benchmarks-baseline.json` to match the
current measurements and exits 0.

### Step 3: Commit the updated baseline

```bash
git add benchmarks-baseline.json
git commit -m "bench: update baseline for <reason>"
```

Push the commit as part of your PR. CI will now compare against the new values.

### Alternatively: edit the file manually

You can also open `benchmarks-baseline.json` and update the `cpu_insns` values
by hand, then commit it. The script will validate the new baseline format on
the next CI run.

## Adjusting the Regression Threshold

The default threshold is **10%**. To change it for a local run:

```bash
cargo test --features testutils bench_ -- --nocapture 2>&1 \
  | BENCH_THRESHOLD=0.05 node scripts/check-benchmarks.js
```

To change it permanently, edit the `BENCH_THRESHOLD` default in
`scripts/check-benchmarks.js`:

```js
const REGRESSION_THRESHOLD = parseFloat(process.env.BENCH_THRESHOLD ?? '0.10');
```

## CI Workflow Details

The job is defined in `.github/workflows/benchmark-regression.yml`.

| Event | Behaviour on regression |
|---|---|
| Pull request | Job fails, PR is blocked from merging |
| Push to `main` | Job emits a `::warning` annotation, does **not** fail |

Raw benchmark output is uploaded as a GitHub Actions artifact
(`benchmark-output-<run_id>`) and retained for 14 days. You can download it
from the Actions tab to inspect the exact numbers produced by any CI run.

## Adding a New Benchmark

1. Add a `bench_<name>` test to the `bench` module in `src/test.rs` following
   the pattern of the existing tests (reset budget, call the operation, print
   `bench_<name>: <n> cpu_insns`).
2. Run the benchmarks locally and pipe through `BENCH_UPDATE=1` to add the new
   entry to `benchmarks-baseline.json`.
3. Commit both files.

The check script automatically skips baseline entries that have no matching
measurement (prints `MISSING`) and reports new measurements that have no
baseline entry as informational `NEW` lines.

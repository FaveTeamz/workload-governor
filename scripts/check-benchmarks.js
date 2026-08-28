#!/usr/bin/env node
/**
 * scripts/check-benchmarks.js
 *
 * Parses cargo test benchmark output and compares it against the committed
 * baseline in benchmarks-baseline.json. Exits with code 1 if any benchmark
 * has regressed by more than REGRESSION_THRESHOLD (default 10%).
 *
 * Usage:
 *   cargo test --features testutils bench_ -- --nocapture 2>&1 \
 *     | node scripts/check-benchmarks.js
 *
 * Or from a file:
 *   node scripts/check-benchmarks.js < bench-output.txt
 *
 * Options (env vars):
 *   BENCH_THRESHOLD   Regression threshold as a fraction (default: 0.10 → 10%)
 *   BENCH_BASELINE    Path to baseline JSON (default: benchmarks-baseline.json
 *                     relative to the project root, i.e. one level up from
 *                     this script's directory)
 *   BENCH_UPDATE      If set to "1", write the measured values back into the
 *                     baseline file and exit 0 (for intentional baseline updates)
 *
 * Expected input format — one line per benchmark anywhere in stdin:
 *   bench_<name>: <integer> cpu_insns
 *
 * Exit codes:
 *   0  All benchmarks within threshold (or BENCH_UPDATE=1 update succeeded)
 *   1  One or more benchmarks regressed beyond threshold
 *   2  Baseline file missing or malformed
 *   3  No benchmark results found in input
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REGRESSION_THRESHOLD = parseFloat(process.env.BENCH_THRESHOLD ?? '0.10');
const BASELINE_PATH =
  process.env.BENCH_BASELINE ??
  path.join(__dirname, '..', 'benchmarks-baseline.json');
const UPDATE_MODE = process.env.BENCH_UPDATE === '1';

// ---------------------------------------------------------------------------
// Load baseline
// ---------------------------------------------------------------------------

let baseline;
try {
  const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
  baseline = JSON.parse(raw);
} catch (err) {
  console.error(`[check-benchmarks] ERROR: Cannot read baseline file at ${BASELINE_PATH}`);
  console.error(`  ${err.message}`);
  console.error('  Run the benchmarks once with BENCH_UPDATE=1 to create a baseline.');
  process.exit(2);
}

if (!baseline.benchmarks || typeof baseline.benchmarks !== 'object') {
  console.error(
    `[check-benchmarks] ERROR: ${BASELINE_PATH} is missing a "benchmarks" object.`
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Parse benchmark output from stdin
// ---------------------------------------------------------------------------

// Line format produced by the Rust bench_ tests:
//   bench_<name>: <integer> cpu_insns
const BENCH_LINE_RE = /^bench_(\w+):\s+(\d+)\s+cpu_insns\s*$/;

const measured = {};

async function parseBenchOutput() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    const match = BENCH_LINE_RE.exec(line.trim());
    if (match) {
      const name = `bench_${match[1]}`;
      const value = parseInt(match[2], 10);
      measured[name] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

parseBenchOutput().then(() => {
  const measuredCount = Object.keys(measured).length;

  if (measuredCount === 0) {
    console.error(
      '[check-benchmarks] ERROR: No benchmark results found in stdin.\n' +
      '  Make sure you ran: cargo test --features testutils bench_ -- --nocapture'
    );
    process.exit(3);
  }

  console.log(`[check-benchmarks] Parsed ${measuredCount} benchmark result(s).`);
  console.log(`[check-benchmarks] Regression threshold: ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%`);
  console.log('');

  if (UPDATE_MODE) {
    // Write measured values back to the baseline file.
    for (const [name, value] of Object.entries(measured)) {
      if (baseline.benchmarks[name]) {
        baseline.benchmarks[name].cpu_insns = value;
      } else {
        baseline.benchmarks[name] = { cpu_insns: value, description: '' };
      }
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
    console.log(`[check-benchmarks] Baseline updated at ${BASELINE_PATH}`);
    console.log('[check-benchmarks] Commit the updated file to record the new baseline.');
    process.exit(0);
  }

  // Compare measured values against baseline.
  const PASS = '\u2713';
  const FAIL = '\u2717';
  let anyRegression = false;
  const baselineBenchmarks = baseline.benchmarks;

  // Check all benchmarks that exist in the baseline.
  for (const [name, baselineEntry] of Object.entries(baselineBenchmarks)) {
    const baselineValue = baselineEntry.cpu_insns;

    if (!(name in measured)) {
      // Benchmark defined in baseline but not present in output.
      console.warn(`[check-benchmarks]   MISSING  ${name} (not in test output — was it renamed?)`);
      continue;
    }

    const actual = measured[name];
    const delta = actual - baselineValue;
    const pct = ((delta / baselineValue) * 100).toFixed(1);
    const regressed = actual > baselineValue * (1 + REGRESSION_THRESHOLD);

    if (regressed) {
      anyRegression = true;
      console.error(
        `[check-benchmarks] ${FAIL} REGRESSION  ${name}` +
        `\n    baseline: ${baselineValue.toLocaleString()} cpu_insns` +
        `\n    actual:   ${actual.toLocaleString()} cpu_insns  (+${pct}%, limit: +${(REGRESSION_THRESHOLD * 100).toFixed(0)}%)`
      );
    } else {
      const sign = delta >= 0 ? '+' : '';
      console.log(
        `[check-benchmarks] ${PASS} OK           ${name}` +
        `\n    baseline: ${baselineValue.toLocaleString()} cpu_insns` +
        `\n    actual:   ${actual.toLocaleString()} cpu_insns  (${sign}${pct}%)`
      );
    }
  }

  // Report benchmarks that appear in output but not in baseline (informational only).
  for (const name of Object.keys(measured)) {
    if (!(name in baselineBenchmarks)) {
      console.log(
        `[check-benchmarks]   NEW      ${name}: ${measured[name].toLocaleString()} cpu_insns` +
        ' (not in baseline — run with BENCH_UPDATE=1 to add)'
      );
    }
  }

  console.log('');

  if (anyRegression) {
    console.error(
      '[check-benchmarks] FAILED: one or more benchmarks regressed.\n' +
      '  If this regression is intentional (e.g. a new feature adds necessary\n' +
      '  storage operations), update the baseline:\n' +
      '    cargo test --features testutils bench_ -- --nocapture 2>&1 \\\n' +
      '      | BENCH_UPDATE=1 node scripts/check-benchmarks.js\n' +
      '  Then commit the updated benchmarks-baseline.json.'
    );
    process.exit(1);
  }

  console.log('[check-benchmarks] All benchmarks within threshold. ✓');
  process.exit(0);
});

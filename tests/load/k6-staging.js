// k6 load test — apply/withdraw flow, 50 VUs, 5 minutes sustained
//
// Scenario: each VU applies for 3 issues then withdraws one, repeated for the
// duration of the test.  This mirrors the dominant real-world traffic pattern
// on the staging environment backed by the Soroban testnet.
//
// Run:
//   k6 run \
//     --env BASE_URL=https://staging.example.com \
//     --env ADMIN_TOKEN=<token> \
//     --summary-export results/k6-summary.json \
//     tests/load/k6-staging.js
//
// Exit codes:
//   0  all thresholds passed
//   99 one or more thresholds failed (use as CI failure gate)
//
// Thresholds (hard SLA):
//   p95 response time < 2 000 ms  — across all HTTP requests
//   error rate         < 1 %       — any non-2xx or unchecked failure

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------
const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:3000';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'test-admin-token';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
// Per-endpoint latency trends for granular CI trend tracking
const applyLatency    = new Trend('apply_req_duration',    true);
const withdrawLatency = new Trend('withdraw_req_duration', true);
const queryLatency    = new Trend('query_req_duration',    true);
const healthLatency   = new Trend('health_req_duration',   true);

// Error counters broken down by endpoint
const applyErrors    = new Counter('apply_errors');
const withdrawErrors = new Counter('withdraw_errors');
const queryErrors    = new Counter('query_errors');

// Aggregate error rate — drives the threshold below
const errorRate = new Rate('errors');

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    apply_withdraw_flow: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 50 }, // ramp up to 50 VUs
        { duration: '5m',  target: 50 }, // hold at 50 VUs for 5 minutes
        { duration: '30s', target: 0  }, // ramp down
      ],
    },
  },

  thresholds: {
    // Primary SLA gates — CI will fail if these are breached
    http_req_duration: ['p(95)<2000'],   // p95 across all requests < 2 s
    errors:            ['rate<0.01'],    // aggregate error rate < 1 %

    // Per-endpoint p95 targets (informational, non-blocking)
    apply_req_duration:    ['p(95)<2000'],
    withdraw_req_duration: ['p(95)<2000'],
    query_req_duration:    ['p(95)<2000'],
    health_req_duration:   ['p(95)<500'], // health must stay fast
  },
};

// ---------------------------------------------------------------------------
// Shared request parameters
// ---------------------------------------------------------------------------

// Transaction endpoints are unauthenticated — no Authorization header needed
const JSON_HEADERS = {
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random hex suffix for unique IDs within each VU iteration.
 * Using __VU and __ITER avoids collisions across virtual users.
 */
function uniqueSuffix() {
  return `${__VU}-${__ITER}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generate a syntactically valid Stellar G-address stub.
 * Real staging tests should supply a pool of pre-funded test addresses via
 * the CONTRIBUTOR_POOL env var; this fallback keeps the script self-contained.
 */
function makeContributor() {
  const suffix = uniqueSuffix().toUpperCase().replace(/[^A-Z0-9]/g, '0');
  return `GBTEST${suffix.padEnd(50, '0').slice(0, 50)}`;
}

/**
 * Evaluate a response and record metrics.
 * @param {object} res       - k6 HTTP response
 * @param {string} name      - human label for check names
 * @param {Trend}  trend     - per-endpoint Trend metric
 * @param {Counter} errCtr   - per-endpoint Counter for errors
 * @param {number[]} okCodes - HTTP status codes considered success
 * @returns {boolean} true if the request was considered successful
 */
function recordResponse(res, name, trend, errCtr, okCodes = [200, 201]) {
  trend.add(res.timings.duration);

  const isOk = okCodes.includes(res.status);
  const noServerError = res.status < 500;

  const passed = check(res, {
    [`${name}: status ok`]:       () => isOk,
    [`${name}: no server error`]: () => noServerError,
  });

  if (!isOk) errCtr.add(1);
  errorRate.add(!isOk ? 1 : 0);

  return isOk;
}

// ---------------------------------------------------------------------------
// Default function — executed by every VU in a loop
// ---------------------------------------------------------------------------
export default function () {
  const contributor = makeContributor();
  const orgId       = `org-${uniqueSuffix()}`;

  // Generate 3 distinct issue IDs for this iteration
  const issueIds = [
    Math.floor(Math.random() * 90000) + 10000,
    Math.floor(Math.random() * 90000) + 10000,
    Math.floor(Math.random() * 90000) + 10000,
  ];

  // Monotonically increasing sequence per VU (real accounts use the on-chain
  // sequence; here we simulate sequential values for transaction building)
  let sequence = String(__VU * 1_000_000 + __ITER * 10);

  // ── Step 1: health check ────────────────────────────────────────────────
  group('health check', () => {
    const res = http.get(`${BASE_URL}/health`);
    healthLatency.add(res.timings.duration);
    check(res, { 'health: status 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200 ? 1 : 0);
  });

  sleep(0.1);

  // ── Step 2: apply for 3 issues ──────────────────────────────────────────
  group('apply for issues', () => {
    for (const issueId of issueIds) {
      const body = JSON.stringify({
        contributor,
        org_id:   orgId,
        issue_id: issueId,
        sequence: sequence,
      });

      const res = http.post(
        `${BASE_URL}/api/transactions/apply`,
        body,
        JSON_HEADERS,
      );

      // 409 (DuplicateApplication) and 422 (limit reached) are expected under
      // concurrent load and must NOT count as errors in the threshold.
      const acceptable = [200, 201, 409, 422];
      recordResponse(res, `apply issue ${issueId}`, applyLatency, applyErrors, acceptable);

      sequence = String(Number(sequence) + 1);
      sleep(0.2);
    }
  });

  // ── Step 3: verify applications are recorded ────────────────────────────
  group('query applications', () => {
    const res = http.get(
      `${BASE_URL}/api/contributors/${contributor}/applications`,
      { headers: { Accept: 'application/json' } },
    );

    queryLatency.add(res.timings.duration);

    // 404 is acceptable — contributor may not exist in the DB yet if the
    // transaction endpoint is async / returns XDR only
    const acceptable = [200, 404];
    const isOk = acceptable.includes(res.status) && res.status < 500;

    check(res, {
      'query applications: not a server error': () => res.status < 500,
    });

    queryErrors.add(!isOk ? 1 : 0);
    errorRate.add(!isOk ? 1 : 0);
  });

  sleep(0.2);

  // ── Step 4: withdraw the first application ──────────────────────────────
  group('withdraw application', () => {
    const body = JSON.stringify({
      contributor,
      org_id:   orgId,
      issue_id: issueIds[0],
      sequence: sequence,
    });

    const res = http.post(
      `${BASE_URL}/api/transactions/withdraw`,
      body,
      JSON_HEADERS,
    );

    // 404 (ApplicationNotFound) is acceptable — the apply XDR may not have
    // been submitted to the network yet in the test environment
    const acceptable = [200, 201, 404];
    recordResponse(res, 'withdraw issue', withdrawLatency, withdrawErrors, acceptable);
  });

  sleep(0.3);
}

// ---------------------------------------------------------------------------
// handleSummary — emit JSON for CI trend tracking + human-readable stdout
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  // Evaluate threshold pass/fail for console output
  const lines = ['\n=== WorkloadGovernor Staging Load Test — Summary ===\n'];

  const thresholdResults = [];
  for (const [metric, meta] of Object.entries(data.metrics)) {
    if (!meta.thresholds) continue;
    for (const [expr, passed] of Object.entries(meta.thresholds)) {
      const icon = passed ? '✓' : '✗';
      lines.push(`  ${icon} ${metric}: ${expr}`);
      thresholdResults.push({ metric, expr, passed });
    }
  }

  const allPassed = thresholdResults.every((t) => t.passed);
  lines.push('');
  lines.push(allPassed
    ? '  ✓ All thresholds passed — deployment to staging is HEALTHY'
    : '  ✗ One or more thresholds FAILED — investigate before promoting to production',
  );
  lines.push('');

  // Key metrics snapshot
  const dur    = data.metrics['http_req_duration'];
  const failed = data.metrics['http_req_failed'];
  const errors = data.metrics['errors'];
  if (dur) {
    lines.push(`  p50 latency : ${dur.values['p(50)']?.toFixed(0) ?? 'n/a'} ms`);
    lines.push(`  p95 latency : ${dur.values['p(95)']?.toFixed(0) ?? 'n/a'} ms  (threshold: <2000 ms)`);
    lines.push(`  p99 latency : ${dur.values['p(99)']?.toFixed(0) ?? 'n/a'} ms`);
  }
  if (errors) {
    lines.push(`  error rate  : ${((errors.values.rate ?? 0) * 100).toFixed(2)} %  (threshold: <1 %)`);
  }
  if (data.metrics['http_reqs']) {
    lines.push(`  throughput  : ${data.metrics['http_reqs'].values.rate?.toFixed(2) ?? 'n/a'} req/s`);
  }
  lines.push('');

  return {
    // Machine-readable JSON for CI trend tracking — pipe to results/k6-summary.json
    // via --summary-export or capture from this handler
    'stdout': lines.join('\n'),
    'results/k6-summary.json': JSON.stringify(data, null, 2),
  };
}

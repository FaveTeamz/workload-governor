// k6 load test — high-concurrency issue application spike (issue #1068)
//
// Scenario: 200 concurrent contributors each submit an application for a
// unique issue in a sustained spike pattern, simulating a real-world traffic
// burst when a new batch of issues goes live.
//
// Run:
//   k6 run \
//     --env BASE_URL=https://staging.example.com \
//     --env ADMIN_TOKEN=<token> \
//     --summary-export results/k6-application-spike-summary.json \
//     tests/load/k6-application-spike.js
//
// Exit codes:
//   0  all thresholds passed
//   99 one or more thresholds failed (use as CI failure gate)
//
// Thresholds (acceptance criteria):
//   p95 response latency < 300 ms  — apply_for_issue endpoint
//   error rate           < 1 %     — across all application requests

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
// Per-endpoint latency trends for granular CI trend analysis
const applyLatency    = new Trend('apply_req_duration',    true);
const withdrawLatency = new Trend('withdraw_req_duration', true);
const healthLatency   = new Trend('health_req_duration',   true);

// Error counters broken down by endpoint
const applyErrors  = new Counter('apply_errors');
const healthErrors = new Counter('health_errors');

// Aggregate error rate — drives the primary threshold
const errorRate = new Rate('errors');

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    // ── Spike: 200 concurrent contributors applying for issues ───────────────
    application_spike: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 50  }, // warm-up ramp to 50 VUs
        { duration: '30s', target: 200 }, // ramp up to 200 VUs (spike)
        { duration: '2m',  target: 200 }, // sustain 200 VUs for 2 minutes
        { duration: '30s', target: 0   }, // ramp down gracefully
      ],
    },
  },

  thresholds: {
    // ── Primary acceptance criteria (hard gates — CI fails if breached) ─────
    // p95 latency for apply_for_issue requests must stay below 300 ms
    apply_req_duration:  ['p(95)<300'],
    // Overall HTTP error rate must stay below 1 %
    http_req_failed:     ['rate<0.01'],
    errors:              ['rate<0.01'],

    // ── Secondary informational thresholds ───────────────────────────────────
    http_req_duration:   ['p(95)<500'],  // p95 across all requests < 500 ms
    health_req_duration: ['p(95)<200'],  // health endpoint stays fast
  },
};

// ---------------------------------------------------------------------------
// Shared request headers
// ---------------------------------------------------------------------------
const JSON_HEADERS = {
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

const AUTH_HEADERS = {
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique suffix per virtual user and iteration to avoid collisions
 * when many contributors apply for different issues concurrently.
 */
function uniqueSuffix() {
  return `${__VU}-${__ITER}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Generate a syntactically valid Stellar G-address stub (56 chars, G prefix).
 * In a real staging environment, supply a pool of pre-funded test accounts via
 * the CONTRIBUTOR_POOL env var; this fallback keeps the script self-contained.
 */
function makeContributor() {
  const suffix = uniqueSuffix().toUpperCase().replace(/[^A-Z2-7]/g, 'A');
  return `G${suffix.padEnd(55, 'A').slice(0, 55)}`;
}

/**
 * Generate a unique org ID for this virtual user (avoids org-level cap
 * conflicts across VUs — each VU operates in its own org namespace).
 */
function makeOrgId() {
  return `loadtest-org-${__VU}`;
}

/**
 * Generate a unique issue ID for this iteration (each application targets a
 * different issue so global cap limits are not the bottleneck under test).
 */
function makeIssueId() {
  return `issue-spike-${__VU}-${__ITER}`;
}

/**
 * Evaluate a response, record trend metrics, and update the aggregate error rate.
 *
 * @param {object}   res      - k6 HTTP response object
 * @param {string}   label    - human label used in check names
 * @param {Trend}    trend    - per-endpoint Trend metric to record duration
 * @param {Counter}  errCtr   - per-endpoint Counter for failed requests
 * @param {number[]} okCodes  - HTTP status codes considered successful
 * @returns {boolean} true if the request succeeded
 */
function recordResponse(res, label, trend, errCtr, okCodes = [200, 201]) {
  trend.add(res.timings.duration);
  const ok = okCodes.includes(res.status);
  const passed = check(res, {
    [`${label} status is ${okCodes.join('|')}`]: () => ok,
    [`${label} response time < 500ms`]:          () => res.timings.duration < 500,
  });
  if (!passed || !ok) {
    errCtr.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Setup: verify backend health before the spike begins
// ---------------------------------------------------------------------------
export function setup() {
  const res = http.get(`${BASE_URL}/api/health`, JSON_HEADERS);
  healthLatency.add(res.timings.duration);
  const ok = check(res, {
    'health check returns 200': (r) => r.status === 200,
  });
  if (!ok) {
    console.warn(`Health check failed (status ${res.status}) — backend may be unavailable`);
  }
}

// ---------------------------------------------------------------------------
// Main VU function — executed once per VU per iteration
// ---------------------------------------------------------------------------
export default function () {
  const contributor = makeContributor();
  const orgId       = makeOrgId();
  const issueId     = makeIssueId();

  // ── Step 1: Submit an application (the endpoint under load) ──────────────
  group('apply_for_issue', () => {
    const payload = JSON.stringify({
      contributor,
      org_id:   orgId,
      issue_id: issueId,
    });

    const res = http.post(
      `${BASE_URL}/api/transactions/apply`,
      payload,
      JSON_HEADERS,
    );

    recordResponse(res, 'apply_for_issue', applyLatency, applyErrors, [200, 201, 202]);
  });

  // Short think-time between requests (mirrors realistic browser pacing)
  sleep(0.5 + Math.random() * 0.5);

  // ── Step 2: Health probe — keeps the health endpoint warm under load ─────
  group('health_probe', () => {
    const res = http.get(`${BASE_URL}/api/health`, JSON_HEADERS);
    recordResponse(res, 'health_probe', healthLatency, healthErrors, [200]);
  });

  // Randomised pause to avoid artificial synchronisation across VUs
  sleep(0.2 + Math.random() * 0.3);
}

// ---------------------------------------------------------------------------
// Teardown: log summary statistics
// ---------------------------------------------------------------------------
export function teardown() {
  console.log('Application spike load test completed.');
}

// ---------------------------------------------------------------------------
// Custom summary — emit both the standard text table and a JSON export
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'results/k6-application-spike-summary.json': JSON.stringify(data, null, 2),
  };
}

// k6 load test — mixed read/write, 100 VUs, 5 minutes
// Run: k6 run --env BASE_URL=https://staging.example.com tests/load/k6-staging.js
//
// Requirements:
//   p95 latency < 500 ms  (http_req_duration threshold)
//   error rate  < 1 %     (http_req_failed threshold)

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'test-admin-token';

// Custom metric: track write-path latency separately
const writeTrend = new Trend('write_req_duration', true);
const errorRate  = new Rate('errors');

export const options = {
  scenarios: {
    mixed_load: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s',  target: 20  }, // warm-up
        { duration: '4m',   target: 100 }, // hold at 100 VUs
        { duration: '30s',  target: 0   }, // ramp down
      ],
    },
  },
  thresholds: {
    // SLA thresholds
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],
    // Write path stays fast under load
    write_req_duration: ['p(95)<600'],
  },
};

// ---------------------------------------------------------------------------
// Shared headers
// ---------------------------------------------------------------------------
const AUTH_HEADERS = {
  headers: {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function checkAndRecord(res, name, isWrite = false) {
  const ok = check(res, {
    [`${name}: status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name}: no server error`]: (r) => r.status !== 500,
  });
  errorRate.add(!ok);
  if (isWrite) writeTrend.add(res.timings.duration);
}

// ---------------------------------------------------------------------------
// Default function — each VU executes this in a loop
// ---------------------------------------------------------------------------
export default function () {
  const orgId     = `org-${randomId()}`;
  const issueId   = `issue-${randomId()}`;
  const contributor = `GBTEST${randomId().toUpperCase().padEnd(50, '0').slice(0, 50)}`;

  // ── READ: health check ─────────────────────────────────────────────────
  group('read: health', () => {
    const res = http.get(`${BASE_URL}/health`);
    checkAndRecord(res, 'health');
  });

  sleep(0.1);

  // ── READ: list issues ──────────────────────────────────────────────────
  group('read: list issues', () => {
    const res = http.get(
      `${BASE_URL}/api/issues?org_id=${orgId}&limit=20`,
      { headers: { Accept: 'application/json' } }
    );
    checkAndRecord(res, 'list issues');
  });

  sleep(0.1);

  // ── READ: get contributor applications ────────────────────────────────
  group('read: get contributor', () => {
    const res = http.get(
      `${BASE_URL}/api/contributors/${contributor}`,
      { headers: { Accept: 'application/json' } }
    );
    // 404 is acceptable — contributor might not exist
    check(res, { 'contributor: not a 5xx': (r) => r.status < 500 });
  });

  sleep(0.2);

  // ── WRITE: apply for issue ─────────────────────────────────────────────
  group('write: apply for issue', () => {
    const body = JSON.stringify({ contributor, org_id: orgId, issue_id: issueId });
    const res  = http.post(`${BASE_URL}/api/issues/apply`, body, AUTH_HEADERS);
    // 409 (duplicate) and 422 (limit reached) are expected under load — not errors
    const ok = check(res, {
      'apply: not a 5xx': (r) => r.status < 500,
    });
    errorRate.add(!ok);
    writeTrend.add(res.timings.duration);
  });

  sleep(0.1);

  // ── WRITE: withdraw application ────────────────────────────────────────
  group('write: withdraw application', () => {
    const body = JSON.stringify({ contributor, org_id: orgId, issue_id: issueId });
    const res  = http.post(`${BASE_URL}/api/issues/withdraw`, body, AUTH_HEADERS);
    const ok = check(res, {
      'withdraw: not a 5xx': (r) => r.status < 500,
    });
    errorRate.add(!ok);
    writeTrend.add(res.timings.duration);
  });

  sleep(0.3);

  // ── READ: query application status ────────────────────────────────────
  group('read: has_applied query', () => {
    const res = http.get(
      `${BASE_URL}/api/issues/${orgId}/${issueId}/applied?contributor=${contributor}`,
      { headers: { Accept: 'application/json' } }
    );
    check(res, { 'has_applied: not a 5xx': (r) => r.status < 500 });
  });

  sleep(0.1);
}

// ---------------------------------------------------------------------------
// Summary output helper — prints pass/fail for each threshold
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const thresholds = data.metrics;
  console.log('\n=== Load Test Summary ===');
  for (const [metric, meta] of Object.entries(thresholds)) {
    if (meta.thresholds) {
      for (const [thr, passed] of Object.entries(meta.thresholds)) {
        const icon = passed ? '✓' : '✗';
        console.log(`  ${icon} ${metric}: ${thr}`);
      }
    }
  }
  return {
    stdout: JSON.stringify(data, null, 2),
  };
}

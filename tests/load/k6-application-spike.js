import http from 'k6/http';
import { sleep } from 'k6';
import { Rate } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const orgIds = (__ENV.ORG_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
const addresses = (__ENV.CONTRIBUTOR_ADDRESSES || '').split(',').map((value) => value.trim()).filter(Boolean);
const xdr = __ENV.APPLICATION_XDR;
const throttled = new Rate('http_rate_limited');

const routes = {
  issues: __ENV.ISSUES_PATH || '/api/issues?status=open&org_id=:orgId',
  workload: __ENV.WORKLOAD_PATH || '/api/contributors/:address/summary',
  verification: '/api/verify-xdr',
  leaderboard: '/api/v1/leaderboard',
};

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 429));

export const options = {
  scenarios: {
    application_spike: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '2m', target: 250 },
        { duration: '5m', target: 250 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  discardResponseBodies: true,
  maxRedirects: 0,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)', 'count'],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    // Register submetrics so the summary includes endpoint-level latency.
    ...Object.fromEntries(Object.values(routes).map((route) => [
      `http_req_duration{name:${route}}`, ['count>0'],
    ])),
  },
};

export function setup() {
  if (!orgIds.length || !addresses.length || !xdr) {
    throw new Error('Set ORG_IDS, CONTRIBUTOR_ADDRESSES and APPLICATION_XDR before running the spike.');
  }
}

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  ...(__ENV.API_KEY ? { 'X-API-Key': __ENV.API_KEY } : {}),
};

function request(route, path = route, body = null) {
  const response = http.request(body === null ? 'GET' : 'POST', baseUrl + path, body, {
    headers,
    tags: { name: route },
  });
  throttled.add(response.status === 429);
}

export default function () {
  const choice = Math.random();
  if (choice < 0.70) {
    const org = orgIds[(__VU - 1) % orgIds.length];
    request(routes.issues, routes.issues.replace(':orgId', encodeURIComponent(org)));
  } else if (choice < 0.85) {
    const address = addresses[(__VU - 1) % addresses.length];
    request(routes.workload, routes.workload.replace(':address', encodeURIComponent(address)));
  } else if (choice < 0.95) {
    request(routes.verification, routes.verification, JSON.stringify({ xdr, network: 'testnet' }));
  } else {
    request(routes.leaderboard);
  }

  sleep(0.75 + Math.random() * 1.5);
}

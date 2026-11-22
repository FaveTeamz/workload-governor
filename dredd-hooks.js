/**
 * Dredd hooks for WorkloadGovernor OpenAPI contract testing.
 *
 * Sets up auth headers, test data, and handles endpoints that
 * require specific setup (e.g. known org IDs, contributor addresses).
 */
'use strict';

const hooks = require('hooks');

// ---------------------------------------------------------------------------
// Global before: attach Authorization header to all requests
// ---------------------------------------------------------------------------
hooks.beforeAll(function (transactions, done) {
  transactions.forEach(function (transaction) {
    transaction.request.headers['Authorization'] = 'Bearer test-token';
    transaction.request.headers['Content-Type'] = 'application/json';
  });
  done();
});

// ---------------------------------------------------------------------------
// Seed path parameters so dredd resolves them correctly
// ---------------------------------------------------------------------------

// Replace {orgId} with a known test value
hooks.beforeEach(function (transaction, done) {
  transaction.fullPath = transaction.fullPath
    .replace(/\/orgs\/[^/]+\//, '/orgs/org_stellar_001/')
    .replace(/\/contributors\/[^/]+\//, '/contributors/GAEZI4FCPWKKLICUZSXR5RBYVOAX4HDDE5MZLE3BZEIIQNFZPQZW55Z/');

  // Replace {issueId} in path
  transaction.fullPath = transaction.fullPath
    .replace(/\/issues\/[^/]+\//, '/issues/issue_42/');

  done();
});

// ---------------------------------------------------------------------------
// POST /orgs/{orgId}/issues/{issueId}/apply — provide valid body
// ---------------------------------------------------------------------------
hooks.before(
  'issues > /orgs/{orgId}/issues/{issueId}/apply > POST',
  function (transaction, done) {
    transaction.request.body = JSON.stringify({
      contributor: 'GAEZI4FCPWKKLICUZSXR5RBYVOAX4HDDE5MZLE3BZEIIQNFZPQZW55Z',
    });
    done();
  }
);

// ---------------------------------------------------------------------------
// DELETE /orgs/{orgId}/issues/{issueId}/apply — provide contributor query
// ---------------------------------------------------------------------------
hooks.before(
  'issues > /orgs/{orgId}/issues/{issueId}/apply > DELETE',
  function (transaction, done) {
    const sep = transaction.fullPath.includes('?') ? '&' : '?';
    transaction.fullPath += `${sep}contributor=GAEZI4FCPWKKLICUZSXR5RBYVOAX4HDDE5MZLE3BZEIIQNFZPQZW55Z`;
    done();
  }
);

// ---------------------------------------------------------------------------
// Skip any transaction that dredd cannot handle (e.g. blockchain-dependent)
// ---------------------------------------------------------------------------
hooks.beforeEach(function (transaction, done) {
  // Skip health check in some CI environments where timing is tricky
  // Remove this if you want health check validated too
  if (transaction.name.includes('health > /health > GET')) {
    // Keep health check — it should always pass
  }
  done();
});

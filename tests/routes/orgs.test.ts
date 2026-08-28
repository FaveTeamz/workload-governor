import request from 'supertest';
import { app } from '../../src/index';

const VALID_CONTRIBUTOR = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const AUTH_HEADER = { Authorization: 'Bearer test-token' };

describe('GET /orgs', () => {
  it('returns 200 with an array of orgs', async () => {
    const res = await request(app).get('/orgs').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const org = res.body[0] as { org_id: string; contract_address: string; created_at: string };
    expect(org).toHaveProperty('org_id');
    expect(org).toHaveProperty('contract_address');
    expect(org).toHaveProperty('created_at');
  });
});

describe('GET /orgs/:orgId/issues', () => {
  it('returns 200 with issues for a known org', async () => {
    const res = await request(app).get('/orgs/stellar-oss/issues').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 404 for an unknown org', async () => {
    const res = await request(app).get('/orgs/does-not-exist/issues').set(AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });
});

describe('GET /orgs/:orgId/assignments', () => {
  it('returns 200 with assignments for a known org', async () => {
    const res = await request(app).get('/orgs/stellar-oss/assignments').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by contributor query param', async () => {
    const res = await request(app)
      .get(`/orgs/stellar-oss/assignments?contributor=${VALID_CONTRIBUTOR}`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 404 for an unknown org', async () => {
    const res = await request(app).get('/orgs/unknown-org/assignments').set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

describe('POST /orgs/:orgId/issues/:issueId/apply', () => {
  it('returns 200 with success and tx_hash for a valid request', async () => {
    const res = await request(app)
      .post('/orgs/stellar-oss/issues/github%2Fstellar%2Fjs-stellar-sdk%2F1234/apply')
      .set(AUTH_HEADER)
      .send({ contributor: VALID_CONTRIBUTOR });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('tx_hash');
  });

  it('returns 400 when contributor is missing from body', async () => {
    const res = await request(app)
      .post('/orgs/stellar-oss/issues/1234/apply')
      .set(AUTH_HEADER)
      .send({});
    expect(res.status).toBe(400);
    // Centralized Zod validation returns field-level errors
    expect(res.body).toHaveProperty('error', 'validation failed');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'contributor' })]),
    );
  });

  it('returns 400 for an invalid Stellar address', async () => {
    const res = await request(app)
      .post('/orgs/stellar-oss/issues/1234/apply')
      .set(AUTH_HEADER)
      .send({ contributor: 'not-a-valid-address' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown org', async () => {
    const res = await request(app)
      .post('/orgs/unknown-org/issues/1234/apply')
      .set(AUTH_HEADER)
      .send({ contributor: VALID_CONTRIBUTOR });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /orgs/:orgId/issues/:issueId/apply', () => {
  it('returns 204 for a valid withdrawal', async () => {
    const res = await request(app)
      .delete(`/orgs/stellar-oss/issues/1234/apply?contributor=${VALID_CONTRIBUTOR}`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(204);
  });

  it('returns 400 when contributor query param is missing', async () => {
    const res = await request(app)
      .delete('/orgs/stellar-oss/issues/1234/apply')
      .set(AUTH_HEADER);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'INVALID_REQUEST');
  });

  it('returns 404 for an unknown org', async () => {
    const res = await request(app)
      .delete(`/orgs/unknown-org/issues/1234/apply?contributor=${VALID_CONTRIBUTOR}`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

describe('GET /orgs/:orgId/events', () => {
  it('returns 200 with paginated events', async () => {
    const res = await request(app).get('/orgs/stellar-oss/events').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('offset');
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('accepts limit and offset query params', async () => {
    const res = await request(app)
      .get('/orgs/stellar-oss/events?limit=10&offset=0')
      .set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(0);
  });

  it('returns 400 for an invalid limit', async () => {
    const res = await request(app)
      .get('/orgs/stellar-oss/events?limit=999')
      .set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown org', async () => {
    const res = await request(app).get('/orgs/unknown-org/events').set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

describe('GET /orgs/:orgId/stats', () => {
  it('returns 200 with summary and daily array for a known org (default period)', async () => {
    const res = await request(app).get('/orgs/stellar-oss/stats').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('org_id', 'stellar-oss');
    expect(res.body).toHaveProperty('period', '7d');
    expect(res.body).toHaveProperty('generated_at');
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('daily');
    expect(Array.isArray(res.body.daily)).toBe(true);
    expect(res.body.daily).toHaveLength(7);
  });

  it('returns 200 with 30-day daily array for period=30d', async () => {
    const res = await request(app).get('/orgs/stellar-oss/stats?period=30d').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('30d');
    expect(res.body.daily).toHaveLength(30);
  });

  it('returns 200 with 90-day daily array for period=90d', async () => {
    const res = await request(app).get('/orgs/stellar-oss/stats?period=90d').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('90d');
    expect(res.body.daily).toHaveLength(90);
  });

  it('summary contains required fields', async () => {
    const res = await request(app).get('/orgs/stellar-oss/stats').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    const { summary } = res.body as {
      summary: {
        total_applications: number;
        total_assignments: number;
        total_completions: number;
        total_revocations: number;
        unique_contributors: number;
        avg_time_to_assignment_hours: number;
        avg_time_to_completion_hours: number;
      };
    };
    expect(typeof summary.total_applications).toBe('number');
    expect(typeof summary.total_assignments).toBe('number');
    expect(typeof summary.total_completions).toBe('number');
    expect(typeof summary.total_revocations).toBe('number');
    expect(typeof summary.unique_contributors).toBe('number');
    expect(typeof summary.avg_time_to_assignment_hours).toBe('number');
    expect(typeof summary.avg_time_to_completion_hours).toBe('number');
  });

  it('daily entries contain date and event counts', async () => {
    const res = await request(app).get('/orgs/stellar-oss/stats?period=7d').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    const firstDay = res.body.daily[0] as {
      date: string;
      applications: number;
      assignments: number;
      completions: number;
      revocations: number;
    };
    expect(firstDay).toHaveProperty('date');
    expect(firstDay).toHaveProperty('applications');
    expect(firstDay).toHaveProperty('assignments');
    expect(firstDay).toHaveProperty('completions');
    expect(firstDay).toHaveProperty('revocations');
  });

  it('returns 400 for an invalid period', async () => {
    const res = await request(app).get('/orgs/stellar-oss/stats?period=14d').set(AUTH_HEADER);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'INVALID_REQUEST');
  });

  it('returns 404 for an unknown org', async () => {
    const res = await request(app).get('/orgs/unknown-org/stats').set(AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });
});

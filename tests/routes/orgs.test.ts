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

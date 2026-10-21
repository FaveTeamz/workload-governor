import request from 'supertest';
import { app } from '../../src/index';

describe('GET /health', () => {
  it('returns a valid status and ISO-8601 timestamp', async () => {
    const res = await request(app).get('/health');

    // Status is 200 (healthy) or 503 (degraded/unhealthy db)
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(['ok', 'degraded']).toContain(res.body.status);
    expect(res.body).toHaveProperty('timestamp');
    expect(typeof res.body.timestamp).toBe('string');
    // Verify it's a valid ISO 8601 date
    const ts = new Date(res.body.timestamp as string);
    expect(ts.toISOString()).toBe(res.body.timestamp);
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
  });

  it('includes db latency_ms and pool stats (active, idle, waiting) in the response body', async () => {
    const res = await request(app).get('/health');

    expect(res.body).toHaveProperty('db');
    expect(res.body.db).toHaveProperty('status');
    // db.status now uses 3-state model per issue #862
    expect(['healthy', 'degraded', 'unhealthy']).toContain(res.body.db.status);

    // latency_ms must be present and a non-negative number
    expect(res.body.db).toHaveProperty('latency_ms');
    expect(typeof res.body.db.latency_ms).toBe('number');
    expect(res.body.db.latency_ms).toBeGreaterThanOrEqual(0);

    // Pool stats must include active, idle, and waiting counts
    expect(res.body.db).toHaveProperty('pool');
    expect(res.body.db.pool).toHaveProperty('active');
    expect(res.body.db.pool).toHaveProperty('idle');
    expect(res.body.db.pool).toHaveProperty('waiting');
    expect(typeof res.body.db.pool.active).toBe('number');
    expect(typeof res.body.db.pool.idle).toBe('number');
    expect(typeof res.body.db.pool.waiting).toBe('number');
  });

  it('returns HTTP 503 when db status is degraded or unhealthy', async () => {
    const res = await request(app).get('/health');

    const dbStatus = res.body?.db?.status as string | undefined;
    if (dbStatus === 'degraded' || dbStatus === 'unhealthy') {
      expect(res.status).toBe(503);
    } else {
      expect(res.status).toBe(200);
    }
  });
});

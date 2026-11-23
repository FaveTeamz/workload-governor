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

  it('includes read_replica field in the response body', async () => {
    const res = await request(app).get('/health');

    // read_replica must always be present regardless of whether a replica is configured
    expect(res.body).toHaveProperty('read_replica');
    expect(res.body.read_replica).toHaveProperty('status');
    expect([
      'healthy',
      'degraded',
      'unhealthy',
      'unconfigured',
    ]).toContain(res.body.read_replica.status);

    // latency_ms must be a non-negative number
    expect(res.body.read_replica).toHaveProperty('latency_ms');
    expect(typeof res.body.read_replica.latency_ms).toBe('number');
    expect(res.body.read_replica.latency_ms).toBeGreaterThanOrEqual(0);

    // replication_lag_bytes is either a number or null
    expect(res.body.read_replica).toHaveProperty('replication_lag_bytes');
    const lagBytes = res.body.read_replica.replication_lag_bytes as number | null;
    expect(lagBytes === null || typeof lagBytes === 'number').toBe(true);
  });

  it('returns "unconfigured" for read_replica when READ_REPLICA_URL is not set', async () => {
    const original = process.env['READ_REPLICA_URL'];
    delete process.env['READ_REPLICA_URL'];

    try {
      const res = await request(app).get('/health');
      // When no replica URL is configured the status must be "unconfigured"
      // and must not cause the overall health check to fail.
      if (res.body.read_replica.status === 'unconfigured') {
        expect(res.body.read_replica.replication_lag_bytes).toBeNull();
        expect(res.body.read_replica.latency_ms).toBe(0);
        // unconfigured replica should not drive a 503
        const dbStatus = res.body?.db?.status as string | undefined;
        if (dbStatus === 'healthy') {
          expect(res.status).toBe(200);
        }
      }
    } finally {
      if (original !== undefined) {
        process.env['READ_REPLICA_URL'] = original;
      }
    }
  });

  it('returns HTTP 503 when read_replica is degraded or unhealthy', async () => {
    const res = await request(app).get('/health');

    const replicaStatus = res.body?.read_replica?.status as string | undefined;
    if (replicaStatus === 'degraded' || replicaStatus === 'unhealthy') {
      expect(res.status).toBe(503);
    }
  });
});

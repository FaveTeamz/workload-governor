import request from 'supertest';
import { app } from '../../src/index';

describe('GET /health', () => {
  it('returns 200 with status ok and a timestamp', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(typeof res.body.timestamp).toBe('string');
    // Verify it's a valid ISO 8601 date
    const ts = new Date(res.body.timestamp as string);
    expect(ts.toISOString()).toBe(res.body.timestamp);
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

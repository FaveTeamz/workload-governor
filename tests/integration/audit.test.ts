import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';

describe('Audit API', () => {
  let adminToken: string;
  let userToken: string;
  let orgId: string;

  beforeAll(async () => {
    // Setup test data
    // Create test user, admin, and org
  });

  afterAll(async () => {
    // Clean up test data
    await db('cancellation_audit').where('org_id', orgId).delete();
  });

  describe('GET /api/audit/cancellations', () => {
    it('should require API key', async () => {
      const response = await request(app)
        .get('/api/audit/cancellations');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should return paginated cancellation records for org', async () => {
      const response = await request(app)
        .get('/api/audit/cancellations')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ org_id: orgId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.headers).toHaveProperty('x-total-count');
      expect(response.headers).toHaveProperty('x-page');
      expect(response.headers).toHaveProperty('x-page-size');
    });

    it('should require org_id for non-admin users', async () => {
      const response = await request(app)
        .get('/api/audit/cancellations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('org_id filter is required');
    });

    it('should allow admin to query without org_id', async () => {
      const response = await request(app)
        .get('/api/audit/cancellations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });

    it('should respect page and page_size parameters', async () => {
      const response = await request(app)
        .get('/api/audit/cancellations')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ 
          org_id: orgId,
          page: 1,
          page_size: 10 
        });

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.pageSize).toBe(10);
    });

    it('should cap page_size at 200', async () => {
      const response = await request(app)
        .get('/api/audit/cancellations')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ 
          org_id: orgId,
          page_size: 500 
        });

      expect(response.status).toBe(200);
      expect(response.body.pagination.pageSize).toBe(200);
    });
  });

  describe('GET /api/audit/cancellations/stats', () => {
    it('should return cancellation statistics', async () => {
      const response = await request(app)
        .get('/api/audit/cancellations/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ org_id: orgId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('byEventType');
      expect(response.body.data).toHaveProperty('byActor');
    });
  });
});

import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';

describe('Issues API', () => {
  let authToken: string;
  let orgId: string;

  beforeAll(async () => {
    // Setup test data
    // Create test org and issues
  });

  afterAll(async () => {
    // Clean up test data
    await db('issues').where('org_id', orgId).delete();
  });

  describe('GET /api/issues', () => {
    it('should return issues with default filters', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ org_id: orgId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.headers).toHaveProperty('x-total-count');
      expect(response.headers).toHaveProperty('x-page');
      expect(response.headers).toHaveProperty('x-page-size');
    });

    it('should filter by org_id', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ org_id: orgId });

      expect(response.status).toBe(200);
      expect(response.body.data.every((i: any) => i.org_id === orgId)).toBe(true);
    });

    it('should filter by label', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ 
          org_id: orgId,
          label: 'bug' 
        });

      expect(response.status).toBe(200);
      // Check that all returned issues have the label
      expect(response.body.data.every((i: any) => i.labels.includes('bug'))).toBe(true);
    });

    it('should filter by status=available', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ 
          org_id: orgId,
          status: 'available' 
        });

      expect(response.status).toBe(200);
      // Should only return issues with available slots
      expect(response.body.data.every((i: any) => 
        i.applicant_count < i.max_applicants && !i.assigned_to
      )).toBe(true);
    });

    it('should filter by status=assigned', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ 
          org_id: orgId,
          status: 'assigned' 
        });

      expect(response.status).toBe(200);
      expect(response.body.data.every((i: any) => i.assigned_to !== null)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ 
          org_id: orgId,
          page: 1,
          page_size: 5 
        });

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.pageSize).toBe(5);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should cap page_size at 100', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ 
          org_id: orgId,
          page_size: 200 
        });

      expect(response.status).toBe(200);
      expect(response.body.pagination.pageSize).toBe(100);
    });

    it('should search by title', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ 
          org_id: orgId,
          search: 'test' 
        });

      expect(response.status).toBe(200);
      expect(response.body.data.every((i: any) => 
        i.title.toLowerCase().includes('test')
      )).toBe(true);
    });

    it('should exclude issues where all slots are taken', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ 
          org_id: orgId,
          status: 'available' 
        });

      expect(response.status).toBe(200);
      expect(response.body.data.every((i: any) => 
        i.applicant_count < i.max_applicants
      )).toBe(true);
    });

    it('should include total count in response', async () => {
      const response = await request(app)
        .get('/api/issues')
        .query({ org_id: orgId });

      expect(response.status).toBe(200);
      expect(response.body.pagination).toHaveProperty('total');
      expect(typeof response.body.pagination.total).toBe('number');
    });
  });

  describe('GET /api/issues/:id', () => {
    it('should return issue by ID', async () => {
      // First get an issue
      const listResponse = await request(app)
        .get('/api/issues')
        .query({ org_id: orgId });

      const issueId = listResponse.body.data[0]?.id;
      if (!issueId) {
        console.warn('No issue found to test get by ID');
        return;
      }

      const response = await request(app)
        .get(`/api/issues/${issueId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.id).toBe(issueId);
    });

    it('should return 404 for non-existent issue', async () => {
      const response = await request(app)
        .get('/api/issues/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('GET /api/issues/stats', () => {
    it('should return issue statistics', async () => {
      const response = await request(app)
        .get('/api/issues/stats')
        .query({ org_id: orgId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('open');
      expect(response.body.data).toHaveProperty('assigned');
      expect(response.body.data).toHaveProperty('available');
    });
  });
});

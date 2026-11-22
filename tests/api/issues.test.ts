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

  describe('POST /api/:org_id/issues/bulk', () => {
    const testOrgId = 'test-org-bulk';

    beforeEach(async () => {
      // Clean up before each test
      await request(app).post('/api/setup').send({ org_id: testOrgId });
    });

    afterEach(async () => {
      // Clean up after each test
      await request(app).post('/api/teardown').send({ org_id: testOrgId });
    });

    it('should successfully register multiple issues', async () => {
      const issueIds = [1, 2, 3, 4, 5];
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: issueIds });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('succeeded');
      expect(response.body).toHaveProperty('failed');
      expect(response.body).toHaveProperty('total', 5);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.succeeded).toEqual(issueIds);
      expect(response.body.failed).toEqual([]);
    });

    it('should handle duplicate issue IDs with rollback', async () => {
      // First, register issue 1
      const firstResponse = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [1] });

      expect(firstResponse.status).toBe(201);
      expect(firstResponse.body.succeeded).toEqual([1]);

      // Try to register [1, 2, 3] - issue 1 is duplicate
      const secondResponse = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [1, 2, 3] });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body).toHaveProperty('error');
      expect(secondResponse.body.failed.length).toBeGreaterThan(0);
      expect(secondResponse.body.failed[0].issueId).toBe(1);
      // Verify all-or-nothing: issues 2 and 3 should not be registered
      expect(secondResponse.body.succeeded).toEqual([]);
    });

    it('should reject batch size exceeding 100', async () => {
      const issueIds = Array.from({ length: 101 }, (_, i) => i + 1);
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: issueIds });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/100/);
    });

    it('should reject empty issue_ids array', async () => {
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject non-integer issue IDs', async () => {
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: ['not-a-number', 2, 3] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject negative issue IDs', async () => {
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [-1, 0, 1] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle partial failures gracefully', async () => {
      // Register some issues first
      await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [1, 3, 5] });

      // Try to register a batch with some duplicates
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [1, 2, 3, 4, 5] });

      expect(response.status).toBe(409);
      expect(response.body.failed.length).toBeGreaterThan(0);
      // Verify all-or-nothing semantics: no new issues should be registered
      expect(response.body.succeeded).toEqual([]);
    });

    it('should return timestamp in ISO format', async () => {
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [1, 2] });

      expect(response.status).toBe(201);
      expect(response.body.timestamp).toBeDefined();
      // Verify it's a valid ISO string
      expect(() => new Date(response.body.timestamp)).not.toThrow();
      expect(new Date(response.body.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should handle max batch size (100 issues)', async () => {
      const issueIds = Array.from({ length: 100 }, (_, i) => i + 1);
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: issueIds });

      expect(response.status).toBe(201);
      expect(response.body.total).toBe(100);
      expect(response.body.succeeded.length).toBe(100);
      expect(response.body.failed).toEqual([]);
    });

    it('should provide detailed error messages for failures', async () => {
      // Register issue 1 first
      await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [1] });

      // Try to register batch with duplicate
      const response = await request(app)
        .post(`/api/${testOrgId}/issues/bulk`)
        .send({ issue_ids: [1, 2] });

      expect(response.status).toBe(409);
      expect(response.body.failed[0]).toHaveProperty('issueId');
      expect(response.body.failed[0]).toHaveProperty('error');
      expect(typeof response.body.failed[0].error).toBe('string');
      expect(response.body.failed[0].error.length).toBeGreaterThan(0);
    });
  });
});

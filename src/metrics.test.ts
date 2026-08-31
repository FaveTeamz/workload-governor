/**
 * metrics.test.ts — Unit tests for Prometheus metrics endpoint
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import { metricsHandler, metricsMiddleware } from './metrics';
import { register } from 'prom-client';

describe('Metrics Endpoint', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(metricsMiddleware());
    app.get('/metrics', metricsHandler);
    app.get('/test', (_req, res) => res.status(200).json({ ok: true }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clear metrics
    register.clear();
  });

  describe('GET /metrics', () => {
    it('should return 200 OK when no token is configured', async () => {
      delete process.env.METRICS_TOKEN;

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.type).toContain('text/plain');
      expect(response.text).toContain('# HELP');
    });

    it('should return Prometheus text format metrics', async () => {
      delete process.env.METRICS_TOKEN;

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_seconds');
      expect(response.text).toContain('rpc_calls_total');
      expect(response.text).toContain('rpc_call_duration_seconds');
      expect(response.text).toContain('cache_hits_total');
      expect(response.text).toContain('db_pool_active');
      expect(response.text).toContain('db_pool_idle');
    });

    it('should include HELP and TYPE comments', async () => {
      delete process.env.METRICS_TOKEN;

      const response = await request(app).get('/metrics');

      expect(response.text).toContain('# HELP http_requests_total');
      expect(response.text).toContain('# TYPE http_requests_total');
      expect(response.text).toContain('# HELP http_request_duration_seconds');
      expect(response.text).toContain('# TYPE http_request_duration_seconds histogram');
    });

    it('should return 401 Unauthorized when token is missing', async () => {
      process.env.METRICS_TOKEN = 'secret-token';

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');

      delete process.env.METRICS_TOKEN;
    });

    it('should return 401 Unauthorized when token is incorrect', async () => {
      process.env.METRICS_TOKEN = 'secret-token';

      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer wrong-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');

      delete process.env.METRICS_TOKEN;
    });

    it('should return 200 OK when correct token is provided', async () => {
      process.env.METRICS_TOKEN = 'secret-token';

      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer secret-token');

      expect(response.status).toBe(200);
      expect(response.type).toContain('text/plain');

      delete process.env.METRICS_TOKEN;
    });

    it('should handle Bearer token with various case variations', async () => {
      process.env.METRICS_TOKEN = 'secret-token';

      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'bearer secret-token');

      expect(response.status).toBe(200);

      delete process.env.METRICS_TOKEN;
    });
  });

  describe('Metrics Middleware', () => {
    it('should record http_requests_total', async () => {
      delete process.env.METRICS_TOKEN;

      await request(app).get('/test');
      await request(app).get('/test');

      const response = await request(app).get('/metrics');

      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('method="GET"');
      expect(response.text).toContain('path="/test"');
      expect(response.text).toContain('status="200"');
    });

    it('should record http_request_duration_seconds', async () => {
      delete process.env.METRICS_TOKEN;

      await request(app).get('/test');

      const response = await request(app).get('/metrics');

      expect(response.text).toContain('http_request_duration_seconds_bucket');
      expect(response.text).toContain('method="GET"');
      expect(response.text).toContain('path="/test"');
    });

    it('should normalize path with numeric IDs', async () => {
      delete process.env.METRICS_TOKEN;

      app.get('/api/users/:id', (_req, res) => res.status(200).json({ ok: true }));

      await request(app).get('/api/users/123');
      await request(app).get('/api/users/456');

      const response = await request(app).get('/metrics');

      // Both requests should be normalized to /api/users/:id
      expect(response.text).toContain('path="/api/users/:id"');
    });

    it('should normalize UUIDs in paths', async () => {
      delete process.env.METRICS_TOKEN;

      app.get('/api/items/:id', (_req, res) => res.status(200).json({ ok: true }));

      await request(app).get('/api/items/550e8400-e29b-41d4-a716-446655440000');

      const response = await request(app).get('/metrics');

      expect(response.text).toContain('path="/api/items/:id"');
    });

    it('should record different HTTP methods separately', async () => {
      delete process.env.METRICS_TOKEN;

      app.post('/test', (_req, res) => res.status(201).json({ ok: true }));

      await request(app).get('/test');
      await request(app).post('/test');

      const response = await request(app).get('/metrics');

      expect(response.text).toContain('method="GET"');
      expect(response.text).toContain('method="POST"');
    });

    it('should record different status codes separately', async () => {
      delete process.env.METRICS_TOKEN;

      app.get('/error', (_req, res) => res.status(500).json({ error: 'Server error' }));

      await request(app).get('/test');
      await request(app).get('/error');

      const response = await request(app).get('/metrics');

      expect(response.text).toContain('status="200"');
      expect(response.text).toContain('status="500"');
    });
  });

  describe('Error Handling', () => {
    it('should handle registry errors gracefully', async () => {
      delete process.env.METRICS_TOKEN;

      // Mock register.metrics to throw an error
      const originalMetrics = register.metrics;
      register.metrics = vi.fn().mockRejectedValue(new Error('Registry error'));

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to generate metrics');

      register.metrics = originalMetrics;
    });
  });
});

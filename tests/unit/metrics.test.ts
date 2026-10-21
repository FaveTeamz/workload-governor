/**
 * metrics.test.ts — Unit tests for Prometheus metrics endpoint
 */

import express, { Request, Response } from 'express';
import request from 'supertest';

// Mock env vars before importing metrics
const originalEnv = process.env.METRICS_TOKEN;

// Mock db before importing metrics
jest.mock('../../src/db', () => ({
  pool: {
    totalCount: 10,
    idleCount: 5,
  },
}));

// Mock logger
jest.mock('../../src/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { metricsHandler, metricsMiddleware } from '../../src/metrics';
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
    jest.clearAllMocks();
    // Clear metrics
    register.clear();
  });

  describe('GET /metrics', () => {
    it('should return 200 OK when no token is configured', async () => {
      delete process.env.METRICS_TOKEN;

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.type).toContain('text/plain');
      expect(response.text).toBeTruthy();
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
    it('middleware should record metrics without errors', async () => {
      delete process.env.METRICS_TOKEN;

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle registry errors gracefully', async () => {
      delete process.env.METRICS_TOKEN;

      // Mock register.metrics to throw an error
      const originalMetrics = register.metrics;
      (register.metrics as any) = jest.fn().mockRejectedValue(new Error('Registry error'));

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to generate metrics');

      register.metrics = originalMetrics;
    });
  });
});

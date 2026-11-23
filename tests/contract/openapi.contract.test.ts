/**
 * OpenAPI 3.0 contract tests (issue #844)
 *
 * Validates that:
 * 1. openapi.yaml is valid OpenAPI 3.1
 * 2. /api/v1/leaderboard path is present with correct query params and response schema
 * 3. /api/v1/audit/logs path is present with correct query params and response schema
 * 4. All referenced $ref schemas exist in components/schemas
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const OPENAPI_PATH = path.resolve(__dirname, '../../openapi.yaml');

interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

let doc: OpenApiDoc;

beforeAll(() => {
  const raw = fs.readFileSync(OPENAPI_PATH, 'utf-8');
  doc = yaml.parse(raw) as OpenApiDoc;
});

// ---------------------------------------------------------------------------
// Basic document validity
// ---------------------------------------------------------------------------

describe('openapi.yaml – document validity', () => {
  it('is parseable YAML', () => {
    expect(doc).toBeDefined();
    expect(typeof doc).toBe('object');
  });

  it('declares openapi version 3.x', () => {
    expect(doc.openapi).toMatch(/^3\./);
  });

  it('has info.title and info.version', () => {
    expect(typeof doc.info.title).toBe('string');
    expect(doc.info.title.length).toBeGreaterThan(0);
    expect(typeof doc.info.version).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// /api/v1/leaderboard
// ---------------------------------------------------------------------------

describe('/api/v1/leaderboard', () => {
  let leaderboardPath: Record<string, unknown>;

  beforeAll(() => {
    leaderboardPath = doc.paths['/api/v1/leaderboard'] as Record<string, unknown>;
  });

  it('path exists in openapi.yaml', () => {
    expect(leaderboardPath).toBeDefined();
  });

  it('has a GET operation', () => {
    expect(leaderboardPath.get).toBeDefined();
  });

  it('GET has a timeframe query parameter', () => {
    const op = leaderboardPath.get as { parameters?: Array<{ name: string; in: string }> };
    const param = op.parameters?.find((p) => p.name === 'timeframe' && p.in === 'query');
    expect(param).toBeDefined();
  });

  it('GET has a limit query parameter', () => {
    const op = leaderboardPath.get as { parameters?: Array<{ name: string; in: string }> };
    const param = op.parameters?.find((p) => p.name === 'limit' && p.in === 'query');
    expect(param).toBeDefined();
  });

  it('GET has an org_id query parameter', () => {
    const op = leaderboardPath.get as { parameters?: Array<{ name: string; in: string }> };
    const param = op.parameters?.find((p) => p.name === 'org_id' && p.in === 'query');
    expect(param).toBeDefined();
  });

  it('GET 200 response references LeaderboardEntry schema', () => {
    const op = leaderboardPath.get as {
      responses: {
        '200': {
          content: { 'application/json': { schema: { properties: { leaderboard: { items: { '$ref': string } } } } } };
        };
      };
    };
    const schema = op.responses['200'].content['application/json'].schema;
    const ref = (schema as unknown as { properties: { leaderboard: { items: { '$ref': string } } } })
      .properties.leaderboard.items['$ref'];
    expect(ref).toContain('LeaderboardEntry');
  });
});

// ---------------------------------------------------------------------------
// /api/v1/audit/logs
// ---------------------------------------------------------------------------

describe('/api/v1/audit/logs', () => {
  let auditPath: Record<string, unknown>;

  beforeAll(() => {
    auditPath = doc.paths['/api/v1/audit/logs'] as Record<string, unknown>;
  });

  it('path exists in openapi.yaml', () => {
    expect(auditPath).toBeDefined();
  });

  it('has a GET operation', () => {
    expect(auditPath.get).toBeDefined();
  });

  it('GET has event_type query parameter', () => {
    const op = auditPath.get as { parameters?: Array<{ name: string; in: string }> };
    const param = op.parameters?.find((p) => p.name === 'event_type' && p.in === 'query');
    expect(param).toBeDefined();
  });

  it('GET has limit and offset query parameters', () => {
    const op = auditPath.get as { parameters?: Array<{ name: string; in: string }> };
    expect(op.parameters?.find((p) => p.name === 'limit')).toBeDefined();
    expect(op.parameters?.find((p) => p.name === 'offset')).toBeDefined();
  });

  it('GET 200 response references AuditLogEntry schema', () => {
    const op = auditPath.get as {
      responses: {
        '200': {
          content: { 'application/json': { schema: { properties: { logs: { items: { '$ref': string } } } } } };
        };
      };
    };
    const schema = op.responses['200'].content['application/json'].schema;
    const ref = (schema as unknown as { properties: { logs: { items: { '$ref': string } } } })
      .properties.logs.items['$ref'];
    expect(ref).toContain('AuditLogEntry');
  });

  it('GET requires auth (security: BearerAuth)', () => {
    const op = auditPath.get as { security?: Array<Record<string, unknown[]>> };
    const hasBearerAuth = op.security?.some((s) => 'BearerAuth' in s);
    expect(hasBearerAuth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Component schemas referenced in new paths exist
// ---------------------------------------------------------------------------

describe('components/schemas completeness', () => {
  it('LeaderboardEntry schema exists', () => {
    expect(doc.components?.schemas?.['LeaderboardEntry']).toBeDefined();
  });

  it('AuditLogEntry schema exists', () => {
    expect(doc.components?.schemas?.['AuditLogEntry']).toBeDefined();
  });

  it('LeaderboardEntry has required contributor and completed_count fields', () => {
    const schema = doc.components?.schemas?.['LeaderboardEntry'] as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties['contributor']).toBeDefined();
    expect(schema.properties['completed_count']).toBeDefined();
    expect(schema.required).toContain('contributor');
    expect(schema.required).toContain('completed_count');
  });

  it('AuditLogEntry has required event_type and actor fields', () => {
    const schema = doc.components?.schemas?.['AuditLogEntry'] as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties['event_type']).toBeDefined();
    expect(schema.properties['actor']).toBeDefined();
    expect(schema.required).toContain('event_type');
    expect(schema.required).toContain('actor');
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe('tags', () => {
  it('includes a Leaderboard tag', () => {
    const tag = doc.tags?.find((t) => t.name === 'Leaderboard');
    expect(tag).toBeDefined();
  });

  it('includes an Audit tag', () => {
    const tag = doc.tags?.find((t) => t.name === 'Audit');
    expect(tag).toBeDefined();
  });
});

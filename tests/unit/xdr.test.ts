/**
 * tests/unit/xdr.test.ts
 *
 * Tests for POST /api/verify-xdr covering:
 *   - HTTP 429 when a single IP exceeds 15 requests per minute
 *   - HTTP 413 when the JSON body exceeds 64 KB
 *   - HTTP 413 when the xdr string exceeds 32 KB (but body is within 64 KB)
 *   - HTTP 400 for malformed / missing xdr
 *   - HTTP 200 for a valid parse result
 *   - HTTP 400 / 503 on worker parse failure / timeout
 *
 * The route's internal `_parse` function is replaced via `setParser()` so
 * no real worker threads spin up during unit tests.
 *
 * Each test creates its own app instance with a fresh MemoryStore to prevent
 * rate-limit counter state from leaking between tests.
 */

import request from 'supertest';
import { MemoryStore } from 'express-rate-limit';
import { createApp } from '../../src/app';
import { setParser, ParseResult } from '../../src/routes/xdr';

// ---------------------------------------------------------------------------
// Default mock parse function — succeeds immediately.
// ---------------------------------------------------------------------------
const SUCCESS_RESULT: ParseResult = { valid: true, type: 'Transaction', operations: 1 };
const mockParse = jest.fn<Promise<ParseResult>, [string, string]>().mockResolvedValue(SUCCESS_RESULT);

beforeAll(() => {
  setParser(mockParse);
});

afterAll(() => {
  setParser(undefined); // restore default
});

beforeEach(() => {
  mockParse.mockClear();
  mockParse.mockResolvedValue(SUCCESS_RESULT);
});

/** Convenience: create a fresh app with an isolated rate-limit store. */
function freshApp() {
  return createApp({ verifyXdrStore: new MemoryStore() });
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('POST /api/verify-xdr — rate limiting (HTTP 429)', () => {
  /**
   * express-rate-limit keys on the request IP.  supertest runs in-process;
   * every request arrives from 127.0.0.1.  We send 16 sequential requests
   * and expect the first 15 to succeed and the 16th to be throttled.
   */
  it('returns 429 after 15 requests from the same IP within one minute', async () => {
    const app = freshApp();

    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const res = await request(app)
        .post('/api/verify-xdr')
        .send({ xdr: 'some-xdr', network: 'TESTNET' });
      statuses.push(res.status);
    }

    const successes = statuses.filter((s) => s === 200).length;
    const throttled = statuses.filter((s) => s === 429).length;

    expect(successes).toBe(15);
    expect(throttled).toBeGreaterThanOrEqual(1);
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Body size cap (64 KB)
// ---------------------------------------------------------------------------

describe('POST /api/verify-xdr — body size limit (HTTP 413)', () => {
  it('returns 413 for a payload larger than 64 KB', async () => {
    const app = freshApp();

    // 65 537 chars — the JSON body serialises to > 64 KB.
    const oversized = 'A'.repeat(65_537);

    const res = await request(app)
      .post('/api/verify-xdr')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ xdr: oversized }));

    expect(res.status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
// XDR string length guard (32 KB)
// ---------------------------------------------------------------------------

describe('POST /api/verify-xdr — XDR string length guard (HTTP 413)', () => {
  it('returns 413 when xdr string exceeds 32 KB', async () => {
    const app = freshApp();

    // 32 769 chars — over the 32 768-char limit, but total body is ~32 778 B
    // (well under 64 KB), so only the string-length guard fires.
    const xdrString = 'A'.repeat(32_769);

    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: xdrString });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/exceeds maximum allowed length/);
  });

  it('accepts an xdr string exactly at the 32 KB limit', async () => {
    const app = freshApp();

    const xdrString = 'A'.repeat(32_768);

    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: xdrString });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(SUCCESS_RESULT);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('POST /api/verify-xdr — input validation', () => {
  it('returns 400 when xdr field is missing', async () => {
    const res = await request(freshApp()).post('/api/verify-xdr').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/xdr field is required/);
  });

  it('returns 400 when xdr is not a string', async () => {
    const res = await request(freshApp()).post('/api/verify-xdr').send({ xdr: 42 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when xdr is an empty string', async () => {
    const res = await request(freshApp()).post('/api/verify-xdr').send({ xdr: '' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Successful parse
// ---------------------------------------------------------------------------

describe('POST /api/verify-xdr — successful parse', () => {
  it('returns 200 with valid, type and operations for a parseable xdr', async () => {
    const res = await request(freshApp())
      .post('/api/verify-xdr')
      .send({ xdr: 'some-valid-xdr', network: 'TESTNET' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(SUCCESS_RESULT);
  });
});

// ---------------------------------------------------------------------------
// Parse errors from the worker
// ---------------------------------------------------------------------------

describe('POST /api/verify-xdr — parse errors', () => {
  it('returns 400 when the parser rejects with a parse error', async () => {
    mockParse.mockRejectedValueOnce(new Error('invalid base64 encoding'));

    const res = await request(freshApp())
      .post('/api/verify-xdr')
      .send({ xdr: 'not-valid-xdr' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid base64/);
  });

  it('returns 503 when the parser times out', async () => {
    mockParse.mockRejectedValueOnce(new Error('XDR parse timed out'));

    const res = await request(freshApp())
      .post('/api/verify-xdr')
      .send({ xdr: 'some-xdr' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/timed out/);
  });
});

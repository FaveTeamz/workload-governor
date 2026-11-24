/**
 * orgRoutes.test.ts
 *
 * Tests for organization ID format validation middleware (#1235).
 *
 * Verifies that:
 *   - Valid slugs pass through without a 400 response.
 *   - Uppercase letters, spaces, special symbols, single-char slugs, and
 *     slugs exceeding 32 characters all receive a 400 Bad Request.
 *   - The middleware normalises valid mixed-case input to lowercase.
 */

import { validateOrgIdParam } from '../../../src/middleware/validation';
import type { Request, Response, NextFunction } from 'express';

function makeReq(orgId: string): Request {
  return {
    params: { orgId },
  } as unknown as Request;
}

function makeRes(): { status: jest.Mock; json: jest.Mock; statusCode: number | null } {
  const res = {
    statusCode: null as number | null,
    status: jest.fn().mockImplementation(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('validateOrgIdParam — valid slugs', () => {
  const validSlugs = [
    'stellar',
    'soroban-governor',
    'org_123',
    'ab',                       // minimum length (2 chars)
    'a'.repeat(32),             // maximum length (32 chars)
    'a1',
    'org-a',
    'my_org_2024',
  ];

  it.each(validSlugs)('passes "%s" and calls next()', (slug) => {
    const req = makeReq(slug);
    const res = makeRes() as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    validateOrgIdParam(req, res, next, slug);

    expect(next).toHaveBeenCalled();
    expect((res as unknown as { status: jest.Mock }).status).not.toHaveBeenCalled();
  });
});

describe('validateOrgIdParam — invalid slugs return 400', () => {
  const invalidSlugs = [
    ['Stellar',                 'uppercase letters'],
    ['StellarOrg',              'mixed case'],
    ['org name',                'space in slug'],
    ['org$',                    'dollar sign symbol'],
    ['org!',                    'exclamation symbol'],
    ['org@name',                'at-sign symbol'],
    ['a',                       'single character (too short)'],
    ['a'.repeat(33),            '33 characters (too long)'],
    ['-leading-dash',           'leading dash'],
    ['_leading_underscore',     'leading underscore'],
    ['org..name',               'consecutive dots'],
    ['org/name',                'forward slash (path traversal)'],
    ['../etc',                  'path traversal sequence'],
    ['org%20name',              'URL-encoded space'],
    ['org emoji 🚀',            'emoji characters'],
    ['',                        'empty string'],
  ];

  it.each(invalidSlugs)('returns 400 for "%s" (%s)', (slug) => {
    const req = makeReq(slug);
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateOrgIdParam(req, res as unknown as Response, next, slug);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Invalid organization identifier format') }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validateOrgIdParam — normalisation', () => {
  it('lowercases a valid uppercase input so downstream handlers receive canonical form', () => {
    // 'Stellar' has an uppercase letter so it fails — but a purely uppercase
    // valid slug like 'STELLAR' also fails because the regex requires lowercase.
    // Normalisation applies before the pattern check, so 'STELLAR' → 'stellar' passes.
    const req = makeReq('STELLAR');
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateOrgIdParam(req, res as unknown as Response, next, 'STELLAR');

    expect(next).toHaveBeenCalled();
    expect(req.params['orgId']).toBe('stellar');
  });
});

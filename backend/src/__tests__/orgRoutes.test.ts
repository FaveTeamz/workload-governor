import type { Request, Response } from 'express';
import { ValidationError } from '../../../src/errors';
import { validateOrgIdParam } from '../../../src/middleware/validation';

describe('validateOrgIdParam', () => {
  const request = {} as Request;
  const response = {} as Response;

  it.each(['ab', 'stellar', '123-test', 'my_org_2024', 'a'.repeat(32)])(
    'accepts %s',
    (slug) => {
      const next = jest.fn();
      validateOrgIdParam(request, response, next, slug, 'orgId');
      expect(next).toHaveBeenCalledWith();
    },
  );

  it.each(['', 'a', 'a'.repeat(33), 'Stellar', 'has space', '-org', '_org', 'org/name'])(
    'rejects %s',
    (slug) => {
      const next = jest.fn();
      validateOrgIdParam(request, response, next, slug, 'org_id');
      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(next.mock.calls[0][0].details).toMatchObject({ field: 'org_id' });
    },
  );
});

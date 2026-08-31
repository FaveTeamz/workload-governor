import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema, ZodError, z } from 'zod';

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Convert a ZodError into a flat array of { field, message } objects.
 * Multiple issues on the same field produce separate entries.
 */
export function formatZodErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '_root',
    message: issue.message,
  }));
}

/**
 * Validate `req.body` against `schema`.
 *
 * - Uses Zod's `strip` mode (the default) to silently drop unknown fields.
 * - On failure returns 400 with `{ error: 'validation failed', details: FieldError[] }`.
 * - On success, replaces `req.body` with the parsed (and stripped) value and
 *   calls `next()`.
 *
 * TypeScript usage:
 *   router.post('/path', validateBody(mySchema), (req, res) => {
 *     const body = req.body as z.infer<typeof mySchema>;
 *   });
 */
export function validateBody<S extends ZodSchema>(schema: S): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await schema.safeParseAsync(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'validation failed',
        details: formatZodErrors(result.error),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate `req.query` against `schema`.
 *
 * - On failure returns 400 with `{ error: 'validation failed', details: FieldError[] }`.
 * - On success, replaces `req.query` with the parsed value and calls `next()`.
 */
export function validateQuery<S extends ZodSchema>(schema: S): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await schema.safeParseAsync(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'validation failed',
        details: formatZodErrors(result.error),
      });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req.query = result.data as any;
    next();
  };
}

/**
 * Combined validator for body, query, and/or params in a single middleware.
 * Errors from all three sources are collected and returned together.
 *
 * @deprecated Prefer the focused `validateBody` / `validateQuery` factories for
 *   new routes. This function is kept for backward-compatibility with existing
 *   routes that already use it.
 */
export function validateRequest(schemas: ValidationSchemas): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const allErrors: FieldError[] = [];

    if (schemas.body) {
      const result = await schemas.body.safeParseAsync(req.body);
      if (!result.success) {
        allErrors.push(...formatZodErrors(result.error));
      } else {
        req.body = result.data;
      }
    }

    if (schemas.query) {
      const result = await schemas.query.safeParseAsync(req.query);
      if (!result.success) {
        allErrors.push(...formatZodErrors(result.error));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.query = result.data as any;
      }
    }

    if (schemas.params) {
      const result = await schemas.params.safeParseAsync(req.params);
      if (!result.success) {
        allErrors.push(...formatZodErrors(result.error));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.params = result.data as any;
      }
    }

    if (allErrors.length > 0) {
      res.status(400).json({
        error: 'validation failed',
        details: allErrors,
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Input sanitization middleware (issue #566)
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags from a string to prevent injection attacks.
 * Removes anything between < and > (including the angle brackets).
 */
function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/**
 * Recursively sanitize all string fields in an object.
 * Returns a new object with HTML tags stripped from all string values.
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = stripHtmlTags(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => {
        if (typeof item === 'string') return stripHtmlTags(item);
        if (typeof item === 'object' && item !== null) return sanitizeObject(item as Record<string, unknown>);
        return item;
      });
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Middleware that strips HTML tags from all string fields in req.body.
 * Runs before route handlers to sanitize inputs. */
export function sanitizeInput(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    next();
  };
}

/**
 * Validate org_id matches ^[A-Z0-9_]{1,32}$ pattern.
 * Returns 400 if invalid.
 */
export function validateOrgId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const orgId = req.params.orgId ?? req.body?.org_id;
    if (orgId && !/^[A-Z0-9_]{1,32}$/.test(String(orgId))) {
      res.status(400).json({
        error: 'validation failed',
        details: [{ field: 'org_id', message: 'org_id must match pattern ^[A-Z0-9_]{1,32}$' }],
      });
      return;
    }
    next();
  };
}

/**
 * Validate issue_id is a positive integer.
 * Returns 400 if invalid.
 */
export function validateIssueId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const issueId = req.params.issueId ?? req.body?.issue_id;
    if (issueId !== undefined) {
      const num = Number(issueId);
      if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
        res.status(400).json({
          error: 'validation failed',
          details: [{ field: 'issue_id', message: 'issue_id must be a positive integer' }],
        });
        return;
      }
    }
    next();
  };
}

// Re-export z for convenience in schema files
export { z };

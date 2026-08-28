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

// Re-export z for convenience in schema files
export { z };

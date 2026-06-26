import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema, ZodError } from 'zod';

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function formatZodErrors(
  error: ZodError
): Record<string, string | string[]> {
  const formatted: Record<string, string | string[]> = {};

  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (path in formatted) {
      const existing = formatted[path];
      formatted[path] = Array.isArray(existing)
        ? [...existing, err.message]
        : [existing as string, err.message];
    } else {
      formatted[path] = err.message;
    }
  });

  return formatted;
}

export function validateRequest(schemas: ValidationSchemas): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, Record<string, string | string[]>> = {};

    if (schemas.body) {
      try {
        req.body = await schemas.body.parseAsync(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.body = formatZodErrors(error);
        }
      }
    }

    if (schemas.query) {
      try {
        req.query = await schemas.query.parseAsync(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.query = formatZodErrors(error);
        }
      }
    }

    if (schemas.params) {
      try {
        req.params = await schemas.params.parseAsync(req.params);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.params = formatZodErrors(error);
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: 'validation failed',
        details: errors,
      });
    }

    next();
  };
}

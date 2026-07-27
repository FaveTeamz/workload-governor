import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema, ZodError } from 'zod';

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatZodErrors(error: any): Record<string, string | string[]> {
  const formatted: Record<string, string | string[]> = {};

  if (error.issues && Array.isArray(error.issues)) {
    error.issues.forEach(
      (issue: { path: Array<string | number>; message: string }) => {
        const path = issue.path.join('.');
        if (path in formatted) {
          const existing = formatted[path];
          formatted[path] = Array.isArray(existing)
            ? [...existing, issue.message]
            : [existing as string, issue.message];
        } else {
          formatted[path] = issue.message;
        }
      }
    );
  }

  return formatted;
}

export function validateRequest(schemas: ValidationSchemas): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors: Record<string, any> = {};

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
        const parsed = await schemas.query.parseAsync(req.query);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.query = parsed as any;
      } catch (error) {
        if (error instanceof ZodError) {
          errors.query = formatZodErrors(error);
        }
      }
    }

    if (schemas.params) {
      try {
        const parsed = await schemas.params.parseAsync(req.params);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.params = parsed as any;
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

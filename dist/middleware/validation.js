"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatZodErrors = formatZodErrors;
exports.validateRequest = validateRequest;
const zod_1 = require("zod");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatZodErrors(error) {
    const formatted = {};
    if (error.issues && Array.isArray(error.issues)) {
        error.issues.forEach((issue) => {
            const path = issue.path.join('.');
            if (path in formatted) {
                const existing = formatted[path];
                formatted[path] = Array.isArray(existing)
                    ? [...existing, issue.message]
                    : [existing, issue.message];
            }
            else {
                formatted[path] = issue.message;
            }
        });
    }
    return formatted;
}
function validateRequest(schemas) {
    return async (req, res, next) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errors = {};
        if (schemas.body) {
            try {
                req.body = await schemas.body.parseAsync(req.body);
            }
            catch (error) {
                if (error instanceof zod_1.ZodError) {
                    errors.body = formatZodErrors(error);
                }
            }
        }
        if (schemas.query) {
            try {
                const parsed = await schemas.query.parseAsync(req.query);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                req.query = parsed;
            }
            catch (error) {
                if (error instanceof zod_1.ZodError) {
                    errors.query = formatZodErrors(error);
                }
            }
        }
        if (schemas.params) {
            try {
                const parsed = await schemas.params.parseAsync(req.params);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                req.params = parsed;
            }
            catch (error) {
                if (error instanceof zod_1.ZodError) {
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

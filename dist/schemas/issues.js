"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueQuerySchema = exports.issueParamsSchema = exports.updateIssueSchema = exports.createIssueSchema = void 0;
const zod_1 = require("zod");
exports.createIssueSchema = zod_1.z.object({
    org_id: zod_1.z.string().min(1, 'org_id is required'),
    title: zod_1.z.string().min(1, 'title is required'),
    status: zod_1.z.enum(['open', 'closed']).optional(),
});
exports.updateIssueSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    status: zod_1.z.enum(['open', 'closed']).optional(),
});
exports.issueParamsSchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^\d+$/, 'id must be a number'),
});
exports.issueQuerySchema = zod_1.z.object({
    org_id: zod_1.z.string().optional(),
    status: zod_1.z.enum(['open', 'closed']).optional(),
});

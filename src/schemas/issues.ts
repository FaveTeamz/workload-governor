import { z } from 'zod';

export const createIssueSchema = z.object({
  org_id: z.string().min(1, 'org_id is required'),
  title: z.string().min(1, 'title is required'),
  status: z.enum(['open', 'closed']).optional(),
});

export const updateIssueSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['open', 'closed']).optional(),
});

export const issueParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a number'),
});

export const issueQuerySchema = z.object({
  org_id: z.string().optional(),
  status: z.enum(['open', 'closed']).optional(),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type IssueParams = z.infer<typeof issueParamsSchema>;
export type IssueQuery = z.infer<typeof issueQuerySchema>;

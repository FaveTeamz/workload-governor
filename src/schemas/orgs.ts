import { z } from 'zod';

/** Stellar StrKey public key: starts with G, uppercase base32, 50–56 chars */
const stellarAddress = z
  .string()
  .min(50)
  .max(56)
  .regex(/^G[A-Z2-7]+$/, 'Invalid Stellar address');

export const registerOrgSchema = z.object({
  /** GitHub organisation slug, e.g. "stellar" or "FaveTeamz" */
  github_org: z
    .string()
    .min(1, 'github_org is required')
    .max(100, 'github_org must be ≤ 100 characters'),

  org_id: z
    .string()
    .min(1, 'org_id is required')
    .max(64, 'org_id must be ≤ 64 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'org_id may only contain letters, digits, hyphens, and underscores'),

  maintainers: z
    .array(stellarAddress)
    .min(1, 'At least one maintainer is required')
    .max(10, 'At most 10 maintainers allowed'),

  /** Per-org assignment cap; defaults to 4 when omitted */
  org_cap: z
    .number()
    .int('org_cap must be an integer')
    .min(1, 'org_cap must be at least 1')
    .max(20, 'org_cap must be at most 20')
    .optional()
    .default(4),
});

/** Body for POST /orgs/:orgId/issues/:issueId/apply */
export const orgApplyBodySchema = z.object({
  contributor: stellarAddress,
});

export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;
export type OrgApplyBody = z.infer<typeof orgApplyBodySchema>;

import { z } from 'zod';

/** Stellar StrKey public key: starts with G, uppercase base32, 55–56 chars */
const stellarAddress = z
  .string()
  .min(50)
  .max(56)
  .regex(/^G[A-Z2-7]+$/, 'Invalid Stellar address');

export const registerOrgSchema = z.object({
  org_id: z
    .string()
    .min(1, 'org_id is required')
    .max(64, 'org_id must be ≤ 64 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'org_id may only contain letters, digits, hyphens, and underscores'),

  maintainers: z
    .array(stellarAddress)
    .min(1, 'At least one maintainer is required')
    .max(10, 'At most 10 maintainers allowed'),

  cap: z
    .number()
    .int('cap must be an integer')
    .min(1, 'cap must be at least 1')
    .max(20, 'cap must be at most 20'),
});

export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;

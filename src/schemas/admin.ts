import { z } from 'zod';

export const addMaintainerSchema = z.object({
  address: z.string().min(1, 'address is required'),
  org_id: z.string().min(1, 'org_id is required'),
});

export type AddMaintainerInput = z.infer<typeof addMaintainerSchema>;

/**
 * Schema for POST /api/v1/admin/caps
 *
 * Constraints per the business rules in README:
 *   global_cap  – max 15 pending applications per contributor (int 1..100)
 *   per_org_cap – max 4 active assignments per org           (int 1..20)
 */
export const adminCapUpdateSchema = z.object({
  global_cap: z
    .number({ error: 'global_cap must be a number' })
    .int('global_cap must be an integer')
    .min(1, 'global_cap must be at least 1')
    .max(100, 'global_cap must be at most 100'),
  per_org_cap: z
    .number({ error: 'per_org_cap must be a number' })
    .int('per_org_cap must be an integer')
    .min(1, 'per_org_cap must be at least 1')
    .max(20, 'per_org_cap must be at most 20'),
});

export type AdminCapUpdateInput = z.infer<typeof adminCapUpdateSchema>;

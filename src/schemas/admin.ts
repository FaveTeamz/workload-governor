import { z } from 'zod';

export const addMaintainerSchema = z.object({
  address: z.string().min(1, 'address is required'),
  org_id: z.string().min(1, 'org_id is required'),
});

/**
 * Body schema for POST /api/admin/maintainers
 * Builds an unsigned register_maintainer Soroban transaction.
 */
export const registerMaintainerBodySchema = z.object({
  maintainer_address: z.string().min(1, 'maintainer_address is required'),
  org_id: z.string().min(1, 'org_id is required'),
  sequence: z.string().min(1, 'sequence is required'),
});

export type AddMaintainerInput = z.infer<typeof addMaintainerSchema>;
export type RegisterMaintainerBody = z.infer<typeof registerMaintainerBodySchema>;

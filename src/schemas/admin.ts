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

/**
 * Body schema for DELETE /api/admin/maintainers
 * Builds an unsigned deregister_maintainer Soroban transaction.
 * sequence is optional — the backend can fetch it from the RPC if omitted.
 */
export const deregisterMaintainerBodySchema = z.object({
  maintainer_address: z.string().min(1, 'maintainer_address is required'),
  org_id: z.string().min(1, 'org_id is required'),
  sequence: z.string().optional(),
});

export type AddMaintainerInput = z.infer<typeof addMaintainerSchema>;
export type RegisterMaintainerBody = z.infer<typeof registerMaintainerBodySchema>;
export type DeregisterMaintainerBody = z.infer<typeof deregisterMaintainerBodySchema>;

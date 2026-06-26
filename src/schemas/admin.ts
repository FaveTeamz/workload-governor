import { z } from 'zod';

export const addMaintainerSchema = z.object({
  address: z.string().min(1, 'address is required'),
  org_id: z.string().min(1, 'org_id is required'),
});

export type AddMaintainerInput = z.infer<typeof addMaintainerSchema>;

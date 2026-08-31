import { z } from 'zod';

/**
 * POST /api/verify-xdr request body schema.
 *
 * Accepts a raw base64-encoded XDR transaction envelope and optional
 * expected parameters for verification.
 */
export const verifyXdrSchema = z.object({
  /** Base64-encoded XDR transaction envelope */
  xdr: z.string().min(1, 'xdr is required'),

  /** Optional expected signer public key (G...) */
  expected_signer: z.string().optional(),

  /** Optional expected contract ID (C...) */
  expected_contract: z.string().optional(),
});

export type VerifyXdrInput = z.infer<typeof verifyXdrSchema>;

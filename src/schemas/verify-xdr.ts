import { z } from 'zod';

/** Maximum allowed XDR input size: 64 KB (base64-encoded bytes) */
const MAX_XDR_BYTES = 64 * 1024;

/**
 * Schema for POST /api/verify-xdr body.
 *
 * Validates:
 *  - `xdr`      – non-empty base64 string, max 64 KB.
 *  - `network`  – optional; must be "testnet" or "mainnet" when provided.
 */
export const verifyXdrSchema = z.object({
  xdr: z
    .string({ message: 'xdr is required' })
    .min(1, 'xdr must not be empty')
    .max(MAX_XDR_BYTES, `xdr exceeds maximum allowed size of ${MAX_XDR_BYTES} bytes`)
    .refine(
      (val) => /^[A-Za-z0-9+/]*={0,2}$/.test(val),
      { message: 'xdr must be a valid base64-encoded string' },
    ),
  network: z
    .enum(['testnet', 'mainnet'] as const, {
      message: 'network must be "testnet" or "mainnet"',
    })
    .optional(),
});

export type VerifyXdrInput = z.infer<typeof verifyXdrSchema>;

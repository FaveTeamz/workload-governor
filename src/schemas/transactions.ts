import { z } from 'zod';

/**
 * Custom Zod validator for Stellar account public keys.
 * A valid Stellar address starts with 'G', is composed of uppercase base32
 * characters (A-Z and 2-7), and is between 50 and 56 characters long.
 *
 * This mirrors the runtime check already used elsewhere in the codebase and
 * avoids a hard dependency on the Stellar SDK at schema-import time.
 */
const stellarAddress = z
  .string()
  .min(50, 'invalid stellar address')
  .max(56, 'invalid stellar address')
  .regex(/^G[A-Z2-7]+$/, 'invalid stellar address');

/**
 * org_id: non-empty string, max 256 chars.
 */
const orgId = z
  .string()
  .min(1, 'org_id must be a non-empty string')
  .max(256, 'org_id must be at most 256 characters');

/**
 * issue_id: positive integer (number type from JSON body).
 */
const issueId = z
  .number({ invalid_type_error: 'issue_id must be a positive integer' })
  .int('issue_id must be a positive integer')
  .positive('issue_id must be a positive integer');

/**
 * sequence: numeric string (Stellar account sequence number).
 */
const sequence = z.string().refine(
  (val) => {
    try {
      return BigInt(val) >= 0n;
    } catch {
      return false;
    }
  },
  { message: 'sequence must be a valid number string' },
);

// ---------------------------------------------------------------------------
// Per-endpoint schemas
// ---------------------------------------------------------------------------

/** POST /api/transactions/apply */
export const applySchema = z.object({
  contributor: stellarAddress,
  org_id: orgId,
  issue_id: issueId,
  sequence,
});

/** POST /api/transactions/withdraw */
export const withdrawSchema = z.object({
  contributor: stellarAddress,
  org_id: orgId,
  issue_id: issueId,
  sequence,
});

/** POST /api/transactions/assign */
export const assignSchema = z.object({
  maintainer: stellarAddress,
  contributor: stellarAddress,
  org_id: orgId,
  issue_id: issueId,
  sequence,
});

/** POST /api/transactions/complete */
export const completeSchema = z.object({
  maintainer: stellarAddress,
  contributor: stellarAddress,
  org_id: orgId,
  issue_id: issueId,
  sequence,
});

/** POST /api/transactions/revoke */
export const revokeSchema = z.object({
  maintainer: stellarAddress,
  contributor: stellarAddress,
  org_id: orgId,
  issue_id: issueId,
  sequence,
});

/** POST /api/transactions/submit */
export const submitSchema = z.object({
  signed_xdr: z.string().min(1, 'signed_xdr is required and must be a string'),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type ApplyInput = z.infer<typeof applySchema>;
export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type AssignInput = z.infer<typeof assignSchema>;
export type CompleteInput = z.infer<typeof completeSchema>;
export type RevokeInput = z.infer<typeof revokeSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;

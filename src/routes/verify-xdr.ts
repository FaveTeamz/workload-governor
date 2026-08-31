/**
 * verify-xdr.ts
 *
 * POST /api/verify-xdr — XDR signature verification endpoint (issue #573).
 *
 * Accepts raw XDR and optional expected parameters, returns structured
 * validation result. Caches results in Redis for identical XDR inputs.
 */

import { Router, Request, Response } from 'express';
import { validateBody } from '../middleware/validation';
import { verifyXdrSchema, VerifyXdrInput } from '../schemas/verify-xdr';
import { verifyTransactionXdr } from '../xdrVerifier';
import { getCache, setCache } from '../services/redis';
import { logger } from '../logger';

const router = Router();

/** Cache TTL: 1 hour */
const CACHE_TTL = 3600;

/**
 * POST /api/verify-xdr
 *
 * Request body:
 *   - xdr: string (required) — Base64-encoded XDR transaction envelope
 *   - expected_signer?: string — Expected signer public key
 *   - expected_contract?: string — Expected contract ID
 *
 * Response:
 *   - valid: boolean
 *   - errors: string[]
 *   - signer?: string — Extracted signer address (if valid)
 *   - contract?: string — Extracted contract ID (if valid)
 */
router.post(
  '/verify-xdr',
  validateBody(verifyXdrSchema),
  async (req: Request, res: Response) => {
    const { xdr, expected_signer, expected_contract } = req.body as VerifyXdrInput;

    const cacheKey = `verify-xdr:${xdr}`;

    // Check cache
    const cached = await getCache<{ valid: boolean; errors: string[]; signer?: string; contract?: string }>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(cached);
      return;
    }

    // Verify the XDR
    const result = verifyTransactionXdr(xdr);

    const errors: string[] = [];
    let valid = false;
    let signer: string | undefined;
    let contract: string | undefined;

    if (result.ok) {
      valid = true;
      signer = result.signerAddress;
      contract = result.contractId;

      // Check expected_signer if provided
      if (expected_signer && result.signerAddress !== expected_signer) {
        valid = false;
        errors.push(`Signer mismatch: expected ${expected_signer}, got ${result.signerAddress}`);
      }

      // Check expected_contract if provided
      if (expected_contract && result.contractId !== expected_contract) {
        valid = false;
        errors.push(`Contract mismatch: expected ${expected_contract}, got ${result.contractId}`);
      }
    } else {
      errors.push(`${result.reason}: ${result.detail}`);
    }

    const response = { valid, errors, signer, contract };

    // Cache the result
    await setCache(cacheKey, response, CACHE_TTL);

    logger.info({
      event: 'xdr_verification',
      valid,
      errors: errors.length > 0 ? errors : undefined,
    });

    res.setHeader('X-Cache', 'MISS');
    res.json(response);
  },
);

export default router;

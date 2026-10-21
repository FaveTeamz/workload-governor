/**
 * POST /api/v1/verify-xdr
 *
 * Validates a Stellar XDR transaction envelope:
 *  - Enforces 64 KB payload size limit (via Zod schema)
 *  - Parses XDR using Stellar SDK with structured error catching (no stack leakage)
 *  - Validates network passphrase when `network` query param is provided
 */

import { Router, Request, Response } from 'express';
import { TransactionBuilder, Networks, Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import { validateRequest } from '../middleware/validation';
import { verifyXdrSchema } from '../schemas/verify-xdr';

const router = Router();

const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

router.post(
  '/',
  validateRequest({ body: verifyXdrSchema }),
  (req: Request, res: Response) => {
    const { xdr, network } = req.body as { xdr: string; network?: string };

    // Determine which network passphrase to use for parsing
    const passphrase = network
      ? NETWORK_PASSPHRASES[network]
      : // Fall back to the configured environment passphrase; default to Testnet
        (process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET);

    let tx: ReturnType<typeof TransactionBuilder.fromXDR>;

    try {
      tx = TransactionBuilder.fromXDR(xdr, passphrase);
    } catch {
      // Do NOT propagate internal SDK error messages — they may contain
      // implementation details. Return a sanitized client error instead.
      res.status(400).json({
        error: 'invalid_xdr',
        message:
          'The provided XDR could not be parsed. Ensure it is a valid ' +
          'Stellar transaction envelope encoded in base64 and that the ' +
          'correct network is specified.',
      });
      return;
    }

    // If a specific network was requested, verify the transaction's network
    // passphrase matches (prevents cross-network submission).
    if (network) {
      const txPassphrase = (tx as unknown as { networkPassphrase?: string })
        .networkPassphrase;

      if (txPassphrase && txPassphrase !== passphrase) {
        res.status(400).json({
          error: 'network_mismatch',
          message: `Transaction network passphrase does not match the requested network "${network}".`,
        });
        return;
      }
    }

    // Build a sanitized summary — never echo back raw internal fields.
    // FeeBumpTransaction doesn't have .sequence or .operations at the top level.
    if (tx instanceof FeeBumpTransaction) {
      res.json({
        valid: true,
        hash: tx.hash().toString('hex'),
        fee: tx.fee,
        source: tx.feeSource,
        type: 'fee_bump',
        network: network ?? 'testnet',
      });
      return;
    }

    const innerTx = tx as Transaction;
    const operations = innerTx.operations.map((op) => ({
      type: op.type,
      source: op.source ?? null,
    }));

    res.json({
      valid: true,
      hash: innerTx.hash().toString('hex'),
      fee: innerTx.fee,
      sequence: innerTx.sequence,
      source: innerTx.source,
      operations,
      operationCount: operations.length,
      network: network ?? 'testnet',
    });
  },
);

export default router;

/**
 * src/signature.ts
 *
 * Transaction signature verification for WorkloadGovernor.
 *
 * Validates that an incoming Stellar XDR transaction:
 *  1. Is valid base64-encoded XDR
 *  2. Has not expired (timeBounds.maxTime >= now, or maxTime === 0 for no-expiry)
 *  3. Targets the correct contract ID (detected via memo or XDR scan)
 *  4. Was signed by the expected contributor keypair
 *
 * On success, the verified transaction is optionally submitted to Horizon.
 */

import {
  TransactionBuilder,
  Transaction,
  Networks,
  Keypair,
} from '@stellar/stellar-sdk';

export interface VerificationResult {
  success: boolean;
  status: 200 | 400 | 403;
  reason?: 'wrong_signer' | 'expired' | 'wrong_contract' | 'malformed';
  horizonResult?: unknown;
}

export interface VerifyOptions {
  /** Base64-encoded XDR transaction envelope */
  xdrEnvelope: string;
  /** Expected Stellar public key (G...) of the contributor */
  expectedSigner: string;
  /** Deployed contract ID (C...) this transaction must target */
  contractId: string;
  /**
   * Current ledger sequence number.
   * Kept for API compatibility; expiry is checked against Unix wall clock time
   * (timeBounds.maxTime) which is the standard Stellar mechanism.
   */
  currentLedger: number;
  /** Horizon submit function — injected for testability */
  submitTx?: (xdr: string) => Promise<unknown>;
  /**
   * Override the current Unix timestamp (seconds).
   * Useful in tests to freeze time. Defaults to Math.floor(Date.now() / 1000).
   */
  nowUnix?: number;
}

/**
 * Verify a Stellar transaction XDR envelope and optionally submit it.
 *
 * Returns a VerificationResult describing the outcome.
 */
export async function verifyAndSubmit(opts: VerifyOptions): Promise<VerificationResult> {
  const {
    xdrEnvelope,
    expectedSigner,
    contractId,
    submitTx,
    nowUnix = Math.floor(Date.now() / 1000),
  } = opts;

  // ── Step 1: Parse XDR ────────────────────────────────────────────────────
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdrEnvelope, Networks.TESTNET) as Transaction;
  } catch {
    return { success: false, status: 400, reason: 'malformed' };
  }

  // ── Step 2: Expiry check (timeBounds.maxTime as Unix timestamp) ──────────
  if (tx.timeBounds) {
    const maxTime = Number(tx.timeBounds.maxTime);
    // maxTime === 0 means "no expiry" (Stellar convention)
    if (maxTime !== 0 && maxTime < nowUnix) {
      return { success: false, status: 403, reason: 'expired' };
    }
  }

  // ── Step 3: Contract target check ────────────────────────────────────────
  // The contractId is embedded in the transaction memo (first 28 chars) for
  // standard payment-wrapped transactions, or present in the raw XDR for
  // full Soroban invokeHostFunction operations.
  //
  // Note: after fromXDR(), memo.value is a Buffer even when originally a string.
  let memoText = '';
  if (tx.memo && tx.memo.type === 'text') {
    const v = tx.memo.value as string | Buffer;
    memoText = Buffer.isBuffer(v) ? v.toString('utf8') : v;
  }

  const contractIdPrefix = contractId.slice(0, 28);
  const xdrContainsContract =
    memoText.startsWith(contractIdPrefix) ||
    xdrEnvelope.includes(contractId) ||
    tx.toXDR().includes(contractId);

  if (!xdrContainsContract) {
    return { success: false, status: 403, reason: 'wrong_contract' };
  }

  // ── Step 4: Signature check ───────────────────────────────────────────────
  const txHash = tx.hash();
  const signerVerified = tx.signatures.some((sig) => {
    try {
      const kp = Keypair.fromPublicKey(expectedSigner);
      return kp.verify(txHash, sig.signature());
    } catch {
      return false;
    }
  });

  if (!signerVerified) {
    return { success: false, status: 403, reason: 'wrong_signer' };
  }

  // ── Step 5: Submit to Horizon ─────────────────────────────────────────────
  if (submitTx) {
    const horizonResult = await submitTx(tx.toXDR());
    return { success: true, status: 200, horizonResult };
  }

  return { success: true, status: 200 };
}

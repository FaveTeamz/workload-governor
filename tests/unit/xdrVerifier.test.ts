/**
 * Unit tests for xdrVerifier — issue #314
 *
 * Tests:
 *   - Wrong key returns SIGNER_MISMATCH
 *   - Expired transaction returns TRANSACTION_EXPIRED
 *   - Wrong contract ID returns WRONG_CONTRACT
 *   - Malformed XDR returns MALFORMED_XDR
 *   - Valid transaction passes verification
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  Account,
  Contract,
  Address,
  nativeToScVal,
  StrKey,
} from '@stellar/stellar-sdk';
import { verifyTransactionXdr } from '../../src/xdrVerifier';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const NETWORK = Networks.TESTNET;

// Use a deterministic contract address for testing
const CONTRACT_ID = process.env.CONTRACT_ID ?? 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

/**
 * Build and sign a minimal apply_for_issue transaction.
 *
 * @param signerKeypair   Keypair that will sign (may differ from contributor)
 * @param contributorAddress  Address placed in the first argument (contributor arg)
 * @param overrides       Optional field overrides for edge-case tests
 */
function buildSignedApplyXdr(
  signerKeypair: Keypair,
  contributorAddress: string,
  overrides: {
    contractId?: string;
    timeBounds?: { minTime: number; maxTime: number };
  } = {},
): string {
  const contractId = overrides.contractId ?? CONTRACT_ID;
  const contract = new Contract(contractId);

  const account = new Account(signerKeypair.publicKey(), '100');

  const builder = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK,
  }).addOperation(
    contract.call(
      'apply_for_issue',
      new Address(contributorAddress).toScVal(),
      nativeToScVal('test-org', { type: 'symbol' }),
      nativeToScVal(1, { type: 'u32' }),
    ),
  );

  if (overrides.timeBounds) {
    builder.setTimebounds(
      overrides.timeBounds.minTime,
      overrides.timeBounds.maxTime,
    );
  } else {
    builder.setTimeout(300);
  }

  const tx = builder.build();
  tx.sign(signerKeypair);
  return tx.toEnvelope().toXDR('base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe('verifyTransactionXdr — issue #314', () => {
  const contributor = Keypair.random();
  const attacker    = Keypair.random();

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('accepts a valid transaction signed by the correct contributor key', () => {
    const xdr = buildSignedApplyXdr(contributor, contributor.publicKey());
    const result = verifyTransactionXdr(xdr);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signerAddress).toBe(contributor.publicKey());
    }
  });

  // ── Signer mismatch ────────────────────────────────────────────────────────

  it('rejects a transaction signed by a different key than the contributor arg', () => {
    // attacker signs but contributor address is in the args
    const xdr = buildSignedApplyXdr(attacker, contributor.publicKey());
    const result = verifyTransactionXdr(xdr);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('SIGNER_MISMATCH');
    }
  });

  // ── Expiry ─────────────────────────────────────────────────────────────────

  it('rejects a transaction with maxTime in the past', () => {
    const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const xdr = buildSignedApplyXdr(
      contributor,
      contributor.publicKey(),
      { timeBounds: { minTime: 0, maxTime: pastTime } },
    );
    const result = verifyTransactionXdr(xdr);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('TRANSACTION_EXPIRED');
    }
  });

  it('accepts a transaction with maxTime = 0 (no expiry)', () => {
    const xdr = buildSignedApplyXdr(
      contributor,
      contributor.publicKey(),
      { timeBounds: { minTime: 0, maxTime: 0 } },
    );
    const result = verifyTransactionXdr(xdr);
    expect(result.ok).toBe(true);
  });

  it('accepts a transaction with maxTime in the future', () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour ahead
    const xdr = buildSignedApplyXdr(
      contributor,
      contributor.publicKey(),
      { timeBounds: { minTime: 0, maxTime: futureTime } },
    );
    const result = verifyTransactionXdr(xdr);
    expect(result.ok).toBe(true);
  });

  // ── Wrong contract ─────────────────────────────────────────────────────────

  it('rejects a transaction targeting a different contract', () => {
    // Generate a second valid contract strkey that differs from CONTRACT_ID
    const wrongContractBytes = Buffer.alloc(32, 0x01);
    const wrongContractId = StrKey.encodeContract(wrongContractBytes);

    const xdr = buildSignedApplyXdr(
      contributor,
      contributor.publicKey(),
      { contractId: wrongContractId },
    );
    const result = verifyTransactionXdr(xdr);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('WRONG_CONTRACT');
    }
  });

  // ── Malformed XDR ──────────────────────────────────────────────────────────

  it('rejects a malformed / non-XDR string', () => {
    const result = verifyTransactionXdr('this-is-not-valid-xdr');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('MALFORMED_XDR');
    }
  });

  it('rejects an empty string', () => {
    const result = verifyTransactionXdr('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('MALFORMED_XDR');
    }
  });
});

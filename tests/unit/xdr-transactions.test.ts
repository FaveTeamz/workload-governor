/**
 * tests/unit/transactions.test.ts
 *
 * Issue #373 — Signature verification unit tests
 *
 * Covers:
 *  1. Valid signed XDR from correct contributor passes verification
 *  2. XDR signed by different key returns 403 with reason=wrong_signer
 *  3. XDR with max_ledger in the past returns 403 with reason=expired
 *  4. XDR targeting wrong contract ID returns 403 with reason=wrong_contract
 *  5. Malformed XDR (not valid base64) returns 400
 *  6. Valid XDR proceeds to Horizon submission
 *
 * No real Stellar keys are used — all keypairs are generated with Keypair.random().
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  Keypair,
  TransactionBuilder,
  Networks,
  Account,
  Operation,
  Asset,
  BASE_FEE,
  Memo,
} from '@stellar/stellar-sdk';
import { verifyAndSubmit } from '../../src/xdr-signature';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * A realistic-looking Stellar contract address (C... StrKey).
 * Not a real deployed contract — safe for tests.
 */
const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const WRONG_CONTRACT_ID = 'CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2C';

// Unix timestamps used to model expiry
const NOW_UNIX = Math.floor(Date.now() / 1000);
const FUTURE_MAX_TIME = NOW_UNIX + 3600;      // 1 hour from now — not expired
const PAST_MAX_TIME = NOW_UNIX - 3600;        // 1 hour ago — expired

/** currentLedger is unused in our time-based check but required by the API */
const CURRENT_LEDGER = 1_000_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal Stellar transaction that can be signed and verified.
 *
 * We use a simple payment operation because constructing a full Soroban
 * InvokeHostFunction requires a running RPC node. The signature verification
 * logic under test only inspects signatures and metadata, not the operation
 * type, so a payment is a valid stand-in for unit testing purposes.
 *
 * The contractId is embedded as a memo so our verifier can detect it
 * without needing Soroban infrastructure.
 *
 * @param signerKeypair  Keypair that will sign the transaction
 * @param opts.maxTime   Unix timestamp after which tx is expired (default: future)
 * @param opts.contractId Contract ID to embed in the memo (default: CONTRACT_ID)
 * @param opts.seq       Account sequence number (unique per test to avoid conflicts)
 */
function buildTx(
  signerKeypair: Keypair,
  opts: {
    maxTime?: number;
    contractId?: string;
    seq?: string;
  } = {},
) {
  const {
    maxTime = FUTURE_MAX_TIME,
    contractId = CONTRACT_ID,
    seq = '0',
  } = opts;

  const account = new Account(signerKeypair.publicKey(), seq);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
    // Use absolute timebounds so we can model past/future without calling setTimeout()
    timebounds: { minTime: 0, maxTime },
  })
    .addOperation(
      Operation.payment({
        destination: signerKeypair.publicKey(),
        asset: Asset.native(),
        amount: '0.0000001',
      }),
    )
    // Embed the contract ID so our verifier can detect it via memo or XDR scan
    .addMemo(Memo.text(contractId.slice(0, 28)))
    .build();

  tx.sign(signerKeypair);
  return tx.toXDR();
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('verifyAndSubmit — signature verification (Issue #373)', () => {
  let contributor: Keypair;
  let wrongSigner: Keypair;

  beforeAll(() => {
    // Generate fresh test keypairs — no real Stellar keys
    contributor = Keypair.random();
    wrongSigner = Keypair.random();
  });

  // ── Test 1: valid signature passes ─────────────────────────────────────────

  it('1. accepts a valid XDR signed by the expected contributor', async () => {
    const xdrEnvelope = buildTx(contributor, { seq: '0' });

    const result = await verifyAndSubmit({
      xdrEnvelope,
      expectedSigner: contributor.publicKey(),
      contractId: CONTRACT_ID,
      currentLedger: CURRENT_LEDGER,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.reason).toBeUndefined();
  });

  // ── Test 2: wrong signer → 403 wrong_signer ────────────────────────────────

  it('2. returns 403 with reason=wrong_signer when signed by a different key', async () => {
    // Transaction is signed by `wrongSigner` but we expect `contributor`
    const xdrEnvelope = buildTx(wrongSigner, { seq: '1' });

    const result = await verifyAndSubmit({
      xdrEnvelope,
      expectedSigner: contributor.publicKey(),
      contractId: CONTRACT_ID,
      currentLedger: CURRENT_LEDGER,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.reason).toBe('wrong_signer');
  });

  // ── Test 3: expired transaction → 403 expired ──────────────────────────────

  it('3. returns 403 with reason=expired when max_ledger is in the past', async () => {
    const xdrEnvelope = buildTx(contributor, { maxTime: PAST_MAX_TIME, seq: '2' });

    const result = await verifyAndSubmit({
      xdrEnvelope,
      expectedSigner: contributor.publicKey(),
      contractId: CONTRACT_ID,
      currentLedger: CURRENT_LEDGER,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.reason).toBe('expired');
  });

  // ── Test 4: wrong contract → 403 wrong_contract ────────────────────────────

  it('4. returns 403 with reason=wrong_contract when targeting a different contract', async () => {
    const xdrEnvelope = buildTx(contributor, { contractId: WRONG_CONTRACT_ID, seq: '3' });

    const result = await verifyAndSubmit({
      xdrEnvelope,
      expectedSigner: contributor.publicKey(),
      contractId: CONTRACT_ID,
      currentLedger: CURRENT_LEDGER,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.reason).toBe('wrong_contract');
  });

  // ── Test 5: malformed XDR → 400 ────────────────────────────────────────────

  it('5. returns 400 (not 403) for malformed / non-base64 XDR', async () => {
    const result = await verifyAndSubmit({
      xdrEnvelope: '!!!this is not valid XDR base64!!!',
      expectedSigner: contributor.publicKey(),
      contractId: CONTRACT_ID,
      currentLedger: CURRENT_LEDGER,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.reason).toBe('malformed');
  });

  // ── Test 6: valid XDR proceeds to Horizon ──────────────────────────────────

  it('6. calls the submitTx function and returns the Horizon result on success', async () => {
    const xdrEnvelope = buildTx(contributor, { seq: '4' });
    const mockHorizonResponse = { id: 'abc123', successful: true };
    const submitTx = vi.fn().mockResolvedValue(mockHorizonResponse);

    const result = await verifyAndSubmit({
      xdrEnvelope,
      expectedSigner: contributor.publicKey(),
      contractId: CONTRACT_ID,
      currentLedger: CURRENT_LEDGER,
      submitTx,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(submitTx).toHaveBeenCalledOnce();
    expect(typeof submitTx.mock.calls[0][0]).toBe('string');
    expect(result.horizonResult).toEqual(mockHorizonResponse);
  });
});

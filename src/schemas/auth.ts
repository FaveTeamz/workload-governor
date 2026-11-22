/**
 * Schema types and validation guards for signed auth payloads.
 *
 * Every signed payload sent to protected endpoints must include:
 *   - nonce          — UUIDv4 or 32-byte hex string; consumed on first use.
 *   - ledger_sequence — Stellar ledger at time of signing.
 *   - max_ledger     — Expiration ledger (must be > ledger_sequence, ≤ +100).
 *
 * These fields bind a payload to a specific instant in time and guarantee
 * it cannot be re-submitted once accepted (replay protection).
 */

/** Maximum ledger advance window a client may request (~8 minutes at 5 s/ledger). */
export const MAX_LEDGER_ADVANCE = 100;

/** Regex patterns for accepted nonce formats. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX32_RE = /^[0-9a-f]{64}$/i;

export function isValidNonce(value: unknown): value is string {
  return typeof value === 'string' && (UUID_V4_RE.test(value) || HEX32_RE.test(value));
}

/**
 * The replay-protection fields that every signed payload must carry.
 * Additional domain fields (contributor, org_id, etc.) are merged in by each
 * route's own type, so this interface is kept deliberately minimal.
 */
export interface SignedPayloadBase {
  /** UUIDv4 or 64-char hex string. Consumed on first use and stored in Redis. */
  nonce: string;
  /** Stellar ledger sequence at the time the payload was signed. */
  ledger_sequence: number;
  /**
   * Latest ledger at which this payload is still valid.
   * Must satisfy: ledger_sequence < max_ledger ≤ ledger_sequence + MAX_LEDGER_ADVANCE.
   */
  max_ledger: number;
}

export interface SignedPayloadValidationError {
  field: string;
  message: string;
}

/**
 * Validate the replay-protection fields of a request body.
 * Returns an array of errors; an empty array means the fields are structurally valid.
 * This does NOT check Redis or the live ledger — that happens in replayProtection middleware.
 */
export function validateSignedPayloadBase(
  body: Record<string, unknown>,
): SignedPayloadValidationError[] {
  const errors: SignedPayloadValidationError[] = [];

  if (!isValidNonce(body.nonce)) {
    errors.push({
      field: 'nonce',
      message: 'nonce must be a UUIDv4 or 64-character hex string',
    });
  }

  const seq = body.ledger_sequence;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
    errors.push({
      field: 'ledger_sequence',
      message: 'ledger_sequence must be a positive integer',
    });
  }

  const max = body.max_ledger;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) {
    errors.push({
      field: 'max_ledger',
      message: 'max_ledger must be a positive integer',
    });
  }

  // Cross-field: window must be (0, MAX_LEDGER_ADVANCE]
  if (errors.length === 0) {
    const ledgerSeq = seq as number;
    const maxLedger = max as number;
    if (maxLedger <= ledgerSeq) {
      errors.push({
        field: 'max_ledger',
        message: 'max_ledger must be greater than ledger_sequence',
      });
    } else if (maxLedger - ledgerSeq > MAX_LEDGER_ADVANCE) {
      errors.push({
        field: 'max_ledger',
        message: `max_ledger may not exceed ledger_sequence by more than ${MAX_LEDGER_ADVANCE} ledgers`,
      });
    }
  }

  return errors;
}

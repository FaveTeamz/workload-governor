/**
 * EventValidationService.ts
 *
 * Validates decoded contract event payloads against ABI constraints and
 * data invariants before they are handed off to the EventRepository for
 * persistence.
 *
 * Zero database or network dependencies.
 *
 * Implements issue #1245: Decouple event decoding logic from database
 * persistence transactions.
 */

import type { DecodedContractEvent } from "./EventDecoderService.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Known event names emitted by the WorkloadGovernor Soroban contract.
const KNOWN_EVENT_NAMES = new Set([
  "apply",
  "withdraw",
  "assign",
  "complete",
  "revoke",
  "initialize",
  "register_maintainer",
  "upgrade",
]);

// ─── Field validators ─────────────────────────────────────────────────────────

function validateId(event: DecodedContractEvent): ValidationError[] {
  if (!event.id || typeof event.id !== "string") {
    return [{ field: "id", message: "id must be a non-empty string" }];
  }
  // Canonical format: "<ledger_seq_padded>-<event_index_padded>"
  if (!/^\d{10}-\d{10}$/.test(event.id)) {
    return [
      {
        field: "id",
        message: `id "${event.id}" does not match expected format NNNNNNNNNN-NNNNNNNNNN`,
      },
    ];
  }
  return [];
}

function validateLedger(event: DecodedContractEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Number.isInteger(event.ledger) || event.ledger < 0) {
    errors.push({ field: "ledger", message: "ledger must be a non-negative integer" });
  }
  return errors;
}

function validateTimestamp(event: DecodedContractEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!event.ledgerClosedAt || typeof event.ledgerClosedAt !== "string") {
    errors.push({ field: "ledgerClosedAt", message: "ledgerClosedAt must be a non-empty string" });
    return errors;
  }
  const ts = Date.parse(event.ledgerClosedAt);
  if (Number.isNaN(ts)) {
    errors.push({
      field: "ledgerClosedAt",
      message: `ledgerClosedAt "${event.ledgerClosedAt}" is not a valid ISO-8601 timestamp`,
    });
  }
  return errors;
}

function validateContractId(event: DecodedContractEvent): ValidationError[] {
  if (!event.contractId || typeof event.contractId !== "string") {
    return [{ field: "contractId", message: "contractId must be a non-empty string" }];
  }
  return [];
}

function validateTxHash(event: DecodedContractEvent): ValidationError[] {
  if (!event.txHash || typeof event.txHash !== "string") {
    return [{ field: "txHash", message: "txHash must be a non-empty string" }];
  }
  // SHA-256 hex: 64 hex chars
  if (!/^[0-9a-f]{64}$/i.test(event.txHash)) {
    return [
      {
        field: "txHash",
        message: `txHash "${event.txHash.slice(0, 16)}..." is not a 64-character hex string`,
      },
    ];
  }
  return [];
}

function validateTopics(event: DecodedContractEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Array.isArray(event.topics) || event.topics.length === 0) {
    errors.push({ field: "topics", message: "topics must be a non-empty array" });
  }
  return errors;
}

function validateEventName(event: DecodedContractEvent): ValidationError[] {
  const errors: ValidationError[] = [];
  if (event.eventName === null) {
    errors.push({
      field: "eventName",
      message: "first topic must be a symbol representing the event name",
    });
    return errors;
  }
  if (!KNOWN_EVENT_NAMES.has(event.eventName)) {
    // Warn-only: unknown event names are allowed to pass validation so the
    // system can ingest events from future contract upgrades without crashing.
    // Callers may inspect ValidationResult.errors for the warning.
    errors.push({
      field: "eventName",
      message: `unknown event name "${event.eventName}" — may be from a newer contract version`,
    });
  }
  return errors;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a single decoded contract event.
 *
 * Returns a ValidationResult with valid=true when all mandatory fields pass
 * their constraints. Unknown event names produce a non-fatal warning error
 * but still yield valid=true.
 */
export function validateContractEvent(event: DecodedContractEvent): ValidationResult {
  const hardErrors: ValidationError[] = [
    ...validateId(event),
    ...validateLedger(event),
    ...validateTimestamp(event),
    ...validateContractId(event),
    ...validateTxHash(event),
    ...validateTopics(event),
  ];

  const softErrors: ValidationError[] = [...validateEventName(event)];

  const errors = [...hardErrors, ...softErrors];

  return {
    valid: hardErrors.length === 0,
    errors,
  };
}

/**
 * Validate a batch of decoded events.
 *
 * Returns one ValidationResult per input event. Invalid events can be
 * identified by filtering results where valid === false.
 */
export function validateContractEvents(
  events: DecodedContractEvent[],
): Array<{ event: DecodedContractEvent; result: ValidationResult }> {
  return events.map((event) => ({ event, result: validateContractEvent(event) }));
}

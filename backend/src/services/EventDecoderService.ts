/**
 * EventDecoderService.ts
 *
 * Pure functional module that accepts raw XDR event buffers returned by the
 * Soroban RPC and returns strongly-typed DecodedContractEvent objects.
 *
 * Zero database or network dependencies — the entire module can be exercised
 * in memory using saved XDR fixtures, making unit tests fast and hermetic.
 *
 * Implements issue #1245: Decouple event decoding logic from database
 * persistence transactions.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawContractEvent {
  /** Base64-encoded XDR ContractEvent envelope */
  xdr: string;
  /** Ledger sequence in which the event was emitted */
  ledger: number;
  /** ISO-8601 close time of the ledger */
  ledgerClosedAt: string;
  /** Unique event identifier returned by the RPC (e.g. "0000500123-0000000001") */
  id: string;
  /** SHA-256 transaction hash */
  txHash: string;
  /** Zero-based index of the event within the transaction */
  eventIndex: number;
  /** Soroban contract address */
  contractId: string;
}

export type EventTopicValue =
  | { type: "symbol"; value: string }
  | { type: "address"; value: string }
  | { type: "i128"; value: bigint }
  | { type: "u32"; value: number }
  | { type: "u64"; value: bigint }
  | { type: "bool"; value: boolean }
  | { type: "bytes"; value: string }
  | { type: "unknown"; value: string };

export interface DecodedContractEvent {
  id: string;
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  eventIndex: number;
  /** First topic value, typically the event name symbol */
  eventName: string | null;
  topics: EventTopicValue[];
  /** Decoded data payload as a plain object */
  data: Record<string, unknown> | null;
  /** Raw XDR preserved for auditability */
  rawXdr: string;
}

export interface DecodeResult {
  ok: true;
  event: DecodedContractEvent;
}

export interface DecodeError {
  ok: false;
  id: string;
  error: string;
  rawXdr: string;
}

export type DecodeOutcome = DecodeResult | DecodeError;

// ─── XDR value helpers ────────────────────────────────────────────────────────

/**
 * Convert a Soroban ScVal JSON representation into a typed EventTopicValue.
 *
 * The Soroban RPC returns ScVal objects as plain JSON with a discriminant
 * "type" field and a type-specific value field. This function normalises the
 * union into a closed EventTopicValue variant.
 */
function decodeScVal(scVal: Record<string, unknown>): EventTopicValue {
  const type = scVal["type"] as string | undefined;

  switch (type) {
    case "symbol":
      return { type: "symbol", value: String(scVal["value"] ?? "") };

    case "address":
      return { type: "address", value: String(scVal["value"] ?? "") };

    case "i128": {
      const raw = scVal["value"];
      const lo = typeof raw === "object" && raw !== null ? (raw as any).lo ?? 0 : Number(raw);
      const hi = typeof raw === "object" && raw !== null ? (raw as any).hi ?? 0 : 0;
      const combined = (BigInt(hi) << 64n) | BigInt(lo);
      return { type: "i128", value: combined };
    }

    case "u32":
      return { type: "u32", value: Number(scVal["value"] ?? 0) };

    case "u64": {
      const raw = scVal["value"];
      return { type: "u64", value: BigInt(typeof raw === "string" ? raw : Number(raw)) };
    }

    case "bool":
      return { type: "bool", value: Boolean(scVal["value"]) };

    case "bytes":
      return { type: "bytes", value: String(scVal["value"] ?? "") };

    default:
      return { type: "unknown", value: JSON.stringify(scVal) };
  }
}

/**
 * Extract a plain-object representation from an ScVal map or struct.
 */
function decodeDataPayload(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw !== "object") {
    return { _value: raw };
  }

  const obj = raw as Record<string, unknown>;

  // Map variant: { type: "map", value: [{ key: ScVal, val: ScVal }] }
  if (obj["type"] === "map" && Array.isArray(obj["value"])) {
    const result: Record<string, unknown> = {};
    for (const entry of obj["value"] as Array<Record<string, unknown>>) {
      const key = entry["key"] as Record<string, unknown> | undefined;
      const val = entry["val"] as Record<string, unknown> | undefined;
      if (key && val) {
        const keyStr =
          key["type"] === "symbol" || key["type"] === "string"
            ? String(key["value"] ?? "")
            : JSON.stringify(key);
        result[keyStr] = decodeScVal(val);
      }
    }
    return result;
  }

  // Struct / vec / other — return as-is
  return obj;
}

// ─── Core decoder ─────────────────────────────────────────────────────────────

/**
 * Decode a single raw Soroban contract event.
 *
 * Accepts the JSON representation that the Soroban RPC returns for each
 * event entry (not the raw binary XDR — the RPC already parses it into JSON
 * when the `xdr_format: "base64+json"` option is used, or when the caller
 * passes the pre-parsed object alongside the raw XDR for audit storage).
 *
 * @param raw      - Raw event from the RPC
 * @param parsed   - Pre-parsed ScVal JSON (topics and data) alongside raw
 * @returns        - DecodeOutcome — either a decoded event or a structured error
 */
export function decodeContractEvent(
  raw: RawContractEvent,
  parsed: {
    topics: Array<Record<string, unknown>>;
    data: unknown;
  },
): DecodeOutcome {
  try {
    const topics = parsed.topics.map(decodeScVal);
    const data = decodeDataPayload(parsed.data);

    const firstTopic = topics[0];
    const eventName =
      firstTopic?.type === "symbol" ? firstTopic.value : null;

    return {
      ok: true,
      event: {
        id: raw.id,
        contractId: raw.contractId,
        ledger: raw.ledger,
        ledgerClosedAt: raw.ledgerClosedAt,
        txHash: raw.txHash,
        eventIndex: raw.eventIndex,
        eventName,
        topics,
        data,
        rawXdr: raw.xdr,
      },
    };
  } catch (err) {
    return {
      ok: false,
      id: raw.id,
      error: err instanceof Error ? err.message : String(err),
      rawXdr: raw.xdr,
    };
  }
}

/**
 * Decode a batch of raw Soroban contract events.
 *
 * Individual decode failures are isolated — a malformed event at position N
 * does not abort decoding of events at N+1..M. Each failure is returned as
 * a DecodeError in the results array.
 *
 * @param raws    - Array of raw events from the Soroban RPC
 * @param parseds - Corresponding pre-parsed ScVal JSON for each event
 * @returns       - Array of DecodeOutcome values, one per input event
 */
export function decodeContractEvents(
  raws: RawContractEvent[],
  parseds: Array<{ topics: Array<Record<string, unknown>>; data: unknown }>,
): DecodeOutcome[] {
  if (raws.length !== parseds.length) {
    throw new RangeError(
      `decodeContractEvents: raws.length (${raws.length}) !== parseds.length (${parseds.length})`,
    );
  }
  return raws.map((raw, i) => decodeContractEvent(raw, parseds[i]!));
}

// ─── Partition helpers ────────────────────────────────────────────────────────

/** Split a DecodeOutcome[] into successes and failures. */
export function partitionOutcomes(outcomes: DecodeOutcome[]): {
  decoded: DecodedContractEvent[];
  errors: DecodeError[];
} {
  const decoded: DecodedContractEvent[] = [];
  const errors: DecodeError[] = [];

  for (const outcome of outcomes) {
    if (outcome.ok) {
      decoded.push(outcome.event);
    } else {
      errors.push(outcome);
    }
  }

  return { decoded, errors };
}

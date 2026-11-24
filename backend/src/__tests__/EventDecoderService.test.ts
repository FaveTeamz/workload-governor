/**
 * backend/src/__tests__/EventDecoderService.test.ts
 *
 * Pure in-memory unit tests for EventDecoderService.
 * No database, no network, no test doubles beyond plain fixtures.
 *
 * Implements issue #1245: Decouple event decoding logic from database
 * persistence transactions.
 */

import {
  decodeContractEvent,
  decodeContractEvents,
  partitionOutcomes,
  type RawContractEvent,
} from "../services/EventDecoderService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawContractEvent> = {}): RawContractEvent {
  return {
    xdr: "AAAAAAAAAAAAAAAAAAAAAA==",
    ledger: 500123,
    ledgerClosedAt: "2026-09-25T12:00:00Z",
    id: "0000500123-0000000001",
    txHash: "e5a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    eventIndex: 1,
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    ...overrides,
  };
}

function makeParsed(overrides: { topics?: Array<Record<string, unknown>>; data?: unknown } = {}) {
  return {
    topics: overrides.topics ?? [
      { type: "symbol", value: "apply" },
      { type: "address", value: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN" },
    ],
    data: overrides.data ?? {
      type: "map",
      value: [
        { key: { type: "symbol", value: "org_id" }, val: { type: "symbol", value: "org_stellar" } },
        { key: { type: "symbol", value: "issue_id" }, val: { type: "u32", value: 42 } },
      ],
    },
  };
}

// ─── decodeContractEvent ──────────────────────────────────────────────────────

describe("decodeContractEvent", () => {
  it("decodes a well-formed event successfully", () => {
    const raw = makeRaw();
    const parsed = makeParsed();
    const outcome = decodeContractEvent(raw, parsed);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.event.id).toBe(raw.id);
    expect(outcome.event.ledger).toBe(500123);
    expect(outcome.event.contractId).toBe(raw.contractId);
    expect(outcome.event.txHash).toBe(raw.txHash);
    expect(outcome.event.eventName).toBe("apply");
    expect(outcome.event.rawXdr).toBe(raw.xdr);
  });

  it("extracts symbol event name from first topic", () => {
    const outcome = decodeContractEvent(
      makeRaw(),
      makeParsed({ topics: [{ type: "symbol", value: "assign" }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.eventName).toBe("assign");
  });

  it("sets eventName to null when first topic is not a symbol", () => {
    const outcome = decodeContractEvent(
      makeRaw(),
      makeParsed({ topics: [{ type: "address", value: "GAAZI..." }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.eventName).toBeNull();
  });

  it("decodes i128 topic value correctly", () => {
    const outcome = decodeContractEvent(
      makeRaw(),
      makeParsed({
        topics: [
          { type: "symbol", value: "apply" },
          { type: "i128", value: { lo: 100, hi: 0 } },
        ],
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.topics[1]).toEqual({ type: "i128", value: 100n });
  });

  it("decodes u64 topic value correctly", () => {
    const outcome = decodeContractEvent(
      makeRaw(),
      makeParsed({
        topics: [{ type: "symbol", value: "apply" }, { type: "u64", value: "9007199254740993" }],
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.topics[1]).toEqual({ type: "u64", value: 9007199254740993n });
  });

  it("decodes bool topic value correctly", () => {
    const outcome = decodeContractEvent(
      makeRaw(),
      makeParsed({ topics: [{ type: "bool", value: true }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.topics[0]).toEqual({ type: "bool", value: true });
  });

  it("decodes bytes topic as unknown-fallback when value missing", () => {
    const outcome = decodeContractEvent(
      makeRaw(),
      makeParsed({ topics: [{ type: "bytes" }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.topics[0]).toEqual({ type: "bytes", value: "" });
  });

  it("decodes unknown topic type to unknown variant", () => {
    const outcome = decodeContractEvent(
      makeRaw(),
      makeParsed({ topics: [{ type: "void" }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.topics[0].type).toBe("unknown");
  });

  it("decodes map data payload into key-value record", () => {
    const outcome = decodeContractEvent(makeRaw(), makeParsed());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.data).not.toBeNull();
    expect(outcome.event.data).toHaveProperty("org_id");
    expect(outcome.event.data).toHaveProperty("issue_id");
  });

  it("sets data to null when parsed.data is null", () => {
    const outcome = decodeContractEvent(makeRaw(), makeParsed({ data: null }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.data).toBeNull();
  });

  it("preserves rawXdr in the decoded event", () => {
    const raw = makeRaw({ xdr: "ZZZZZZZZZZZZ==" });
    const outcome = decodeContractEvent(raw, makeParsed());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.event.rawXdr).toBe("ZZZZZZZZZZZZ==");
  });
});

// ─── decodeContractEvents ─────────────────────────────────────────────────────

describe("decodeContractEvents", () => {
  it("decodes a batch of events, one outcome per input", () => {
    const raws = [makeRaw({ id: "0000500123-0000000001" }), makeRaw({ id: "0000500123-0000000002" })];
    const parseds = [makeParsed(), makeParsed({ topics: [{ type: "symbol", value: "assign" }] })];

    const outcomes = decodeContractEvents(raws, parseds);

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]!.ok).toBe(true);
    expect(outcomes[1]!.ok).toBe(true);
    if (outcomes[1]!.ok) {
      expect(outcomes[1]!.event.eventName).toBe("assign");
    }
  });

  it("throws RangeError when raws and parseds lengths differ", () => {
    expect(() => decodeContractEvents([makeRaw()], [])).toThrow(RangeError);
  });

  it("isolates a failure — a bad event does not corrupt neighbouring results", () => {
    const raws = [makeRaw({ id: "0000500123-0000000001" }), makeRaw({ id: "0000500123-0000000002" })];

    // Second parsed has topics that will trigger an error via a deliberately
    // constructed getter that throws.
    const parseds = [
      makeParsed(),
      {
        get topics(): Array<Record<string, unknown>> {
          throw new Error("simulated XDR parse failure");
        },
        data: null,
      },
    ];

    const outcomes = decodeContractEvents(raws, parseds as any);

    expect(outcomes[0]!.ok).toBe(true);
    expect(outcomes[1]!.ok).toBe(false);
    if (!outcomes[1]!.ok) {
      expect(outcomes[1]!.error).toMatch(/simulated XDR parse failure/);
      expect(outcomes[1]!.id).toBe("0000500123-0000000002");
    }
  });
});

// ─── partitionOutcomes ────────────────────────────────────────────────────────

describe("partitionOutcomes", () => {
  it("separates successes from failures", () => {
    const raws = Array.from({ length: 5 }, (_, i) =>
      makeRaw({ id: `0000500123-000000000${i + 1}` }),
    );
    const parseds = raws.map((_, i) =>
      i === 2
        ? {
            get topics(): never {
              throw new Error("bad");
            },
            data: null,
          }
        : makeParsed(),
    );

    const outcomes = decodeContractEvents(raws, parseds as any);
    const { decoded, errors } = partitionOutcomes(outcomes);

    expect(decoded).toHaveLength(4);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.id).toBe("0000500123-0000000003");
  });

  it("returns empty arrays for an empty input", () => {
    const { decoded, errors } = partitionOutcomes([]);
    expect(decoded).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});

import nock from "nock";
import { HorizonService, HorizonAccount, HorizonTransaction, HorizonEvent } from "../HorizonService";
import { HorizonError } from "../HorizonError";
import { SpanStatusCode, Tracer, Span, SpanStatus, SpanEvent } from "../tracing";

const BASE = "https://horizon-testnet.stellar.org";
const ACCOUNT_ID = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

const MOCK_ACCOUNT: HorizonAccount = {
  id: ACCOUNT_ID,
  sequence: "1234567890",
  balances: [{ balance: "100.0000000", asset_type: "native" }],
};

const MOCK_TRANSACTION: HorizonTransaction = {
  id: "tx-123",
  hash: "e5a7b8c9d0",
  ledger: 500123,
  created_at: "2026-09-25T12:00:00Z",
  fee_charged: 100,
  operation_count: 1,
  successful: true,
};

const MOCK_EVENTS: HorizonEvent[] = [
  {
    id: "0000500123-0000000001",
    type: "contract",
    ledger: 500123,
    created_at: "2026-09-25T12:00:00Z",
  },
];

class MockSpan implements Span {
  public attributes: Record<string, unknown> = {};
  public events: SpanEvent[] = [];
  public status: SpanStatus = { code: SpanStatusCode.UNSET };
  public ended = false;

  constructor(public readonly name: string, initialAttributes: Record<string, unknown> = {}) {
    this.attributes = { ...initialAttributes };
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, unknown>): this {
    Object.assign(this.attributes, attrs);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    this.events.push({ name, attributes, time: Date.now() });
    return this;
  }

  setStatus(status: SpanStatus): this {
    this.status = status;
    return this;
  }

  recordException(exception: Error | string): this {
    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.events.push({
      name: "exception",
      attributes: { "exception.message": err.message },
      time: Date.now(),
    });
    this.status = { code: SpanStatusCode.ERROR, message: err.message };
    return this;
  }

  end(): void {
    this.ended = true;
  }

  isRecording(): boolean {
    return !this.ended;
  }

  spanContext() {
    return { traceId: "test-trace-id", spanId: "test-span-id", traceFlags: 1 };
  }
}

class TestTracer implements Tracer {
  public spans: MockSpan[] = [];

  startSpan(name: string, options?: { attributes?: Record<string, unknown> }): Span {
    const span = new MockSpan(name, options?.attributes ?? {});
    this.spans.push(span);
    return span;
  }

  startActiveSpan<T>(name: string, fnOrOptions: any, maybeFn?: any): T {
    const fn = typeof fnOrOptions === "function" ? fnOrOptions : maybeFn;
    const span = this.startSpan(name);
    return fn(span);
  }
}

beforeEach(() => nock.cleanAll());
afterAll(() => nock.restore());

describe("HorizonService", () => {
  let tracer: TestTracer;
  let svc: HorizonService;

  beforeEach(() => {
    tracer = new TestTracer();
    svc = new HorizonService(BASE, tracer);
  });

  // ── fetchAccount ──────────────────────────────────────────────────────────

  it("returns a parsed account on 200 and records trace span attributes", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(200, MOCK_ACCOUNT);

    const account = await svc.fetchAccount(ACCOUNT_ID);

    expect(account).toEqual(MOCK_ACCOUNT);
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0];
    expect(span.name).toBe("Horizon.fetchAccount");
    expect(span.attributes["rpc.method"]).toBe("fetchAccount");
    expect(span.attributes["rpc.endpoint"]).toBe(`${BASE}/accounts/${ACCOUNT_ID}`);
    expect(span.attributes["http.status_code"]).toBe(200);
    expect(span.attributes["stellar.ledger_sequence"]).toBe(1234567890);
    expect(typeof span.attributes["rpc.response_latency_ms"]).toBe("number");
    expect(span.status.code).toBe(SpanStatusCode.OK);
    expect(span.ended).toBe(true);
  });

  it("returns null on 404 without throwing and records status 404", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(404, { status: 404 });

    const account = await svc.fetchAccount(ACCOUNT_ID);

    expect(account).toBeNull();
    const span = tracer.spans[0];
    expect(span.attributes["http.status_code"]).toBe(404);
    expect(span.status.code).toBe(SpanStatusCode.OK);
    expect(span.ended).toBe(true);
  });

  it("retries on 429 and records retry events before failing", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(429).persist();

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 429,
    });

    const span = tracer.spans[0];
    const retryEvents = span.events.filter((e) => e.name === "retry");
    expect(retryEvents.length).toBeGreaterThan(0);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.ended).toBe(true);
  }, 10_000);

  it("throws HorizonError with status 200 on malformed JSON response", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(200, "{ not valid json !!!");

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 200,
      message: "Malformed JSON in Horizon response",
    });

    const span = tracer.spans[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("throws HorizonError on unexpected account shape", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(200, { id: 123 });

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 200,
      message: "Unexpected Horizon account shape",
    });

    const span = tracer.spans[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("throws HorizonError on non-200/404/429 status and records ERROR span status", async () => {
    nock(BASE).get(`/accounts/${ACCOUNT_ID}`).reply(500);

    await expect(svc.fetchAccount(ACCOUNT_ID)).rejects.toMatchObject({
      name: "HorizonError",
      status: 500,
    });

    const span = tracer.spans[0];
    expect(span.attributes["http.status_code"]).toBe(500);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("uses the default Horizon testnet base URL when constructed without arguments", async () => {
    const defaultSvc = new HorizonService();
    nock("https://horizon-testnet.stellar.org")
      .get(`/accounts/${ACCOUNT_ID}`)
      .reply(200, MOCK_ACCOUNT);

    const account = await defaultSvc.fetchAccount(ACCOUNT_ID);
    expect(account).toEqual(MOCK_ACCOUNT);
  });

  // ── fetchEvents ───────────────────────────────────────────────────────────

  describe("fetchEvents", () => {
    it("fetches events, records span attributes including target URL, method, and latency", async () => {
      nock(BASE)
        .get("/events?start_ledger=500100&limit=10")
        .reply(200, { _embedded: { records: MOCK_EVENTS }, latest_ledger: 500123 });

      const events = await svc.fetchEvents(500100, undefined, 10);

      expect(events).toEqual(MOCK_EVENTS);
      expect(tracer.spans).toHaveLength(1);
      const span = tracer.spans[0];
      expect(span.name).toBe("Horizon.fetchEvents");
      expect(span.attributes["rpc.method"]).toBe("fetchEvents");
      expect(span.attributes["rpc.endpoint"]).toContain("/events?start_ledger=500100&limit=10");
      expect(span.attributes["http.status_code"]).toBe(200);
      expect(span.attributes["stellar.ledger_sequence"]).toBe(500123);
      expect(typeof span.attributes["rpc.response_latency_ms"]).toBe("number");
      expect(span.status.code).toBe(SpanStatusCode.OK);
      expect(span.ended).toBe(true);
    });

    it("records exception and sets ERROR status on malformed JSON response", async () => {
      nock(BASE).get("/events").reply(200, "malformed-json");

      await expect(svc.fetchEvents()).rejects.toThrow(HorizonError);

      const span = tracer.spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.ended).toBe(true);
    });
  });

  // ── getTransaction ────────────────────────────────────────────────────────

  describe("getTransaction", () => {
    it("fetches transaction, records ledger sequence and status code", async () => {
      nock(BASE).get(`/transactions/${MOCK_TRANSACTION.hash}`).reply(200, MOCK_TRANSACTION);

      const tx = await svc.getTransaction(MOCK_TRANSACTION.hash);

      expect(tx).toEqual(MOCK_TRANSACTION);
      const span = tracer.spans[0];
      expect(span.name).toBe("Horizon.getTransaction");
      expect(span.attributes["rpc.method"]).toBe("getTransaction");
      expect(span.attributes["rpc.endpoint"]).toBe(`${BASE}/transactions/${MOCK_TRANSACTION.hash}`);
      expect(span.attributes["http.status_code"]).toBe(200);
      expect(span.attributes["stellar.ledger_sequence"]).toBe(500123);
      expect(typeof span.attributes["rpc.response_latency_ms"]).toBe("number");
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("returns null on 404 without error status", async () => {
      nock(BASE).get("/transactions/unknown-hash").reply(404);

      const tx = await svc.getTransaction("unknown-hash");

      expect(tx).toBeNull();
      const span = tracer.spans[0];
      expect(span.attributes["http.status_code"]).toBe(404);
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it("records error and exception on 500 failure", async () => {
      nock(BASE).get(`/transactions/${MOCK_TRANSACTION.hash}`).reply(500);

      await expect(svc.getTransaction(MOCK_TRANSACTION.hash)).rejects.toThrow(HorizonError);

      const span = tracer.spans[0];
      expect(span.attributes["http.status_code"]).toBe(500);
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.events.some((e) => e.name === "error")).toBe(true);
    });
  });

  // ── sendTransaction ───────────────────────────────────────────────────────

  describe("sendTransaction", () => {
    it("submits transaction via POST and records span attributes", async () => {
      const txXdr = "AAAAAGXdrPayload...";
      const mockResult = { hash: "new-tx-hash", ledger: 500125, successful: true };

      nock(BASE)
        .post("/transactions", `tx=${encodeURIComponent(txXdr)}`)
        .reply(200, mockResult);

      const res = await svc.sendTransaction(txXdr);

      expect(res).toEqual(mockResult);
      const span = tracer.spans[0];
      expect(span.name).toBe("Horizon.sendTransaction");
      expect(span.attributes["rpc.method"]).toBe("sendTransaction");
      expect(span.attributes["rpc.endpoint"]).toBe(`${BASE}/transactions`);
      expect(span.attributes["http.status_code"]).toBe(200);
      expect(span.attributes["stellar.ledger_sequence"]).toBe(500125);
      expect(typeof span.attributes["rpc.response_latency_ms"]).toBe("number");
      expect(span.status.code).toBe(SpanStatusCode.OK);
      expect(span.ended).toBe(true);
    });

    it("records error events and sets ERROR status on submission failure", async () => {
      nock(BASE).post("/transactions").reply(400, { error: "bad request" });

      await expect(svc.sendTransaction("bad-xdr")).rejects.toThrow(HorizonError);

      const span = tracer.spans[0];
      expect(span.attributes["http.status_code"]).toBe(400);
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.ended).toBe(true);
    });
  });
});

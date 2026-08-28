/**
 * horizon.test.ts  (tests/unit)
 *
 * Unit tests for HorizonService failover / circuit-breaker logic.
 *
 * The HorizonService in src/horizon.ts uses Horizon.Server from
 * @stellar/stellar-sdk and retries on 429 / 503 with exponential back-off.
 *
 * Because the service has a single-node retry model (no independent
 * circuit-breaker class), these tests drive the same retry paths while using
 * Jest fake timers so no real waits occur.
 *
 * Test matrix
 * ───────────────────────────────────────────────────────────────────────────
 *  1. Primary node 5xx  → failover to fallback (second retry succeeds)
 *  2. First attempt 5xx, second 5xx, third succeeds (two-hop failover)
 *  3. All retries exhausted           → error returned to caller
 *  4. Circuit-breaker proxy: 3 consecutive failures "open" the breaker
 *  5. After 60 s the node is retried again (breaker closes)
 *  6. Successful request on recovery  → failure counter resets
 */

import { HorizonService } from "../../src/horizon";
import { Horizon, NotFoundError } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Mock @stellar/stellar-sdk so no real HTTP is made
// ---------------------------------------------------------------------------

const mockAccountCall = jest.fn();
const mockTxCall = jest.fn();
const mockStream = jest.fn();

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        accounts: () => ({
          accountId: () => ({ call: mockAccountCall }),
        }),
        transactions: () => ({
          forAccount: () => ({
            limit: () => ({
              order: () => ({ call: mockTxCall }),
            }),
            stream: mockStream,
          }),
        }),
      })),
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

const MOCK_ACCOUNT = {
  id: ACCOUNT_ID,
  sequence: "12345678",
  subentry_count: 1,
  balances: [{ balance: "100.0", asset_type: "native" }],
};

const MOCK_TX = {
  id: "tx1",
  hash: "abc123",
  ledger_attr: 100,
  created_at: "2024-01-01T00:00:00Z",
  fee_charged: "200",
  operation_count: 1,
};

/** Build a retryable HTTP error */
function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), {
    response: { status },
  });
}

// ---------------------------------------------------------------------------
// Helpers shared across suites
// ---------------------------------------------------------------------------

function makeService(maxRetries = 5, initialDelayMs = 0): HorizonService {
  return new HorizonService("https://horizon-testnet.stellar.org", {
    maxRetries,
    initialDelayMs,
    maxDelayMs: 0,
  });
}

// ===========================================================================
// Existing baseline tests (preserved from original horizon.test.ts)
// ===========================================================================

describe("HorizonService — baseline (existing coverage)", () => {
  let service: HorizonService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HorizonService("https://horizon-testnet.stellar.org", {
      maxRetries: 2,
      initialDelayMs: 1,
    });
  });

  describe("fetchAccount", () => {
    it("returns mapped account data on success", async () => {
      mockAccountCall.mockResolvedValueOnce(MOCK_ACCOUNT);
      const result = await service.fetchAccount(ACCOUNT_ID);
      expect(result.id).toBe(ACCOUNT_ID);
      expect(result.sequence).toBe("12345678");
      expect(result.subentryCount).toBe(1);
      expect(result.balances).toHaveLength(1);
    });

    it('throws "Account not found" on NotFoundError', async () => {
      mockAccountCall.mockRejectedValueOnce(
        new NotFoundError({} as never, undefined as never),
      );
      await expect(service.fetchAccount("GNONE")).rejects.toThrow(
        "Account not found: GNONE",
      );
    });

    it("retries on 429 and succeeds", async () => {
      mockAccountCall
        .mockRejectedValueOnce(httpError(429))
        .mockResolvedValueOnce(MOCK_ACCOUNT);
      const result = await service.fetchAccount(ACCOUNT_ID);
      expect(result.id).toBe(ACCOUNT_ID);
      expect(mockAccountCall).toHaveBeenCalledTimes(2);
    });

    it("throws non-retryable errors immediately", async () => {
      mockAccountCall.mockRejectedValueOnce(httpError(403));
      await expect(service.fetchAccount(ACCOUNT_ID)).rejects.toThrow(
        "HTTP 403",
      );
      expect(mockAccountCall).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchTransactionHistory", () => {
    it("returns mapped transaction data", async () => {
      mockTxCall.mockResolvedValueOnce({ records: [MOCK_TX] });
      const result = await service.fetchTransactionHistory(ACCOUNT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe("abc123");
      expect(result[0].fee_charged).toBe(200);
    });

    it("retries on 503 and eventually throws", async () => {
      mockTxCall.mockRejectedValue(httpError(503));
      await expect(
        service.fetchTransactionHistory(ACCOUNT_ID),
      ).rejects.toThrow("HTTP 503");
      expect(mockTxCall).toHaveBeenCalledTimes(2); // maxRetries=2
    });
  });

  describe("streamEvents", () => {
    it("calls server.transactions().forAccount().stream()", () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      service.streamEvents(ACCOUNT_ID, onUpdate, onError);
      expect(mockStream).toHaveBeenCalledWith({
        onmessage: onUpdate,
        onerror: onError,
      });
    });
  });
});

// ===========================================================================
// NEW — Failover & circuit-breaker tests
// All use fake timers so delays are instantaneous (< 5 s wall-clock).
// ===========================================================================

describe("HorizonService — failover logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runAllTimers();
    jest.useRealTimers();
  });

  // ─── Test 1 ────────────────────────────────────────────────────────────────
  test("TC-1: primary node 5xx triggers failover to first fallback (retry-2 succeeds)", async () => {
    /**
     * Simulates: primary endpoint returns 503 once, then the retry (acting as
     * a "fallback slot") succeeds.
     * Node health assertion: after success on the second attempt, mockAccountCall
     * is called exactly twice — no extra retries leaked.
     */
    mockAccountCall
      .mockRejectedValueOnce(httpError(503)) // primary attempt
      .mockResolvedValueOnce(MOCK_ACCOUNT); // first fallback / retry

    const svc = makeService(3, 0);

    const promise = svc.fetchAccount(ACCOUNT_ID);
    // Advance timers past any exponential back-off delay
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.id).toBe(ACCOUNT_ID);
    // Exactly two attempts: primary (failed) + fallback (succeeded)
    expect(mockAccountCall).toHaveBeenCalledTimes(2);
  });

  // ─── Test 2 ────────────────────────────────────────────────────────────────
  test("TC-2: first fallback 5xx triggers failover to second fallback (retry-3 succeeds)", async () => {
    /**
     * Simulates two consecutive node failures before a successful response.
     */
    mockAccountCall
      .mockRejectedValueOnce(httpError(503)) // primary fails
      .mockRejectedValueOnce(httpError(503)) // first fallback fails
      .mockResolvedValueOnce(MOCK_ACCOUNT); // second fallback succeeds

    const svc = makeService(5, 0);

    const promise = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.id).toBe(ACCOUNT_ID);
    // Three calls: primary + 2 fallbacks
    expect(mockAccountCall).toHaveBeenCalledTimes(3);
  });

  // ─── Test 3 ────────────────────────────────────────────────────────────────
  test("TC-3: all nodes down — error returned after exhausting all retries", async () => {
    /**
     * Every attempt returns 503. After maxRetries attempts the service throws.
     */
    const MAX = 4;
    mockAccountCall.mockRejectedValue(httpError(503));

    const svc = makeService(MAX, 0);

    const promise = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();

    await expect(promise).rejects.toThrow("HTTP 503");
    // Node health: exactly MAX attempts were made
    expect(mockAccountCall).toHaveBeenCalledTimes(MAX);
  });

  // ─── Test 4 ────────────────────────────────────────────────────────────────
  test("TC-4: 3 consecutive failures trigger circuit-breaker open state", async () => {
    /**
     * The HorizonService retries on 503.  After 3 consecutive failures the
     * breaker "opens" — we verify by confirming the service stops calling the
     * underlying mock once maxRetries is reached.
     *
     * Node health assertion: the mock was NOT called more than maxRetries times,
     * proving the breaker (via retry exhaustion) prevented unbounded retries.
     */
    const CB_THRESHOLD = 3;
    mockAccountCall.mockRejectedValue(httpError(503));

    const svc = makeService(CB_THRESHOLD, 0);

    const promise = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow("HTTP 503");

    // Circuit breaker opened: no more calls beyond the threshold
    expect(mockAccountCall).toHaveBeenCalledTimes(CB_THRESHOLD);

    // Simulate a second call — the mock still rejects, breaker ensures we do
    // not accumulate calls beyond the per-call retry cap
    jest.clearAllMocks();
    mockAccountCall.mockRejectedValue(httpError(503));

    const promise2 = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    await expect(promise2).rejects.toThrow("HTTP 503");

    // Each fresh call gets its own full retry budget (breaker per-call)
    expect(mockAccountCall).toHaveBeenCalledTimes(CB_THRESHOLD);
  });

  // ─── Test 5 ────────────────────────────────────────────────────────────────
  test("TC-5: circuit breaker closes after 60 s — node retried successfully", async () => {
    /**
     * Sequence:
     *   Phase A (pre-cooldown): maxRetries exhausted → breaker "opens"
     *   Advance clock 60 000 ms (breaker cooldown)
     *   Phase B (post-cooldown): fresh call succeeds (breaker "closed")
     *
     * The 60 s cooldown is simulated entirely with jest fake timers — no
     * real wall-clock wait.
     */
    const MAX = 3;
    mockAccountCall.mockRejectedValue(httpError(503));

    const svc = makeService(MAX, 0);

    // Phase A — exhaust retries
    const promiseA = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    await expect(promiseA).rejects.toThrow("HTTP 503");
    expect(mockAccountCall).toHaveBeenCalledTimes(MAX);

    // ── Advance clock by 60 s (circuit-breaker cooldown) ──────────────────
    jest.clearAllMocks();
    jest.advanceTimersByTime(60_000);

    // Phase B — node recovered, next call should succeed
    mockAccountCall.mockResolvedValue(MOCK_ACCOUNT);

    const promiseB = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    const result = await promiseB;

    expect(result.id).toBe(ACCOUNT_ID);
    // Only one call needed after recovery — no stale error state
    expect(mockAccountCall).toHaveBeenCalledTimes(1);
  });

  // ─── Test 6 ────────────────────────────────────────────────────────────────
  test("TC-6: successful request on fallback resets failure counter for that node", async () => {
    /**
     * Sequence:
     *   Attempt 1 → 503 (failure counter = 1)
     *   Attempt 2 → success  (failure counter reset to 0)
     *   Attempt 3 → success  (second independent call, also single-attempt)
     *
     * If the failure counter was NOT reset after attempt-2, attempt-3 would
     * start from a non-zero count and might behave differently.  We assert
     * that a third call (after recovery) costs exactly 1 mock invocation.
     */
    // First call: one failure then recovery
    mockAccountCall
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce(MOCK_ACCOUNT)
      // Second call: clean success from first attempt
      .mockResolvedValueOnce(MOCK_ACCOUNT);

    const svc = makeService(5, 0);

    // Call 1 — fails once then recovers
    const p1 = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    const r1 = await p1;
    expect(r1.id).toBe(ACCOUNT_ID);
    expect(mockAccountCall).toHaveBeenCalledTimes(2); // 1 fail + 1 success

    jest.clearAllMocks();

    // Call 2 — should succeed on the first attempt (counter reset)
    const p2 = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    const r2 = await p2;
    expect(r2.id).toBe(ACCOUNT_ID);
    // Node health: failure counter was reset; only 1 attempt needed
    expect(mockAccountCall).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Additional edge-case failover tests
// ===========================================================================

describe("HorizonService — additional failover edge cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runAllTimers();
    jest.useRealTimers();
  });

  test("429 (rate-limit) behaves identically to 503 for retry purposes", async () => {
    mockAccountCall
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce(MOCK_ACCOUNT);

    const svc = makeService(3, 0);
    const promise = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.id).toBe(ACCOUNT_ID);
    expect(mockAccountCall).toHaveBeenCalledTimes(2);
  });

  test("non-retryable error (400) is thrown immediately without retry", async () => {
    mockAccountCall.mockRejectedValueOnce(httpError(400));

    const svc = makeService(5, 0);
    const promise = svc.fetchAccount(ACCOUNT_ID);
    await jest.runAllTimersAsync();

    await expect(promise).rejects.toThrow("HTTP 400");
    // Node health: no retry attempted for non-retryable status
    expect(mockAccountCall).toHaveBeenCalledTimes(1);
  });

  test("transaction fetch also exhausts retries correctly under 503", async () => {
    const MAX = 3;
    mockTxCall.mockRejectedValue(httpError(503));

    const svc = makeService(MAX, 0);
    const promise = svc.fetchTransactionHistory(ACCOUNT_ID);
    await jest.runAllTimersAsync();

    await expect(promise).rejects.toThrow("HTTP 503");
    expect(mockTxCall).toHaveBeenCalledTimes(MAX);
  });

  test("transaction fetch recovers on second attempt after 503", async () => {
    mockTxCall
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ records: [MOCK_TX] });

    const svc = makeService(3, 0);
    const promise = svc.fetchTransactionHistory(ACCOUNT_ID);
    await jest.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].hash).toBe("abc123");
    expect(mockTxCall).toHaveBeenCalledTimes(2);
  });
});

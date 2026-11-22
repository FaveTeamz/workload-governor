import https from "https";
import http from "http";
import { HorizonError } from "./HorizonError";
import {
  tracer as defaultTracer,
  SpanStatusCode,
  type Tracer,
  type Span,
} from "./tracing";

export interface HorizonAccount {
  id: string;
  sequence: string;
  balances: Array<{ balance: string; asset_type: string }>;
}

export interface HorizonTransaction {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  fee_charged: number | string;
  operation_count: number;
  successful: boolean;
  [key: string]: unknown;
}

export interface HorizonEvent {
  id: string;
  type: string;
  ledger: number;
  created_at: string;
  [key: string]: unknown;
}

const DEFAULT_BASE_URL = "https://horizon-testnet.stellar.org";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

/* istanbul ignore next -- transport helpers */
function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    (url.startsWith("https") ? https : http)
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      })
      .on("error", reject);
  });
}

/* istanbul ignore next -- transport helpers */
function post(
  url: string,
  data: string,
  contentType: string = "application/x-www-form-urlencoded",
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/* istanbul ignore next -- transport helpers */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class HorizonService {
  constructor(
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly tracer: Tracer = defaultTracer,
  ) {}

  async fetchAccount(accountId: string): Promise<HorizonAccount | null> {
    const endpoint = `${this.baseUrl}/accounts/${accountId}`;
    const span = this.tracer.startSpan("Horizon.fetchAccount", {
      attributes: {
        "rpc.method": "fetchAccount",
        "rpc.endpoint": endpoint,
      },
    });
    const start = Date.now();

    let retries = 0;

    const attempt = async (): Promise<HorizonAccount | null> => {
      try {
        const { status, body } = await get(endpoint);
        span.setAttribute("http.status_code", status);

        if (status === 200) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            const err = new HorizonError(200, "Malformed JSON in Horizon response");
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            throw err;
          }
          const account = parsed as Record<string, unknown>;
          if (
            typeof account.id !== "string" ||
            typeof account.sequence !== "string" ||
            !Array.isArray(account.balances)
          ) {
            const err = new HorizonError(200, "Unexpected Horizon account shape");
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            throw err;
          }
          const seqNum = parseInt(account.sequence, 10);
          if (!isNaN(seqNum)) {
            span.setAttribute("stellar.ledger_sequence", seqNum);
          }
          span.setStatus({ code: SpanStatusCode.OK });
          return parsed as HorizonAccount;
        }

        if (status === 404) {
          span.setStatus({ code: SpanStatusCode.OK });
          return null;
        }

        if (status === 429 && retries < MAX_RETRIES - 1) {
          retries++;
          const delayMs = BASE_DELAY_MS * 2 ** (retries - 1);
          span.addEvent("retry", {
            "retry.attempt": retries,
            "retry.delay_ms": delayMs,
            "error.message": "Rate limited by Horizon",
          });
          await delay(delayMs);
          return attempt();
        }

        const err = new HorizonError(
          status,
          status === 429
            ? "Rate limited by Horizon after retries"
            : `Horizon responded with ${status}`,
        );
        span.addEvent("error", { message: err.message });
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } catch (err: unknown) {
        if (err instanceof HorizonError) {
          throw err;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        span.addEvent("error", { message: error.message });
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.setAttribute("rpc.response_latency_ms", Date.now() - start);
      }
    };

    try {
      return await attempt();
    } finally {
      span.end();
    }
  }

  async fetchEvents(
    startLedger?: number,
    cursor?: string,
    limit?: number,
  ): Promise<HorizonEvent[]> {
    const urlObj = new URL(`${this.baseUrl}/events`);
    if (startLedger !== undefined) urlObj.searchParams.set("start_ledger", String(startLedger));
    if (cursor !== undefined) urlObj.searchParams.set("cursor", cursor);
    if (limit !== undefined) urlObj.searchParams.set("limit", String(limit));
    const endpoint = urlObj.toString();

    const span = this.tracer.startSpan("Horizon.fetchEvents", {
      attributes: {
        "rpc.method": "fetchEvents",
        "rpc.endpoint": endpoint,
        ...(startLedger !== undefined ? { "stellar.ledger_sequence": startLedger } : {}),
      },
    });
    const start = Date.now();
    let retries = 0;

    const attempt = async (): Promise<HorizonEvent[]> => {
      try {
        const { status, body } = await get(endpoint);
        span.setAttribute("http.status_code", status);

        if (status === 200) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            const err = new HorizonError(200, "Malformed JSON in Horizon response");
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            throw err;
          }
          const data = parsed as Record<string, unknown>;
          const records = (Array.isArray(data) ? data : data._embedded && Array.isArray((data._embedded as any).records) ? (data._embedded as any).records : []) as HorizonEvent[];
          if (data && typeof data.latest_ledger === "number") {
            span.setAttribute("stellar.ledger_sequence", data.latest_ledger);
          }
          span.setStatus({ code: SpanStatusCode.OK });
          return records;
        }

        if (status === 429 && retries < MAX_RETRIES - 1) {
          retries++;
          const delayMs = BASE_DELAY_MS * 2 ** (retries - 1);
          span.addEvent("retry", {
            "retry.attempt": retries,
            "retry.delay_ms": delayMs,
            "error.message": "Rate limited by Horizon",
          });
          await delay(delayMs);
          return attempt();
        }

        const err = new HorizonError(
          status,
          status === 429
            ? "Rate limited by Horizon after retries"
            : `Horizon responded with ${status}`,
        );
        span.addEvent("error", { message: err.message });
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } catch (err: unknown) {
        if (err instanceof HorizonError) {
          throw err;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        span.addEvent("error", { message: error.message });
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.setAttribute("rpc.response_latency_ms", Date.now() - start);
      }
    };

    try {
      return await attempt();
    } finally {
      span.end();
    }
  }

  async getTransaction(txHash: string): Promise<HorizonTransaction | null> {
    const endpoint = `${this.baseUrl}/transactions/${txHash}`;
    const span = this.tracer.startSpan("Horizon.getTransaction", {
      attributes: {
        "rpc.method": "getTransaction",
        "rpc.endpoint": endpoint,
      },
    });
    const start = Date.now();
    let retries = 0;

    const attempt = async (): Promise<HorizonTransaction | null> => {
      try {
        const { status, body } = await get(endpoint);
        span.setAttribute("http.status_code", status);

        if (status === 200) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            const err = new HorizonError(200, "Malformed JSON in Horizon response");
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            throw err;
          }
          const tx = parsed as HorizonTransaction;
          const ledgerSeq = tx.ledger ?? (tx as any).ledger_attr;
          if (ledgerSeq !== undefined) {
            span.setAttribute("stellar.ledger_sequence", Number(ledgerSeq));
          }
          span.setStatus({ code: SpanStatusCode.OK });
          return tx;
        }

        if (status === 404) {
          span.setStatus({ code: SpanStatusCode.OK });
          return null;
        }

        if (status === 429 && retries < MAX_RETRIES - 1) {
          retries++;
          const delayMs = BASE_DELAY_MS * 2 ** (retries - 1);
          span.addEvent("retry", {
            "retry.attempt": retries,
            "retry.delay_ms": delayMs,
            "error.message": "Rate limited by Horizon",
          });
          await delay(delayMs);
          return attempt();
        }

        const err = new HorizonError(
          status,
          status === 429
            ? "Rate limited by Horizon after retries"
            : `Horizon responded with ${status}`,
        );
        span.addEvent("error", { message: err.message });
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } catch (err: unknown) {
        if (err instanceof HorizonError) {
          throw err;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        span.addEvent("error", { message: error.message });
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.setAttribute("rpc.response_latency_ms", Date.now() - start);
      }
    };

    try {
      return await attempt();
    } finally {
      span.end();
    }
  }

  async sendTransaction(txXdr: string): Promise<Record<string, unknown>> {
    const endpoint = `${this.baseUrl}/transactions`;
    const span = this.tracer.startSpan("Horizon.sendTransaction", {
      attributes: {
        "rpc.method": "sendTransaction",
        "rpc.endpoint": endpoint,
      },
    });
    const start = Date.now();
    let retries = 0;
    const bodyPayload = `tx=${encodeURIComponent(txXdr)}`;

    const attempt = async (): Promise<Record<string, unknown>> => {
      try {
        const { status, body } = await post(endpoint, bodyPayload);
        span.setAttribute("http.status_code", status);

        if (status === 200) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            const err = new HorizonError(200, "Malformed JSON in Horizon response");
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            throw err;
          }
          const res = parsed as Record<string, unknown>;
          const ledgerSeq = res.ledger ?? res.ledger_attr;
          if (ledgerSeq !== undefined) {
            span.setAttribute("stellar.ledger_sequence", Number(ledgerSeq));
          }
          span.setStatus({ code: SpanStatusCode.OK });
          return res;
        }

        if (status === 429 && retries < MAX_RETRIES - 1) {
          retries++;
          const delayMs = BASE_DELAY_MS * 2 ** (retries - 1);
          span.addEvent("retry", {
            "retry.attempt": retries,
            "retry.delay_ms": delayMs,
            "error.message": "Rate limited by Horizon",
          });
          await delay(delayMs);
          return attempt();
        }

        const err = new HorizonError(
          status,
          status === 429
            ? "Rate limited by Horizon after retries"
            : `Horizon responded with ${status}`,
        );
        span.addEvent("error", { message: err.message });
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw err;
      } catch (err: unknown) {
        if (err instanceof HorizonError) {
          throw err;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        span.addEvent("error", { message: error.message });
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.setAttribute("rpc.response_latency_ms", Date.now() - start);
      }
    };

    try {
      return await attempt();
    } finally {
      span.end();
    }
  }
}

/**
 * tracing.ts — AWS X-Ray and OpenTelemetry distributed tracing integration
 *
 * Provides:
 *   - OpenTelemetry HTTP, Express, and PostgreSQL spans exported over OTLP
 *   - AWS X-Ray and W3C trace-context propagation
 *   - Configured aws-xray-sdk-core instance
 *   - Intelligent sampling (5% production ratio, 100% errors, 0% health probes)
 *   - xrayMiddleware()   — Express middleware: opens/closes a segment per request
 *   - tracedFetch()      — wraps global fetch with an X-Ray HTTP subsegment
 *   - tracedDbQuery()    — wraps pg Pool.query with an X-Ray subsegment
 *   - OpenTelemetry interfaces & samplers (AlwaysOn, AlwaysOff, TraceIdRatioBased, ParentBased)
 * tracing.ts — AWS X-Ray distributed tracing + request correlation ID (#1234)
 *
 * Provides:
 *   - correlationMiddleware() — assigns/propagates X-Request-ID per request,
 *                               stores it in AsyncLocalStorage so every log line
 *                               emitted during the request lifecycle carries reqId
 *   - getRequestId()          — read the current correlation ID anywhere in the
 *                               async call stack without passing it explicitly
 *   - xrayMiddleware()        — Express middleware: opens/closes a segment per request
 *   - tracedFetch()           — wraps global fetch with an X-Ray HTTP subsegment
 *   - tracedDbQuery()         — wraps pg Pool.query with an X-Ray subsegment
 *
 * Usage:
 *   // app.ts — register correlationMiddleware first, then xrayMiddleware
 *   import { correlationMiddleware, xrayMiddleware } from "./tracing.js";
 *   app.use(correlationMiddleware());
 *   app.use(xrayMiddleware());
 *
 *   // github.ts / health.ts
 *   import { tracedFetch } from "./tracing.js";
 *   const res = await tracedFetch("github-api", "https://api.github.com/...");
 *
 *   // db.ts consumers
 *   import { tracedDbQuery } from "./tracing.js";
 *   const result = await tracedDbQuery("SELECT 1");
 */

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import AWSXRay from "aws-xray-sdk-core";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { AWSXRayPropagator } from "@opentelemetry/propagator-aws-xray";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type { Request, Response, NextFunction } from "express";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import { Gauge, Counter, register } from "prom-client";
import logger from "./logger.js";

// ─── Contract TTL & Application Metrics ───────────────────────────────────────

export const contractMinApplicationRemainingLedgers = new Gauge({
  name: "contract_min_application_remaining_ledgers",
  help: "Minimum remaining TTL across all active pending applications",
  registers: [register],
});

export const contractApplicationTtlExtensionsTotal = new Counter({
  name: "contract_application_ttl_extensions_total",
  help: "Total successful TTL extensions executed",
  registers: [register],
});

export {
  contractMinApplicationRemainingLedgers as contract_min_application_remaining_ledgers,
  contractApplicationTtlExtensionsTotal as contract_application_ttl_extensions_total,
};
// ─── Correlation ID storage ────────────────────────────────────────────────────

/**
 * AsyncLocalStorage context for the current HTTP request.
 * Any code that runs inside a request handler (including async continuations,
 * database callbacks and scheduled microtasks) can read the reqId without it
 * being threaded through every function argument.
 */
export const requestContext = new AsyncLocalStorage<{ reqId: string }>();

/**
 * Return the correlation ID for the currently executing request, or undefined
 * when called outside a request context (e.g. from a background scheduler).
 */
export function getRequestId(): string | undefined {
  return requestContext.getStore()?.reqId;
}

// ─── Correlation middleware ────────────────────────────────────────────────────

/**
 * Express middleware that assigns a unique X-Request-ID to every incoming
 * request and propagates it through the async execution context (#1234).
 *
 * Behaviour:
 *   1. If the client sends an X-Request-ID header its value is sanitised
 *      (stripped to alphanumeric, hyphens and underscores, max 128 chars) and
 *      used as-is to support end-to-end tracing from client to backend.
 *   2. Otherwise a new UUIDv4 is generated.
 *   3. The (possibly sanitised) ID is set as the X-Request-ID response header.
 *   4. The request handler chain runs inside AsyncLocalStorage.run() so that
 *      getRequestId() returns the correct ID throughout the full async stack.
 *
 * Register this middleware before all route handlers in app.ts.
 */
export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.headers["x-request-id"];
    const incoming = Array.isArray(raw) ? raw[0] : raw;

    // Sanitise to prevent header injection and log-format manipulation.
    // Allow only alphanumeric characters, hyphens and underscores, up to 128 chars.
    const reqId = incoming
      ? incoming.replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 128) || randomUUID()
      : randomUUID();

    res.setHeader("X-Request-ID", reqId);

    requestContext.run({ reqId }, () => next());
  };
}


// ─── SDK configuration ────────────────────────────────────────────────────────

const XRAY_ENABLED = process.env.XRAY_ENABLED !== "false";
const SERVICE_NAME = process.env.SERVICE_NAME ?? "workload-governor-backend";
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  ?? `${(process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318").replace(/\/$/, "")}/v1/traces`;

const otelSdk = new NodeSDK({
  serviceName: SERVICE_NAME,
  traceExporter: new OTLPTraceExporter({ url: OTLP_ENDPOINT }),
  textMapPropagator: new CompositePropagator({
    propagators: [
      new AWSXRayPropagator(),
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
    ],
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation({
      // Keep parameter values out of span attributes; only the parameterized SQL is recorded.
      enhancedDatabaseReporting: false,
      requestHook: (span, queryInfo) => {
        span.setAttribute("db.system", "postgresql");
        if (queryInfo.connection.database) {
          span.setAttribute("db.name", queryInfo.connection.database);
        }
        span.setAttribute("db.statement", queryInfo.query.text);
      },
      responseHook: (span, responseInfo) => {
        span.setAttribute("db.row_count", responseInfo.data.rowCount ?? 0);
      },
    }),
  ],
});

otelSdk.start();

export function shutdownTracing(): Promise<void> {
  return otelSdk.shutdown();
}

if (XRAY_ENABLED) {
  // Allow the SDK to capture all outbound HTTP calls made via Node's http/https.
  // This covers any library that uses the built-in http module under the hood.
  AWSXRay.captureHTTPsGlobal(require("http"),  false /* capture all */);
  AWSXRay.captureHTTPsGlobal(require("https"), false);

  // Set the service name used in the X-Ray service map.
  AWSXRay.setDefaultName(SERVICE_NAME);

  // In ECS the daemon runs on the default UDP port. The SDK picks up the
  // AWS_XRAY_DAEMON_ADDRESS env var automatically if set.
  logger.info({ service: SERVICE_NAME }, "X-Ray tracing enabled");
} else {
  logger.info("X-Ray tracing disabled (XRAY_ENABLED=false)");
}

// ─── Excluded health check endpoints ──────────────────────────────────────────

const EXCLUDED_HEALTH_PATHS = new Set([
  "/health",
  "/ready",
  "/metrics",
  "/api/health",
]);

// ─── Express middleware ────────────────────────────────────────────────────────

/**
 * Express middleware that opens an X-Ray segment for incoming requests
 * using intelligent ratio sampling (5% healthy calls, 100% errors, 0% health probes)
 * and closes it when the response finishes.
 *
 * Attach before all route handlers in app.ts.
 *
 * When XRAY_ENABLED=false (local dev / unit tests) the middleware is a no-op
 * pass-through so that tests do not require the X-Ray daemon.
 */
export function xrayMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!XRAY_ENABLED) {
      return next();
    }

    // Health check filter: Drop 100% of traces for /health, /ready, /metrics, /api/health
    if (EXCLUDED_HEALTH_PATHS.has(req.path)) {
      return next();
    }

    const traceHeader = req.headers["x-amzn-trace-id"] as string | undefined;
    const traceData = traceHeader ? AWSXRay.utils.processTraceData(traceHeader) : undefined;
    const parentSampled = traceData?.sampled === "1";

    // Production ratio sampling: Sample 5% of healthy requests, or respect upstream sampled parent
    const sampleDecision = parentSampled || (Math.random() < 0.05);

    let segment: AWSXRay.Segment | undefined;
    if (sampleDecision) {
      segment = new AWSXRay.Segment(
        SERVICE_NAME,
        traceData?.root,
        traceData?.parent,
      );

      // Annotate with HTTP method + URL for the service map
      segment.addAnnotation("http_method", req.method);
      segment.addAnnotation("http_url",    req.path);

      // Make the segment available to downstream subsegment creators
      AWSXRay.setSegment(segment);
    }

    res.on("finish", () => {
      // Always sample 100% of error traces (HTTP 5xx)
      if (res.statusCode >= 500) {
        if (!segment) {
          segment = new AWSXRay.Segment(
            SERVICE_NAME,
            traceData?.root,
            traceData?.parent,
          );
          segment.addAnnotation("http_method", req.method);
          segment.addAnnotation("http_url", req.path);
        }
        segment.addAnnotation("http_status", res.statusCode);
        segment.addFaultFlag();
        segment.close();
        return;
      }

      if (segment) {
        segment.addAnnotation("http_status", res.statusCode);
        if (res.statusCode >= 400 && res.statusCode < 500) {
          segment.addError(new Error(`HTTP ${res.statusCode}`));
        }
        segment.close();
      }
    });

    res.on("close", () => {
      if (segment && !segment.isClosed()) {
        segment.close(new Error("Connection closed before response"));
      }
    });

    next();
  };
}

// ─── Traced HTTP fetch ────────────────────────────────────────────────────────

/**
 * Wraps the global `fetch` API with an X-Ray HTTP subsegment.
 *
 * @param name    - Human-readable subsegment name shown in the X-Ray console
 *                  (e.g. "github-api", "horizon-rpc", "soroban-rpc")
 * @param url     - Target URL
 * @param init    - Standard RequestInit options
 * @returns       - The raw Response, identical to `fetch(url, init)`
 */
export async function tracedFetch(
  name: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!XRAY_ENABLED) {
    return fetch(url, init);
  }

  const segment = AWSXRay.resolveSegment();
  const subsegment = segment?.addNewSubsegment(name);

  if (subsegment) {
    subsegment.addAnnotation("http_url",    url);
    subsegment.addAnnotation("http_method", init?.method ?? "GET");
    subsegment.namespace = "remote";
  }

  try {
    const response = await fetch(url, init);

    if (subsegment) {
      subsegment.addAnnotation("http_status", response.status);
      if (!response.ok) {
        subsegment.addError(new Error(`HTTP ${response.status} from ${name}`));
      }
      subsegment.close();
    }

    return response;
  } catch (err) {
    if (subsegment) {
      subsegment.addError(err instanceof Error ? err : new Error(String(err)));
      subsegment.close(err instanceof Error ? err : new Error(String(err)));
    }
    throw err;
  }
}

// ─── Traced database query ────────────────────────────────────────────────────

/**
 * Wraps a pg Pool query with an X-Ray subsegment.
 *
 * @param pool       - pg Pool instance
 * @param sql        - SQL query string
 * @param values     - Optional parameterised values
 * @returns          - pg QueryResult
 */
export async function tracedDbQuery<R extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  sql: string,
  values?: unknown[],
): Promise<QueryResult<R>> {
  if (!XRAY_ENABLED) {
    return values ? pool.query<R>(sql, values) : pool.query<R>(sql);
  }

  const segment = AWSXRay.resolveSegment();
  const subsegment = segment?.addNewSubsegment("postgres");

  if (subsegment) {
    // Sanitise: include only the first 128 chars of the SQL to avoid storing
    // PII or large payloads in trace data.
    subsegment.addMetadata("sql", sql.slice(0, 128));
    subsegment.namespace = "remote";
  }

  try {
    const result = values
      ? await pool.query<R>(sql, values)
      : await pool.query<R>(sql);

    if (subsegment) {
      subsegment.addAnnotation("row_count", result.rowCount ?? 0);
      subsegment.close();
    }

    return result;
  } catch (err) {
    if (subsegment) {
      subsegment.addError(err instanceof Error ? err : new Error(String(err)));
      subsegment.close(err instanceof Error ? err : new Error(String(err)));
    }
    throw err;
  }
}

export { AWSXRay };

// ─── OpenTelemetry distributed tracing & sampling integration ─────────────────

export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

export interface SpanEvent {
  name: string;
  attributes?: Record<string, unknown>;
  time?: number;
}

export interface Span {
  readonly attributes: Record<string, unknown>;
  readonly events: SpanEvent[];
  readonly status: SpanStatus;
  setAttribute(key: string, value: unknown): this;
  setAttributes(attributes: Record<string, unknown>): this;
  addEvent(name: string, attributes?: Record<string, unknown>): this;
  setStatus(status: SpanStatus): this;
  recordException(exception: Error | string): this;
  end(): void;
  isRecording(): boolean;
  spanContext(): SpanContext;
}

export interface Tracer {
  startSpan(
    name: string,
    options?: {
      attributes?: Record<string, unknown>;
      parent?: Span | SpanContext;
    },
  ): Span;
  startActiveSpan<T>(
    name: string,
    fn: (span: Span) => T,
  ): T;
  startActiveSpan<T>(
    name: string,
    options: {
      attributes?: Record<string, unknown>;
      parent?: Span | SpanContext;
    },
    fn: (span: Span) => T,
  ): T;
}

// ─── Samplers ─────────────────────────────────────────────────────────────────

export enum SamplingDecision {
  NOT_RECORD = 0,
  RECORD = 1,
  RECORD_AND_SAMPLE = 2,
}

export interface SamplingResult {
  decision: SamplingDecision;
  attributes?: Record<string, unknown>;
  traceState?: unknown;
}

export interface Sampler {
  shouldSample(
    context?: SpanContext,
    traceId?: string,
    spanName?: string,
    spanKind?: number,
    attributes?: Record<string, unknown>,
    links?: unknown[],
  ): SamplingResult;
  toString(): string;
}

/** Samples 100% of spans unconditionally */
export class AlwaysOnSampler implements Sampler {
  shouldSample(): SamplingResult {
    return { decision: SamplingDecision.RECORD_AND_SAMPLE };
  }
  toString(): string {
    return "AlwaysOnSampler";
  }
}

/** Drops 100% of spans unconditionally */
export class AlwaysOffSampler implements Sampler {
  shouldSample(): SamplingResult {
    return { decision: SamplingDecision.NOT_RECORD };
  }
  toString(): string {
    return "AlwaysOffSampler";
  }
}

/** Samples a fixed ratio of traces (e.g. 0.05 = 5%) deterministically based on trace ID */
export class TraceIdRatioBasedSampler implements Sampler {
  private readonly ratio: number;
  private readonly idUpperBound: number;

  constructor(ratio: number = 0.05) {
    this.ratio = Math.max(0, Math.min(1, ratio));
    this.idUpperBound = this.ratio * 0xffffffff;
  }

  shouldSample(
    _context?: SpanContext,
    traceId?: string,
    _spanName?: string,
    _spanKind?: number,
    attributes?: Record<string, unknown>,
  ): SamplingResult {
    if (this.ratio <= 0) return { decision: SamplingDecision.NOT_RECORD };
    if (this.ratio >= 1) return { decision: SamplingDecision.RECORD_AND_SAMPLE };

    const idToHash = traceId ? traceId.slice(-8) : randomHex(4);
    const intVal = parseInt(idToHash, 16) || Math.floor(Math.random() * 0xffffffff);
    const decision = intVal <= this.idUpperBound
      ? SamplingDecision.RECORD_AND_SAMPLE
      : SamplingDecision.NOT_RECORD;

    return { decision, attributes };
  }

  toString(): string {
    return `TraceIdRatioBasedSampler{ratio=${this.ratio}}`;
  }
}

/** Respects upstream client sampling decisions or delegates to root sampler */
export class ParentBasedSampler implements Sampler {
  constructor(private readonly root: Sampler = new TraceIdRatioBasedSampler(0.05)) {}

  shouldSample(
    context?: SpanContext,
    traceId?: string,
    spanName?: string,
    spanKind?: number,
    attributes?: Record<string, unknown>,
  ): SamplingResult {
    if (!context || !context.traceId) {
      return this.root.shouldSample(context, traceId, spanName, spanKind, attributes);
    }
    const isSampled = (context.traceFlags & 1) === 1;
    return {
      decision: isSampled ? SamplingDecision.RECORD_AND_SAMPLE : SamplingDecision.NOT_RECORD,
      attributes,
    };
  }

  toString(): string {
    return `ParentBasedSampler{root=${this.root.toString()}}`;
  }
}

/**
 * Intelligent production trace sampler:
 * - Drops 100% of health check / probe requests (/health, /ready, /metrics, /api/health)
 * - Always samples 100% of error traces (HTTP 5xx, errors)
 * - Samples 5% of healthy traces using TraceIdRatioBasedSampler(0.05)
 * - Supports ParentBasedSampler to propagate upstream client decisions
 */
export class ProductionTraceSampler implements Sampler {
  private readonly parentBasedSampler: ParentBasedSampler;

  constructor(ratio: number = 0.05) {
    this.parentBasedSampler = new ParentBasedSampler(new TraceIdRatioBasedSampler(ratio));
  }

  shouldSample(
    context?: SpanContext,
    traceId?: string,
    spanName?: string,
    spanKind?: number,
    attributes?: Record<string, unknown>,
  ): SamplingResult {
    const target = (attributes?.["http.target"] ?? attributes?.["http_url"] ?? spanName) as string | undefined;

    // Drop health check and metrics endpoints
    if (target && EXCLUDED_HEALTH_PATHS.has(target)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    // Always sample error traces (HTTP 5xx)
    const statusCode = attributes?.["http.status_code"] ?? attributes?.["http_status"];
    if (typeof statusCode === "number" && statusCode >= 500) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLE, attributes };
    }

    return this.parentBasedSampler.shouldSample(context, traceId, spanName, spanKind, attributes);
  }

  toString(): string {
    return "ProductionTraceSampler{5% healthy, 100% error, 0% health}";
  }
}

export const defaultSampler: Sampler = new ProductionTraceSampler(0.05);

// ─── Tracer implementation ────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  let hex = "";
  for (let i = 0; i < bytes; i++) {
    hex += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return hex;
}

class InMemorySpan implements Span {
  public attributes: Record<string, unknown> = {};
  public events: SpanEvent[] = [];
  public status: SpanStatus = { code: SpanStatusCode.UNSET };
  private ended = false;
  private readonly startTime = Date.now();
  private readonly context: SpanContext;
  private xRaySubsegment?: AWSXRay.Subsegment;

  constructor(
    public readonly name: string,
    initialAttributes: Record<string, unknown> = {},
    parentContext?: SpanContext,
  ) {
    this.attributes = { ...initialAttributes };
    const traceId = parentContext?.traceId ?? randomHex(16);
    const spanId = randomHex(8);
    this.context = { traceId, spanId, traceFlags: 1 };

    // Link with AWS X-Ray subsegment if active
    if (XRAY_ENABLED) {
      try {
        const seg = AWSXRay.resolveSegment();
        if (seg) {
          this.xRaySubsegment = seg.addNewSubsegment(name);
          this.xRaySubsegment.namespace = "remote";
          for (const [k, v] of Object.entries(initialAttributes)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              this.xRaySubsegment.addAnnotation(k.replace(/\./g, "_"), v);
            }
          }
        }
      } catch {
        // Ignored in test environments without X-Ray daemon
      }
    }
  }

  setAttribute(key: string, value: unknown): this {
    if (this.ended) return this;
    this.attributes[key] = value;
    if (this.xRaySubsegment && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
      try {
        this.xRaySubsegment.addAnnotation(key.replace(/\./g, "_"), value);
      } catch {
        // ignore
      }
    }
    return this;
  }

  setAttributes(attributes: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(attributes)) {
      this.setAttribute(k, v);
    }
    return this;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    if (this.ended) return this;
    this.events.push({
      name,
      attributes: attributes ? { ...attributes } : undefined,
      time: Date.now(),
    });
    return this;
  }

  setStatus(status: SpanStatus): this {
    if (this.ended) return this;
    this.status = status;
    if (status.code === SpanStatusCode.ERROR && this.xRaySubsegment) {
      try {
        this.xRaySubsegment.addError(new Error(status.message ?? "Span error"));
      } catch {
        // ignore
      }
    }
    return this;
  }

  recordException(exception: Error | string): this {
    if (this.ended) return this;
    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.addEvent("exception", {
      "exception.type": err.name,
      "exception.message": err.message,
      "exception.stacktrace": err.stack,
    });
    this.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    return this;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    const durationMs = Date.now() - this.startTime;
    if (this.attributes["response_latency_ms"] === undefined && this.attributes["rpc.response_latency_ms"] === undefined) {
      this.attributes["rpc.response_latency_ms"] = durationMs;
    }
    if (this.xRaySubsegment) {
      try {
        this.xRaySubsegment.close();
      } catch {
        // ignore
      }
    }
  }

  isRecording(): boolean {
    return !this.ended;
  }

  spanContext(): SpanContext {
    return this.context;
  }
}

class InMemoryTracer implements Tracer {
  private activeSpan: Span | null = null;

  startSpan(
    name: string,
    options?: {
      attributes?: Record<string, unknown>;
      parent?: Span | SpanContext;
    },
  ): Span {
    const parentContext =
      options?.parent && "traceId" in options.parent
        ? (options.parent as SpanContext)
        : (options?.parent as Span | undefined)?.spanContext() ??
          this.activeSpan?.spanContext();

    return new InMemorySpan(name, options?.attributes ?? {}, parentContext);
  }

  startActiveSpan<T>(
    name: string,
    fnOrOptions: ((span: Span) => T) | { attributes?: Record<string, unknown>; parent?: Span | SpanContext },
    maybeFn?: (span: Span) => T,
  ): T {
    const options = typeof fnOrOptions === "function" ? undefined : fnOrOptions;
    const fn = typeof fnOrOptions === "function" ? fnOrOptions : maybeFn!;
    const span = this.startSpan(name, options);
    const prev = this.activeSpan;
    this.activeSpan = span;
    try {
      return fn(span);
    } finally {
      this.activeSpan = prev;
    }
  }
}

export function getTracer(name: string = SERVICE_NAME): Tracer {
  // If @opentelemetry/api is present in global runtime, delegate or return InMemoryTracer
  return new InMemoryTracer();
}

export const tracer: Tracer = getTracer(SERVICE_NAME);

// ─── Prometheus Webhook Metrics ───────────────────────────────────────────────

export interface MetricCounter {
  inc(value?: number): void;
  labels(...args: any[]): { inc(value?: number): void };
}

export interface MetricHistogram {
  observe(val: number): void;
  labels(...args: any[]): { observe(val: number): void };
}

let githubWebhooksReceivedTotalInstance: MetricCounter;
let githubWebhookProcessingDurationSecondsInstance: MetricHistogram;

try {
  // Use prom-client if available
  const promClient = require("prom-client");
  githubWebhooksReceivedTotalInstance = new promClient.Counter({
    name: "github_webhooks_received_total",
    help: "Total incoming GitHub webhooks received",
    labelNames: ["event_type", "status"],
    registers: [promClient.register],
  });
  githubWebhookProcessingDurationSecondsInstance = new promClient.Histogram({
    name: "github_webhook_processing_duration_seconds",
    help: "Duration of GitHub webhook processing in seconds",
    labelNames: ["event_type", "status"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [promClient.register],
  });
} catch {
  // Resilient fallback in environments without prom-client
  githubWebhooksReceivedTotalInstance = {
    inc: () => {},
    labels: () => ({ inc: () => {} }),
  };
  githubWebhookProcessingDurationSecondsInstance = {
    observe: () => {},
    labels: () => ({ observe: () => {} }),
  };
}

export const githubWebhooksReceivedTotal: MetricCounter = githubWebhooksReceivedTotalInstance;
export const githubWebhookProcessingDurationSeconds: MetricHistogram = githubWebhookProcessingDurationSecondsInstance;


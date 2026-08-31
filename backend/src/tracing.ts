/**
 * tracing.ts — AWS X-Ray distributed tracing integration
 *
 * Provides:
 *   - Configured aws-xray-sdk-core instance
 *   - xrayMiddleware()   — Express middleware: opens/closes a segment per request
 *   - tracedFetch()      — wraps global fetch with an X-Ray HTTP subsegment
 *   - tracedDbQuery()    — wraps pg Pool.query with an X-Ray subsegment
 *
 * Usage:
 *   // app.ts
 *   import { xrayMiddleware } from "./tracing.js";
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

import AWSXRay from "aws-xray-sdk-core";
import type { Request, Response, NextFunction } from "express";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import logger from "./logger.js";

// ─── SDK configuration ────────────────────────────────────────────────────────

const XRAY_ENABLED = process.env.XRAY_ENABLED !== "false";
const SERVICE_NAME = process.env.SERVICE_NAME ?? "workload-governor-backend";

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

// ─── Express middleware ────────────────────────────────────────────────────────

/**
 * Express middleware that opens an X-Ray segment for each incoming request
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

    const traceHeader = req.headers["x-amzn-trace-id"] as string | undefined;
    const segment = new AWSXRay.Segment(
      SERVICE_NAME,
      traceHeader ? AWSXRay.utils.processTraceData(traceHeader).root : undefined,
      traceHeader ? AWSXRay.utils.processTraceData(traceHeader).parent : undefined,
    );

    // Annotate with HTTP method + URL for the service map
    segment.addAnnotation("http_method", req.method);
    segment.addAnnotation("http_url",    req.path);

    // Make the segment available to downstream subsegment creators
    AWSXRay.setSegment(segment);

    res.on("finish", () => {
      segment.addAnnotation("http_status", res.statusCode);
      if (res.statusCode >= 400 && res.statusCode < 500) {
        segment.addError(new Error(`HTTP ${res.statusCode}`));
      } else if (res.statusCode >= 500) {
        segment.addFaultFlag();
      }
      segment.close();
    });

    res.on("close", () => {
      if (!segment.isClosed()) {
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

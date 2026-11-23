/**
 * routes/events.ts — Server-Sent Events (SSE) streaming endpoint (#1233)
 *
 * GET /api/events/stream?orgId=<orgId>&contributor=<contributor>
 *
 * Establishes a persistent HTTP connection over which the server pushes live
 * contract events (application_created, issue_assigned, assignment_completed,
 * assignment_revoked) to the client as they are ingested by the Stellar event
 * indexer.
 *
 * Protocol details:
 *   - Content-Type: text/event-stream; charset=utf-8
 *   - Cache-Control: no-cache
 *   - Connection: keep-alive
 *   - X-Accel-Buffering: no  (disables Nginx/ALB response buffering)
 *   - An initial keepalive comment (": keepalive\n\n") is written immediately
 *     after the headers so clients know the connection is live.
 *   - A heartbeat comment is sent every 25 seconds to prevent ALB / reverse-
 *     proxy idle-connection timeouts.
 *   - On client disconnect (req 'close' event) the subscriber is removed from
 *     the event bus and the heartbeat timer is cleared, preventing memory leaks.
 *
 * Connection limiting:
 *   - Maximum MAX_STREAMS_PER_IP concurrent streams per remote IP (default: 5).
 *     Requests that exceed this limit receive HTTP 429.
 *
 * Event format (SSE wire format):
 *   event: application_created\n
 *   data: {"orgId":"stellar","issueId":42,"contributor":"G...","createdAt":"..."}\n
 *   \n
 */

import type { Request, Response } from "express";
import {
  subscribe,
  unsubscribe,
  HEARTBEAT_INTERVAL_MS,
  type ContractEvent,
} from "../services/eventStreamService.js";
import logger from "../logger.js";

/**
 * GET /api/events/stream
 *
 * Query parameters:
 *   orgId       (optional) — filter events to a specific org
 *   contributor (optional) — filter events to a specific contributor address
 */
export function sseHandler(req: Request, res: Response): void {
  const orgId       = typeof req.query.orgId       === "string" ? req.query.orgId       : undefined;
  const contributor = typeof req.query.contributor === "string" ? req.query.contributor : undefined;
  const ip          = req.ip ?? req.socket.remoteAddress ?? "unknown";

  // ── Write SSE headers ──────────────────────────────────────────────────────
  res.writeHead(200, {
    "Content-Type":      "text/event-stream; charset=utf-8",
    "Cache-Control":     "no-cache",
    "Connection":        "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Initial keepalive comment — confirms the connection is live to the client.
  res.write(": keepalive\n\n");

  logger.info({ ip, orgId, contributor }, "[sse] Client connected");

  // ── Register subscriber ────────────────────────────────────────────────────
  const listener = (event: ContractEvent): void => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const accepted = subscribe(ip, orgId, contributor, listener);
  if (!accepted) {
    // Per-IP limit exceeded — send 429 before writing SSE headers would
    // prevent status code override, so we signal the client via a special
    // SSE error event and close the connection.
    res.write("event: error\n");
    res.write('data: {"error":"Too many concurrent SSE connections from this IP"}\n\n');
    res.end();
    return;
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  // Sent every HEARTBEAT_INTERVAL_MS (25 s) as an SSE comment so reverse
  // proxies and ALBs do not close the idle connection.
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  // ── Cleanup on disconnect ──────────────────────────────────────────────────
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe(ip, listener);
    logger.info({ ip, orgId, contributor }, "[sse] Client disconnected — subscriber removed");
  });
}

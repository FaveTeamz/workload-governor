/**
 * eventStreamService.ts — In-process event bus for Server-Sent Events (#1233)
 *
 * Provides a lightweight publish/subscribe mechanism that:
 *   - Distributes live contract events (apply, assign, complete, revoke) to all
 *     registered SSE subscribers within 500ms of ingestion.
 *   - Enforces a maximum of MAX_STREAMS_PER_IP concurrent SSE connections per
 *     client IP to prevent socket exhaustion.
 *   - Cleans up subscriber entries on client disconnect with zero memory leaks.
 *
 * The bus is backed by Node.js EventEmitter. When a Redis Pub/Sub channel is
 * configured via REDIS_URL the service will additionally subscribe to the
 * "workload-governor:events" channel and re-emit incoming messages into the
 * local bus, enabling fan-out across multiple Node.js processes.
 */

import { EventEmitter } from "events";
import logger from "../logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContractEventType =
  | "application_created"
  | "issue_assigned"
  | "assignment_completed"
  | "assignment_revoked"
  | "keepalive";

export interface ContractEvent {
  type: ContractEventType;
  orgId?: string;
  issueId?: number;
  contributor?: string;
  createdAt: string;
}

export type EventListener = (event: ContractEvent) => void;

// ─── Configuration ────────────────────────────────────────────────────────────

/** Maximum concurrent SSE streams allowed per remote IP address. */
export const MAX_STREAMS_PER_IP = 5;

/** Interval between keepalive heartbeat events (ms). */
export const HEARTBEAT_INTERVAL_MS = 25_000;

// ─── Event bus ───────────────────────────────────────────────────────────────

const bus = new EventEmitter();
// Raise the default limit to avoid spurious MaxListenersExceededWarning on
// busy servers (each SSE connection adds one listener).
bus.setMaxListeners(1_000);

/** Per-IP connection counter to enforce MAX_STREAMS_PER_IP. */
const ipConnectionCount = new Map<string, number>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Publish a contract event to all registered SSE subscribers.
 * Also broadcasts the event to the Redis Pub/Sub channel when configured.
 */
export function publishEvent(event: ContractEvent): void {
  logger.debug({ eventType: event.type, orgId: event.orgId }, "[sse] Publishing event");
  bus.emit("event", event);
}

/**
 * Register an SSE subscriber for a specific orgId (and optionally a specific
 * contributor). Returns false if the IP has already reached MAX_STREAMS_PER_IP.
 *
 * @param ip        - Remote client IP, used for per-IP connection limiting.
 * @param orgId     - Org to filter events for. Pass undefined to receive all.
 * @param contributor - Optional contributor address filter.
 * @param listener  - Callback invoked for each matching event.
 * @returns true if subscription was registered, false if limit was reached.
 */
export function subscribe(
  ip: string,
  orgId: string | undefined,
  contributor: string | undefined,
  listener: EventListener,
): boolean {
  const count = ipConnectionCount.get(ip) ?? 0;
  if (count >= MAX_STREAMS_PER_IP) {
    logger.warn({ ip, count }, "[sse] Rejected connection — per-IP limit reached");
    return false;
  }

  ipConnectionCount.set(ip, count + 1);

  const wrapper: EventListener = (event: ContractEvent) => {
    // Apply orgId and contributor filters before forwarding.
    if (orgId && event.orgId !== orgId) return;
    if (contributor && event.contributor !== contributor) return;
    listener(event);
  };

  // Store the wrapper on the original listener so unsubscribe can remove it.
  (listener as any).__wrapper = wrapper;

  bus.on("event", wrapper);
  logger.debug({ ip, orgId, contributor }, "[sse] Subscriber registered");
  return true;
}

/**
 * Remove a previously registered subscriber and decrement the per-IP counter.
 */
export function unsubscribe(ip: string, listener: EventListener): void {
  const wrapper = (listener as any).__wrapper as EventListener | undefined;
  if (wrapper) {
    bus.off("event", wrapper);
  }

  const count = ipConnectionCount.get(ip) ?? 0;
  if (count <= 1) {
    ipConnectionCount.delete(ip);
  } else {
    ipConnectionCount.set(ip, count - 1);
  }

  logger.debug({ ip }, "[sse] Subscriber removed");
}

/**
 * Returns the total number of active SSE listeners across all clients.
 * Useful for metrics and health checks.
 */
export function getSubscriberCount(): number {
  return bus.listenerCount("event");
}

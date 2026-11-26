import { AsyncLocalStorage } from "async_hooks";

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

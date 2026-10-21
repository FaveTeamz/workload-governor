/**
 * webhook-dispatcher.ts
 *
 * Fires signed HTTP POST requests to org-registered webhook URLs whenever
 * an assignment state changes (created, completed, revoked).
 *
 * Features (issue #843):
 *  - HMAC-SHA256 signature in X-WG-Signature header
 *  - Retry queue: up to 5 attempts with exponential backoff + full jitter
 *    t = min(MAX_DELAY, BASE_DELAY * 2^attempt + rand_jitter)
 *    where rand_jitter = Math.random() * BASE_DELAY * 2^attempt
 *  - Dead-letter Redis queue `dlq:webhooks` on final failure (LPUSH)
 *  - Dead-letter table insert on final failure (webhook_dead_letters)
 */

import crypto from 'crypto';
import { pool } from '../db';
import redis from './redis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  event: string;
  org_id: string;
  issue_id: number;
  contributor: string;
  ledger: number;
  timestamp: string;
}

export type AssignmentEventType =
  | 'assignment.created'
  | 'assignment.completed'
  | 'assignment.revoked';

export interface DlqEntry {
  webhook_id: number;
  url: string;
  payload: WebhookPayload;
  last_error: string;
  attempts: number;
  failed_at: string;
}

// ---------------------------------------------------------------------------
// HMAC signature
// ---------------------------------------------------------------------------

/**
 * Signs a JSON payload string with HMAC-SHA256.
 * Returns the header value: `sha256=<hex-digest>`
 */
export function signPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

// ---------------------------------------------------------------------------
// Backoff with full jitter
// ---------------------------------------------------------------------------

/** Maximum number of delivery attempts before moving to the DLQ. */
export const MAX_ATTEMPTS = 5;

/** Base delay in milliseconds for the backoff formula. */
const BASE_DELAY = 1_000;

/** Maximum delay cap in milliseconds. */
const MAX_DELAY = 60_000;

/** Redis key for the dead-letter queue. */
export const DLQ_KEY = 'dlq:webhooks';

/**
 * Computes the delay for attempt `attempt` (0-indexed) using full-jitter
 * exponential backoff:
 *
 *   cap   = min(MAX_DELAY, BASE_DELAY * 2^attempt)
 *   delay = random_between(0, cap)          ← full jitter
 *
 * Full jitter distributes retries more uniformly across the interval,
 * which reduces thundering-herd effects when many webhooks retry together.
 */
export function computeBackoffDelay(attempt: number): number {
  const cap = Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, attempt));
  return Math.random() * cap;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// HTTP delivery with retry
// ---------------------------------------------------------------------------

/**
 * Attempt to deliver a payload to a single webhook endpoint.
 * Retries up to MAX_ATTEMPTS (5) times with exponential backoff + full jitter.
 * Logs each attempt with status code and response body.
 *
 * On final failure:
 *  1. Pushes a DLQ entry to Redis key `dlq:webhooks` (LPUSH).
 *  2. Writes a row to the `webhook_dead_letters` DB table.
 */
export async function dispatchToWebhook(
  webhookId: number,
  url: string,
  secret: string,
  payload: WebhookPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  let lastError = '';
  let lastStatusCode: number | null = null;
  let lastResponseBody: string | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WG-Signature': signature,
          'X-WG-Event': payload.event,
        },
        body,
        // 10-second per-request timeout via AbortSignal (Node 18+)
        signal: AbortSignal.timeout(10_000),
      });

      let responseBody: string | null = null;
      try {
        responseBody = await response.text();
      } catch {
        // Ignore body read errors
      }

      console.log(
        `[WebhookDispatcher] Attempt ${attempt + 1}/${MAX_ATTEMPTS} for webhook #${webhookId}: ` +
        `status=${response.status} body=${responseBody?.substring(0, 200) ?? 'N/A'}`,
      );

      if (response.ok) {
        return; // Success — done
      }

      lastError = `HTTP ${response.status} ${response.statusText}`;
      lastStatusCode = response.status;
      lastResponseBody = responseBody?.substring(0, 1000) ?? null;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.log(
        `[WebhookDispatcher] Attempt ${attempt + 1}/${MAX_ATTEMPTS} for webhook #${webhookId}: ` +
        `error=${lastError}`,
      );
    }

    // Backoff before next retry (skip after final attempt)
    if (attempt < MAX_ATTEMPTS - 1) {
      const delayMs = computeBackoffDelay(attempt);
      await sleep(delayMs);
    }
  }

  // ── All attempts exhausted — move to dead-letter queue ──────────────────

  console.error(
    `[WebhookDispatcher] All ${MAX_ATTEMPTS} attempts failed for webhook #${webhookId} → ${url}: ${lastError}`,
  );

  const dlqEntry: DlqEntry = {
    webhook_id: webhookId,
    url,
    payload,
    last_error: lastError,
    attempts: MAX_ATTEMPTS,
    failed_at: new Date().toISOString(),
  };

  // 1. Push to Redis DLQ
  try {
    await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry));
  } catch (redisErr) {
    console.error('[WebhookDispatcher] Failed to push to Redis DLQ:', redisErr);
  }

  // 2. Write to DB dead-letter table
  try {
    await pool.query(
      `INSERT INTO webhook_dead_letters (webhook_id, payload, last_error, attempts, last_status_code, last_response_body)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6)`,
      [webhookId, body, lastError, MAX_ATTEMPTS, lastStatusCode, lastResponseBody],
    );
  } catch (dbErr) {
    console.error('[WebhookDispatcher] Failed to write dead letter to DB:', dbErr);
  }
}

// ---------------------------------------------------------------------------
// High-level dispatch function
// ---------------------------------------------------------------------------

/**
 * Look up all webhooks registered for `orgId`, then fire the assignment
 * event payload to each one concurrently.
 *
 * This function never throws — failures are captured in the DLQ and
 * dead-letter table.
 */
export async function dispatchAssignmentEvent(
  eventType: AssignmentEventType,
  orgId: string,
  issueId: number,
  contributor: string,
  ledger: number,
): Promise<void> {
  let webhooks: Array<{ id: number; url: string; secret: string }>;

  try {
    const result = await pool.query<{ id: number; url: string; secret: string }>(
      `SELECT id, url, secret FROM org_webhooks WHERE org_id = $1`,
      [orgId],
    );
    webhooks = result.rows;
  } catch (err) {
    console.error('[WebhookDispatcher] Failed to query org_webhooks:', err);
    return;
  }

  if (webhooks.length === 0) {
    return; // No registered webhooks for this org
  }

  const payload: WebhookPayload = {
    event: eventType,
    org_id: orgId,
    issue_id: issueId,
    contributor,
    ledger,
    timestamp: new Date().toISOString(),
  };

  // Fire all webhooks concurrently; individual failures are handled inside
  // dispatchToWebhook and never propagate here.
  await Promise.allSettled(
    webhooks.map((wh) => dispatchToWebhook(wh.id, wh.url, wh.secret, payload)),
  );
}

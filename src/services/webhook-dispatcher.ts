/**
 * webhook-dispatcher.ts
 *
 * Fires signed HTTP POST requests to org-registered webhook URLs whenever
 * an assignment state changes (created, completed, revoked).
 *
 * Features (issue #196):
 *  - HMAC-SHA256 signature in X-WG-Signature header
 *  - Retry queue: up to 3 attempts with exponential back-off (1 s, 2 s, 4 s)
 *  - Dead-letter table insert on final failure
 */

import crypto from 'crypto';
import { pool } from '../db';

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
// HTTP delivery with retry
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;

/** Delay helper (exponential back-off: 1 s → 2 s → 4 s). */
function delay(attemptNumber: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attemptNumber)));
}

/**
 * Attempt to deliver a payload to a single webhook endpoint.
 * Retries up to MAX_ATTEMPTS times with exponential back-off.
 * On final failure, writes the payload to webhook_dead_letters.
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

      if (response.ok) {
        return; // Success — done
      }

      lastError = `HTTP ${response.status} ${response.statusText}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Back-off before next retry (skip after final attempt)
    if (attempt < MAX_ATTEMPTS - 1) {
      await delay(attempt);
    }
  }

  // All attempts exhausted — write to dead-letter table
  console.error(
    `[WebhookDispatcher] All ${MAX_ATTEMPTS} attempts failed for webhook #${webhookId} → ${url}: ${lastError}`,
  );

  try {
    await pool.query(
      `INSERT INTO webhook_dead_letters (webhook_id, payload, last_error, attempts)
       VALUES ($1, $2::jsonb, $3, $4)`,
      [webhookId, body, lastError, MAX_ATTEMPTS],
    );
  } catch (dbErr) {
    console.error('[WebhookDispatcher] Failed to write dead letter:', dbErr);
  }
}

// ---------------------------------------------------------------------------
// High-level dispatch function
// ---------------------------------------------------------------------------

/**
 * Look up all webhooks registered for `orgId`, then fire the assignment
 * event payload to each one concurrently.
 *
 * This function never throws — failures are captured in the dead-letter table.
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

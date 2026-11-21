/**
 * github-webhook.ts
 *
 * Service helpers for processing GitHub webhook payloads.
 *
 * Security note (issue #560):
 *   All incoming webhook requests MUST be authenticated by verifying the
 *   HMAC-SHA256 signature provided in the X-Hub-Signature-256 header.
 *   The signature is computed over the raw request body bytes using the
 *   shared GITHUB_WEBHOOK_SECRET.  A timing-safe comparison is used to
 *   prevent timing attacks.
 */

import crypto from 'crypto';

export interface GitHubIssuePayload {
  action: 'opened' | 'closed' | 'edited' | 'labeled' | 'unlabeled';
  issue: {
    number: number;
    title: string;
    state: 'open' | 'closed';
  };
  repository: {
    name: string;
  };
  label?: {
    name: string;
  };
}

/**
 * Verify that the X-Hub-Signature-256 header from GitHub matches the expected
 * HMAC-SHA256 of the raw request body.
 *
 * @param payload   - The raw request body string (must be the bytes GitHub signed)
 * @param signature - The value of the X-Hub-Signature-256 header (e.g. "sha256=abc123…")
 * @param secret    - The shared webhook secret (GITHUB_WEBHOOK_SECRET env var)
 * @returns true if the signature is valid, false otherwise.
 *
 * Uses crypto.timingSafeEqual to prevent timing attacks where an attacker
 * could deduce secret bits by measuring response times.
 */
export function validateGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const digest = `sha256=${hmac.digest('hex')}`;

  // Both buffers must be the same length for timingSafeEqual; if the incoming
  // signature has the wrong length (e.g. truncated), return false immediately
  // without leaking timing information about the comparison.
  if (digest.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/**
 * Parse and validate a raw GitHub webhook body into a typed payload.
 * Returns null if the payload is missing required fields.
 */
export function parseGitHubPayload(body: unknown): GitHubIssuePayload | null {
  try {
    const payload = body as GitHubIssuePayload;
    if (!payload.action || !payload.issue || !payload.repository) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

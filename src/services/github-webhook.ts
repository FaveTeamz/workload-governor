import crypto from 'crypto';

export interface GitHubIssuePayload {
  action: 'opened' | 'closed' | 'edited';
  issue: {
    number: number;
    title: string;
    state: 'open' | 'closed';
  };
  repository: {
    name: string;
  };
}

export function validateGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const digest = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

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

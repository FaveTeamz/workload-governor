import { Router, Request, Response } from 'express';
import { pool } from '../db';
import {
  validateGitHubSignature,
  parseGitHubPayload,
  GitHubIssuePayload,
} from '../services/github-webhook';
import { invalidateCache } from '../services/redis';

const router = Router();

// POST /webhooks/github
router.post('/github', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const payload = JSON.stringify(req.body);

  if (!signature) {
    return res.status(401).json({ error: 'missing signature' });
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'webhook not configured' });
  }

  try {
    if (!validateGitHubSignature(payload, signature, secret)) {
      return res.status(401).json({ error: 'invalid signature' });
    }

    const webhookPayload = parseGitHubPayload(req.body);
    if (!webhookPayload) {
      return res.status(200).json({ message: 'event ignored' });
    }

    const { action, issue, repository } = webhookPayload;

    // Only process supported event types
    if (!['opened', 'closed', 'edited'].includes(action)) {
      return res.status(200).json({ message: 'event type not supported' });
    }

    const issueNumber = issue.number;
    const issueTitle = issue.title;
    const status = issue.state === 'closed' ? 'closed' : 'open';
    const org_id = repository.name;

    try {
      if (action === 'opened') {
        await pool.query(
          `INSERT INTO issues (org_id, title, status) VALUES ($1, $2, $3)
           ON CONFLICT (org_id, id) DO NOTHING`,
          [org_id, issueTitle, status]
        );
        console.log(`GitHub issue #${issueNumber} created`);
      } else if (action === 'closed' || action === 'edited') {
        await pool.query(
          `UPDATE issues SET status = $1, title = $2
           WHERE org_id = $3 AND id = $4`,
          [status, issueTitle, org_id, issueNumber]
        );
        console.log(`GitHub issue #${issueNumber} updated with action: ${action}`);
      }

      // Invalidate cache after successful update
      await invalidateCache('issues:*');
      res.status(200).json({ message: 'webhook processed successfully' });
    } catch (error) {
      console.error('Database error processing webhook:', error);
      res.status(500).json({ error: 'database error' });
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;

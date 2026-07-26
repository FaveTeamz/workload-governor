import { Router, Request, Response } from 'express';
import { pool } from '../db';
import {
  validateGitHubSignature,
  parseGitHubPayload,
} from '../services/github-webhook';
import { invalidateCache } from '../services/redis';

const router = Router();

const SUPPORTED_ACTIONS = ['opened', 'closed', 'edited', 'labeled', 'unlabeled'];
const GOOD_FIRST_ISSUE = 'good first issue';

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

    const { action, issue, repository, label } = webhookPayload;

    // Return 200 for unsupported actions without DB changes
    if (!SUPPORTED_ACTIONS.includes(action)) {
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
      } else if (action === 'closed') {
        await pool.query(
          `UPDATE issues SET status = $1, title = $2
           WHERE org_id = $3 AND id = $4`,
          [status, issueTitle, org_id, issueNumber]
        );
        // Mark any active assignments for this issue as pending-review
        await pool.query(
          `UPDATE assignments SET status = $1
           WHERE org_id = $2 AND issue_id = $3`,
          ['pending-review', org_id, issueNumber]
        );
        console.log(`GitHub issue #${issueNumber} closed; assignments set to pending-review`);
      } else if (action === 'edited') {
        await pool.query(
          `UPDATE issues SET status = $1, title = $2
           WHERE org_id = $3 AND id = $4`,
          [status, issueTitle, org_id, issueNumber]
        );
        console.log(`GitHub issue #${issueNumber} updated with action: ${action}`);
      } else if (action === 'labeled') {
        if (label?.name?.toLowerCase() === GOOD_FIRST_ISSUE) {
          await pool.query(
            `INSERT INTO github_issue_labels (org_id, issue_id, label_name) VALUES ($1, $2, $3)
             ON CONFLICT (org_id, issue_id, label_name) DO NOTHING`,
            [org_id, issueNumber, label.name]
          );
          console.log(`GitHub issue #${issueNumber} labeled "${label.name}"`);
        }
      } else if (action === 'unlabeled') {
        if (label?.name?.toLowerCase() === GOOD_FIRST_ISSUE) {
          await pool.query(
            `DELETE FROM github_issue_labels WHERE org_id = $1 AND issue_id = $2 AND label_name = $3`,
            [org_id, issueNumber, label.name]
          );
          console.log(`GitHub issue #${issueNumber} unlabeled "${label.name}"`);
        }
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

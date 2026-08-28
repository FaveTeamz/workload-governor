import { Router, Request, Response } from 'express';
import { pool } from '../db';
import {
  validateGitHubSignature,
} from '../services/github-webhook';
import { invalidateCache } from '../services/redis';

const router = Router();

interface GitHubLabel {
  name: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
}

interface GitHubRepository {
  name: string;
}

interface GitHubWebhookBody {
  action?: string;
  issue?: GitHubIssue;
  label?: GitHubLabel;
  repository?: GitHubRepository;
}

const GOOD_FIRST_ISSUE = 'good first issue';

// POST /webhooks/github
router.post('/github', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;

  if (!signature) {
    return res.status(401).json({ error: 'missing signature' });
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'webhook not configured' });
  }

  // Validate the raw JSON string used for HMAC
  const payload = JSON.stringify(req.body);

  try {
    if (!validateGitHubSignature(payload, signature, secret)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
  } catch {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const body = req.body as GitHubWebhookBody;
  const { action, issue, repository } = body;

  // Require both issue and repository fields to be present
  if (!action || !issue || !repository) {
    return res.status(200).json({ message: 'event ignored' });
  }

  const issueNumber = issue.number;
  const issueTitle = issue.title;
  const orgId = repository.name;
  const issueState = issue.state;

  try {
    switch (action) {
      case 'opened': {
        // Upsert the issue into the issues table
        await pool.query(
          `INSERT INTO issues (org_id, title, status) VALUES ($1, $2, $3)
           ON CONFLICT (org_id, id) DO NOTHING`,
          [orgId, issueTitle, issueState === 'closed' ? 'closed' : 'open']
        );
        console.log(`GitHub issue #${issueNumber} created`);
        break;
      }

      case 'closed': {
        // Update the issue status to closed
        await pool.query(
          `UPDATE issues SET status = $1, title = $2
           WHERE org_id = $3 AND id = $4`,
          ['closed', issueTitle, orgId, issueNumber]
        );
        // Mark any active assignments for this issue as pending-review
        await pool.query(
          `UPDATE assignments SET status = $1
           WHERE org_id = $2 AND issue_id = $3`,
          ['pending-review', orgId, issueNumber]
        );
        console.log(`GitHub issue #${issueNumber} closed; assignments marked pending-review`);
        break;
      }

      case 'edited': {
        await pool.query(
          `UPDATE issues SET status = $1, title = $2
           WHERE org_id = $3 AND id = $4`,
          [issueState === 'closed' ? 'closed' : 'open', issueTitle, orgId, issueNumber]
        );
        console.log(`GitHub issue #${issueNumber} updated with action: ${action}`);
        break;
      }

      case 'labeled': {
        const labelName = body.label?.name;
        if (labelName !== GOOD_FIRST_ISSUE) {
          return res.status(200).json({ message: 'event ignored' });
        }
        // Upsert issue and record the label
        await pool.query(
          `INSERT INTO issues (org_id, title, status) VALUES ($1, $2, $3)
           ON CONFLICT (org_id, id) DO NOTHING`,
          [orgId, issueTitle, issueState === 'closed' ? 'closed' : 'open']
        );
        await pool.query(
          `INSERT INTO label_records (org_id, issue_number, label) VALUES ($1, $2, $3)
           ON CONFLICT (org_id, issue_number, label) DO NOTHING`,
          [orgId, issueNumber, GOOD_FIRST_ISSUE]
        );
        console.log(`GitHub issue #${issueNumber} labeled good-first-issue`);
        break;
      }

      case 'unlabeled': {
        const labelName = body.label?.name;
        if (labelName !== GOOD_FIRST_ISSUE) {
          return res.status(200).json({ message: 'event ignored' });
        }
        // Remove the label record
        await pool.query(
          `DELETE FROM label_records WHERE org_id = $1 AND issue_number = $2 AND label = $3`,
          [orgId, issueNumber, GOOD_FIRST_ISSUE]
        );
        console.log(`GitHub issue #${issueNumber} unlabeled good-first-issue`);
        break;
      }

      default:
        return res.status(200).json({ message: 'event type not supported' });
    }

    // Invalidate cache after successful update
    await invalidateCache('issues:*');
    return res.status(200).json({ message: 'webhook processed successfully' });
  } catch (error) {
    console.error('Database error processing webhook:', error);
    return res.status(500).json({ error: 'database error' });
  }
});

// ---------------------------------------------------------------------------
// POST /webhooks/org — register a new webhook URL for an org
// ---------------------------------------------------------------------------

router.post('/org', async (req: Request, res: Response) => {
  const { org_id, url, secret } = req.body as {
    org_id?: string;
    url?: string;
    secret?: string;
  };

  if (!org_id || typeof org_id !== 'string' || org_id.trim() === '') {
    return res.status(400).json({ error: 'org_id is required' });
  }

  if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
    return res.status(400).json({ error: 'url must start with https://' });
  }

  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    return res.status(400).json({ error: 'secret is required' });
  }

  try {
    const result = await pool.query<{
      id: number;
      org_id: string;
      url: string;
      created_at: string;
    }>(
      `INSERT INTO org_webhooks (org_id, url, secret)
       VALUES ($1, $2, $3)
       RETURNING id, org_id, url, created_at`,
      [org_id.trim(), url, secret],
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Database error registering webhook:', error);
    return res.status(500).json({ error: 'database error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /webhooks/org/:id — remove a registered webhook
// ---------------------------------------------------------------------------

router.delete('/org/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM org_webhooks WHERE id = $1',
      [id],
    );

    // result.rows contains the deleted rows (real pg) or deleted array (MockPool)
    const deletedCount = (result as { rowCount?: number | null; rows: unknown[] }).rowCount
      ?? result.rows.length;
    if (!deletedCount || deletedCount === 0) {
      return res.status(404).json({ error: 'webhook not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Database error removing webhook:', error);
    return res.status(500).json({ error: 'database error' });
  }
});

// ---------------------------------------------------------------------------
// POST /webhooks/org  — register an org webhook endpoint (issue #196)
// ---------------------------------------------------------------------------

interface RegisterWebhookBody {
  org_id?: string;
  url?: string;
  secret?: string;
}

router.post('/org', async (req: Request, res: Response) => {
  const body = req.body as RegisterWebhookBody;

  if (!body.org_id || typeof body.org_id !== 'string' || body.org_id.trim() === '') {
    return res.status(400).json({ error: 'org_id is required' });
  }

  if (!body.url || typeof body.url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  if (!body.url.startsWith('https://')) {
    return res.status(400).json({ error: 'url must start with https://' });
  }

  if (!body.secret || typeof body.secret !== 'string' || body.secret.trim() === '') {
    return res.status(400).json({ error: 'secret is required' });
  }

  try {
    const result = await pool.query<{ id: number; org_id: string; url: string; created_at: string }>(
      `INSERT INTO org_webhooks (org_id, url, secret)
       VALUES ($1, $2, $3)
       RETURNING id, org_id, url, created_at`,
      [body.org_id.trim(), body.url.trim(), body.secret.trim()],
    );

    const row = result.rows[0];
    return res.status(201).json({
      id: row.id,
      org_id: row.org_id,
      url: row.url,
      created_at: row.created_at,
    });
  } catch (error) {
    console.error('Database error registering webhook:', error);
    return res.status(500).json({ error: 'database error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /webhooks/org/:id  — remove a registered org webhook (issue #196)
// ---------------------------------------------------------------------------

router.delete('/org/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid webhook id' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM org_webhooks WHERE id = $1`,
      [id],
    );

    // rowCount is null-safe: 0 means no row was deleted
    const deleted = (result as unknown as { rowCount: number }).rowCount ?? 0;
    if (deleted === 0) {
      return res.status(404).json({ error: 'webhook not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Database error deleting webhook:', error);
    return res.status(500).json({ error: 'database error' });
  }
});

export default router;

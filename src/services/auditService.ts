import { pool } from '../db';
import { logger } from '../logger';

export type AuditEventType =
  | 'cap_update'
  | 'maintainer_register'
  | 'api_key_created'
  | 'api_key_revoked';

export interface AuditEntry {
  id?: number;
  event_type: AuditEventType;
  actor: string;        // admin public key or IP
  ip_address?: string;
  resource?: string;    // e.g. "global_cap", "per_org_cap"
  previous_value?: unknown;
  new_value?: unknown;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

/**
 * Persist a single audit entry.
 * Designed to be called fire-and-forget; errors are logged but never rethrown
 * so they never fail the originating request.
 */
export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (event_type, actor, ip_address, resource, previous_value, new_value, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        entry.event_type,
        entry.actor,
        entry.ip_address ?? null,
        entry.resource ?? null,
        entry.previous_value !== undefined ? JSON.stringify(entry.previous_value) : null,
        entry.new_value !== undefined ? JSON.stringify(entry.new_value) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ],
    );
  } catch (err) {
    logger.error({
      message: 'Failed to write audit log entry',
      event_type: entry.event_type,
      actor: entry.actor,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Retrieve paginated audit log entries.
 * Used by GET /api/v1/audit/logs.
 */
export async function getAuditLogs(opts: {
  event_type?: string;
  actor?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AuditEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.event_type) {
    params.push(opts.event_type);
    conditions.push(`event_type = $${params.length}`);
  }
  if (opts.actor) {
    params.push(opts.actor);
    conditions.push(`actor = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitNum = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offsetNum = Math.max(opts.offset ?? 0, 0);

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM audit_logs ${where}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).total as string,
    10,
  );

  const result = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limitNum, offsetNum],
  );

  return { rows: result.rows as AuditEntry[], total };
}

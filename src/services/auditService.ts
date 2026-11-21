import { db } from '../config/database';
import { logAuditEvent } from '../logger';

export type CancellationReasonCode = 
  | 'CONTRIBUTOR_WITHDREW' 
  | 'MAINTAINER_REVOKED' 
  | 'TTL_EXPIRED' 
  | 'ADMIN_CANCELLED';

export interface CancellationRecord {
  event_type: string;
  actor: string;
  contributor: string;
  org_id: string;
  issue_id: number;
  reason: CancellationReasonCode | string;
  timestamp: Date;
  tx_hash: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  org_id?: string;
  isAdmin?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class AuditService {
  /**
   * Get paginated cancellation audit records
   */
  async getCancellations(params: PaginationParams): Promise<PaginatedResult<CancellationRecord>> {
    const { page = 1, pageSize = 50, org_id, isAdmin = false } = params;
    const offset = (page - 1) * pageSize;
    const limit = Math.min(pageSize, 200);

    // Build query
    let query = db('cancellation_audit').select('*');

    // Apply org filter (required for non-admin)
    if (org_id) {
      query = query.where('org_id', org_id);
    } else if (!isAdmin) {
      throw new Error('org_id filter is required for non-admin users');
    }

    // Get total count
    const countResult = await query.clone().count('* as total').first();
    const total = parseInt(countResult?.total || '0', 10);

    // Get paginated results
    const data = await query
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      data: data.map(this.mapRecord),
      total,
      page,
      pageSize: limit,
      totalPages,
    };
  }

  /**
   * Map database record to CancellationRecord
   */
  private mapRecord(record: any): CancellationRecord {
    return {
      event_type: record.event_type,
      actor: record.actor,
      contributor: record.contributor,
      org_id: record.org_id,
      issue_id: record.issue_id,
      reason: record.reason || '',
      timestamp: record.timestamp,
      tx_hash: record.tx_hash || '',
    };
  }

  /**
   * Get cancellations for a specific org with optional date range
   */
  async getOrgCancellations(
    org_id: string,
    startDate?: Date,
    endDate?: Date,
    page: number = 1,
    pageSize: number = 50
  ): Promise<PaginatedResult<CancellationRecord>> {
    let query = db('cancellation_audit')
      .where('org_id', org_id);

    if (startDate) {
      query = query.where('timestamp', '>=', startDate);
    }
    if (endDate) {
      query = query.where('timestamp', '<=', endDate);
    }

    const countResult = await query.clone().count('* as total').first();
    const total = parseInt(countResult?.total || '0', 10);

    const data = await query
      .orderBy('timestamp', 'desc')
      .limit(Math.min(pageSize, 200))
      .offset((page - 1) * pageSize);

    return {
      data: data.map(this.mapRecord),
      total,
      page,
      pageSize: Math.min(pageSize, 200),
      totalPages: Math.ceil(total / Math.min(pageSize, 200)),
    };
  }

  /**
   * Get summary statistics for org cancellations
   */
  async getCancellationStats(org_id?: string): Promise<{
    total: number;
    byEventType: Record<string, number>;
    byActor: Record<string, number>;
    byReason: Record<string, number>;
  }> {
    let query = db('cancellation_audit');
    
    if (org_id) {
      query = query.where('org_id', org_id);
    }

    const totalResult = await query.clone().count('* as total').first();
    const total = parseInt(totalResult?.total || '0', 10);

    // Group by event_type
    const byEventTypeResult = await query.clone()
      .select('event_type')
      .count('* as count')
      .groupBy('event_type');

    const byEventType: Record<string, number> = {};
    byEventTypeResult.forEach((row: any) => {
      byEventType[row.event_type] = parseInt(row.count, 10);
    });

    // Group by actor
    const byActorResult = await query.clone()
      .select('actor')
      .count('* as count')
      .groupBy('actor')
      .orderBy('count', 'desc')
      .limit(10);

    const byActor: Record<string, number> = {};
    byActorResult.forEach((row: any) => {
      byActor[row.actor] = parseInt(row.count, 10);
    });

    // Group by reason
    const byReasonResult = await query.clone()
      .select('reason')
      .count('* as count')
      .groupBy('reason')
      .orderBy('count', 'desc');

    const byReason: Record<string, number> = {};
    byReasonResult.forEach((row: any) => {
      if (row.reason) {
        byReason[row.reason] = parseInt(row.count, 10);
      }
    });

    return { total, byEventType, byActor, byReason };
  }

  // ---------------------------------------------------------------------------
  // Structured audit event emission (#1323)
  // ---------------------------------------------------------------------------

  /**
   * Emit a structured audit event for a cancellation action.
   *
   * Call this whenever a cancellation is created or its status changes so that
   * the event is queryable in CloudWatch Logs Insights via:
   *   fields @timestamp, action, actor.id, target.id, outcome
   *   | filter audit = true && action = "cancellation"
   */
  emitCancellationAudit(
    record: Pick<CancellationRecord, 'event_type' | 'actor' | 'org_id' | 'issue_id' | 'reason' | 'tx_hash'>,
    outcome: 'success' | 'failure' = 'success',
  ): void {
    logAuditEvent({
      action: record.event_type,
      actor: {
        type: 'admin',
        id: record.actor,
      },
      target: {
        type: 'issue',
        id: String(record.issue_id),
      },
      outcome,
      details: {
        org_id: record.org_id,
        reason: record.reason,
        tx_hash: record.tx_hash,
      },
    });
  }
}

export const auditService = new AuditService();

export type CancellationReasonCode = 
  | 'CONTRIBUTOR_WITHDREW' 
  | 'MAINTAINER_REVOKED' 
  | 'TTL_EXPIRED' 
  | 'ADMIN_CANCELLED';

export function computeAuditHash(entry: {
  prev_hash: string;
  event_type: string;
  actor: string;
  resource?: string;
  previous_value?: unknown;
  new_value?: unknown;
  timestamp: string;
}): string {
  const content = `${entry.prev_hash}|${entry.event_type}|${entry.actor}|${entry.resource ?? ''}|${JSON.stringify(entry.previous_value ?? null)}|${JSON.stringify(entry.new_value ?? null)}|${entry.timestamp}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function verifyAuditLogChain(entries?: AuditEntry[]): Promise<{ valid: boolean; brokenAtId?: number }> {
  try {
    const logs = entries ?? (await pool.query('SELECT * FROM audit_logs ORDER BY id ASC')).rows as AuditEntry[];
    let prevHash = 'GENESIS_HASH';
    for (const log of logs) {
      const timestamp = log.created_at ?? '';
      const expectedHash = computeAuditHash({
        prev_hash: log.prev_hash || prevHash,
        event_type: log.event_type,
        actor: log.actor,
        resource: log.resource,
        previous_value: log.previous_value,
        new_value: log.new_value,
        timestamp,
      });
      if (log.entry_hash && log.entry_hash !== expectedHash) {
        return { valid: false, brokenAtId: log.id };
      }
      prevHash = log.entry_hash ?? expectedHash;
    }
    return { valid: true };
  } catch (err) {
    logger.error({ message: 'Audit chain verification failed', error: String(err) });
    return { valid: false };
  }
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

    logger.info({
      ecs: { version: '8.11.0' },
      event: {
        action: entry.event_type,
        category: 'audit',
        created: new Date().toISOString(),
      },
      user: {
        name: entry.actor,
      },
      client: {
        ip: entry.ip_address ?? null,
      },
      service: {
        name: 'workload-governor-backend',
      },
      audit: {
        resource: entry.resource ?? null,
        previous_value: entry.previous_value,
        new_value: entry.new_value,
        metadata: entry.metadata,
      },
      message: `Audit event recorded: ${entry.event_type} by ${entry.actor}`,
    });
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

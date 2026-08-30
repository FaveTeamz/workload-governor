import { db } from '../config/database';
import { cancellationAudit } from '../cancellation_audit';

export interface CancellationRecord {
  event_type: string;
  actor: string;
  contributor: string;
  org_id: string;
  issue_id: number;
  reason: string;
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

    return { total, byEventType, byActor };
  }
}

export const auditService = new AuditService();

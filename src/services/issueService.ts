import { db } from '../config/database';
import { redisClient } from '../config/redis';
import { syncIssues } from '../github';

export interface IssueFilter {
  org_id?: string;
  label?: string;
  status?: 'open' | 'assigned' | 'available';
  page?: number;
  page_size?: number;
  search?: string;
}

export interface Issue {
  id: string;
  org_id: string;
  title: string;
  number: number;
  url: string;
  labels: string[];
  applicant_count: number;
  max_applicants: number;
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class IssueService {
  private readonly CACHE_TTL = 30; // 30 seconds
  private readonly DEFAULT_PAGE_SIZE = 20;
  private readonly MAX_PAGE_SIZE = 100;

  /**
   * Get issues with filtering and pagination
   */
  async getIssues(filter: IssueFilter): Promise<PaginatedResult<Issue>> {
    const {
      org_id,
      label,
      status = 'available',
      page = 1,
      page_size = this.DEFAULT_PAGE_SIZE,
      search,
    } = filter;

    const offset = (page - 1) * page_size;
    const limit = Math.min(page_size, this.MAX_PAGE_SIZE);

    // Build cache key
    const cacheKey = this.buildCacheKey(filter);
    
    // Try to get from cache
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query
    let query = db('issues')
      .select(
        'issues.*',
        db.raw('COALESCE(applicant_count.count, 0) as applicant_count'),
        db.raw('COALESCE(assigned.assignee, NULL) as assigned_to')
      )
      .leftJoin(
        db('applications')
          .select('issue_id', db.raw('COUNT(*) as count'))
          .where('status', 'pending')
          .groupBy('issue_id')
          .as('applicant_count'),
        'issues.id',
        'applicant_count.issue_id'
      )
      .leftJoin(
        db('assignments')
          .select('issue_id', 'contributor as assignee')
          .where('status', 'active')
          .as('assigned'),
        'issues.id',
        'assigned.issue_id'
      )
      .where('issues.status', 'open');

    // Apply filters
    if (org_id) {
      query = query.where('issues.org_id', org_id);
    }

    if (label) {
      query = query.whereRaw('? = ANY(issues.labels)', [label]);
    }

    // Status filter
    if (status === 'assigned') {
      query = query.whereNotNull('assigned.assignee');
    } else if (status === 'available') {
      query = query
        .whereRaw('COALESCE(applicant_count.count, 0) < issues.max_applicants')
        .andWhereNull('assigned.assignee');
    }
    // 'open' status includes both assigned and unassigned

    if (search) {
      query = query.where('issues.title', 'ilike', `%${search}%`);
    }

    // Get total count
    const countResult = await query.clone().count('* as total').first();
    const total = parseInt(countResult?.total || '0', 10);

    // Get paginated results
    const data = await query
      .orderBy('issues.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Process labels
    const processedData = data.map((record: any) => ({
      id: record.id,
      org_id: record.org_id,
      title: record.title,
      number: record.number,
      url: record.url,
      labels: record.labels || [],
      applicant_count: parseInt(record.applicant_count || '0', 10),
      max_applicants: record.max_applicants || 1,
      assigned_to: record.assigned_to || null,
      created_at: record.created_at,
      updated_at: record.updated_at,
    }));

    const result = {
      data: processedData,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    };

    // Cache the result
    await this.setCache(cacheKey, result);

    return result;
  }

  /**
   * Get issue by ID
   */
  async getIssueById(id: string): Promise<Issue | null> {
    const record = await db('issues')
      .where('id', id)
      .first();

    if (!record) return null;

    return {
      id: record.id,
      org_id: record.org_id,
      title: record.title,
      number: record.number,
      url: record.url,
      labels: record.labels || [],
      applicant_count: 0,
      max_applicants: record.max_applicants || 1,
      assigned_to: null,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  /**
   * Get issue statistics
   */
  async getIssueStats(org_id?: string): Promise<{
    total: number;
    open: number;
    assigned: number;
    available: number;
  }> {
    let query = db('issues');

    if (org_id) {
      query = query.where('org_id', org_id);
    }

    const totalResult = await query.clone().count('* as total').first();
    const total = parseInt(totalResult?.total || '0', 10);

    const openResult = await query.clone()
      .where('status', 'open')
      .count('* as count')
      .first();
    const open = parseInt(openResult?.count || '0', 10);

    // Assigned count
    const assignedResult = await query.clone()
      .whereExists(
        db('assignments')
          .whereRaw('assignments.issue_id = issues.id')
          .where('assignments.status', 'active')
      )
      .count('* as count')
      .first();
    const assigned = parseInt(assignedResult?.count || '0', 10);

    // Available count (open and not fully assigned)
    const availableResult = await query.clone()
      .where('status', 'open')
      .whereRaw('COALESCE((SELECT COUNT(*) FROM applications WHERE applications.issue_id = issues.id AND applications.status = \'pending\'), 0) < issues.max_applicants')
      .whereNotExists(
        db('assignments')
          .whereRaw('assignments.issue_id = issues.id')
          .where('assignments.status', 'active')
      )
      .count('* as count')
      .first();
    const available = parseInt(availableResult?.count || '0', 10);

    return { total, open, assigned, available };
  }

  /**
   * Build cache key from filter
   */
  private buildCacheKey(filter: IssueFilter): string {
    const { org_id, label, status, page, page_size, search } = filter;
    const parts = ['issues'];
    if (org_id) parts.push(`org_${org_id}`);
    if (label) parts.push(`label_${label}`);
    if (status) parts.push(`status_${status}`);
    if (page) parts.push(`page_${page}`);
    if (page_size) parts.push(`size_${page_size}`);
    if (search) parts.push(`search_${search}`);
    return parts.join(':');
  }

  /**
   * Get from Redis cache
   */
  private async getFromCache(key: string): Promise<PaginatedResult<Issue> | null> {
    try {
      if (!redisClient.isConnected) return null;
      const data = await redisClient.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error('Redis cache error:', error);
      return null;
    }
  }

  /**
   * Set cache in Redis
   */
  private async setCache(key: string, value: any): Promise<void> {
    try {
      if (!redisClient.isConnected) return;
      await redisClient.setex(key, this.CACHE_TTL, JSON.stringify(value));
    } catch (error) {
      console.error('Redis cache error:', error);
    }
  }

  /**
   * Invalidate cache on issue update
   */
  async invalidateCache(org_id?: string): Promise<void> {
    try {
      if (!redisClient.isConnected) return;
      // Delete all issue cache keys
      const pattern = org_id ? `issues:org_${org_id}:*` : 'issues:*';
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      console.error('Redis cache invalidation error:', error);
    }
  }
}

export const issueService = new IssueService();

/**
 * useInfiniteOrgIssues — issue #532
 *
 * Paginated variant of useOrgIssues. Fetches issues in pages of PAGE_SIZE
 * from GET /api/orgs/:orgId/issues?limit=&offset= and accumulates them so
 * the caller can implement infinite scroll without re-fetching previous pages.
 *
 * Usage:
 *   const { issues, loading, hasMore, loadMore, error, globalAppCount,
 *           orgAssignCount, setIssueStatus } = useInfiniteOrgIssues(apiBase, orgId, pubKey);
 *
 *   // Trigger the next page (e.g. from an IntersectionObserver callback):
 *   if (hasMore && !loading) loadMore();
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { IssueStatus, OrgIssue, Difficulty } from './useOrgIssues';
export type { IssueStatus, OrgIssue, Difficulty } from './useOrgIssues';

export const PAGE_SIZE = 20;

export interface UseInfiniteOrgIssuesResult {
  /** Accumulated issues across all loaded pages */
  issues: OrgIssue[];
  /** True while any page is being fetched */
  loading: boolean;
  /** True once all pages have been loaded */
  hasMore: boolean;
  /** Fetch the next page. No-op when loading or !hasMore. */
  loadMore: () => void;
  /** Re-fetch from page 0, discarding accumulated state */
  refresh: () => void;
  error: string | null;
  globalAppCount: number;
  orgAssignCount: number;
  /** Optimistically update a single issue's status */
  setIssueStatus: (issueId: string, status: IssueStatus) => void;
}

interface RawIssue {
  issue_id: string;
  org_id: string;
  title: string;
  status: string;
  reward_xlm?: number;
  created_at: string;
  labels?: string[];
  difficulty?: Difficulty;
  applicant_count?: number;
}

interface RawApplication {
  issue_id: string;
}

interface RawAssignment {
  issue_id: string;
}

export function useInfiniteOrgIssues(
  apiBase: string,
  orgId: string,
  contributorAddress: string | null,
): UseInfiniteOrgIssuesResult {
  const [issues, setIssues]           = useState<OrgIssue[]>([]);
  const [loading, setLoading]         = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [globalAppCount, setGlobalApp] = useState(0);
  const [orgAssignCount, setOrgAssign] = useState(0);

  // Track the current offset so loadMore always appends the right slice.
  const offsetRef = useRef(0);
  // Guard against multiple simultaneous fetches
  const fetchingRef = useRef(false);

  // Pre-fetched contributor state so we don't re-fetch on every page turn.
  const appliedRef  = useRef(new Set<string>());
  const assignedRef = useRef(new Set<string>());
  const statsLoadedRef = useRef(false);

  // ── Fetch contributor status once (first page load) ───────────────────────

  const fetchContributorState = useCallback(async () => {
    if (!contributorAddress || statsLoadedRef.current) return;

    const [appsRes, asgnRes, statsRes] = await Promise.allSettled([
      fetch(`${apiBase}/contributors/${encodeURIComponent(contributorAddress)}/applications`),
      fetch(`${apiBase}/contributors/${encodeURIComponent(contributorAddress)}/assignments`),
      fetch(`${apiBase}/contributors/${encodeURIComponent(contributorAddress)}/counts`),
    ]);

    if (appsRes.status === 'fulfilled' && appsRes.value.ok) {
      const apps: RawApplication[] = await appsRes.value.json();
      appliedRef.current = new Set(apps.map((a) => a.issue_id));
    }
    if (asgnRes.status === 'fulfilled' && asgnRes.value.ok) {
      const asgns: RawAssignment[] = await asgnRes.value.json();
      assignedRef.current = new Set(asgns.map((a) => a.issue_id));
    }
    if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
      const stats = (await statsRes.value.json()) as {
        totalApplications: number;
        byOrganization: { org_id: string; assignments: number }[];
      };
      setGlobalApp(stats.totalApplications ?? 0);
      const orgRow = stats.byOrganization?.find((r) => r.org_id === orgId);
      setOrgAssign(orgRow?.assignments ?? 0);
    }

    statsLoadedRef.current = true;
  }, [apiBase, contributorAddress, orgId]);

  // ── Core page fetcher ─────────────────────────────────────────────────────

  const fetchPage = useCallback(async (offset: number) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Fetch contributor state on first page
      if (offset === 0) {
        statsLoadedRef.current = false;
        await fetchContributorState();
      }

      const url = `${apiBase}/orgs/${encodeURIComponent(orgId)}/issues?limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Issues fetch failed: ${res.status}`);

      const rawIssues: RawIssue[] = await res.json();

      // Merge status from contributor state
      const merged: OrgIssue[] = rawIssues.map((raw) => {
        let status: IssueStatus = 'open';
        if (assignedRef.current.has(raw.issue_id))     status = 'assigned';
        else if (appliedRef.current.has(raw.issue_id)) status = 'applied';
        return {
          issue_id: raw.issue_id,
          org_id: raw.org_id,
          title: raw.title,
          status,
          reward_xlm: raw.reward_xlm,
          created_at: raw.created_at,
          labels: raw.labels,
          difficulty: raw.difficulty,
          applicant_count: raw.applicant_count,
        };
      });

      setIssues((prev) => (offset === 0 ? merged : [...prev, ...merged]));
      offsetRef.current = offset + rawIssues.length;

      // If fewer results than page size, we've reached the end
      setHasMore(rawIssues.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [apiBase, orgId, fetchContributorState]);

  // ── Initial load + reset when orgId / contributor changes ─────────────────

  useEffect(() => {
    offsetRef.current = 0;
    appliedRef.current = new Set();
    assignedRef.current = new Set();
    statsLoadedRef.current = false;
    setIssues([]);
    setHasMore(true);
    void fetchPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, orgId, contributorAddress]);

  // ── Public API ────────────────────────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (loading || !hasMore || fetchingRef.current) return;
    void fetchPage(offsetRef.current);
  }, [loading, hasMore, fetchPage]);

  const refresh = useCallback(() => {
    offsetRef.current = 0;
    appliedRef.current = new Set();
    assignedRef.current = new Set();
    statsLoadedRef.current = false;
    setIssues([]);
    setHasMore(true);
    void fetchPage(0);
  }, [fetchPage]);

  function setIssueStatus(issueId: string, status: IssueStatus) {
    setIssues((prev) =>
      prev.map((i) => (i.issue_id === issueId ? { ...i, status } : i)),
    );
  }

  return {
    issues,
    loading,
    hasMore,
    loadMore,
    refresh,
    error,
    globalAppCount,
    orgAssignCount,
    setIssueStatus,
  };
}

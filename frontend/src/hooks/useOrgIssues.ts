/**
 * useOrgIssues — issue #199
 *
 * Fetches open issues for an org and tracks the contributor's applied/assigned
 * status for each, merging with cap counts for disable logic.
 */
import { useState, useEffect, useCallback } from 'react';

export type IssueStatus = 'open' | 'applied' | 'assigned';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface OrgIssue {
  issue_id: string;
  org_id: string;
  title: string;
  status: IssueStatus;
  reward_xlm?: number;
  created_at: string;
  /** Optional label names for filtering */
  labels?: string[];
  /** Optional difficulty tag */
  difficulty?: Difficulty;
  /** Number of pending applicants */
  applicant_count?: number;
}

interface RawIssue {
  issue_id: string;
  org_id: string;
  title: string;
  status: string;
  reward_xlm?: number;
  created_at: string;
  labels?: string[];
  difficulty?: string;
  applicant_count?: number;
}

interface RawApplication {
  issue_id: string;
}

interface RawAssignment {
  issue_id: string;
}

export interface UseOrgIssuesResult {
  issues: OrgIssue[];
  loading: boolean;
  error: string | null;
  globalAppCount: number;
  orgAssignCount: number;
  refresh: () => void;
  /** Optimistically update a single issue's status */
  setIssueStatus: (issueId: string, status: IssueStatus) => void;
}

export function useOrgIssues(
  apiBase: string,
  orgId: string,
  contributorAddress: string | null,
): UseOrgIssuesResult {
  const [issues, setIssues]             = useState<OrgIssue[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [globalAppCount, setGlobalApp]  = useState(0);
  const [orgAssignCount, setOrgAssign]  = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch open issues
      const issuesRes = await fetch(`${apiBase}/orgs/${encodeURIComponent(orgId)}/issues`);
      if (!issuesRes.ok) throw new Error(`Issues fetch failed: ${issuesRes.status}`);
      const rawIssues: RawIssue[] = await issuesRes.json();

      let applied   = new Set<string>();
      let assigned  = new Set<string>();
      let gCount    = 0;
      let oCount    = 0;

      // 2. If connected, enrich with contributor's application/assignment status
      if (contributorAddress) {
        const [appsRes, asgnRes, statsRes] = await Promise.allSettled([
          fetch(`${apiBase}/contributors/${encodeURIComponent(contributorAddress)}/applications`),
          fetch(`${apiBase}/contributors/${encodeURIComponent(contributorAddress)}/assignments`),
          fetch(`${apiBase}/contributors/${encodeURIComponent(contributorAddress)}/counts`),
        ]);

        if (appsRes.status === 'fulfilled' && appsRes.value.ok) {
          const apps: RawApplication[] = await appsRes.value.json();
          applied = new Set(apps.map((a) => a.issue_id));
        }
        if (asgnRes.status === 'fulfilled' && asgnRes.value.ok) {
          const asgns: RawAssignment[] = await asgnRes.value.json();
          assigned = new Set(asgns.map((a) => a.issue_id));
        }
        if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
          const stats = await statsRes.value.json() as {
            totalApplications: number;
            byOrganization: { org_id: string; assignments: number }[];
          };
          gCount = stats.totalApplications ?? 0;
          const orgRow = stats.byOrganization?.find((r) => r.org_id === orgId);
          oCount = orgRow?.assignments ?? 0;
        }
      }

      // 3. Merge status
      const merged: OrgIssue[] = rawIssues.map((raw) => {
        let status: IssueStatus = 'open';
        if (assigned.has(raw.issue_id))     status = 'assigned';
        else if (applied.has(raw.issue_id)) status = 'applied';
        return {
          ...raw,
          status,
          difficulty: raw.difficulty as OrgIssue['difficulty'],
        };
      });

      setIssues(merged);
      setGlobalApp(gCount);
      setOrgAssign(oCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiBase, orgId, contributorAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  function setIssueStatus(issueId: string, status: IssueStatus) {
    setIssues((prev) =>
      prev.map((i) => (i.issue_id === issueId ? { ...i, status } : i))
    );
  }

  return { issues, loading, error, globalAppCount, orgAssignCount, refresh: load, setIssueStatus };
}

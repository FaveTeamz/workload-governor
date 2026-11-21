import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types (mirror backend IssueDetailResponse)
// ---------------------------------------------------------------------------

export interface IssueDetail {
  id: number;
  org_id: string;
  title: string;
  /** Raw Markdown body. May be null for legacy rows. */
  body: string | null;
  /** Comma-separated label names. May be null. */
  labels: string | null;
  github_url: string | null;
  status: string;
  created_at: string;
}

export interface IssueEvent {
  id: number;
  event_type: 'applied' | 'assigned' | 'completed' | 'revoked' | string;
  contributor: string | null;
  actor: string;
  timestamp: string;
  tx_hash: string | null;
}

export interface IssueDetailData {
  issue: IssueDetail;
  applicant_count: number;
  /** Currently-assigned contributor address, or null. */
  assigned_to: string | null;
  events: IssueEvent[];
}

export interface UseIssueDetailResult {
  data: IssueDetailData | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch the issue detail (e.g. after apply / withdraw). */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches full issue detail from `GET /api/issues/:org_id/:issue_id`.
 *
 * - Returns loading/error/data state.
 * - Exposes a `refetch` callback to reload after mutations.
 * - Aborts in-flight requests when params change or the component unmounts.
 */
export function useIssueDetail(
  apiBase: string,
  orgId: string,
  issueId: string,
): UseIssueDetailResult {
  const [data, setData] = useState<IssueDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId || !issueId) return;

    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(`${apiBase}/issues/${encodeURIComponent(orgId)}/${encodeURIComponent(issueId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<IssueDetailData>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiBase, orgId, issueId, tick]);

  return { data, loading, error, refetch };
}

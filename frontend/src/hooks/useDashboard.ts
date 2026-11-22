/**
 * useDashboard — issue #198
 *
 * Fetches the signed-in contributor's global application count and per-org
 * assignment counts, then exposes helpers needed by the /dashboard page.
 */
import { useState, useEffect, useCallback } from 'react';

export const GLOBAL_CAP = 15;
export const ORG_CAP    = 4;

export interface OrgUsage {
  org_id: string;
  assignments: number;
  applications: number;
}

export interface DashboardData {
  globalApplicationCount: number;
  orgUsage: OrgUsage[];
  lastRefreshed: Date | null;
}

type FetchState = 'idle' | 'loading' | 'error';

export interface UseDashboardResult {
  data: DashboardData | null;
  state: FetchState;
  error: string | null;
  refresh: () => void;
  /** true when global count ≥ 12 or any org count ≥ 3 */
  showWarning: boolean;
}

export function useDashboard(apiBase: string, address: string | null): UseDashboardResult {
  const [data, setData]   = useState<DashboardData | null>(null);
  const [state, setState] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;

    setState('loading');
    setError(null);

    try {
      const statsRes = await fetch(`${apiBase}/contributors/${address}/counts`);
      if (!statsRes.ok) throw new Error(`Stats fetch failed: ${statsRes.status}`);

      const stats = await statsRes.json() as {
        totalApplications: number;
        byOrganization: { org_id: string; applications: number; assignments: number }[];
      };

      const orgUsage: OrgUsage[] = (stats.byOrganization ?? []).map((o) => ({
        org_id: o.org_id,
        assignments: o.assignments ?? 0,
        applications: o.applications ?? 0,
      }));

      setData({
        globalApplicationCount: stats.totalApplications ?? 0,
        orgUsage,
        lastRefreshed: new Date(),
      });
      setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, [apiBase, address]);

  // Auto-load when address becomes available
  useEffect(() => {
    if (address) void load();
  }, [address, load]);

  const showWarning =
    data !== null &&
    (data.globalApplicationCount >= 12 ||
      data.orgUsage.some((o) => o.assignments >= 3));

  return { data, state, error, refresh: load, showWarning };
}

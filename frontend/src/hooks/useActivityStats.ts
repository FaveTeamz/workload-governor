import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthlyActivity {
  /** "YYYY-MM" */
  month: string;
  applied: number;
  assigned: number;
  completed: number;
}

export interface ActivityStatsResult {
  activity: MonthlyActivity[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches 12-month activity stats from
 * `GET /api/contributors/:address/activity`.
 *
 * Returns loading / error / data state and a refetch callback.
 * Aborts in-flight requests on param change or unmount.
 */
export function useActivityStats(
  apiBase: string,
  address: string,
): ActivityStatsResult {
  const [activity, setActivity] = useState<MonthlyActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!address) return;

    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(
      `${apiBase}/contributors/${encodeURIComponent(address)}/activity`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ activity: MonthlyActivity[] }>;
      })
      .then(({ activity: data }) => {
        if (!cancelled) setActivity(data);
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
  }, [apiBase, address, tick]);

  return { activity, loading, error, refetch };
}

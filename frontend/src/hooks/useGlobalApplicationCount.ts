import { useState, useEffect, useCallback } from "react";

const GLOBAL_CAP = 15;

export interface GlobalApplicationCountState {
  count: number;
  loading: boolean;
  error: string | null;
  capReached: boolean;
  refetch: () => void;
}

export function useGlobalApplicationCount(
  walletAddress: string | null,
  apiBase = "/api"
): GlobalApplicationCountState {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!walletAddress) {
      setCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${apiBase}/contributors/${encodeURIComponent(walletAddress)}/global-count`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setCount(typeof data.global_application_count === "number" ? data.global_application_count : 0);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch application count");
          setCount(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [walletAddress, apiBase, tick]);

  return { count, loading, error, capReached: count >= GLOBAL_CAP, refetch };
}

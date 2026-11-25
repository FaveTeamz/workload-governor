import { useState, useEffect, useRef } from "react";
import { useWallet } from "./useWallet";

export type AuthStatus = "loading" | "authorized" | "forbidden" | "no-wallet";

/**
 * Cache entry for a single (publicKey, orgId) authorization result.
 * Entries expire after CACHE_TTL_MS to allow re-validation on navigation.
 */
interface CacheEntry {
  status: "authorized" | "forbidden";
  /** Timestamp (ms) when the entry was written */
  cachedAt: number;
}

/** How long a cached authorization result stays valid (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * In-memory cache keyed by `${publicKey}::${orgId}`.
 *
 * A module-level Map acts like a lightweight SWR cache without an external
 * dependency.  The cache is intentionally process-scoped (not persisted) so
 * it is automatically invalidated on page reload or wallet disconnect.
 */
const authCache = new Map<string, CacheEntry>();

/**
 * Returns a stable cache key for the given wallet address and org.
 */
function cacheKey(publicKey: string, orgId: string): string {
  return `${publicKey}::${orgId}`;
}

/**
 * Reads a non-expired cache entry, or returns `null` if absent / stale.
 */
function readCache(
  publicKey: string,
  orgId: string
): "authorized" | "forbidden" | null {
  const entry = authCache.get(cacheKey(publicKey, orgId));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    // Entry has expired – evict it and re-fetch
    authCache.delete(cacheKey(publicKey, orgId));
    return null;
  }
  return entry.status;
}

/**
 * Writes an authorization result into the cache.
 */
function writeCache(
  publicKey: string,
  orgId: string,
  status: "authorized" | "forbidden"
): void {
  authCache.set(cacheKey(publicKey, orgId), { status, cachedAt: Date.now() });
}

/**
 * Invalidates every cached entry for the given wallet address.
 * Call this on disconnect so stale "authorized" entries are never reused
 * by a different wallet that connects later.
 */
export function invalidateMaintainerAuthCache(publicKey: string): void {
  for (const key of authCache.keys()) {
    if (key.startsWith(`${publicKey}::`)) authCache.delete(key);
  }
}

/**
 * Asks the backend whether `publicKey` maintains `orgId` (#1261). The backend
 * answers from the contract's read-only `is_maintainer(maintainer, org_id)`
 * view (GET /orgs/:orgId/maintainers/:address), replacing the old dummy
 * `globalThis.__contract_client__` lookup that was never wired up.
 *
 * Throws when the backend or the contract cannot be reached, so callers can
 * tell "not a maintainer" from "could not check".
 */
export async function fetchIsMaintainer(
  publicKey: string,
  orgId: string,
  apiBase = "/api",
  signal?: AbortSignal
): Promise<boolean> {
  const res = await fetch(
    `${apiBase}/orgs/${encodeURIComponent(orgId)}/maintainers/${encodeURIComponent(publicKey)}`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(`Maintainer check failed (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { is_maintainer?: unknown };
  return body.is_maintainer === true;
}

export interface MaintainerStatus {
  isMaintainer: boolean;
  isLoading: boolean;
  error: Error | null;
}

/**
 * `{ isMaintainer, isLoading, error }` for the connected wallet and `orgId`.
 * `isMaintainer` stays false while loading, on error, and with no wallet, so
 * maintainer controls are only ever shown after a positive answer.
 */
export function useMaintainerStatus(orgId: string, apiBase = "/api"): MaintainerStatus {
  const { publicKey } = useWallet();
  const [state, setState] = useState<MaintainerStatus>({ isMaintainer: false, isLoading: true, error: null });

  useEffect(() => {
    if (!publicKey) {
      setState({ isMaintainer: false, isLoading: false, error: null });
      return;
    }
    const cached = readCache(publicKey, orgId);
    if (cached !== null) {
      setState({ isMaintainer: cached === "authorized", isLoading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState({ isMaintainer: false, isLoading: true, error: null });
    fetchIsMaintainer(publicKey, orgId, apiBase, controller.signal)
      .then((ok) => {
        writeCache(publicKey, orgId, ok ? "authorized" : "forbidden");
        setState({ isMaintainer: ok, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ isMaintainer: false, isLoading: false, error: err instanceof Error ? err : new Error(String(err)) });
      });
    return () => controller.abort();
  }, [publicKey, orgId, apiBase]);

  return state;
}

/**
 * Checks whether the connected wallet holds a maintainer role for `orgId`.
 *
 * Authorization results are cached in memory for {@link CACHE_TTL_MS} ms so
 * rapid navigation between org pages does not hammer the Stellar RPC.
 * The cache is automatically bypassed when the wallet changes or disconnects.
 *
 * @example
 * ```tsx
 * const status = useMaintainerAuth(orgId);
 * if (status === 'loading') return <Spinner />;
 * if (status === 'forbidden') return <Navigate to="/403" />;
 * ```
 */
export function useMaintainerAuth(orgId: string, apiBase = "/api"): AuthStatus {
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Track the in-flight request to avoid stale state on rapid orgId changes
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!publicKey) {
      setStatus("no-wallet");
      return;
    }

    // Serve from cache when available
    const cached = readCache(publicKey, orgId);
    if (cached !== null) {
      setStatus(cached);
      return;
    }

    setStatus("loading");
    cancelRef.current = false;

    fetchIsMaintainer(publicKey, orgId, apiBase).then((ok) => {
      if (cancelRef.current) return;
      const resolved: "authorized" | "forbidden" = ok
        ? "authorized"
        : "forbidden";
      // Persist the result so subsequent renders skip the RPC round-trip
      writeCache(publicKey, orgId, resolved);
      setStatus(resolved);
    }).catch(() => {
      if (!cancelRef.current) setStatus("forbidden");
    });

    return () => {
      // Signal the in-flight promise to discard its result
      cancelRef.current = true;
    };
  }, [publicKey, orgId, apiBase]);

  return status;
}

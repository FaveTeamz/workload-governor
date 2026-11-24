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
 * Queries the Soroban contract `is_maintainer(maintainer, org_id)` view call
 * via the globally-injected `__contract_client__`.
 *
 * Returns `false` if the contract client is absent (dev/test environment
 * without a running Stellar node).
 */
async function queryContractIsMaintainer(
  publicKey: string,
  orgId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (globalThis as any).__contract_client__;
  if (!client) {
    // No contract client available — fall back to safe default (deny)
    return false;
  }
  return client.is_maintainer(publicKey, orgId) as Promise<boolean>;
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
export function useMaintainerAuth(orgId: string): AuthStatus {
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

    queryContractIsMaintainer(publicKey, orgId).then((ok) => {
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
  }, [publicKey, orgId]);

  return status;
}

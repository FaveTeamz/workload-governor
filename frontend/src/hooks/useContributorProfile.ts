/**
 * useContributorProfile — fetches GET /api/contributors/:address
 *
 * Returns the full contributor profile:
 *   - address
 *   - global_application_count  (pending applications, max 15)
 *   - global_assignment_count   (total assignments)
 *   - orgs                      (per-org breakdown)
 *   - recent_events             (last 50, newest first)
 *
 * State machine:
 *   idle → loading → ready | not-found | error
 */
import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgBreakdown {
  org_id: string;
  applications: number;
  assignments: number;
}

export interface ContributorEvent {
  id: number;
  event_type: string;
  org_id: string | null;
  issue_id: number | null;
  tx_hash: string;
  ledger: number;
  timestamp: string;
}

export interface ContributorProfile {
  address: string;
  global_application_count: number;
  global_assignment_count: number;
  orgs: OrgBreakdown[];
  recent_events: ContributorEvent[];
}

export type ProfileState = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

export interface UseContributorProfileResult {
  profile: ContributorProfile | null;
  state: ProfileState;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContributorProfile(
  apiBase: string,
  address: string | undefined,
): UseContributorProfileResult {
  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [state, setState]     = useState<ProfileState>('idle');
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;

    setState('loading');
    setError(null);

    try {
      const res = await fetch(`${apiBase}/contributors/${encodeURIComponent(address)}`);

      if (res.status === 404) {
        setState('not-found');
        setProfile(null);
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as ContributorProfile;
      setProfile(data);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, [apiBase, address]);

  useEffect(() => {
    if (address) void load();
  }, [address, load]);

  return { profile, state, error, refresh: load };
}

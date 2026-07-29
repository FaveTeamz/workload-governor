import { useActivityStats } from '../hooks/useActivityStats';
import { ActivityChart } from './ActivityChart';
import { StreakBadge } from './StreakBadge';
import { Button } from './Button';
import './ContributorActivity.css';

// ---------------------------------------------------------------------------
// ContributorActivity
// ---------------------------------------------------------------------------

export interface ContributorActivityProps {
  /** Stellar public key of the contributor. */
  address: string;
  /** Backend base URL. Defaults to "/api". */
  apiBase?: string;
}

/**
 * Shows the last 12 months of applied / assigned / completed counts as a
 * bar chart and the contributor's current completion streak badge.
 *
 * Designed to embed inside a contributor profile page.
 */
export function ContributorActivity({
  address,
  apiBase = '/api',
}: ContributorActivityProps) {
  const { activity, loading, error, refetch } = useActivityStats(apiBase, address);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading && activity.length === 0) {
    return (
      <div className="contributor-activity" aria-busy="true">
        <p className="contributor-activity__loading" aria-live="polite">
          Loading activity…
        </p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error && activity.length === 0) {
    return (
      <div className="contributor-activity">
        <p className="contributor-activity__error" role="alert">
          Failed to load activity: {error}
        </p>
        <Button variant="secondary" size="sm" onClick={refetch}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="contributor-activity">
      <div className="contributor-activity__header">
        <h2 className="contributor-activity__title">Activity</h2>
        <StreakBadge activity={activity} />
      </div>

      <ActivityChart activity={activity} />
    </div>
  );
}

import type { MonthlyActivity } from '../hooks/useActivityStats';

// ---------------------------------------------------------------------------
// Streak logic (pure, export for unit-testing)
// ---------------------------------------------------------------------------

export type StreakTier = 'bronze' | 'silver' | 'gold' | 'none';

/**
 * Calculates the current contribution streak: the number of consecutive
 * calendar months ending with the most recent month that has at least
 * one completed assignment.
 *
 * Months are expected to be ordered oldest → newest (as the API returns).
 * Any trailing months with 0 completions do NOT break the streak — only
 * an interior month with 0 completions resets the counter.
 *
 * Algorithm:
 *  1. Trim trailing zero-completion months (the current month may be
 *     mid-progress, so we don't penalise it).
 *  2. Count consecutive non-zero months from the right.
 */
export function calculateStreak(activity: MonthlyActivity[]): number {
  if (activity.length === 0) return 0;

  // Step 1 — trim trailing zeroes
  let end = activity.length - 1;
  while (end >= 0 && activity[end].completed === 0) {
    end--;
  }
  if (end < 0) return 0; // no completed months at all

  // Step 2 — walk left counting consecutive completed months
  let streak = 0;
  for (let i = end; i >= 0; i--) {
    if (activity[i].completed > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Maps a streak length to a badge tier.
 * gold ≥ 12, silver ≥ 6, bronze ≥ 3, else none.
 */
export function streakTier(streak: number): StreakTier {
  if (streak >= 12) return 'gold';
  if (streak >= 6) return 'silver';
  if (streak >= 3) return 'bronze';
  return 'none';
}

// ---------------------------------------------------------------------------
// StreakBadge component
// ---------------------------------------------------------------------------

const TIER_META: Record<StreakTier, { label: string; emoji: string; className: string }> = {
  gold:   { label: 'Gold streak',   emoji: '🥇', className: 'streak-badge streak-badge--gold'   },
  silver: { label: 'Silver streak', emoji: '🥈', className: 'streak-badge streak-badge--silver' },
  bronze: { label: 'Bronze streak', emoji: '🥉', className: 'streak-badge streak-badge--bronze' },
  none:   { label: 'No streak',     emoji: '—',  className: 'streak-badge streak-badge--none'   },
};

export interface StreakBadgeProps {
  /** Pre-computed months from useActivityStats */
  activity: MonthlyActivity[];
}

/**
 * Displays the contributor's current streak length and tier badge.
 * Returns null when the streak is 0 (no badge shown).
 */
export function StreakBadge({ activity }: StreakBadgeProps) {
  const streak = calculateStreak(activity);
  const tier = streakTier(streak);

  if (tier === 'none') return null;

  const { label, emoji, className } = TIER_META[tier];

  return (
    <div
      className={className}
      role="img"
      aria-label={`${label}: ${streak} consecutive month${streak !== 1 ? 's' : ''} with completed assignments`}
    >
      <span className="streak-badge__icon" aria-hidden="true">{emoji}</span>
      <span className="streak-badge__text">
        <span className="streak-badge__count" aria-hidden="true">{streak}</span>
        <span className="streak-badge__label" aria-hidden="true">
          {tier.charAt(0).toUpperCase() + tier.slice(1)} streak
        </span>
      </span>
    </div>
  );
}

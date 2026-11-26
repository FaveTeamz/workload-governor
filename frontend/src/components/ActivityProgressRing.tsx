import type { CSSProperties } from "react";
import './ActivityProgressRing.css';

const badges = {
  bronze: { label: 'Bronze', icon: '🥉' },
  silver: { label: 'Silver', icon: '🥈' },
  gold: { label: 'Gold', icon: '🥇' },
  platinum: { label: 'Platinum', icon: '💎' },
} as const;

export interface ActivityProgressRingProps {
  value: number;
  max: number;
  streakDays: number;
  badgeLevel: keyof typeof badges;
}

/** Displays weekly completion progress and the current daily streak. */
export function ActivityProgressRing({ value, max, streakDays, badgeLevel }: ActivityProgressRingProps) {
  const limit = Number.isFinite(max) && max > 0 ? max : 0;
  const completed = Number.isFinite(value) ? Math.max(0, value) : 0;
  const progress = limit ? Math.min(completed, limit) / limit : 0;
  const badge = badges[badgeLevel];

  return (
    <div className={`activity-ring activity-ring--${badgeLevel}`}>
      <div className="activity-ring__meter"
        role="img"
        aria-label={`${completed} of ${limit} weekly tasks completed, ${Math.round(progress * 100)}%. ${streakDays} day streak.`}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="activity-ring__track" cx="50" cy="50" r="44" />
          <circle className="activity-ring__progress" cx="50" cy="50" r="44"
            pathLength="100" strokeDasharray="100" transform="rotate(-90 50 50)"
            style={{ "--activity-ring-offset": 100 * (1 - progress) } as CSSProperties}
          />
        </svg>
        <span className="activity-ring__counter" aria-hidden="true">
          <span>🔥</span>
          <strong>{streakDays}</strong>
          <span>{streakDays === 1 ? 'day' : 'days'}</span>
        </span>
      </div>
      <span><span aria-hidden="true">{badge.icon}</span> {badge.label}</span>
      <span className="activity-ring__summary" aria-hidden="true">{completed} / {limit} this week</span>
    </div>
  );
}

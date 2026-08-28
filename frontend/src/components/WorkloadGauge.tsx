import React from 'react';

export interface WorkloadGaugeProps {
  /** Current usage count. Undefined/null is treated as 0. */
  current?: number | null;
  /** Maximum cap. Undefined/null is treated as 1 to avoid division by zero. */
  max?: number | null;
  /** Human-readable label, e.g. "org assignments" or "global applications". */
  label?: string;
}

/**
 * Normalises a raw prop value to a safe, non-negative integer.
 * - undefined / null → 0
 * - negative         → 0
 * - non-integer      → Math.floor(value)
 */
export function normaliseCount(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const floored = Math.floor(value);
  return floored < 0 ? 0 : floored;
}

/**
 * Displays cap usage as a labelled progress bar.
 *
 * States:
 *  - empty   : current === 0
 *  - partial : 0 < current < max
 *  - full    : current >= max  (red / warning)
 *  - overflow: current > max   (treated as full, capped at 100 %)
 */
export function WorkloadGauge({ current, max, label }: WorkloadGaugeProps) {
  const safeMax = normaliseCount(max) || 1; // guard against 0/null/undefined max
  const safeCurrent = normaliseCount(current);

  // Clamp fill percentage to [0, 100]
  const percentage = Math.min(Math.round((safeCurrent / safeMax) * 100), 100);

  const isFull = safeCurrent >= safeMax;
  const isEmpty = safeCurrent === 0;

  let state: 'empty' | 'partial' | 'full';
  if (isFull) {
    state = 'full';
  } else if (isEmpty) {
    state = 'empty';
  } else {
    state = 'partial';
  }

  const displayCurrent = safeCurrent > safeMax ? safeMax : safeCurrent;

  return (
    <div
      className={`workload-gauge workload-gauge--${state}`}
      data-testid="workload-gauge"
      data-state={state}
    >
      {label && (
        <span className="workload-gauge__label" data-testid="workload-gauge-label">
          {label}
        </span>
      )}
      <span className="workload-gauge__count" data-testid="workload-gauge-count">
        {displayCurrent}/{safeMax}
      </span>
      <div
        className="workload-gauge__track"
        role="progressbar"
        aria-valuenow={safeCurrent}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label ? `${label}: ${displayCurrent} of ${safeMax}` : `${displayCurrent} of ${safeMax}`}
      >
        <div
          className="workload-gauge__fill"
          data-testid="workload-gauge-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

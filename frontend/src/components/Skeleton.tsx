import type { CSSProperties } from 'react'

export interface SkeletonProps {
  /** Width (CSS value). Default: '100%' */
  width?: string | number
  /** Height (CSS value). Default: '1em' */
  height?: string | number
  /** Border radius (CSS value). Defaults to --radius-sm */
  radius?: string | number
  /** Additional className */
  className?: string
  /** Inline style overrides */
  style?: CSSProperties
}

/**
 * Base Skeleton — a shimmer-animated placeholder block.
 * Dimensions must match the loaded content to prevent layout shift.
 * Animation is paused when prefers-reduced-motion is set (handled via CSS).
 */
export function Skeleton({
  width   = '100%',
  height  = '1em',
  radius,
  className = '',
  style,
}: SkeletonProps) {
  const inlineStyle: CSSProperties = {
    width:        typeof width  === 'number' ? `${width}px`  : width,
    height:       typeof height === 'number' ? `${height}px` : height,
    borderRadius: radius != null
      ? (typeof radius === 'number' ? `${radius}px` : radius)
      : undefined,
    ...style,
  }

  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={inlineStyle}
      aria-hidden="true"
      role="presentation"
    />
  )
}

// ─── Compound variants ────────────────────────────────────────────────────────

/**
 * IssueCard skeleton — matches IssueCard layout.
 */
export function IssueCardSkeleton() {
  return (
    <article
      className="issue-card skeleton-card"
      aria-label="Loading issue"
      aria-busy="true"
    >
      {/* meta row: org pill + chip */}
      <div className="issue-card__meta">
        <Skeleton width={72}  height={20} radius={9999} />
        <Skeleton width={56}  height={20} radius={9999} />
      </div>
      {/* title */}
      <Skeleton width="85%" height={18} radius={4} />
      <Skeleton width="55%" height={18} radius={4} />
      {/* action button */}
      <div className="issue-card__actions">
        <Skeleton width={80} height={36} radius={6} />
      </div>
    </article>
  )
}

/**
 * AssignmentRow skeleton — matches MaintainerPanel panel-row layout.
 */
export function AssignmentRowSkeleton() {
  return (
    <li
      className="panel-row skeleton-row"
      aria-label="Loading assignment"
      aria-busy="true"
    >
      <div className="row-info">
        <Skeleton width={96}  height={14} radius={4} />
        <Skeleton width={72}  height={14} radius={4} />
        <Skeleton width={160} height={14} radius={4} className="issue-title" />
      </div>
      <div className="row-actions">
        <Skeleton width={76} height={36} radius={6} />
        <Skeleton width={64} height={36} radius={6} />
      </div>
    </li>
  )
}

/**
 * EventHistoryTable row skeleton — matches activity-feed af-event layout.
 */
export function EventHistoryRowSkeleton() {
  return (
    <li
      className="af-event skeleton-row"
      aria-label="Loading event"
      aria-busy="true"
    >
      <Skeleton width={64}  height={20} radius={9999} />
      <span className="af-event__body">
        <Skeleton width={80}  height={14} radius={4} />
        <Skeleton width={100} height={14} radius={4} style={{ marginLeft: 8 }} />
      </span>
      <Skeleton width={48}  height={12} radius={4} />
    </li>
  )
}

/**
 * WorkloadGauge skeleton — matches Gauge SVG circle dimensions.
 */
export function WorkloadGaugeSkeleton({ size = 120 }: { size?: number }) {
  return (
    <figure
      className="gauge skeleton-gauge"
      aria-label="Loading gauge"
      aria-busy="true"
    >
      {/* circular placeholder */}
      <Skeleton width={size} height={size} radius="50%" />
      {/* label text */}
      <Skeleton width={72} height={12} radius={4} style={{ marginTop: 6 }} />
    </figure>
  )
}

/**
 * OrgSelector option skeleton — matches sidebar org list item width.
 */
export function OrgSelectorSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul
      className="org-list skeleton-org-list"
      aria-label="Loading organisations"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="org-list__item">
          <Skeleton width="90%" height={20} radius={4} style={{ margin: '6px 0' }} />
        </li>
      ))}
    </ul>
  )
}

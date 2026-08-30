import type { CSSProperties } from "react";

interface SkeletonProps {
  /** Visual width — any CSS value, e.g. "100%", "120px", "8rem" */
  width?: string | number;
  /** Visual height — defaults to "1em" so it scales with surrounding text */
  height?: string | number;
  /** Border-radius override. Defaults to var(--radius-sm, 4px). */
  borderRadius?: string | number;
  /** Extra class names */
  className?: string;
  /** Extra inline styles */
  style?: CSSProperties;
}

/**
 * Generic skeleton placeholder shown while async data is loading.
 *
 * Design goals (issue #15):
 * - Matches the approximate shape of the real content to avoid layout shift.
 * - Uses the existing design-token CSS vars so it adapts to dark/light theme.
 * - Animated shimmer for a polished loading feel.
 *
 * Usage:
 *   <Skeleton width="100%" height="1rem" />
 *   <Skeleton width={40} height={40} borderRadius="50%" />  // avatar circle
 */
export function Skeleton({
  width = "100%",
  height = "1em",
  borderRadius,
  className = "",
  style,
}: SkeletonProps) {
  const sizeStyle: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    borderRadius:
      borderRadius != null
        ? typeof borderRadius === "number"
          ? `${borderRadius}px`
          : borderRadius
        : undefined,
    ...style,
  };

  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={sizeStyle}
      aria-hidden="true"          // decorative — screen readers skip it
      role="presentation"
    />
  );
}

/* ── Convenience composites ──────────────────────────────────────────────── */

/**
 * Skeleton row that mimics a single panel-row (application / assignment card).
 * Width ratios approximate: contributor | org | title | action.
 */
export function PanelRowSkeleton() {
  return (
    <li className="panel-row skeleton-row" aria-hidden="true">
      <div className="row-info">
        <Skeleton width="90px" height="0.8125rem" />
        <Skeleton width="70px" height="0.8125rem" />
        <Skeleton width="140px" height="0.8125rem" />
        <Skeleton width="50px" height="0.75rem" />
      </div>
      <div className="row-actions">
        <Skeleton width="58px" height="26px" borderRadius="var(--radius, 6px)" />
      </div>
    </li>
  );
}

/**
 * Skeleton for an IssueCard — matches org chip + title + action button layout.
 */
export function IssueCardSkeleton() {
  return (
    <article
      className="issue-card skeleton-card"
      aria-hidden="true"
    >
      <div className="issue-card__meta">
        <Skeleton width="60px" height="18px" borderRadius="9999px" />
        <Skeleton width="50px" height="18px" borderRadius="9999px" />
      </div>
      <Skeleton width="80%" height="0.875rem" />
      <div className="issue-card__actions">
        <Skeleton width="64px" height="28px" borderRadius="var(--radius, 6px)" />
      </div>
    </article>
  );
}

/**
 * Skeleton for the application-count badge in a panel column header.
 */
export function CountBadgeSkeleton() {
  return (
    <Skeleton
      width="22px"
      height="22px"
      borderRadius="9999px"
      className="count-badge-skeleton"
    />
  );
}

/**
 * Skeleton screen components — issue #319
 *
 * Variants:
 *   - IssueCardSkeleton         matches IssueCard layout
 *   - EventHistoryTableSkeleton matches EventHistoryTable row layout
 *   - ContributorProfileSkeleton matches contributor header layout
 *
 * Features:
 *   - Shimmer animation via CSS gradient (see app.css .skeleton-shimmer)
 *   - Dark-mode aware via CSS custom properties
 *   - aria-busy=true on container while loading
 *   - Minimum display time of 300 ms to prevent skeleton flash
 *   - Transition to content via FadeInCard
 */

import { useState, useEffect, type ReactNode } from "react";
import FadeInCard from "../../components/FadeInCard";

// ---------------------------------------------------------------------------
// SkeletonLoader — handles 300 ms min display + aria-busy management
// ---------------------------------------------------------------------------

interface SkeletonLoaderProps {
  /** When true, content is ready and skeleton should be replaced */
  loading: boolean;
  /** The skeleton placeholder to show while loading */
  skeleton: ReactNode;
  /** The real content to show once loaded */
  children: ReactNode;
}

/**
 * Wraps loading state so the skeleton is shown for at least 300 ms,
 * preventing a flash of the skeleton on fast loads.
 */
export function SkeletonLoader({ loading, skeleton, children }: SkeletonLoaderProps) {
  const [showSkeleton, setShowSkeleton] = useState(loading);

  useEffect(() => {
    if (loading) {
      setShowSkeleton(true);
      return;
    }
    // Keep skeleton visible for at least 300 ms
    const timer = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(timer);
  }, [loading]);

  if (showSkeleton) {
    return (
      <div aria-busy="true" aria-label="Loading…">
        {skeleton}
      </div>
    );
  }

  return (
    <div aria-busy="false">
      <FadeInCard>{children}</FadeInCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton primitives
// ---------------------------------------------------------------------------

/** A single shimmering line block */
function SkeletonLine({ width = "100%", height = "14px", className = "" }: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <span
      className={`skeleton-line skeleton-shimmer ${className}`}
      style={{ width, height, display: "block", borderRadius: "var(--radius-sm)" }}
      aria-hidden="true"
    />
  );
}

/** A shimmering rectangular block (avatars, images) */
function SkeletonBlock({ width = "100%", height = "48px", className = "", borderRadius = "var(--radius)" }: {
  width?: string;
  height?: string;
  className?: string;
  borderRadius?: string;
}) {
  return (
    <span
      className={`skeleton-block skeleton-shimmer ${className}`}
      style={{ width, height, display: "block", borderRadius }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// IssueCardSkeleton
// ---------------------------------------------------------------------------

/**
 * Skeleton placeholder matching the IssueCard layout:
 *   - Meta row: org chip + status chip
 *   - Title line
 *   - Action button
 */
export function IssueCardSkeleton() {
  return (
    <article
      className="issue-card issue-card--skeleton"
      aria-hidden="true"
    >
      {/* Meta row */}
      <div className="issue-card__meta">
        <SkeletonLine width="80px" height="18px" />
        <SkeletonLine width="64px" height="18px" />
      </div>

      {/* Title */}
      <SkeletonLine width="75%" height="20px" className="issue-card__title-skeleton" />
      <SkeletonLine width="50%" height="14px" className="issue-card__subtitle-skeleton" />

      {/* Button */}
      <div className="issue-card__actions">
        <SkeletonBlock width="80px" height="32px" borderRadius="var(--radius)" />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// EventHistoryTableSkeleton
// ---------------------------------------------------------------------------

interface EventHistoryTableSkeletonProps {
  /** Number of placeholder rows to render. Defaults to 5. */
  rows?: number;
}

/**
 * Skeleton placeholder matching EventHistoryTable layout:
 *   - Column headers (Date, Action, Org, Issue, Status)
 *   - N skeleton rows
 */
export function EventHistoryTableSkeleton({ rows = 5 }: EventHistoryTableSkeletonProps) {
  const COLS = ["Date", "Action", "Org", "Issue", "Status"];
  const COL_WIDTHS = ["80px", "90px", "100px", "50px", "70px"];

  return (
    <div
      className="event-history-skeleton"
      role="table"
      aria-label="Loading event history"
      aria-rowcount={rows + 1}
    >
      {/* Header row */}
      <div className="event-history-skeleton__header" role="row" aria-rowindex={1}>
        {COLS.map((col) => (
          <div key={col} className="event-history-skeleton__cell" role="columnheader">
            <span className="sr-only">{col}</span>
            <SkeletonLine width="60px" height="12px" />
          </div>
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="event-history-skeleton__row"
          role="row"
          aria-rowindex={i + 2}
          aria-hidden="true"
        >
          {COL_WIDTHS.map((w, ci) => (
            <div key={ci} className="event-history-skeleton__cell" role="cell">
              <SkeletonLine width={w} height="14px" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContributorProfileSkeleton
// ---------------------------------------------------------------------------

/**
 * Skeleton placeholder matching the ContributorProfile header layout:
 *   - Avatar circle
 *   - Name + truncated address line
 *   - Stats row (global apps, org assignments)
 */
export function ContributorProfileSkeleton() {
  return (
    <div
      className="contributor-profile-skeleton"
      aria-hidden="true"
    >
      {/* Avatar */}
      <SkeletonBlock
        width="56px"
        height="56px"
        borderRadius="var(--radius-full)"
        className="contributor-profile-skeleton__avatar"
      />

      {/* Text block */}
      <div className="contributor-profile-skeleton__info">
        <SkeletonLine width="140px" height="18px" className="contributor-profile-skeleton__name" />
        <SkeletonLine width="220px" height="13px" className="contributor-profile-skeleton__address" />
      </div>

      {/* Stats */}
      <div className="contributor-profile-skeleton__stats">
        <div className="contributor-profile-skeleton__stat">
          <SkeletonBlock width="40px" height="28px" borderRadius="var(--radius-sm)" />
          <SkeletonLine width="80px" height="12px" />
        </div>
        <div className="contributor-profile-skeleton__stat">
          <SkeletonBlock width="40px" height="28px" borderRadius="var(--radius-sm)" />
          <SkeletonLine width="100px" height="12px" />
        </div>
      </div>
    </div>
  );
}

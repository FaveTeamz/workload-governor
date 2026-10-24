'use client';

/**
 * IssueCardSkeleton — closes #552
 *
 * A shimmer placeholder that matches the IssueCard dimensions.
 * Used while the first page of issues is loading to prevent blank space.
 *
 * Features:
 *  - CSS animated shimmer (`.skeleton-shimmer` from app.css)
 *  - aria-hidden so screen readers skip individual skeleton cards
 *  - IssueCardSkeletonGrid sets aria-busy on the container
 *  - Transitions to real content via FadeInCard
 */

import FadeInCard from './FadeInCard';

// ---------------------------------------------------------------------------
// Skeleton primitives
// ---------------------------------------------------------------------------

function SkeletonLine({ width, height = '14px' }: { width: string; height?: string }) {
  return (
    <span
      className="skeleton-shimmer"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: '4px',
        background: 'var(--color-border, #2e3347)',
      }}
      aria-hidden="true"
    />
  );
}

function SkeletonBlock({ width, height, borderRadius = '4px' }: {
  width: string;
  height: string;
  borderRadius?: string;
}) {
  return (
    <span
      className="skeleton-shimmer"
      style={{
        display: 'block',
        width,
        height,
        borderRadius,
        background: 'var(--color-border, #2e3347)',
      }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// IssueCardSkeleton — matches IssueCard layout exactly
// ---------------------------------------------------------------------------

/**
 * Skeleton placeholder that mirrors the IssueCard DOM structure:
 *   - Meta row: org chip + status chip
 *   - Title line
 *   - Footer: reward + action button
 */
export function IssueCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderRadius: '8px',
        border: '1px solid var(--color-border, #2e3347)',
        background: 'var(--color-surface, #1c1f2b)',
        padding: '16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
      }}
    >
      {/* Meta row: org chip + status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <SkeletonLine width="80px" height="16px" />
        <SkeletonLine width="60px" height="16px" />
      </div>

      {/* Title */}
      <SkeletonLine width="75%" height="18px" />
      <SkeletonLine width="50%" height="14px" />

      {/* Footer: reward + button */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <SkeletonLine width="48px" height="16px" />
        <SkeletonBlock width="72px" height="32px" borderRadius="6px" />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// IssueCardSkeletonGrid
// ---------------------------------------------------------------------------

interface IssueCardSkeletonGridProps {
  /** Number of skeleton cards to show. Defaults to 5 per the issue spec. */
  count?: number;
}

/**
 * Renders N skeleton cards inside an aria-busy grid while the first page of
 * issues is loading. Once `loading` becomes false, the real content is passed
 * as `children` and revealed through a FadeInCard transition.
 */
export function IssueCardSkeletonGrid({ count = 5 }: IssueCardSkeletonGridProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading issues…"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(1, 1fr)',
        gap: '16px',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <IssueCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IssueCardGridWithSkeleton
// ---------------------------------------------------------------------------

interface IssueCardGridWithSkeletonProps {
  /** True while data is being fetched */
  loading: boolean;
  /** Number of skeleton placeholder cards (default 5) */
  skeletonCount?: number;
  /** Rendered issue cards once loading is complete */
  children: React.ReactNode;
}

/**
 * Drop-in wrapper that shows `skeletonCount` skeleton cards while `loading`
 * is true, then fades in the real `children` via FadeInCard.
 *
 * @example
 * <IssueCardGridWithSkeleton loading={isFetching}>
 *   <IssueCardGrid issues={issues} onApply={handleApply} />
 * </IssueCardGridWithSkeleton>
 */
export default function IssueCardGridWithSkeleton({
  loading,
  skeletonCount = 5,
  children,
}: IssueCardGridWithSkeletonProps) {
  if (loading) {
    return <IssueCardSkeletonGrid count={skeletonCount} />;
  }

  return (
    <div aria-busy="false">
      <FadeInCard>{children}</FadeInCard>
    </div>
  );
}

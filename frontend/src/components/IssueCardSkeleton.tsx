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

import './IssueCardSkeleton.css';

interface IssueCardSkeletonProps {
  className?: string;
  onAnimationEnd?: React.AnimationEventHandler<HTMLElement>;
}

export function IssueCardSkeleton({
  className = 'issue-card',
  onAnimationEnd,
}: IssueCardSkeletonProps) {
  return (
    <article
      className={`issue-card-slot issue-card-skeleton ${className}`}
      aria-hidden="true"
      onAnimationEnd={onAnimationEnd}
    >
      <span className="issue-card-skeleton__title skeleton-shimmer" />
      <div className="issue-card-skeleton__tags">
        <span className="skeleton-shimmer" />
        <span className="skeleton-shimmer" />
        <span className="skeleton-shimmer" />
      </div>
      <div className="issue-card-skeleton__footer">
        <span className="issue-card-skeleton__metadata skeleton-shimmer" />
        <span className="issue-card-skeleton__action skeleton-shimmer" />
      </div>
    </article>
  );
}

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

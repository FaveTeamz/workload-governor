/**
 * SkeletonScreens.tsx
 *
 * Fix #1057 – Prevent Cumulative Layout Shift (CLS) during loading transitions.
 *
 * All skeleton card dimensions (height, padding, margin, border-radius, border)
 * are kept in sync with IssueCard so the document geometry is identical before
 * and after hydration.  Target CLS < 0.05 (Lighthouse "Good").
 */

import React from 'react';

// ─── Keyframe animation ───────────────────────────────────────────────────────
const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
};

/**
 * Inject the keyframe animation once into <head>.
 * Using a module-level singleton so it runs only on first import.
 */
if (typeof document !== 'undefined') {
  const STYLE_ID = 'skeleton-shimmer-keyframes';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes skeleton-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Shared block helper ──────────────────────────────────────────────────────
interface BlockProps {
  width?: string | number;
  height?: number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

const Block: React.FC<BlockProps> = ({
  width = '100%',
  height = 12,
  borderRadius = 4,
  style,
}) => (
  <div
    aria-hidden="true"
    style={{
      width,
      height,
      borderRadius,
      ...shimmerStyle,
      ...style,
    }}
  />
);

// ─── IssueCardSkeleton ────────────────────────────────────────────────────────
/**
 * Matches IssueCard exactly:
 *   - Card: min-height 120px, padding 16px, border 1px solid #e2e8f0,
 *           border-radius 8px, margin-bottom 12px
 *   - Avatar circle: 32 × 32 px
 *   - Title line: height 16px, ~70% width
 *   - Meta lines: height 12px, 40% and 55% width
 *   - Badge pill: height 24px, width 72px, border-radius 12px
 *   - Action area: height 32px button-shaped, width 96px
 */
export const IssueCardSkeleton: React.FC = () => (
  <div
    role="status"
    aria-label="Loading issue"
    style={{
      // ── exact match to IssueCard container ──
      minHeight: 120,
      padding: 16,
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      marginBottom: 12,
      boxSizing: 'border-box',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    {/* Row 1: avatar + title */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Avatar circle */}
      <Block
        width={32}
        height={32}
        borderRadius={16}
        style={{ flexShrink: 0 }}
      />
      {/* Title */}
      <Block width="70%" height={16} borderRadius={4} />
    </div>

    {/* Row 2: meta line 1 */}
    <Block width="40%" height={12} />

    {/* Row 3: meta line 2 */}
    <Block width="55%" height={12} />

    {/* Row 4: badge + action button */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 2,
      }}
    >
      {/* Status badge */}
      <Block width={72} height={24} borderRadius={12} />
      {/* Action button */}
      <Block width={96} height={32} borderRadius={6} />
    </div>
  </div>
);

// ─── IssueListSkeleton ────────────────────────────────────────────────────────
interface IssueListSkeletonProps {
  /** Number of skeleton cards to render (default 5). */
  count?: number;
}

export const IssueListSkeleton: React.FC<IssueListSkeletonProps> = ({
  count = 5,
}) => (
  <div aria-busy="true" aria-label="Loading issues">
    {Array.from({ length: count }, (_, i) => (
      <IssueCardSkeleton key={i} />
    ))}
  </div>
);

// ─── Default export ───────────────────────────────────────────────────────────
export default IssueListSkeleton;

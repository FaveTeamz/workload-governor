/**
 * Icon — sprite-based SVG icon component (#327).
 *
 * Renders any symbol defined in /public/icons.svg by name.
 * Color inherits `currentColor` by default so it responds to CSS color.
 *
 * Usage:
 *   <Icon name="check-circle" />
 *   <Icon name="retry" size="lg" color="var(--color-primary)" />
 *
 * Available names (kebab-case):
 *   bluesky, discord, github, x, docs, social,
 *   check, check-circle, x-circle, warning, info, error,
 *   assign, complete, revoke, withdraw, retry, close, menu, pin,
 *   chevron-right, chevron-left,
 *   wallet-connect, wallet-disconnect, tx,
 *   issue-open, issue-closed, org,
 *   settings, external-link, copy, activity, chart
 */

export type IconName =
  | 'bluesky' | 'discord' | 'github' | 'x'
  | 'docs' | 'social'
  | 'check' | 'check-circle' | 'x-circle' | 'warning' | 'info' | 'error'
  | 'assign' | 'complete' | 'revoke' | 'withdraw' | 'retry' | 'close' | 'menu' | 'pin'
  | 'chevron-right' | 'chevron-left'
  | 'wallet-connect' | 'wallet-disconnect' | 'tx'
  | 'issue-open' | 'issue-closed' | 'org'
  | 'settings' | 'external-link' | 'copy' | 'activity' | 'chart';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export interface IconProps {
  /** Icon name from the sprite — matches the symbol id without the `icon-` prefix */
  name: IconName;
  /** Preset size. Defaults to `md` (20 px). */
  size?: IconSize;
  /** Explicit pixel override — use sparingly; prefer `size`. */
  sizePx?: number;
  /** CSS color value. Defaults to `currentColor`. */
  color?: string;
  /** Accessible label. Set when the icon conveys meaning (no adjacent text). */
  label?: string;
  /** Extra CSS classes */
  className?: string;
}

export function Icon({
  name,
  size = 'md',
  sizePx,
  color = 'currentColor',
  label,
  className = '',
}: IconProps) {
  const px = sizePx ?? SIZE_PX[size];

  return (
    <svg
      width={px}
      height={px}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      style={{ color, flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
      className={className}
    >
      <use href={`/icons.svg#icon-${name}`} />
    </svg>
  );
}

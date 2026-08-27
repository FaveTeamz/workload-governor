/**
 * IssueCard — closes #272
 *
 * Displays an issue with metadata, cap gauges, and an apply/withdraw action.
 */
import { useState } from 'react';
import { Badge } from './Badge';
import { Tooltip } from './Tooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

export type IssueStatus = 'open' | 'applied' | 'assigned' | 'completed';

export interface IssueLabel {
  name: string;
  color?: string;
}

/** Detail info shown in the expanded section */
export interface IssueCardDetails {
  /** Total number of current applicants */
  applicantCount?: number;
  /** Contributor's remaining global cap slots (max 15) */
  globalSlotsRemaining?: number;
  /** Contributor's remaining org-level slots (max 4) */
  orgSlotsRemaining?: number;
  /** ISO-8601 timestamp when the existing application TTL expires */
  ttlExpiresAt?: string | null;
}

export interface IssueCardProps {
  /** Issue ID string, e.g. '#42' */
  id: string;
  /** Organisation name */
  org: string;
  /** Issue title */
  title: string;
  /** Numeric issue number */
  issueNumber: number;
  /** Optional label badges */
  labels?: IssueLabel[];
  /** ISO date string for when the issue was posted */
  timePosted?: string;
  /** Current global application count (default: 0) */
  globalAppCount?: number;
  /** Current org assignment count (default: 0) */
  orgAppCount?: number;
  /** Global cap (default: 15) */
  globalAppMax?: number;
  /** Org cap (default: 4) */
  orgAppMax?: number;
  /** Issue status */
  status: IssueStatus;
  /** Called when the user confirms Apply */
  onApply?: (id: string) => Promise<void> | void;
  /** Called when the user clicks Withdraw */
  onWithdraw?: (id: string) => Promise<void> | void;
  /**
   * If provided, clicking Apply first awaits this function.
   * It should resolve on confirm and reject (with any error) on cancel.
   * If it rejects with an AbortError, Apply is silently cancelled.
   */
  openTxModal?: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string for an ISO date.
 * E.g. 'just now', '5 minutes ago', '3 hours ago', '2 days ago', '1 month ago'
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;

  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? 'month' : 'months'} ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IssueCard({
  id,
  org,
  title,
  issueNumber,
  labels,
  timePosted,
  globalAppCount = 0,
  orgAppCount = 0,
  globalAppMax = 15,
  orgAppMax = 4,
  status,
  onApply,
  onWithdraw,
  openTxModal,
}: IssueCardProps) {
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Cap checks ──────────────────────────────────────────────────────────────
  const globalCapReached = globalAppCount >= globalAppMax;
  const orgCapReached = orgAppCount >= orgAppMax;

  let applyDisabledReason: string | null = null;
  if (globalCapReached) {
    applyDisabledReason = `Global application limit reached (${globalAppCount}/${globalAppMax}). Withdraw an application first.`;
  } else if (orgCapReached) {
    applyDisabledReason = `Org assignment limit reached (${orgAppCount}/${orgAppMax}). Complete an assignment first.`;
  }

  const isApplyDisabled = busy || Boolean(applyDisabledReason);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleApply() {
    if (isApplyDisabled) return;
    setError(null);
    setBusy(true);

    try {
      // Step 1: await tx modal confirmation if provided
      if (openTxModal) {
        try {
          await openTxModal();
        } catch (err) {
          // AbortError (or any rejection) means user cancelled — bail silently
          if (err instanceof Error && err.name === 'AbortError') {
            setBusy(false);
            return;
          }
          // Non-abort rejection from modal — also cancel
          setBusy(false);
          return;
        }
      }

      // Step 2: call the actual apply handler
      await onApply?.(id);
      setApplied(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An error occurred while applying.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await onWithdraw?.(id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An error occurred while withdrawing.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  // ── Apply button ─────────────────────────────────────────────────────────────

  function renderApplyButton() {
    let label: string;
    if (busy) {
      label = 'Applying…';
    } else if (applied) {
      label = 'Applied ✓';
    } else {
      label = 'Apply';
    }

    // Wrap disabled button in a span so Tooltip events fire correctly
    // (disabled buttons suppress mouse events in some browsers).
    const btn = (
      <span style={{ display: 'inline-block' }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={isApplyDisabled ? undefined : handleApply}
          disabled={isApplyDisabled || applied}
          aria-disabled={isApplyDisabled || applied}
          aria-busy={busy || undefined}
          aria-label={`Apply for issue: ${title}`}
          style={isApplyDisabled ? { pointerEvents: 'none' } : undefined}
        >
          {label}
        </button>
      </span>
    );

    if (applyDisabledReason) {
      return (
        <Tooltip content={applyDisabledReason} position="top">
          {btn}
        </Tooltip>
      );
    }

    return btn;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <article
      className={`issue-card issue-card--${status}`}
      aria-label={`Issue: ${title}`}
    >
      {/* ── Header ── */}
      <div className="issue-card__header">
        <span className="issue-card__org">{org}</span>
        <span className="issue-card__number">#{issueNumber}</span>
        {timePosted && (
          <time
            className="issue-card__time"
            dateTime={timePosted}
            aria-label={`Posted ${formatRelativeTime(timePosted)}`}
          >
            {formatRelativeTime(timePosted)}
          </time>
        )}
      </div>

      {/* ── Title ── */}
      <h3 className="issue-card__title">{title}</h3>

      {/* ── Labels ── */}
      {labels && labels.length > 0 && (
        <div className="issue-card__labels" aria-label="Labels">
          {labels.map((label) => (
            <span
              key={label.name}
              style={label.color ? { '--label-color': label.color } as React.CSSProperties : undefined}
            >
              <Badge variant="neutral">{label.name}</Badge>
            </span>
          ))}
        </div>
      )}

      {/* ── Slot counts ── */}
      <div className="issue-card__slots" aria-label="Capacity">
        <span
          className={`issue-card__slot${globalCapReached ? ' issue-card__slot--warn' : ''}`}
          aria-label={`Global slots: ${globalAppCount} of ${globalAppMax} used`}
        >
          {globalAppCount}/{globalAppMax} global slots
        </span>
        <span
          className={`issue-card__slot${orgCapReached ? ' issue-card__slot--warn' : ''}`}
          aria-label={`Org slots: ${orgAppCount} of ${orgAppMax} used`}
        >
          {orgAppCount}/{orgAppMax} org slots
        </span>
      </div>

      {/* ── Error message ── */}
      {error && (
        <p role="alert" className="issue-card__error">
          {error}
        </p>
      )}

      {/* ── Actions ── */}
      <div className="issue-card__actions">
        {status === 'open' && renderApplyButton()}

        {status === 'applied' && (
          <>
            <Badge variant="info">Applied</Badge>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleWithdraw}
              disabled={busy}
              aria-busy={busy || undefined}
              aria-label={`Withdraw application for: ${title}`}
            >
              {busy ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </>
        )}

        {status === 'assigned' && <Badge variant="success">Assigned</Badge>}
        {status === 'completed' && <Badge variant="neutral">Completed</Badge>}
      </div>
    </article>
  );
}

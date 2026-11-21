/**
 * MaintainerPanel — slide-in side panel for maintainer assignment workflow (#325).
 *
 * Features:
 *  - Opens/closes from the right when a maintainer clicks an issue row
 *  - Lists applicants sorted by appliedDate (oldest first)
 *  - Shows each applicant's cap usage (global + org)
 *  - One-click Assign (with confirm step), Complete, Revoke per row
 *  - Pin button keeps panel open while browsing the issue list
 *  - Mobile: renders as full-screen sheet (CSS media query)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Application {
  id: string;
  contributor: string;
  org: string;
  issueTitle: string;
  appliedDate: string;
  /** Global application count for the contributor (shown as cap usage) */
  globalCount?: number;
  /** Org assignment count for the contributor */
  orgCount?: number;
}

export interface Assignment {
  id: string;
  contributor: string;
  org: string;
  issueTitle: string;
  /** Global application count for the contributor */
  globalCount?: number;
  /** Org assignment count for the contributor */
  orgCount?: number;
}

/** A single selectable issue that opens the panel */
export interface Issue {
  id: string;
  org: string;
  title: string;
  applicantCount: number;
}

/**
 * mode controls which column(s) are shown:
 *   "all"          — both columns side-by-side (default, legacy)
 *   "applications" — only the Pending Applications column
 *   "assignments"  — only the Active Assignments column
 */
export type PanelMode = "all" | "applications" | "assignments";

interface Props {
  applications: Application[];
  assignments: Assignment[];
  issues?: Issue[];
  onAssign: (app: Application) => Promise<void>;
  onComplete: (assignment: Assignment) => Promise<void>;
  onRevoke: (assignment: Assignment) => Promise<void>;
  mode?: PanelMode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function CapBadge({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = Math.min(count / max, 1);
  const cls =
    pct >= 1 ? 'cap-badge cap-badge--full' :
    pct >= 0.75 ? 'cap-badge cap-badge--high' : 'cap-badge';
  return (
    <span className={cls} title={`${label}: ${count}/${max}`}>
      {count}/{max}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AppRow (application row inside panel)
// ---------------------------------------------------------------------------

function AppRow({
  app,
  onAssign,
}: {
  app: Application;
  onAssign: (a: Application) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  function startConfirm() {
    setConfirming(true);
    setTimeout(() => confirmRef.current?.focus(), 50);
  }

  async function confirm() {
    setBusy(true);
    try { await onAssign(app); }
    finally { setBusy(false); setConfirming(false); }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') setConfirming(false);
  }

  return (
    <li className="panel-row" onKeyDown={handleKeyDown} data-shortcut-item tabIndex={0}>
      {/* data-shortcut-item + tabIndex make this row focusable and discoverable by J/K nav (closes #281) */}
    <li
      className="panel-row"
      data-testid="pending-application"
      onKeyDown={handleKeyDown}
    >
      <div className="row-info">
        <span className="contributor" title={app.contributor} aria-label={`Contributor: ${app.contributor}`}>
          {truncate(app.contributor)}
        </span>
        <span className="org" aria-label={`Organisation: ${app.org}`}>{app.org}</span>
        <span className="issue-title" aria-label={`Issue: ${app.issueTitle}`}>{app.issueTitle}</span>
        <time className="date" dateTime={app.appliedDate} aria-label={`Applied on ${new Date(app.appliedDate).toLocaleDateString()}`}>
          {new Date(app.appliedDate).toLocaleDateString()}
        </time>
        {app.globalCount != null && (
          <CapBadge label="Global apps" count={app.globalCount} max={15} />
        )}
        {app.orgCount != null && (
          <CapBadge label="Org assignments" count={app.orgCount} max={4} />
        )}
      </div>

      <div className="row-actions">
        {!confirming ? (
          <button
            className="btn btn-primary btn-sm"
            data-testid="assign-btn"
            onClick={startConfirm}
            aria-label={`Assign ${app.issueTitle} to ${truncate(app.contributor)}`}
          >
            <Icon name="assign" size="xs" />
            Assign
          </button>
        ) : (
          <>
            <button
              ref={confirmRef}
              className="btn btn-primary btn-sm"
              onClick={confirm}
              disabled={busy}
              aria-label={`Confirm assignment of ${app.issueTitle}`}
              aria-busy={busy}
            >
              {busy ? 'Assigning…' : 'Confirm'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
              aria-label="Cancel assignment"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// AssignRow (assignment row inside panel)
// ---------------------------------------------------------------------------

function AssignRow({
  asgn,
  onComplete,
  onRevoke,
}: {
  asgn: Assignment;
  onComplete: (a: Assignment) => Promise<void>;
  onRevoke: (a: Assignment) => Promise<void>;
}) {
  const [busy, setBusy] = useState<'complete' | 'revoke' | null>(null);

  async function handle(action: 'complete' | 'revoke') {
    setBusy(action);
    try {
      if (action === 'complete') await onComplete(asgn);
      else await onRevoke(asgn);
    } finally { setBusy(null); }
  }

  return (
    <li className="panel-row" data-shortcut-item tabIndex={0}>
      {/* data-shortcut-item + tabIndex make this row focusable and discoverable by J/K nav (closes #281) */}
    <li className="panel-row" data-testid="active-assignment">
      <div className="row-info">
        <span className="contributor" title={asgn.contributor} aria-label={`Contributor: ${asgn.contributor}`}>
          {truncate(asgn.contributor)}
        </span>
        <span className="org" aria-label={`Organisation: ${asgn.org}`}>{asgn.org}</span>
        <span className="issue-title" aria-label={`Issue: ${asgn.issueTitle}`}>{asgn.issueTitle}</span>
        {asgn.globalCount != null && (
          <CapBadge label="Global apps" count={asgn.globalCount} max={15} />
        )}
        {asgn.orgCount != null && (
          <CapBadge label="Org assignments" count={asgn.orgCount} max={4} />
        )}
      </div>

      <div className="row-actions">
        <button
          className="btn btn-complete btn-sm"
          data-testid="complete-btn"
          onClick={() => handle('complete')}
          disabled={busy !== null}
          aria-label={`Mark ${asgn.issueTitle} as complete`}
          aria-busy={busy === 'complete'}
        >
          <Icon name="complete" size="xs" />
          {busy === 'complete' ? '…' : 'Complete'}
        </button>
        <button
          className="btn btn-revoke btn-sm"
          data-testid="revoke-btn"
          onClick={() => handle('revoke')}
          disabled={busy !== null}
          aria-label={`Revoke assignment of ${asgn.issueTitle}`}
          aria-busy={busy === 'revoke'}
        >
          <Icon name="revoke" size="xs" />
          {busy === 'revoke' ? '…' : 'Revoke'}
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// MaintainerPanel (side panel shell)
// ---------------------------------------------------------------------------

export function MaintainerPanel({
  applications,
  assignments,
  onAssign,
  onComplete,
  onRevoke,
  mode = "all",
}: Props) {
  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Sort applications oldest-first by appliedDate
  const sortedApps = [...applications].sort(
    (a, b) => new Date(a.appliedDate).getTime() - new Date(b.appliedDate).getTime()
  );

  // Close on Escape (unless pinned)
  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !pinned) setOpen(false);
    },
    [pinned]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Return focus to trigger when panel closes
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        className="btn btn-primary maintainer-panel-open-btn"
        onClick={() => setOpen(true)}
        aria-label="Open maintainer panel"
      >
        <Icon name="assign" size="sm" />
        Maintainer Panel
      </button>
    );
  }

  return (
    <>
      {/* Backdrop — click closes if not pinned */}
      {!pinned && (
        <div
          className="panel-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <section
        ref={panelRef}
        className={`maintainer-panel maintainer-panel--slide${pinned ? ' maintainer-panel--pinned' : ''}`}
        aria-label="Maintainer Panel"
        tabIndex={-1}
      >
        {/* ── Panel header ── */}
        <div className="panel-header">
          <h2 className="panel-header__title">
            <Icon name="assign" size="sm" />
            Maintainer Panel
          </h2>
          <div className="panel-header__actions">
            {/* Pin toggle */}
            <button
              className={`btn btn-ghost btn-sm panel-pin-btn${pinned ? ' panel-pin-btn--active' : ''}`}
              onClick={() => setPinned((p) => !p)}
              aria-label={pinned ? 'Unpin panel (allow closing)' : 'Pin panel open'}
              aria-pressed={pinned}
              title={pinned ? 'Unpin' : 'Pin open'}
            >
              <Icon name="pin" size="sm" />
            </button>
            {/* Close button */}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen(false)}
              aria-label="Close maintainer panel"
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        </div>

        {/* ── Panel body: two columns ── */}
        <div className="panel-columns">
          {/* Left: pending applications */}
          <div className="panel-column">
            <h3 id="applications-heading">
              Pending Applications
              <span
                className="count-badge"
                aria-live="polite"
                aria-atomic="true"
                aria-label={`${sortedApps.length} pending applications`}
              >
                {sortedApps.length}
              </span>
            </h3>

            {sortedApps.length === 0 ? (
              <EmptyState
                variant="no-applications"
                compact
                ctaLabel="Browse issues"
                onCta={() => window.open('https://github.com', '_blank', 'noreferrer')}
              />
            ) : (
              <ul
                className="panel-list"
                aria-labelledby="applications-heading"
                aria-label="Pending applications list"
              >
                {sortedApps.map((app) => (
                  <AppRow key={app.id} app={app} onAssign={onAssign} />
                ))}
              </ul>
            )}
          </div>

          {/* Right: active assignments */}
          <div className="panel-column">
            <h3 id="assignments-heading">
              Active Assignments
              <span
                className="count-badge"
                aria-live="polite"
                aria-atomic="true"
                aria-label={`${assignments.length} active assignments`}
              >
                {assignments.length}
              </span>
            </h3>

            {assignments.length === 0 ? (
              <EmptyState
                variant="no-assignments"
                compact
                ctaLabel="Apply for an issue"
                onCta={() => window.open('https://github.com', '_blank', 'noreferrer')}
              />
            ) : (
              <ul
                className="panel-list"
                aria-labelledby="assignments-heading"
                aria-label="Active assignments list"
              >
                {assignments.map((asgn) => (
                  <AssignRow
                    key={asgn.id}
                    asgn={asgn}
                    onComplete={onComplete}
                    onRevoke={onRevoke}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

'use client';

/**
 * EventHistoryTable — closes #550
 *
 * Adds real-time event updates via 10-second polling against GET /api/events.
 *
 * Features:
 *  - Polls every 10 s; pauses when the tab is hidden (Page Visibility API)
 *  - New rows are prepended and fade in via the `.fade-in` animation
 *  - A "New events available" toast fires when the user has scrolled away
 *    from the top of the table and new events arrive
 *  - Controlled mode: when `events` + `onRefresh` props are omitted the
 *    component manages its own state; when provided it delegates to the parent
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import FadeInCard from './FadeInCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventRow = {
  id: string;
  eventType: string;
  org: string;
  issueId: string;
  contributor: string;
  timestamp: string;
};

type EventHistoryTableProps = {
  /** Initial / controlled event list */
  events?: EventRow[];
  /**
   * When provided, the component polls `GET /api/events` every `pollIntervalMs`
   * and merges new events into the list.
   */
  apiBase?: string;
  /** Polling interval in ms. Defaults to 10 000 (10 s). */
  pollIntervalMs?: number;
  /** Called after a successful poll — lets the parent sync its own state. */
  onNewEvents?: (newEvents: EventRow[]) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const EVENT_TYPE_STYLES: Record<string, string> = {
  applied:   'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  assigned:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  withdrawn: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  revoked:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

function EventTypeBadge({ type }: { type: string }) {
  const style = EVENT_TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${style}`}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toast (inline, lightweight — no external dep)
// ---------------------------------------------------------------------------

function NewEventsToast({
  count,
  onDismiss,
}: {
  count: number;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="new-events-toast"
      style={{
        position: 'sticky',
        top: '8px',
        zIndex: 10,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        margin: '8px auto',
        padding: '6px 14px',
        borderRadius: '20px',
        background: 'var(--color-primary, #6c8eff)',
        color: '#fff',
        fontSize: '0.8125rem',
        fontWeight: 600,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        animation: 'fadeIn 200ms ease-out both',
      }}
      onClick={onDismiss}
    >
      ↑ {count} new event{count !== 1 ? 's' : ''} — click to scroll up
      <button
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useEventPolling — encapsulates all polling logic
// ---------------------------------------------------------------------------

function useEventPolling({
  apiBase,
  pollIntervalMs,
  initialEvents,
  onNewEvents,
}: {
  apiBase: string;
  pollIntervalMs: number;
  initialEvents: EventRow[];
  onNewEvents?: (events: EventRow[]) => void;
}) {
  const [rows, setRows] = useState<EventRow[]>(initialEvents);
  // Track which row ids are "new" so we can animate them
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set(initialEvents.map((e) => e.id)));
  const tableRef = useRef<HTMLDivElement>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingBufferRef = useRef<EventRow[]>([]);

  const isScrolledAway = useCallback(() => {
    const el = tableRef.current;
    if (!el) return false;
    return el.scrollTop > 80;
  }, []);

  const poll = useCallback(async () => {
    try {
      const url = `${apiBase}/events?limit=50`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data: EventRow[] = await res.json();

      const fresh = data.filter((e) => !knownIdsRef.current.has(e.id));
      if (fresh.length === 0) return;

      fresh.forEach((e) => knownIdsRef.current.add(e.id));
      onNewEvents?.(fresh);

      if (isScrolledAway()) {
        // Buffer — show toast instead of immediately inserting
        pendingBufferRef.current = [...fresh, ...pendingBufferRef.current];
        setPendingCount(pendingBufferRef.current.length);
      } else {
        // Prepend immediately with fade-in animation
        setNewIds(new Set(fresh.map((e) => e.id)));
        setRows((prev) => [...fresh, ...prev]);
        // Clear new-row highlight after animation completes
        setTimeout(() => setNewIds(new Set()), 600);
      }
    } catch {
      // Network errors are silently swallowed — polling will retry
    }
  }, [apiBase, isScrolledAway, onNewEvents]);

  // Flush the pending buffer when user clicks the toast
  const flushPending = useCallback(() => {
    if (pendingBufferRef.current.length === 0) return;
    const toAdd = pendingBufferRef.current;
    pendingBufferRef.current = [];
    setPendingCount(0);
    setNewIds(new Set(toAdd.map((e) => e.id)));
    setRows((prev) => [...toAdd, ...prev]);
    setTimeout(() => setNewIds(new Set()), 600);
    // Scroll back to top
    tableRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!apiBase) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      intervalId = setInterval(poll, pollIntervalMs);
    }

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        poll(); // immediate poll on tab focus
        startPolling();
      }
    }

    // Start immediately
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [apiBase, poll, pollIntervalMs]);

  return { rows, newIds, tableRef, pendingCount, flushPending };
}

// ---------------------------------------------------------------------------
// EventHistoryTable
// ---------------------------------------------------------------------------

/**
 * Event history table with real-time polling.
 *
 * - Desktop (≥ 768px): standard HTML table
 * - Mobile (< 768px): each row rendered as a card with <dl>/<dt>/<dd>
 *
 * Real-time behaviour (when `apiBase` is provided):
 * - Polls `GET {apiBase}/events` every `pollIntervalMs` (default 10 s)
 * - Pauses polling when the browser tab is hidden
 * - New rows are prepended and fade in
 * - Shows a "New events available" toast when the user has scrolled down
 */
export default function EventHistoryTable({
  events: initialEvents = [],
  apiBase = '/api',
  pollIntervalMs = 10_000,
  onNewEvents,
}: EventHistoryTableProps) {
  const { rows, newIds, tableRef, pendingCount, flushPending } = useEventPolling({
    apiBase,
    pollIntervalMs,
    initialEvents,
    onNewEvents,
  });

  if (rows.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast for new events when scrolled away */}
      {pendingCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <NewEventsToast count={pendingCount} onDismiss={flushPending} />
        </div>
      )}

      <div
        ref={tableRef}
        data-testid="event-history-table"
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
        style={{ maxHeight: '600px', overflowY: 'auto' }}
      >
        {/* ── Desktop table (hidden below md) ─────────────────────────────── */}
        <div className="hidden md:block overflow-x-auto">
          <table
            data-testid="event-table"
            className="min-w-full divide-y divide-[var(--color-border)]"
          >
            <thead className="bg-[var(--color-surface)]">
              <tr>
                {['Event Type', 'Org', 'Issue ID', 'Contributor', 'Timestamp'].map(
                  (header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]"
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((event) =>
                newIds.has(event.id) ? (
                  <FadeInCard key={event.id} style={{ display: 'contents' }}>
                    <EventTableRow event={event} isNew />
                  </FadeInCard>
                ) : (
                  <EventTableRow key={event.id} event={event} />
                )
              )}
            </tbody>
          </table>
        </div>

        {/* ── Mobile card list (hidden at md and above) ────────────────────── */}
        <ul
          data-testid="event-card-list"
          className="md:hidden divide-y divide-[var(--color-border)]"
          role="list"
        >
          {rows.map((event) => (
            <EventMobileCard
              key={event.id}
              event={event}
              isNew={newIds.has(event.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row sub-components
// ---------------------------------------------------------------------------

function EventTableRow({ event, isNew = false }: { event: EventRow; isNew?: boolean }) {
  return (
    <tr
      data-testid={isNew ? 'new-event-row' : undefined}
      className={`transition-colors ${isNew ? 'fade-in bg-[var(--color-bg)]' : 'hover:bg-[var(--color-bg)]'}`}
    >
      <td className="px-4 py-3">
        <EventTypeBadge type={event.eventType} />
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {event.org}
      </td>
      <td className="px-4 py-3 font-mono text-sm text-[var(--color-text-primary)]">
        {event.issueId}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
        {event.contributor}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
        {formatTimestamp(event.timestamp)}
      </td>
    </tr>
  );
}

function EventMobileCard({ event, isNew = false }: { event: EventRow; isNew?: boolean }) {
  return (
    <li
      className={`p-4 ${isNew ? 'fade-in' : ''}`}
      data-testid={isNew ? 'new-event-row' : undefined}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium text-[var(--color-text-secondary)]">Type</dt>
        <dd><EventTypeBadge type={event.eventType} /></dd>

        <dt className="font-medium text-[var(--color-text-secondary)]">Org</dt>
        <dd className="text-[var(--color-text-primary)]">{event.org}</dd>

        <dt className="font-medium text-[var(--color-text-secondary)]">Issue</dt>
        <dd className="font-mono text-[var(--color-text-primary)]">{event.issueId}</dd>

        <dt className="font-medium text-[var(--color-text-secondary)]">Contributor</dt>
        <dd className="truncate font-mono text-xs text-[var(--color-text-primary)]">
          {event.contributor}
        </dd>

        <dt className="font-medium text-[var(--color-text-secondary)]">When</dt>
        <dd className="text-[var(--color-text-secondary)] whitespace-nowrap">
          {formatTimestamp(event.timestamp)}
        </dd>
      </dl>
    </li>
  );
}

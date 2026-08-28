'use client';

export type EventRow = {
  id: string;
  eventType: string;
  org: string;
  issueId: string;
  contributor: string;
  timestamp: string;
};

type EventHistoryTableProps = {
  events: EventRow[];
};

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

/**
 * Event history component — responsive.
 *
 * - Desktop (≥ 768px): standard HTML table
 * - Mobile (< 768px): each row rendered as a card with <dl>/<dt>/<dd>
 *
 * Both renderings are in the DOM; CSS hides the appropriate one per viewport
 * using Tailwind responsive prefixes.
 */
export default function EventHistoryTable({ events }: EventHistoryTableProps) {
  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* ── Desktop table (hidden below md) ───────────────────────────────── */}
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
            {events.map((event) => (
              <tr
                key={event.id}
                className="hover:bg-[var(--color-bg)] transition-colors"
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
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list (hidden at md and above) ─────────────────────── */}
      <ul
        data-testid="event-card-list"
        className="md:hidden divide-y divide-[var(--color-border)]"
        role="list"
      >
        {events.map((event) => (
          <li key={event.id} className="p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium text-[var(--color-text-secondary)]">Type</dt>
              <dd>
                <EventTypeBadge type={event.eventType} />
              </dd>

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
        ))}
      </ul>
    </div>
  );
}

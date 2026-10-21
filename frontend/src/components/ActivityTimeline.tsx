/**
 * ActivityTimeline — closes #651
 *
 * Vertical timeline of a contributor's apply / withdraw / assign /
 * complete / revoke events, sorted newest-first.
 *
 * Features:
 *  - Date-based grouping: Today | Yesterday | This Week | This Month | Older
 *  - Load-more pagination (20 events per page)
 *  - Empty state with illustration + CTA
 *  - Loading skeleton
 *  - Accessible: <ul>/<li> semantics, each entry focusable
 */
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import "./ActivityTimeline.css";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "applied"
  | "withdrawn"
  | "assigned"
  | "completed"
  | "revoked";

export interface TimelineEvent {
  id: string;
  event_type: TimelineEventType;
  /** Display title; falls back to `#<issue_id>` when absent */
  issue_title?: string;
  issue_id: number;
  org_id: string;
  tx_hash?: string;
  timestamp: string; // ISO-8601
}

export interface ActivityTimelineProps {
  /** Stellar public key of the contributor */
  address: string;
  /** Base URL for the backend API — defaults to "/api" */
  apiBase?: string;
  /** Override fetch for Storybook / testing */
  fetchFn?: typeof fetch;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const EVENT_META: Record<
  TimelineEventType,
  { icon: IconName; label: string; cssModifier: string }
> = {
  applied:   { icon: "issue-open",    label: "Applied",   cssModifier: "applied"   },
  withdrawn: { icon: "withdraw",      label: "Withdrawn", cssModifier: "withdrawn" },
  assigned:  { icon: "assign",        label: "Assigned",  cssModifier: "assigned"  },
  completed: { icon: "check-circle",  label: "Completed", cssModifier: "completed" },
  revoked:   { icon: "x-circle",      label: "Revoked",   cssModifier: "revoked"   },
};

// ─── Date helpers ────────────────────────────────────────────────────────────

function dateGroup(iso: string): "Today" | "Yesterday" | "This Week" | "This Month" | "Older" {
  const now = new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const prevDay =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (prevDay) return "Yesterday";

  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "This Month", "Older"] as const;
type GroupLabel = (typeof GROUP_ORDER)[number];

function groupEvents(
  events: TimelineEvent[]
): { group: GroupLabel; items: TimelineEvent[] }[] {
  const map = new Map<GroupLabel, TimelineEvent[]>();
  for (const ev of events) {
    const g = dateGroup(ev.timestamp);
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(ev);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    items: map.get(g)!,
  }));
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ActivityTimeline({
  address,
  apiBase = "/api",
  fetchFn = fetch,
}: ActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (pageOffset: number, replace = false) => {
      if (!address) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          contributor: address,
          limit: String(PAGE_SIZE),
          offset: String(pageOffset),
        });
        const res = await fetchFn(`${apiBase}/events?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          events: TimelineEvent[];
          pagination: { hasMore: boolean };
        };
        setEvents((prev) => (replace ? data.events : [...prev, ...data.events]));
        setHasMore(data.pagination.hasMore);
        setOffset(pageOffset + PAGE_SIZE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load activity");
      } finally {
        setLoading(false);
      }
    },
    [address, apiBase, fetchFn]
  );

  useEffect(() => {
    setEvents([]);
    setOffset(0);
    setHasMore(true);
    loadPage(0, true);
  }, [loadPage]);

  // ── Loading skeleton (initial load) ───────────────────────────────────────
  if (loading && events.length === 0) {
    return (
      <div className="activity-timeline" aria-busy="true" aria-label="Loading activity">
        <ul className="activity-timeline__list" aria-label="Activity timeline">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="activity-timeline__skeleton" aria-hidden="true">
              <span className="skeleton-dot" />
              <span className="skeleton-line skeleton-line--long" />
              <span className="skeleton-line skeleton-line--short" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && events.length === 0) {
    return (
      <div className="activity-timeline">
        <p className="activity-timeline__error" role="alert">
          Failed to load activity: {error}
        </p>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => loadPage(0, true)}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!loading && events.length === 0) {
    return (
      <div className="activity-timeline activity-timeline--empty">
        <img
          src="/illustrations/empty-activity.svg"
          alt=""
          aria-hidden="true"
          className="activity-timeline__illustration"
          width={180}
          height={135}
        />
        <h3 className="activity-timeline__empty-title">No activity yet</h3>
        <p className="activity-timeline__empty-msg">
          Your application and assignment history will appear here.
        </p>
        <a href="/" className="btn btn-primary">
          Start by applying to your first issue
        </a>
      </div>
    );
  }

  // ── Main timeline ─────────────────────────────────────────────────────────
  const groups = groupEvents(events);

  return (
    <div className="activity-timeline">
      {groups.map(({ group, items }) => (
        <section
          key={group}
          className="activity-timeline__group"
          aria-labelledby={`tl-group-${group.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <h3
            id={`tl-group-${group.replace(/\s+/g, "-").toLowerCase()}`}
            className="activity-timeline__group-label"
          >
            {group}
          </h3>

          <ul className="activity-timeline__list" aria-label={`${group} events`}>
            {items.map((ev) => {
              const meta = EVENT_META[ev.event_type] ?? EVENT_META.applied;
              const title = ev.issue_title ?? `#${ev.issue_id}`;
              const abs = new Date(ev.timestamp).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <li
                  key={ev.id}
                  className={`activity-timeline__item activity-timeline__item--${meta.cssModifier}`}
                  tabIndex={0}
                  aria-label={`${meta.label}: ${title} in ${ev.org_id}`}
                >
                  {/* Dot on the spine */}
                  <span className="activity-timeline__dot" aria-hidden="true">
                    <Icon name={meta.icon} size="sm" />
                  </span>

                  <div className="activity-timeline__content">
                    <div className="activity-timeline__header">
                      <span
                        className={`activity-timeline__badge activity-timeline__badge--${meta.cssModifier}`}
                      >
                        {meta.label}
                      </span>
                      <time
                        className="activity-timeline__time"
                        dateTime={ev.timestamp}
                        title={abs}
                      >
                        {relativeTime(ev.timestamp)}
                      </time>
                    </div>

                    <a
                      href={`/issues/${ev.org_id}/${ev.issue_id}`}
                      className="activity-timeline__title"
                    >
                      {title}
                    </a>

                    <span className="activity-timeline__org">{ev.org_id}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Load more */}
      {hasMore && (
        <div className="activity-timeline__footer">
          <button
            className="btn btn-secondary"
            onClick={() => loadPage(offset)}
            disabled={loading}
            aria-busy={loading}
            type="button"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {error && (
        <p className="activity-timeline__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

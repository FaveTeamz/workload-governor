import { useState, useEffect, useRef, useCallback } from "react";
import { EmptyState } from "./EmptyState";
import "./ActivityFeed.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType = "applied" | "assigned" | "completed" | "revoked";

export interface ActivityEvent {
  id: string;
  event_type: EventType;
  contributor: string;
  org_id: string;
  issue_id: number;
  tx_hash: string;
  timestamp: string; // ISO-8601
}

interface ActivityFeedProps {
  /** Base URL for the backend API, e.g. "/api" */
  apiBase?: string;
  /** Optional org scope — if provided, only events for this org are shown */
  orgId?: string;
  /** Network for Stellar Explorer links: "mainnet" | "testnet" */
  network?: "mainnet" | "testnet";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const EXPLORER_BASE: Record<string, string> = {
  mainnet: "https://stellar.expert/explorer/public/tx",
  testnet: "https://stellar.expert/explorer/testnet/tx",
};

const EVENT_LABELS: Record<EventType, string> = {
  applied:   "Applied",
  assigned:  "Assigned",
  completed: "Completed",
  revoked:   "Revoked",
};

const ALL_EVENT_TYPES = Object.keys(EVENT_LABELS) as EventType[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortAddr(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// ActivityFeed component
// ---------------------------------------------------------------------------

export function ActivityFeed({ apiBase = "/api", orgId, network = "testnet" }: ActivityFeedProps) {
  const [events, setEvents]           = useState<ActivityEvent[]>([]);
  const [offset, setOffset]           = useState(0);
  const [hasMore, setHasMore]         = useState(true);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [filter, setFilter]           = useState<EventType | "">("");
  const [newIds, setNewIds]           = useState<Set<string>>(new Set());
  const loaderRef                     = useRef<HTMLDivElement>(null);
  const explorerBase                  = EXPLORER_BASE[network];

  const fetchPage = useCallback(async (pageOffset: number, reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String(pageOffset),
      });
      if (orgId)  params.set("org_id", orgId);
      if (filter) params.set("event_type", filter);

      const res = await fetch(`${apiBase}/events?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { events: ActivityEvent[]; pagination: { hasMore: boolean } };

      setEvents(prev => {
        const incoming = data.events as ActivityEvent[];
        if (reset) return incoming;
        // Highlight brand-new events (those not already in list)
        const existingIds = new Set(prev.map(e => e.id));
        const freshIds = incoming.filter(e => !existingIds.has(e.id)).map(e => e.id);
        if (freshIds.length) {
          setNewIds(ids => new Set([...ids, ...freshIds]));
          // Clear highlight after animation completes
          setTimeout(() => setNewIds(ids => {
            const next = new Set(ids);
            freshIds.forEach(id => next.delete(id));
            return next;
          }), 2000);
        }
        return [...prev, ...incoming];
      });
      setHasMore(data.pagination.hasMore);
      setOffset(pageOffset + PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [apiBase, orgId, filter]);

  // Initial / filter-change load
  useEffect(() => {
    setEvents([]);
    setOffset(0);
    setHasMore(true);
    fetchPage(0, true);
  }, [fetchPage]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          fetchPage(offset);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, loading, offset]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="activity-feed" aria-label="Activity feed">
      <div className="activity-feed__header">
        <h2 className="activity-feed__title">Activity Feed</h2>
        <div className="activity-feed__filters" role="group" aria-label="Filter by event type">
          <button
            className={`af-filter-btn${filter === "" ? " af-filter-btn--active" : ""}`}
            onClick={() => setFilter("")}
            aria-pressed={filter === ""}
          >
            All
          </button>
          {ALL_EVENT_TYPES.map(type => (
            <button
              key={type}
              className={`af-filter-btn af-filter-btn--${type}${filter === type ? " af-filter-btn--active" : ""}`}
              onClick={() => setFilter(type)}
              aria-pressed={filter === type}
            >
              {EVENT_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="activity-feed__error" role="alert">{error}</p>
      )}

      {!loading && events.length === 0 && !error && (
        <EmptyState variant="no-events" />
      )}

      <ol className="activity-feed__list" aria-live="polite" aria-relevant="additions">
        {events.map(ev => (
          <li
            key={ev.id}
            className={`af-event af-event--${ev.event_type}${newIds.has(ev.id) ? " af-event--new" : ""}`}
          >
            <span className={`af-badge af-badge--${ev.event_type}`} aria-hidden="true">
              {EVENT_LABELS[ev.event_type]}
            </span>
            <span className="af-event__body">
              <a
                href={`${explorerBase}/${ev.tx_hash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="af-event__tx"
                aria-label={`View transaction ${ev.tx_hash} on Stellar Explorer`}
              >
                {shortAddr(ev.contributor)}
              </a>
              {" → "}
              <span className="af-event__org">{ev.org_id}</span>
              {" #"}
              <span className="af-event__issue">{ev.issue_id}</span>
            </span>
            <time className="af-event__time" dateTime={ev.timestamp} title={ev.timestamp}>
              {relativeTime(ev.timestamp)}
            </time>
          </li>
        ))}
      </ol>

      {/* Sentinel element — IntersectionObserver triggers next page load */}
      <div ref={loaderRef} className="activity-feed__loader" aria-hidden="true">
        {loading && <span className="af-spinner" />}
      </div>
    </section>
  );
}

import { useState, useEffect, useCallback } from "react";
import { EmptyState } from "./EmptyState";
import { Badge } from "./Badge";
import type { BadgeVariant } from "./Badge";

// ── Types ────────────────────────────────────────────────────────────────────

export type EventType =
  | "application"
  | "assignment"
  | "completion"
  | "revocation"
  | string;

export interface ContractEvent {
  id: string;
  event_type: EventType;
  org_id: string;
  issue_id: string;
  timestamp: string; // ISO-8601
  tx_hash: string;
  contributor?: string;
}

type SortDir = "asc" | "desc";

type FilterValue = "all" | "application" | "assignment" | "completion" | "revocation";

const PAGE_SIZE = 25;

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All Events" },
  { value: "application", label: "Applications" },
  { value: "assignment", label: "Assignments" },
  { value: "completion", label: "Completions" },
  { value: "revocation", label: "Revocations" },
];

const EVENT_BADGE: Record<string, BadgeVariant> = {
  application: "info",
  assignment: "warning",
  completion: "success",
  revocation: "error",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Copy-to-clipboard button ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available — silent fail
    }
  }

  return (
    <button
      className="eht-copy-btn"
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : `Copy transaction hash ${text}`}
      title={copied ? "Copied!" : "Copy to clipboard"}
      type="button"
    >
      {copied ? (
        // Checkmark icon
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <polyline points="2,8 6,12 14,4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        // Copy icon
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 11H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

// ── Sort indicator ────────────────────────────────────────────────────────────

function SortIndicator({ dir }: { dir: SortDir | null }) {
  if (!dir) return <span className="eht-sort-none" aria-hidden="true">⇅</span>;
  return <span aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</span>;
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;

  return (
    <nav className="eht-pagination" aria-label="Event history pagination">
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onChange(1)}
        disabled={page === 1}
        aria-label="First page"
      >
        «
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        ‹ Prev
      </button>
      <span className="eht-pagination__info" aria-live="polite" aria-atomic="true">
        Page {page} of {last}
      </span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onChange(page + 1)}
        disabled={page === last}
        aria-label="Next page"
      >
        Next ›
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onChange(last)}
        disabled={page === last}
        aria-label="Last page"
      >
        »
      </button>
    </nav>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface EventHistoryTableProps {
  /** API base URL, e.g. "/api". Table fetches GET {apiBase}/events */
  apiBase?: string;
  /** Optional: provide events directly (disables fetching) */
  events?: ContractEvent[];
  /** Optional: contributor address to filter by */
  contributor?: string;
}

export function EventHistoryTable({
  apiBase = "/api",
  events: propEvents,
  contributor,
}: EventHistoryTableProps) {
  const [events, setEvents] = useState<ContractEvent[]>(propEvents ?? []);
  const [loading, setLoading] = useState(!propEvents);
  const [error, setError] = useState<string | null>(null);

  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [page, setPage] = useState(1);

  // Fetch from API unless events were injected as props
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (contributor) params.set("contributor", contributor);
      const res = await fetch(`${apiBase}/events?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { events: ContractEvent[] };
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [apiBase, contributor]);

  useEffect(() => {
    if (!propEvents) void fetchEvents();
  }, [propEvents, fetchEvents]);

  // Keep events in sync if prop changes
  useEffect(() => {
    if (propEvents) setEvents(propEvents);
  }, [propEvents]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = events.filter(
    (ev) => filter === "all" || ev.event_type === filter
  );

  const sorted = [...filtered].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return sortDir === "desc" ? tb - ta : ta - tb;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort() {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    setPage(1);
  }

  function handleFilterChange(value: FilterValue) {
    setFilter(value);
    setPage(1);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="eht-loading" aria-busy="true" aria-label="Loading event history">
        <span className="eht-spinner" aria-hidden="true" />
        <span>Loading event history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="eht-error" role="alert">
        <p>Failed to load event history: {error}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => void fetchEvents()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <section className="eht-section" aria-labelledby="eht-heading">
      <div className="eht-toolbar">
        <h2 id="eht-heading" className="eht-heading">
          Event History
          <span
            className="count-badge"
            aria-label={`${filtered.length} events`}
            aria-live="polite"
          >
            {filtered.length}
          </span>
        </h2>

        <label className="eht-filter-label" htmlFor="eht-filter">
          <span className="visually-hidden">Filter by event type</span>
          <select
            id="eht-filter"
            className="eht-filter-select"
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value as FilterValue)}
            aria-label="Filter events by type"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <EmptyState variant="no-events" />
      ) : (
        <>
          <div className="table-wrap" role="region" aria-label="Event history table" tabIndex={0}>
            <table className="table eht-table">
              <caption className="table__caption">
                {filtered.length} event{filtered.length !== 1 ? "s" : ""}
                {filter !== "all" ? ` · ${FILTER_OPTIONS.find((o) => o.value === filter)?.label}` : ""}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Event Type</th>
                  <th scope="col">Org</th>
                  <th scope="col">Issue ID</th>
                  <th
                    scope="col"
                    className="eht-sortable"
                    onClick={toggleSort}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSort();
                      }
                    }}
                    tabIndex={0}
                    role="columnheader"
                    aria-sort={sortDir === "asc" ? "ascending" : "descending"}
                    aria-label={`Timestamp, sort ${sortDir === "asc" ? "descending" : "ascending"}`}
                  >
                    Timestamp <SortIndicator dir={sortDir} />
                  </th>
                  <th scope="col">Transaction Hash</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((ev) => (
                  <tr key={ev.id} className="eht-row">
                    <td>
                      <Badge variant={EVENT_BADGE[ev.event_type] ?? "neutral"}>
                        {ev.event_type}
                      </Badge>
                    </td>
                    <td>{ev.org_id}</td>
                    <td className="eht-issue-id">{ev.issue_id}</td>
                    <td>
                      <time dateTime={ev.timestamp}>{formatTimestamp(ev.timestamp)}</time>
                    </td>
                    <td className="eht-txhash-cell">
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${ev.tx_hash}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="eht-txhash-link"
                        aria-label={`View transaction ${ev.tx_hash} on Stellar Expert`}
                        title={ev.tx_hash}
                      >
                        {truncateHash(ev.tx_hash)}
                      </a>
                      <CopyButton text={ev.tx_hash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            total={sorted.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}

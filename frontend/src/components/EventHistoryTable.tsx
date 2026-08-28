/**
 * EventHistoryTable — closes #647 (sorting & filtering) + #648 (a11y badges)
 *
 * Features:
 *  - Sortable columns: Event Type, Org, Issue ID, Timestamp
 *  - Filter bar: event-type multi-select, org text field, date range
 *  - URL query-param sync (sort, dir, eventType, org, from, to)
 *  - Clear-all-filters button
 *  - aria-sort on column headers
 *  - Color-blind-friendly event type badges (icon + text label)
 */
import { useCallback, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import "./EventHistoryTable.css";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EventType =
  | "applied"
  | "withdrawn"
  | "assigned"
  | "completed"
  | "revoked";

export interface EventRow {
  id: string;
  eventType: EventType;
  org: string;
  issueId: string;
  contributor: string;
  timestamp: string; // ISO-8601
}

export type SortColumn = "eventType" | "org" | "issueId" | "timestamp";
export type SortDir = "asc" | "desc";

export interface FilterState {
  eventTypes: EventType[];
  org: string;
  dateFrom: string;
  dateTo: string;
}

export interface EventHistoryTableProps {
  events: EventRow[];
  caption?: string;
}

// ─── Event type metadata (icon + label for color-blind users) ────────────────

interface EventMeta {
  icon: IconName;
  label: string;
}

const EVENT_META: Record<EventType, EventMeta> = {
  applied:   { icon: "issue-open",   label: "Applied"   },
  withdrawn: { icon: "withdraw",     label: "Withdrawn" },
  assigned:  { icon: "assign",       label: "Assigned"  },
  completed: { icon: "check-circle", label: "Completed" },
  revoked:   { icon: "x-circle",     label: "Revoked"   },
};

const ALL_EVENT_TYPES: EventType[] = [
  "applied",
  "withdrawn",
  "assigned",
  "completed",
  "revoked",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function sortRows(rows: EventRow[], col: SortColumn, dir: SortDir): EventRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "eventType": cmp = a.eventType.localeCompare(b.eventType); break;
      case "org":       cmp = a.org.localeCompare(b.org);             break;
      case "issueId":   cmp = a.issueId.localeCompare(b.issueId, undefined, { numeric: true }); break;
      case "timestamp": cmp = a.timestamp.localeCompare(b.timestamp); break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function filterRows(rows: EventRow[], filters: FilterState): EventRow[] {
  return rows.filter((r) => {
    if (filters.eventTypes.length > 0 && !filters.eventTypes.includes(r.eventType)) return false;
    if (filters.org && !r.org.toLowerCase().includes(filters.org.toLowerCase())) return false;
    if (filters.dateFrom && new Date(r.timestamp).getTime() < new Date(filters.dateFrom).getTime()) return false;
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setDate(to.getDate() + 1);
      if (new Date(r.timestamp).getTime() >= to.getTime()) return false;
    }
    return true;
  });
}

function hasActiveFilters(filters: FilterState): boolean {
  return filters.eventTypes.length > 0 || filters.org !== "" || filters.dateFrom !== "" || filters.dateTo !== "";
}

function paramsToState(params: URLSearchParams): {
  filters: FilterState;
  sortCol: SortColumn;
  sortDir: SortDir;
} {
  const etRaw = params.get("eventType") ?? "";
  const eventTypes = etRaw
    ? (etRaw.split(",").filter((t) => ALL_EVENT_TYPES.includes(t as EventType)) as EventType[])
    : [];
  const sortColRaw = params.get("sort") ?? "timestamp";
  const sortCol: SortColumn = (["eventType", "org", "issueId", "timestamp"] as SortColumn[]).includes(sortColRaw as SortColumn)
    ? (sortColRaw as SortColumn)
    : "timestamp";
  const sortDir: SortDir = params.get("dir") === "asc" ? "asc" : "desc";
  return {
    filters: {
      eventTypes,
      org:      params.get("org")  ?? "",
      dateFrom: params.get("from") ?? "",
      dateTo:   params.get("to")   ?? "",
    },
    sortCol,
    sortDir,
  };
}

// ─── Inner table (always inside a Router) ────────────────────────────────────

function EventHistoryTableInner({ events, caption = "Event History" }: EventHistoryTableProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const initial = useMemo(() => paramsToState(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [filters, setFilters] = useState<FilterState>(initial.filters);
  const [sortCol, setSortCol] = useState<SortColumn>(initial.sortCol);
  const [sortDir, setSortDir] = useState<SortDir>(initial.sortDir);

  // Sync state → URL params
  useEffect(() => {
    const p = new URLSearchParams();
    if (sortCol !== "timestamp") p.set("sort", sortCol);
    if (sortDir !== "desc")      p.set("dir", sortDir);
    if (filters.eventTypes.length) p.set("eventType", filters.eventTypes.join(","));
    if (filters.org)      p.set("org",  filters.org);
    if (filters.dateFrom) p.set("from", filters.dateFrom);
    if (filters.dateTo)   p.set("to",   filters.dateTo);
    setSearchParams(p, { replace: true });
  }, [filters, sortCol, sortDir, setSearchParams]);

  function toggleSort(col: SortColumn) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const toggleEventType = useCallback((type: EventType) => {
    setFilters((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(type)
        ? prev.eventTypes.filter((t) => t !== type)
        : [...prev.eventTypes, type],
    }));
  }, []);

  function clearFilters() {
    setFilters({ eventTypes: [], org: "", dateFrom: "", dateTo: "" });
  }

  const processed = useMemo(
    () => sortRows(filterRows(events, filters), sortCol, sortDir),
    [events, filters, sortCol, sortDir]
  );

  const active = hasActiveFilters(filters);

  function ariaSortAttr(col: SortColumn): "ascending" | "descending" | "none" {
    if (col !== sortCol) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  function SortIndicator({ col }: { col: SortColumn }) {
    if (col !== sortCol) return <span className="sort-indicator sort-indicator--idle" aria-hidden="true">⇅</span>;
    return <span className="sort-indicator sort-indicator--active" aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const COLS: { col: SortColumn | null; header: string }[] = [
    { col: "eventType", header: "Event Type"  },
    { col: "org",       header: "Org"         },
    { col: "issueId",   header: "Issue ID"    },
    { col: null,        header: "Contributor" },
    { col: "timestamp", header: "Timestamp"   },
  ];

  return (
    <div className="eht">
      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="eht__filters" role="group" aria-label="Table filters">
        <fieldset className="eht__filter-group">
          <legend className="eht__filter-label">Event type</legend>
          <div className="eht__checkboxes">
            {ALL_EVENT_TYPES.map((type) => {
              const meta = EVENT_META[type];
              return (
                <label key={type} className="eht__checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.eventTypes.includes(type)}
                    onChange={() => toggleEventType(type)}
                  />
                  <Icon name={meta.icon} size="xs" aria-hidden={true} />
                  {meta.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="eht__filter-group">
          <span className="eht__filter-label">Org</span>
          <input
            type="text"
            className="eht__filter-input"
            value={filters.org}
            onChange={(e) => setFilters((prev) => ({ ...prev, org: e.target.value }))}
            placeholder="Filter by org…"
            aria-label="Filter by organisation"
          />
        </label>

        <div className="eht__filter-group">
          <span className="eht__filter-label">Date range</span>
          <div className="eht__date-range">
            <label className="eht__filter-date">
              <span className="sr-only">From</span>
              <input
                type="date"
                className="eht__filter-input"
                value={filters.dateFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                aria-label="Filter from date"
              />
            </label>
            <span className="eht__date-sep" aria-hidden="true">–</span>
            <label className="eht__filter-date">
              <span className="sr-only">To</span>
              <input
                type="date"
                className="eht__filter-input"
                value={filters.dateTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                aria-label="Filter to date"
              />
            </label>
          </div>
        </div>

        {active && (
          <button
            className="btn btn-secondary btn-sm eht__clear-btn"
            onClick={clearFilters}
            type="button"
          >
            <Icon name="close" size="xs" aria-hidden={true} />
            Clear filters
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="eht__table-wrap" role="region" aria-label={caption} tabIndex={0}>
        <table className="eht__table">
          <caption className="eht__caption">{caption}</caption>
          <thead>
            <tr>
              {COLS.map(({ col, header }) =>
                col ? (
                  <th key={header} scope="col" aria-sort={ariaSortAttr(col)} className="eht__th eht__th--sortable">
                    <button
                      className="eht__sort-btn"
                      onClick={() => toggleSort(col)}
                      type="button"
                      aria-label={`Sort by ${header}`}
                    >
                      {header}
                      <SortIndicator col={col} />
                    </button>
                  </th>
                ) : (
                  <th key={header} scope="col" className="eht__th">{header}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr>
                <td colSpan={5} className="eht__empty">
                  {active ? "No events match the current filters." : "No events to display."}
                </td>
              </tr>
            ) : (
              processed.map((row) => {
                const meta = EVENT_META[row.eventType];
                return (
                  <tr key={row.id} className="eht__row">
                    <td className="eht__td">
                      <span className={`eht__badge eht__badge--${row.eventType}`} aria-label={`Event type: ${meta.label}`}>
                        <Icon name={meta.icon} size="xs" aria-hidden={true} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="eht__td eht__td--muted">{row.org}</td>
                    <td className="eht__td eht__td--mono">{row.issueId}</td>
                    <td className="eht__td eht__td--mono eht__td--truncate" title={row.contributor}>
                      {row.contributor.length > 12
                        ? `${row.contributor.slice(0, 6)}…${row.contributor.slice(-4)}`
                        : row.contributor}
                    </td>
                    <td className="eht__td eht__td--muted eht__td--nowrap">
                      {formatTimestamp(row.timestamp)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {processed.length} event{processed.length !== 1 ? "s" : ""} shown
        {active ? " (filters active)" : ""}.
      </p>
    </div>
  );
}

// ─── Public export: wraps the inner component in error boundary for
//     contexts without a Router (renders table without URL sync) ─────────────

import { Component, type ReactNode } from "react";

class RouterErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function EventHistoryTableNoRouter({ events, caption = "Event History" }: EventHistoryTableProps) {
  const [filters, setFilters] = useState<FilterState>({ eventTypes: [], org: "", dateFrom: "", dateTo: "" });
  const [sortCol, setSortCol] = useState<SortColumn>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(col: SortColumn) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const toggleEventType = useCallback((type: EventType) => {
    setFilters((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(type)
        ? prev.eventTypes.filter((t) => t !== type)
        : [...prev.eventTypes, type],
    }));
  }, []);

  function clearFilters() {
    setFilters({ eventTypes: [], org: "", dateFrom: "", dateTo: "" });
  }

  const processed = useMemo(
    () => sortRows(filterRows(events, filters), sortCol, sortDir),
    [events, filters, sortCol, sortDir]
  );

  const active = hasActiveFilters(filters);

  function ariaSortAttr(col: SortColumn): "ascending" | "descending" | "none" {
    if (col !== sortCol) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  function SortIndicator({ col }: { col: SortColumn }) {
    if (col !== sortCol) return <span className="sort-indicator sort-indicator--idle" aria-hidden="true">⇅</span>;
    return <span className="sort-indicator sort-indicator--active" aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const COLS: { col: SortColumn | null; header: string }[] = [
    { col: "eventType", header: "Event Type"  },
    { col: "org",       header: "Org"         },
    { col: "issueId",   header: "Issue ID"    },
    { col: null,        header: "Contributor" },
    { col: "timestamp", header: "Timestamp"   },
  ];

  return (
    <div className="eht">
      <div className="eht__filters" role="group" aria-label="Table filters">
        <fieldset className="eht__filter-group">
          <legend className="eht__filter-label">Event type</legend>
          <div className="eht__checkboxes">
            {ALL_EVENT_TYPES.map((type) => {
              const meta = EVENT_META[type];
              return (
                <label key={type} className="eht__checkbox-label">
                  <input type="checkbox" checked={filters.eventTypes.includes(type)} onChange={() => toggleEventType(type)} />
                  <Icon name={meta.icon} size="xs" aria-hidden={true} />
                  {meta.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="eht__filter-group">
          <span className="eht__filter-label">Org</span>
          <input
            type="text"
            className="eht__filter-input"
            value={filters.org}
            onChange={(e) => setFilters((prev) => ({ ...prev, org: e.target.value }))}
            placeholder="Filter by org…"
            aria-label="Filter by organisation"
          />
        </label>

        <div className="eht__filter-group">
          <span className="eht__filter-label">Date range</span>
          <div className="eht__date-range">
            <label className="eht__filter-date">
              <span className="sr-only">From</span>
              <input
                type="date"
                className="eht__filter-input"
                value={filters.dateFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                aria-label="Filter from date"
              />
            </label>
            <span className="eht__date-sep" aria-hidden="true">–</span>
            <label className="eht__filter-date">
              <span className="sr-only">To</span>
              <input
                type="date"
                className="eht__filter-input"
                value={filters.dateTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                aria-label="Filter to date"
              />
            </label>
          </div>
        </div>

        {active && (
          <button className="btn btn-secondary btn-sm eht__clear-btn" onClick={clearFilters} type="button">
            <Icon name="close" size="xs" aria-hidden={true} />
            Clear filters
          </button>
        )}
      </div>

      <div className="eht__table-wrap" role="region" aria-label={caption} tabIndex={0}>
        <table className="eht__table">
          <caption className="eht__caption">{caption}</caption>
          <thead>
            <tr>
              {COLS.map(({ col, header }) =>
                col ? (
                  <th key={header} scope="col" aria-sort={ariaSortAttr(col)} className="eht__th eht__th--sortable">
                    <button className="eht__sort-btn" onClick={() => toggleSort(col)} type="button" aria-label={`Sort by ${header}`}>
                      {header}
                      <SortIndicator col={col} />
                    </button>
                  </th>
                ) : (
                  <th key={header} scope="col" className="eht__th">{header}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr><td colSpan={5} className="eht__empty">{active ? "No events match the current filters." : "No events to display."}</td></tr>
            ) : (
              processed.map((row) => {
                const meta = EVENT_META[row.eventType];
                return (
                  <tr key={row.id} className="eht__row">
                    <td className="eht__td">
                      <span className={`eht__badge eht__badge--${row.eventType}`} aria-label={`Event type: ${meta.label}`}>
                        <Icon name={meta.icon} size="xs" aria-hidden={true} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="eht__td eht__td--muted">{row.org}</td>
                    <td className="eht__td eht__td--mono">{row.issueId}</td>
                    <td className="eht__td eht__td--mono eht__td--truncate" title={row.contributor}>
                      {row.contributor.length > 12 ? `${row.contributor.slice(0, 6)}…${row.contributor.slice(-4)}` : row.contributor}
                    </td>
                    <td className="eht__td eht__td--muted eht__td--nowrap">{formatTimestamp(row.timestamp)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {processed.length} event{processed.length !== 1 ? "s" : ""} shown{active ? " (filters active)" : ""}.
      </p>
    </div>
  );
}

/** Public component. Uses URL params when inside a Router; falls back gracefully otherwise. */
export function EventHistoryTable(props: EventHistoryTableProps) {
  return (
    <RouterErrorBoundary fallback={<EventHistoryTableNoRouter {...props} />}>
      <EventHistoryTableInner {...props} />
    </RouterErrorBoundary>
  );
}

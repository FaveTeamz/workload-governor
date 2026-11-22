/**
 * AuditLogPage — responsive audit log view.
 *
 * Implements FE-020 / Issue #855:
 * - Desktop/tablet (min-width: 769px): 6-column table layout
 * - Mobile (max-width: 768px): Structured stacked card layout
 * - All audit fields (timestamp, actor, event/action, diff) remain legible without horizontal scroll
 */

import { useState, useEffect, useCallback } from "react";
import "./AuditLogPage.css";

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target?: string;
  diff: string;
  status?: "success" | "failure" | "pending";
}

interface AuditLogPageProps {
  apiBase?: string;
  initialLogs?: AuditLogRecord[];
}

export function formatTimestamp(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoDate;
  }
}

export function AuditLogPage({ apiBase = "/api", initialLogs }: AuditLogPageProps) {
  const [logs, setLogs] = useState<AuditLogRecord[]>(initialLogs ?? []);
  const [loading, setLoading] = useState(!initialLogs);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/audit`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.data ?? data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (initialLogs) {
      setLogs(initialLogs);
      setLoading(false);
    } else {
      void fetchLogs();
    }
  }, [initialLogs, fetchLogs]);

  return (
    <div className="audit-log-page" data-testid="audit-log-page">
      <header className="audit-log-header">
        <h1 className="audit-log-title">
          Audit Logs
          <span className="audit-log-badge-count" data-testid="audit-log-count">
            {logs.length}
          </span>
        </h1>
      </header>

      {loading && <p data-testid="audit-log-loading">Loading audit records…</p>}

      {error && (
        <div className="audit-log-error" role="alert" data-testid="audit-log-error">
          <p>{error}</p>
          <button type="button" onClick={() => void fetchLogs()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="audit-log-empty" data-testid="audit-log-empty">
          <p>No audit logs found.</p>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <>
          {/* ── Desktop/Tablet 6-Column Tabular Layout (> 768px) ──────── */}
          <div
            className="audit-log-table-container"
            data-testid="audit-log-table-container"
          >
            <table
              className="audit-log-table"
              data-testid="audit-log-table"
              aria-label="Audit log records"
            >
              <thead>
                <tr>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Diff</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((record) => (
                  <tr key={record.id} data-testid="audit-log-row">
                    <td className="audit-log-timestamp">
                      <time dateTime={record.timestamp}>
                        {formatTimestamp(record.timestamp)}
                      </time>
                    </td>
                    <td className="audit-log-actor audit-log-mono">
                      {record.actor}
                    </td>
                    <td className="audit-log-action">{record.action}</td>
                    <td className="audit-log-target">{record.target ?? "—"}</td>
                    <td className="audit-log-diff-cell">
                      <pre className="audit-log-diff-preview">{record.diff}</pre>
                    </td>
                    <td className="audit-log-status">
                      <span
                        className={`audit-log-status-badge audit-log-status-badge--${
                          record.status ?? "success"
                        }`}
                      >
                        {record.status ?? "success"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Stacked Card Layout (<= 768px) ─────────────────── */}
          <div
            className="audit-log-cards-container"
            data-testid="audit-log-cards-container"
          >
            <ul
              className="audit-log-cards"
              data-testid="audit-log-cards"
              role="list"
            >
              {logs.map((record) => (
                <li
                  key={record.id}
                  className="audit-log-card"
                  data-testid="audit-log-card"
                >
                  <div className="audit-log-card__header">
                    <span className="audit-log-card__action">
                      {record.action}
                    </span>
                    <span
                      className={`audit-log-status-badge audit-log-status-badge--${
                        record.status ?? "success"
                      }`}
                    >
                      {record.status ?? "success"}
                    </span>
                  </div>

                  <div className="audit-log-card__field">
                    <span className="audit-log-card__label">Timestamp</span>
                    <time
                      className="audit-log-card__timestamp"
                      dateTime={record.timestamp}
                    >
                      {formatTimestamp(record.timestamp)}
                    </time>
                  </div>

                  <div className="audit-log-card__field">
                    <span className="audit-log-card__label">Actor</span>
                    <span className="audit-log-card__value audit-log-mono">
                      {record.actor}
                    </span>
                  </div>

                  {record.target && (
                    <div className="audit-log-card__field">
                      <span className="audit-log-card__label">Target</span>
                      <span className="audit-log-card__value">
                        {record.target}
                      </span>
                    </div>
                  )}

                  <div className="audit-log-card__field">
                    <span className="audit-log-card__label">Diff</span>
                    <pre
                      className="audit-log-card__diff"
                      data-testid="audit-log-card-diff"
                    >
                      {record.diff}
                    </pre>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default AuditLogPage;

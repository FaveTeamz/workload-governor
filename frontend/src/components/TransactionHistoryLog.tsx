/**
 * TransactionHistoryLog — closes #810
 *
 * Renders a paginated list of a contributor's transaction history.
 * Fetches one page at a time using the backend's `limit` and `offset`
 * query parameters so large histories never block the initial paint.
 *
 * Features:
 *  - Default page size: 20
 *  - Previous / Next navigation controls
 *  - Previous disabled on page 1
 *  - Total count shown in the heading
 *  - Current page reflected in URL query parameter ?page=N
 *  - Loading and empty states
 */

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Transaction {
  id: string;
  type: "apply" | "withdraw" | "assign" | "complete" | "revoke";
  org_id: string;
  issue_id: number;
  timestamp: string;
  status: "pending" | "success" | "failed";
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TransactionHistoryLogProps {
  /** Stellar public key of the contributor whose history to display. */
  contributorAddress: string;
  /** Number of transactions per page. @default 20 */
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<Transaction["type"], string> = {
  apply:    "Applied",
  withdraw: "Withdrew",
  assign:   "Assigned",
  complete: "Completed",
  revoke:   "Revoked",
};

const STATUS_CLASS: Record<Transaction["status"], string> = {
  pending: "tx-log__status--pending",
  success: "tx-log__status--success",
  failed:  "tx-log__status--failed",
};

function readPageFromUrl(): number {
  if (typeof window === "undefined") return 1;
  const raw = new URLSearchParams(window.location.search).get("page");
  const parsed = parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function writePageToUrl(page: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set("page", String(page));
  window.history.replaceState(null, "", `?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionHistoryLog({
  contributorAddress,
  pageSize = 20,
}: TransactionHistoryLogProps) {
  const [page, setPage] = useState<number>(readPageFromUrl);
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const offset = (targetPage - 1) * pageSize;
        const url = `/api/contributors/${encodeURIComponent(contributorAddress)}/transactions?limit=${pageSize}&offset=${offset}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const json: TransactionsResponse = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load transactions");
      } finally {
        setLoading(false);
      }
    },
    [contributorAddress, pageSize],
  );

  // Fetch whenever the page or fetch function changes
  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  function goToPage(next: number) {
    setPage(next);
    writePageToUrl(next);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <section className="tx-log" aria-labelledby="tx-log-heading">
      <h2 id="tx-log-heading" className="tx-log__heading">
        Transactions
        {!loading && data && (
          <span className="tx-log__count" aria-label={`${total} transactions total`}>
            {" "}({total} total)
          </span>
        )}
      </h2>

      {loading && (
        <p className="tx-log__loading" role="status" aria-live="polite">
          Loading transactions…
        </p>
      )}

      {error && (
        <p className="tx-log__error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.transactions.length === 0 && (
        <p className="tx-log__empty" data-testid="tx-log-empty">
          No transactions yet.
        </p>
      )}

      {!loading && !error && data && data.transactions.length > 0 && (
        <ul className="tx-log__list" aria-label="Transaction list">
          {data.transactions.map((tx) => (
            <li key={tx.id} className="tx-log__item" data-testid="tx-log-item">
              <div className="tx-log__item-header">
                <span className="tx-log__type">{TYPE_LABEL[tx.type]}</span>
                <span
                  className={`tx-log__status ${STATUS_CLASS[tx.status]}`}
                  aria-label={`Status: ${tx.status}`}
                >
                  {tx.status}
                </span>
              </div>
              <div className="tx-log__item-meta">
                <span className="tx-log__org" aria-label={`Organisation: ${tx.org_id}`}>
                  {tx.org_id}
                </span>
                {" / "}
                <span className="tx-log__issue" aria-label={`Issue: ${tx.issue_id}`}>
                  #{tx.issue_id}
                </span>
              </div>
              <time
                className="tx-log__time"
                dateTime={tx.timestamp}
                aria-label={`Date: ${new Date(tx.timestamp).toLocaleString()}`}
              >
                {new Date(tx.timestamp).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination controls */}
      {!loading && !error && data && (
        <nav className="tx-log__pagination" aria-label="Transaction pagination">
          <button
            className="btn btn-secondary btn-sm"
            data-testid="tx-log-prev"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ← Previous
          </button>

          <span className="tx-log__page-indicator" aria-current="page" aria-label={`Page ${page} of ${totalPages}`}>
            Page {page} of {totalPages}
          </span>

          <button
            className="btn btn-secondary btn-sm"
            data-testid="tx-log-next"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  );
}

/**
 * MaintainerDashboard (#278)
 *
 * Full dashboard for registered maintainers to:
 *  - View pending applications grouped by issue
 *  - Assign an application → POST /api/transactions/assign
 *  - Complete an assignment → POST /api/transactions/complete
 *  - Revoke an assignment  → POST /api/transactions/revoke (with confirmation dialog)
 *
 * Access is gated by useMaintainerAuth. Non-maintainer wallets see ForbiddenPage.
 * All three actions open TxConfirmModal, optimistically update state, and revert on error.
 */

import { useState, useEffect, useCallback } from "react";
import { useMaintainerAuth } from "../hooks/useMaintainerAuth";
import { useWallet } from "../hooks/useWallet";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { ForbiddenPage } from "./ForbiddenPage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkItem {
  /** Unique item id — used as React key */
  id: string;
  contributor: string;
  issueId: string;
  /** ISO timestamp */
  date: string;
  type: "application" | "assignment";
  /** Optional: contributor's current global cap usage */
  globalCapUsage?: number;
  /** Max global cap (default 15) */
  globalCapLimit?: number;
}

interface Props {
  orgId: string;
  /** API base URL. Defaults to "/api". */
  apiBase?: string;
  /** Injected for testing / Storybook — skips fetch when provided */
  initialItems?: WorkItem[];
}

type ActionType = "assign" | "complete" | "revoke";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const NETWORK: "testnet" | "mainnet" = "testnet";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
    <nav className="md-pagination" aria-label="Table pagination">
      <Button
        variant="ghost"
        size="sm"
        disabled={page === 1}
        aria-label="Previous page"
        onClick={() => onChange(page - 1)}
      >
        ‹ Prev
      </Button>
      <span className="md-pagination__info" aria-live="polite">
        Page {page} / {last}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page === last}
        aria-label="Next page"
        onClick={() => onChange(page + 1)}
      >
        Next ›
      </Button>
    </nav>
  );
}

// ── Confirmation modal (simple inline — avoids useTxModal circular dep) ───────

interface ConfirmModalProps {
  open: boolean;
  action: ActionType | null;
  item: WorkItem | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ActionConfirmModal({
  open,
  action,
  item,
  busy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!item || !action) return null;

  const titles: Record<ActionType, string> = {
    assign: "Confirm Assignment",
    complete: "Mark as Complete?",
    revoke: "Revoke Assignment?",
  };

  const descriptions: Record<ActionType, string> = {
    assign: `Assign issue ${item.issueId} to ${truncate(item.contributor)}?`,
    complete: `Mark issue ${item.issueId} as complete for ${truncate(item.contributor)}?`,
    revoke: `Revoke the assignment of issue ${item.issueId} from ${truncate(item.contributor)}? This action cannot be undone on-chain.`,
  };

  const buttonLabels: Record<ActionType, string> = {
    assign: "Assign",
    complete: "Complete",
    revoke: "Revoke",
  };

  return (
    <Modal
      open={open}
      title={titles[action]}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            className={action === "revoke" ? "btn-revoke" : ""}
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy ? `${buttonLabels[action]}…` : buttonLabels[action]}
          </Button>
        </>
      }
    >
      <p>
        {descriptions[action]}
      </p>
      <dl className="md-tx-details">
        <dt>Network</dt>
        <dd>
          <span className={`badge badge--${NETWORK === "testnet" ? "warning" : "success"}`}>
            {NETWORK.toUpperCase()}
          </span>
        </dd>
        <dt>Issue</dt>
        <dd><strong>{item.issueId}</strong></dd>
        <dt>Contributor</dt>
        <dd>
          <code className="md-addr" title={item.contributor}>
            {truncate(item.contributor)}
          </code>
        </dd>
      </dl>
    </Modal>
  );
}

// ── Row actions ───────────────────────────────────────────────────────────────

interface RowActionsProps {
  item: WorkItem;
  busyId: string | null;
  onAction: (item: WorkItem, action: ActionType) => void;
}

function RowActions({ item, busyId, onAction }: RowActionsProps) {
  const isBusy = busyId === item.id;

  if (item.type === "application") {
    return (
      <Button
        variant="primary"
        size="sm"
        disabled={isBusy || busyId !== null}
        aria-busy={isBusy}
        aria-label={`Assign issue ${item.issueId} to ${truncate(item.contributor)}`}
        data-testid="assign-btn"
        onClick={() => onAction(item, "assign")}
      >
        {isBusy ? "Assigning…" : "Assign"}
      </Button>
    );
  }

  return (
    <span className="md-row-actions">
      <Button
        variant="secondary"
        size="sm"
        disabled={isBusy || busyId !== null}
        aria-busy={isBusy}
        aria-label={`Complete issue ${item.issueId} for ${truncate(item.contributor)}`}
        data-testid="complete-btn"
        onClick={() => onAction(item, "complete")}
      >
        {isBusy ? "…" : "Complete"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="btn-revoke"
        disabled={busyId !== null}
        aria-label={`Revoke assignment of issue ${item.issueId} from ${truncate(item.contributor)}`}
        data-testid="revoke-btn"
        onClick={() => onAction(item, "revoke")}
      >
        Revoke
      </Button>
    </span>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function MaintainerDashboard({ orgId, apiBase = "/api", initialItems }: Props) {
  const authStatus = useMaintainerAuth(orgId);
  const { publicKey } = useWallet();

  const [items, setItems] = useState<WorkItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Confirmation modal state
  const [pendingAction, setPendingAction] = useState<{
    item: WorkItem;
    action: ActionType;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ── Fetch items ─────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    if (authStatus !== "authorized") return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${apiBase}/transactions?org_id=${encodeURIComponent(orgId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { items: WorkItem[] };
      if (!cancelled) setItems(data.items ?? []);
    } catch (err) {
      if (!cancelled) setFetchError(err instanceof Error ? err.message : "Failed to load work items");
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, [apiBase, orgId, authStatus]);

  useEffect(() => {
    if (!initialItems) {
      void fetchItems();
    }
  }, [initialItems, fetchItems]);

  useEffect(() => {
    if (initialItems) setItems(initialItems);
  }, [initialItems]);

  // ── Action handler ──────────────────────────────────────────────────────────

  function requestAction(item: WorkItem, action: ActionType) {
    setActionError(null);
    setPendingAction({ item, action });
  }

  async function executeAction() {
    if (!pendingAction) return;
    const { item, action } = pendingAction;

    setConfirmBusy(true);
    setBusyId(item.id);

    // Optimistic update
    const prev = items;
    if (action === "assign") {
      setItems((cur) =>
        cur.map((i) => (i.id === item.id ? { ...i, type: "assignment" } : i))
      );
    } else {
      setItems((cur) => cur.filter((i) => i.id !== item.id));
    }

    try {
      const endpoint = action === "assign" ? "assign" : action === "complete" ? "complete" : "revoke";
      const body: Record<string, unknown> = {
        maintainer: publicKey,
        contributor: item.contributor,
        org_id: orgId,
        issue_id: item.issueId,
        sequence: "0",
      };

      const res = await fetch(`${apiBase}/transactions/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      // Success — optimistic state is already correct
    } catch (err) {
      // Revert optimistic update
      setItems(prev);
      setActionError(err instanceof Error ? err.message : "Action failed. Please try again.");
    } finally {
      setConfirmBusy(false);
      setBusyId(null);
      setPendingAction(null);
    }
  }

  // ── Auth gates ──────────────────────────────────────────────────────────────

  if (authStatus === "loading") {
    return (
      <main className="md-loading" aria-busy="true" aria-label="Checking authorisation…">
        <span className="md-spinner" aria-hidden="true" />
        Checking authorisation…
      </main>
    );
  }

  if (authStatus === "no-wallet") {
    return (
      <main className="error-page" aria-labelledby="nw-heading">
        <span className="error-page__code" aria-hidden="true">🔒</span>
        <h1 id="nw-heading">Wallet not connected</h1>
        <p>Connect your Freighter wallet to access the maintainer dashboard.</p>
        <a href="#/" className="btn btn-secondary">← Back to home</a>
      </main>
    );
  }

  if (authStatus === "forbidden") {
    return <ForbiddenPage />;
  }

  // ── Paginate ────────────────────────────────────────────────────────────────

  const applications = items.filter((i) => i.type === "application");
  const assignments = items.filter((i) => i.type === "assignment");

  const start = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  return (
    <>
      <main className="md-page" aria-labelledby="md-heading">
        <header className="md-header">
          <div>
            <h1 id="md-heading" className="md-title">Maintainer Dashboard</h1>
            <p className="md-subtitle">
              Organisation: <strong>{orgId}</strong>
              {publicKey && (
                <span className="md-wallet">
                  {" "}· {truncate(publicKey)}
                </span>
              )}
            </p>
          </div>
          <a href="#/" className="btn btn-ghost btn-sm">← Back</a>
        </header>

        {/* Summary counts */}
        <div className="md-summary" role="region" aria-label="Summary counts">
          <div className="md-summary__card" data-testid="pending-count">
            <span className="md-summary__num">{applications.length}</span>
            <span className="md-summary__label">Pending Applications</span>
          </div>
          <div className="md-summary__card">
            <span className="md-summary__num">{assignments.length}</span>
            <span className="md-summary__label">Active Assignments</span>
          </div>
        </div>

        {actionError && (
          <div className="md-action-error" role="alert">
            <strong>Error:</strong> {actionError}
            <button
              className="md-dismiss"
              aria-label="Dismiss error"
              onClick={() => setActionError(null)}
            >
              ✕
            </button>
          </div>
        )}

        <section aria-label="Work items table">
          {loading ? (
            <p className="md-status" aria-live="polite" aria-busy="true">Loading…</p>
          ) : fetchError ? (
            <div className="md-action-error" role="alert">
              <strong>Failed to load:</strong> {fetchError}
              <button className="btn btn-secondary btn-sm" onClick={() => void fetchItems()}>
                Retry
              </button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState variant="no-applications" compact />
          ) : (
            <>
              <div className="table-wrap" role="region" aria-label="Work items" tabIndex={0}>
                <table className="table">
                  <caption className="table__caption">
                    {items.length} item{items.length !== 1 ? "s" : ""} for {orgId}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col">Contributor</th>
                      <th scope="col">Global Cap</th>
                      <th scope="col">Issue ID</th>
                      <th scope="col">Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item) => (
                      <tr
                        key={item.id}
                        data-testid={
                          item.type === "application"
                            ? "pending-application"
                            : "active-assignment"
                        }
                      >
                        <td>
                          <Badge variant={item.type === "application" ? "info" : "warning"}>
                            {item.type === "application" ? "Pending" : "Assigned"}
                          </Badge>
                        </td>
                        <td>
                          <span
                            className="md-addr"
                            title={item.contributor}
                            aria-label={`Contributor: ${item.contributor}`}
                          >
                            {truncate(item.contributor)}
                          </span>
                        </td>
                        <td>
                          {item.globalCapUsage !== undefined ? (
                            <span
                              aria-label={`${item.globalCapUsage} of ${item.globalCapLimit ?? 15} global applications`}
                              className={item.globalCapUsage >= (item.globalCapLimit ?? 15) ? "md-cap md-cap--full" : "md-cap"}
                            >
                              {item.globalCapUsage}/{item.globalCapLimit ?? 15}
                            </span>
                          ) : (
                            <span className="md-cap md-cap--unknown" aria-label="Unknown">—</span>
                          )}
                        </td>
                        <td className="md-issue-id">{item.issueId}</td>
                        <td>
                          <time dateTime={item.date}>{fmtDate(item.date)}</time>
                        </td>
                        <td>
                          <RowActions
                            item={item}
                            busyId={busyId}
                            onAction={requestAction}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                total={items.length}
                pageSize={PAGE_SIZE}
                onChange={setPage}
              />
            </>
          )}
        </section>
      </main>

      {/* Action confirmation modal */}
      <ActionConfirmModal
        open={pendingAction !== null}
        action={pendingAction?.action ?? null}
        item={pendingAction?.item ?? null}
        busy={confirmBusy}
        onConfirm={() => void executeAction()}
        onCancel={() => {
          if (!confirmBusy) setPendingAction(null);
        }}
      />
    </>
  );
}

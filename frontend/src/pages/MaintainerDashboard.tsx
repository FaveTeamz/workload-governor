import { useState, useEffect } from "react";
import { useMaintainerAuth } from "../hooks/useMaintainerAuth";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { ForbiddenPage } from "./ForbiddenPage";

const PAGE_SIZE = 20;

export interface WorkItem {
  contributor: string;
  issueId: string;
  date: string; // ISO string
  type: "application" | "assignment";
}

interface Props {
  orgId: string;
  /** Injected for testing / future API wiring. Defaults to an empty stub. */
  fetchItems?: (orgId: string) => Promise<WorkItem[]>;
  onAssign?: (orgId: string, item: WorkItem) => Promise<void>;
  onComplete?: (orgId: string, item: WorkItem) => Promise<void>;
  onRevoke?: (orgId: string, item: WorkItem) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Default no-op stubs — replace with real contract calls
// ---------------------------------------------------------------------------
async function defaultFetch(_orgId: string): Promise<WorkItem[]> {
  return [];
}
async function noop(_orgId: string, _item: WorkItem): Promise<void> {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function truncate(addr: string) {
  return addr.length > 14
    ? `${addr.slice(0, 6)}…${addr.slice(-6)}`
    : addr;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Row-level action buttons
// ---------------------------------------------------------------------------
function RowActions({
  item,
  orgId,
  onAssign,
  onComplete,
  onRevokeRequest,
}: {
  item: WorkItem;
  orgId: string;
  onAssign: Props["onAssign"];
  onComplete: Props["onComplete"];
  onRevokeRequest: (item: WorkItem) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  if (item.type === "application") {
    return (
      <Button
        variant="primary"
        size="sm"
        disabled={busy !== null}
        aria-busy={busy !== null}
        aria-label={`Assign issue ${item.issueId} to ${truncate(item.contributor)}`}
        onClick={() => run("assign", () => (onAssign ?? noop)(orgId, item))}
      >
        {busy === "assign" ? "Assigning…" : "Assign"}
      </Button>
    );
  }

  return (
    <span className="md-row-actions">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy !== null}
        aria-busy={busy !== null}
        aria-label={`Complete issue ${item.issueId} for ${truncate(item.contributor)}`}
        onClick={() => run("complete", () => (onComplete ?? noop)(orgId, item))}
      >
        {busy === "complete" ? "…" : "Complete"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="btn-revoke"
        disabled={busy !== null}
        aria-label={`Revoke assignment of issue ${item.issueId} from ${truncate(item.contributor)}`}
        onClick={() => onRevokeRequest(item)}
      >
        Revoke
      </Button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pagination bar
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function MaintainerDashboard({
  orgId,
  fetchItems = defaultFetch,
  onAssign,
  onComplete,
  onRevoke,
}: Props) {
  const authStatus = useMaintainerAuth(orgId);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [revokeTarget, setRevokeTarget] = useState<WorkItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Load items once authorised
  useEffect(() => {
    if (authStatus !== "authorized") return;
    let cancelled = false;
    setLoading(true);
    fetchItems(orgId).then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [authStatus, orgId, fetchItems]);

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

  // Paginate
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await (onRevoke ?? noop)(orgId, revokeTarget);
      setItems((prev) => prev.filter((i) => i !== revokeTarget));
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  }

  function handleAssign(item: WorkItem) {
    return (onAssign ?? noop)(orgId, item).then(() =>
      setItems((prev) => prev.filter((i) => i !== item))
    );
  }

  function handleComplete(item: WorkItem) {
    return (onComplete ?? noop)(orgId, item).then(() =>
      setItems((prev) => prev.filter((i) => i !== item))
    );
  }

  return (
    <>
      <main className="md-page" aria-labelledby="md-heading">
        <header className="md-header">
          <div>
            <h1 id="md-heading" className="md-title">Maintainer Dashboard</h1>
            <p className="md-subtitle">
              Organisation: <strong>{orgId}</strong>
            </p>
          </div>
          <a href="#/" className="btn btn-ghost btn-sm">← Back</a>
        </header>

        <section aria-label="Work items table">
          {loading ? (
            <p className="md-status" aria-live="polite">Loading…</p>
          ) : items.length === 0 ? (
            <p className="md-status" aria-live="polite">No pending applications or active assignments.</p>
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
                      <th scope="col">Issue ID</th>
                      <th scope="col">Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item) => (
                      <tr key={`${item.type}-${item.contributor}-${item.issueId}`}>
                        <td>
                          <span
                            className={`badge badge--${item.type === "application" ? "info" : "warning"}`}
                          >
                            {item.type === "application" ? "Pending" : "Assigned"}
                          </span>
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
                        <td className="md-issue-id">{item.issueId}</td>
                        <td>
                          <time dateTime={item.date}>{fmtDate(item.date)}</time>
                        </td>
                        <td>
                          <RowActions
                            item={item}
                            orgId={orgId}
                            onAssign={handleAssign}
                            onComplete={handleComplete}
                            onRevokeRequest={setRevokeTarget}
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

      {/* Revoke confirmation modal */}
      <Modal
        open={revokeTarget !== null}
        title="Revoke assignment?"
        onClose={() => setRevokeTarget(null)}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={revoking}
              onClick={() => setRevokeTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="btn-revoke"
              disabled={revoking}
              aria-busy={revoking}
              onClick={confirmRevoke}
            >
              {revoking ? "Revoking…" : "Revoke"}
            </Button>
          </>
        }
      >
        {revokeTarget && (
          <p>
            Revoke the assignment of issue{" "}
            <strong>{revokeTarget.issueId}</strong> from{" "}
            <code className="md-addr">{truncate(revokeTarget.contributor)}</code>?
            This action cannot be undone on-chain.
          </p>
        )}
      </Modal>
    </>
  );
}

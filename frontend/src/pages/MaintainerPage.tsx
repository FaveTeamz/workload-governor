import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { useContract, type ContractRow } from "../hooks/useContract";
import { useMaintainerCheck } from "../hooks/useMaintainerCheck";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";

const PAGE_SIZE = 20;

type TabId = "applications" | "assignments";

interface RevokeTarget {
  row: ContractRow;
}

function truncAddr(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function Pagination({
  page, total, onChange,
}: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button
        variant="ghost" size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        ‹ Prev
      </Button>
      <span className="pagination__info" aria-live="polite">
        {page} / {pages}
      </span>
      <Button
        variant="ghost" size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page === pages}
        aria-label="Next page"
      >
        Next ›
      </Button>
    </nav>
  );
}

export function MaintainerPage() {
  const { org_id = "" } = useParams<{ org_id: string }>();
  const { publicKey } = useWallet();
  const contract = useContract();

  const authorized = useMaintainerCheck(org_id, publicKey);

  const [tab, setTab] = useState<TabId>("applications");
  const [applications, setApplications] = useState<ContractRow[]>([]);
  const [assignments, setAssignments] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appPage, setAppPage] = useState(1);
  const [asnPage, setAsnPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null); // issue_id being actioned

  // Revoke confirmation modal
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  const load = useCallback(async () => {
    if (!authorized) return;
    setLoading(true);
    setError(null);
    try {
      const [apps, asgns] = await Promise.all([
        contract.listApplications(org_id),
        contract.listAssignments(org_id),
      ]);
      setApplications(apps);
      setAssignments(asgns);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [authorized, org_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleAssign(row: ContractRow) {
    if (!publicKey) return;
    setBusy(row.issue_id);
    try {
      await contract.assign({ maintainer: publicKey, contributor: row.contributor, org_id, issue_id: row.issue_id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleComplete(row: ContractRow) {
    if (!publicKey) return;
    setBusy(row.issue_id);
    try {
      await contract.complete({ maintainer: publicKey, contributor: row.contributor, org_id, issue_id: row.issue_id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Complete failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevokeConfirm() {
    if (!revokeTarget || !publicKey) return;
    const { row } = revokeTarget;
    setBusy(row.issue_id);
    setRevokeTarget(null);
    try {
      await contract.revoke({ maintainer: publicKey, contributor: row.contributor, org_id, issue_id: row.issue_id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(null);
    }
  }

  if (!authorized) return null; // useMaintainerCheck handles redirect

  const appSlice = applications.slice((appPage - 1) * PAGE_SIZE, appPage * PAGE_SIZE);
  const asnSlice = assignments.slice((asnPage - 1) * PAGE_SIZE, asnPage * PAGE_SIZE);

  return (
    <main className="maintainer-page" id="main-content" tabIndex={-1}>
      <h1 className="maintainer-page__title">Maintainer — <code>{org_id}</code></h1>

      {error && (
        <p className="maintainer-page__error" role="alert">{error}</p>
      )}

      {/* Tabs */}
      <div className="tab-bar" role="tablist" aria-label="View sections">
        <button
          role="tab"
          className={`tab-btn${tab === "applications" ? " tab-btn--active" : ""}`}
          aria-selected={tab === "applications"}
          onClick={() => setTab("applications")}
        >
          Pending Applications
          <span className="count-badge" aria-label={`${applications.length} items`}>{applications.length}</span>
        </button>
        <button
          role="tab"
          className={`tab-btn${tab === "assignments" ? " tab-btn--active" : ""}`}
          aria-selected={tab === "assignments"}
          onClick={() => setTab("assignments")}
        >
          Active Assignments
          <span className="count-badge" aria-label={`${assignments.length} items`}>{assignments.length}</span>
        </button>
      </div>

      {loading ? (
        <p className="maintainer-page__loading" aria-live="polite">Loading…</p>
      ) : (
        <>
          {/* Applications table */}
          {tab === "applications" && (
            <section aria-label="Pending Applications">
              <div className="table-wrap" role="region" aria-label="Pending applications" tabIndex={0}>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Contributor</th>
                      <th scope="col">Issue ID</th>
                      <th scope="col">Applied Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appSlice.length === 0 ? (
                      <tr><td colSpan={4} className="table__empty">No pending applications</td></tr>
                    ) : appSlice.map((row) => (
                      <tr key={`${row.contributor}:${row.issue_id}`}>
                        <td title={row.contributor}>{truncAddr(row.contributor)}</td>
                        <td>{row.issue_id}</td>
                        <td><time dateTime={row.date}>{new Date(row.date).toLocaleDateString()}</time></td>
                        <td className="table__actions">
                          <Button
                            size="sm"
                            onClick={() => handleAssign(row)}
                            disabled={busy === row.issue_id}
                            aria-busy={busy === row.issue_id}
                            aria-label={`Assign issue ${row.issue_id} to ${truncAddr(row.contributor)}`}
                          >
                            {busy === row.issue_id ? "…" : "Assign"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={appPage} total={applications.length} onChange={setAppPage} />
            </section>
          )}

          {/* Assignments table */}
          {tab === "assignments" && (
            <section aria-label="Active Assignments">
              <div className="table-wrap" role="region" aria-label="Active assignments" tabIndex={0}>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Contributor</th>
                      <th scope="col">Issue ID</th>
                      <th scope="col">Assigned Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asnSlice.length === 0 ? (
                      <tr><td colSpan={4} className="table__empty">No active assignments</td></tr>
                    ) : asnSlice.map((row) => (
                      <tr key={`${row.contributor}:${row.issue_id}`}>
                        <td title={row.contributor}>{truncAddr(row.contributor)}</td>
                        <td>{row.issue_id}</td>
                        <td><time dateTime={row.date}>{new Date(row.date).toLocaleDateString()}</time></td>
                        <td className="table__actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleComplete(row)}
                            disabled={busy === row.issue_id}
                            aria-busy={busy === row.issue_id}
                            aria-label={`Complete issue ${row.issue_id} for ${truncAddr(row.contributor)}`}
                          >
                            {busy === row.issue_id ? "…" : "Complete"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRevokeTarget({ row })}
                            disabled={busy === row.issue_id}
                            className="btn-revoke"
                            aria-label={`Revoke issue ${row.issue_id} from ${truncAddr(row.contributor)}`}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={asnPage} total={assignments.length} onChange={setAsnPage} />
            </section>
          )}
        </>
      )}

      {/* Revoke confirmation modal */}
      <Modal
        open={revokeTarget !== null}
        title="Confirm Revoke"
        onClose={() => setRevokeTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="primary" className="btn-revoke" onClick={handleRevokeConfirm}>
              Revoke
            </Button>
          </>
        }
      >
        {revokeTarget && (
          <p>
            Revoke assignment for issue <strong>{revokeTarget.row.issue_id}</strong> from{" "}
            <strong>{truncAddr(revokeTarget.row.contributor)}</strong>?
            This cannot be undone.
          </p>
        )}
      </Modal>
    </main>
  );
}

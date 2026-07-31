/**
 * DashboardPage — issue #198
 *
 * Shows the signed-in contributor's current cap usage in real time:
 *   - Global applications gauge  (n / 15)
 *   - Per-org assignment cards   (one per active org)
 *   - Warning banner when global ≥ 12 or any org count ≥ 3
 *   - Last-refreshed timestamp + manual refresh button
 *   - Pending applications list with Withdraw action (on-chain via Freighter)
 */
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useDashboard, GLOBAL_CAP, ORG_CAP, type OrgUsage } from '../hooks/useDashboard';
import { useToast, ToastContainer } from '../components/Toast';
import { WithdrawConfirmModal } from '../components/WithdrawConfirmModal';
import { useWithdraw } from '../hooks/useWithdraw';
import { Gauge } from '../components/Gauge';
import './DashboardPage.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingApplication {
  contributor: string;
  org_id: string;
  issue_id: number;
  title: string;
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface OrgCardProps {
  usage: OrgUsage;
}

function OrgCard({ usage }: OrgCardProps) {
  const assignRatio  = usage.assignments  / ORG_CAP;
  const warnClass    = usage.assignments >= 3 ? ' dashboard-page__org-card--warning' : '';

  function barColor(ratio: number): string {
    if (ratio < 0.67) return 'var(--color-success-500)';
    if (ratio < 0.93) return 'var(--color-warning-500)';
    return 'var(--color-error-500)';
  }

  const assignColor = barColor(assignRatio);

  return (
    <div className={`dashboard-page__org-card${warnClass}`} role="region" aria-label={`Org: ${usage.org_id}`}>
      <h3 className="dashboard-page__org-name">{usage.org_id}</h3>

      {/* Assignments bar */}
      <div>
        <div className="cap-bar">
          <div className="cap-bar__header">
            <span className="cap-bar__label">Assignments</span>
            <span className="cap-bar__count" style={{ color: assignColor }}>
              {usage.assignments} / {ORG_CAP}
            </span>
          </div>
          <div
            className="cap-bar__track"
            role="progressbar"
            aria-valuenow={usage.assignments}
            aria-valuemin={0}
            aria-valuemax={ORG_CAP}
            aria-label={`Assignments: ${usage.assignments} of ${ORG_CAP}`}
          >
            <div
              className="cap-bar__fill"
              style={{ width: `${Math.min((usage.assignments / ORG_CAP) * 100, 100)}%`, background: assignColor }}
            />
          </div>
        </div>
      </div>

      {/* Applications count */}
      <div className="dashboard-page__org-stats">
        <div className="dashboard-page__org-stat">
          <span className="dashboard-page__org-stat-label">Pending applications</span>
          <span className="dashboard-page__org-stat-value">{usage.applications}</span>
        </div>
      </div>
    </div>
  );
}

interface ApplicationRowProps {
  app: PendingApplication;
  onWithdraw: (app: PendingApplication) => void;
  withdrawing: boolean;
}

function ApplicationRow({ app, onWithdraw, withdrawing }: ApplicationRowProps) {
  const isAssigned = app.status === 'assigned';

  return (
    <div
      className="dashboard-page__app-row"
      data-testid="pending-application-row"
      aria-label={`Pending application: ${app.title}`}
    >
      <div className="dashboard-page__app-row-info">
        <span className="dashboard-page__app-row-org">{app.org_id}</span>
        <span className="dashboard-page__app-row-title">{app.title}</span>
        <span className="dashboard-page__app-row-id">#{app.issue_id}</span>
      </div>
      <div className="dashboard-page__app-row-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onWithdraw(app)}
          disabled={withdrawing || isAssigned}
          aria-busy={withdrawing}
          aria-label={
            isAssigned
              ? `Cannot withdraw: issue ${app.title} is already assigned`
              : `Withdraw application for: ${app.title}`
          }
          title={isAssigned ? 'Cannot withdraw — this issue has already been assigned.' : undefined}
          data-testid="withdraw-btn"
        >
          {withdrawing ? (
            <>
              <span className="dashboard-page__spinner" aria-hidden="true" />
              Withdrawing…
            </>
          ) : isAssigned ? (
            'Assigned'
          ) : (
            'Withdraw'
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------
function SkeletonGauge() {
  return (
    <div className="dashboard-page__global">
      <div className="dashboard-page__skeleton-gauge" aria-busy="true" aria-label="Loading gauge…" />
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="dashboard-page__org-grid">
      {[0, 1, 2].map((i) => (
        <div key={i} className="dashboard-page__skeleton-card" aria-busy="true" aria-label="Loading org card…" />
      ))}
    </div>
  );
}

function SkeletonAppList() {
  return (
    <div className="dashboard-page__app-list">
      {[0, 1, 2].map((i) => (
        <div key={i} className="dashboard-page__skeleton-card" aria-busy="true" aria-label="Loading application…" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook: pending applications
// ---------------------------------------------------------------------------

interface UseApplicationsResult {
  applications: PendingApplication[];
  loading: boolean;
  error: string | null;
  removeApplication: (issueId: number) => void;
  reload: () => void;
}

function useApplications(apiBase: string, address: string | null): UseApplicationsResult {
  const [applications, setApplications] = useState<PendingApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/contributors/${encodeURIComponent(address)}/applications`);
      if (!res.ok) throw new Error(`Failed to fetch applications: ${res.status}`);
      const data = await res.json() as PendingApplication[];
      // Only show pending applications (not assigned ones, but still show them as disabled)
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiBase, address]);

  useEffect(() => {
    void load();
  }, [load]);

  function removeApplication(issueId: number) {
    setApplications((prev) => prev.filter((a) => a.issue_id !== issueId));
  }

  return { applications, loading, error, removeApplication, reload: load };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface DashboardPageProps {
  /** Base URL for the backend API, e.g. "/api" */
  apiBase?: string;
}

export function DashboardPage({ apiBase = '/api' }: DashboardPageProps) {
  const wallet = useWallet();
  const { data, state, error, refresh, showWarning } = useDashboard(apiBase, wallet.publicKey ?? null);
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const {
    applications,
    loading: appsLoading,
    error: appsError,
    removeApplication,
    reload: reloadApps,
  } = useApplications(apiBase, wallet.publicKey ?? null);

  const withdraw = useWithdraw({
    publicKey: wallet.publicKey,
    apiBase,
    onSuccess: (issueId) => {
      removeApplication(Number(issueId));
      addToast('Application withdrawn successfully. Your cap count has been decremented.', 'success');
      // Refresh dashboard counts
      void refresh();
    },
    onError: (msg) => {
      addToast(`Withdraw failed: ${msg}`, 'error');
    },
  });

  const isLoading = state === 'loading';

  // ── Not connected ────────────────────────────────────────────────────────
  if (!wallet.publicKey) {
    return (
      <main className="dashboard-page" id="main-content" tabIndex={-1}>
        <div className="dashboard-page__connect">
          <span className="dashboard-page__connect-icon" aria-hidden="true">🔒</span>
          <h1 className="dashboard-page__connect-title">Connect your wallet</h1>
          <p className="dashboard-page__connect-desc">
            Connect your Freighter wallet to view your contributor dashboard.
          </p>
          <button
            className="btn btn-primary"
            onClick={wallet.connect}
            type="button"
          >
            Connect Freighter
          </button>
        </div>
      </main>
    );
  }

  // ── Header ───────────────────────────────────────────────────────────────
  const lastRefreshedStr = data?.lastRefreshed
    ? data.lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <main className="dashboard-page" id="main-content" tabIndex={-1}>
      {/* Header */}
      <div className="dashboard-page__header">
        <h1 className="dashboard-page__title">Dashboard</h1>
        <div className="dashboard-page__meta">
          {lastRefreshedStr && (
            <span className="dashboard-page__timestamp" aria-live="polite" aria-atomic="true">
              Updated {lastRefreshedStr}
            </span>
          )}
          <button
            className="dashboard-page__refresh-btn"
            onClick={() => { void refresh(); void reloadApps(); }}
            disabled={isLoading}
            aria-label="Refresh dashboard data"
            type="button"
          >
            <span
              className={`dashboard-page__refresh-icon${isLoading ? ' dashboard-page__refresh-icon--spinning' : ''}`}
              aria-hidden="true"
            >
              ↺
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Warning banner */}
      {showWarning && (
        <div
          className="dashboard-page__warning"
          role="alert"
          aria-live="assertive"
        >
          <span className="dashboard-page__warning-icon" aria-hidden="true">⚠️</span>
          <span>
            You are approaching your cap limits. You have{' '}
            <strong>{data!.globalApplicationCount} / {GLOBAL_CAP}</strong> global
            applications pending
            {data!.orgUsage.some((o) => o.assignments >= 3) &&
              ' and at least one org is at 3+ active assignments'}.
            Withdraw or complete work to free capacity.
          </span>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="dashboard-page__error" role="alert">
          Failed to load dashboard: {error}. Please try refreshing.
        </div>
      )}

      {/* Global gauge */}
      {isLoading && !data ? (
        <SkeletonGauge />
      ) : (
        data && (
          <section className="dashboard-page__global" aria-label="Global applications">
            <h2 className="dashboard-page__global-title">Global applications</h2>
            <Gauge
              value={data.globalApplicationCount}
              max={GLOBAL_CAP}
              label="Applications"
              size={160}
              tooltip={`You may have at most ${GLOBAL_CAP} pending applications across all organisations.`}
            />
          </section>
        )
      )}

      {/* Per-org cards */}
      {isLoading && !data ? (
        <SkeletonGrid />
      ) : (
        data && (
          <>
            <h2 className="dashboard-page__org-section-title">
              Active organisations ({data.orgUsage.length})
            </h2>
            {data.orgUsage.length === 0 ? (
              <p className="dashboard-page__empty">
                No active org activity yet. Browse open issues to get started.
              </p>
            ) : (
              <div className="dashboard-page__org-grid">
                {data.orgUsage.map((usage) => (
                  <OrgCard key={usage.org_id} usage={usage} />
                ))}
              </div>
            )}
          </>
        )
      )}

      {/* ── Pending applications section ─────────────────────────────────── */}
      <section className="dashboard-page__apps-section" aria-label="Pending applications">
        <h2 className="dashboard-page__apps-title">
          Pending applications ({applications.length})
        </h2>

        {appsError && (
          <div className="dashboard-page__error" role="alert">
            Failed to load applications: {appsError}
          </div>
        )}

        {appsLoading ? (
          <SkeletonAppList />
        ) : applications.length === 0 ? (
          <p className="dashboard-page__empty">
            No pending applications. Browse open issues to apply.
          </p>
        ) : (
          <div className="dashboard-page__app-list">
            {applications.map((app) => (
              <ApplicationRow
                key={`${app.org_id}-${app.issue_id}`}
                app={app}
                onWithdraw={(a) =>
                  withdraw.initiateWithdraw({
                    issueId: String(a.issue_id),
                    issueTitle: a.title,
                    orgId: a.org_id,
                  })
                }
                withdrawing={
                  withdraw.loading &&
                  withdraw.pendingTarget?.issueId === String(app.issue_id) &&
                  withdraw.pendingTarget?.orgId === app.org_id
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Withdraw confirmation modal */}
      <WithdrawConfirmModal
        target={withdraw.pendingTarget}
        loading={withdraw.loading}
        onConfirm={withdraw.handleConfirm}
        onCancel={withdraw.handleCancel}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </main>
  );
}

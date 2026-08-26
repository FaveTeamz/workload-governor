/**
 * ContributorProfilePage — /contributor/:address
 *
 * Shows the public profile for any contributor address:
 *   - Address with copy button
 *   - Global applications cap gauge (n / 15)
 *   - Per-org assignment counts
 *   - Recent 10 events
 *   - Share button that copies the profile URL
 *   - Withdraw Application buttons on active applications (own profile only)
 *   - 404 page when the address has no on-chain activity
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { useContributorProfile, type OrgBreakdown, type ContributorEvent } from '../hooks/useContributorProfile';
import { useWallet } from '../hooks/useWallet';
import { Gauge } from '../components/Gauge';
import { CopyButton } from '../components/CopyButton';
import { WalletAddress } from '../components/WalletAddress';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import './ContributorProfilePage.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLOBAL_CAP = 15;
const ORG_CAP    = 4;
const API_BASE   = '/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  applied:   'Applied',
  assigned:  'Assigned',
  completed: 'Completed',
  revoked:   'Revoked',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface OrgRowProps {
  org: OrgBreakdown;
}

function OrgRow({ org }: OrgRowProps) {
  const assignRatio = org.assignments / ORG_CAP;

  function barColor(ratio: number): string {
    if (ratio < 0.67) return 'var(--color-success-500)';
    if (ratio < 0.93) return 'var(--color-warning-500)';
    return 'var(--color-error-500)';
  }

  return (
    <div
      className={`cpp-org-row${org.assignments >= 3 ? ' cpp-org-row--warning' : ''}`}
      role="region"
      aria-label={`Organisation: ${org.org_id}`}
    >
      <span className="cpp-org-row__name">{org.org_id}</span>

      {/* Assignments progress bar */}
      <div className="cpp-org-row__bar-wrap">
        <div className="cpp-org-row__bar-header">
          <span className="cpp-org-row__bar-label">Assignments</span>
          <span
            className="cpp-org-row__bar-count"
            style={{ color: barColor(assignRatio) }}
          >
            {org.assignments} / {ORG_CAP}
          </span>
        </div>
        <div
          className="cpp-org-row__track"
          role="progressbar"
          aria-valuenow={org.assignments}
          aria-valuemin={0}
          aria-valuemax={ORG_CAP}
          aria-label={`Assignments: ${org.assignments} of ${ORG_CAP}`}
        >
          <div
            className="cpp-org-row__fill"
            style={{
              width: `${Math.min((org.assignments / ORG_CAP) * 100, 100)}%`,
              background: barColor(assignRatio),
            }}
          />
        </div>
      </div>

      {org.applications > 0 && (
        <span className="cpp-org-row__apps">
          {org.applications} pending application{org.applications !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface EventItemProps {
  event: ContributorEvent;
}

function EventItem({ event }: EventItemProps) {
  const network = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STELLAR_NETWORK)
    ? (import.meta.env.VITE_STELLAR_NETWORK as string).toLowerCase()
    : 'testnet';
  const explorerBase = network === 'mainnet'
    ? 'https://stellar.expert/explorer/public/tx'
    : 'https://stellar.expert/explorer/testnet/tx';

  const label = EVENT_TYPE_LABELS[event.event_type] ?? event.event_type;

  return (
    <li className={`cpp-event cpp-event--${event.event_type}`}>
      <span
        className={`cpp-event__badge cpp-event__badge--${event.event_type}`}
        aria-hidden="true"
      >
        {label}
      </span>
      <span className="cpp-event__body">
        {event.org_id && (
          <span className="cpp-event__org">{event.org_id}</span>
        )}
        {event.issue_id != null && (
          <span className="cpp-event__issue"> #{event.issue_id}</span>
        )}
        {' — '}
        <a
          href={`${explorerBase}/${event.tx_hash}`}
          target="_blank"
          rel="noreferrer noopener"
          className="cpp-event__tx"
          aria-label={`View transaction on Stellar Explorer`}
        >
          {event.tx_hash.slice(0, 8)}…
        </a>
      </span>
      <time
        className="cpp-event__time"
        dateTime={event.timestamp}
        title={event.timestamp}
      >
        {relativeTime(event.timestamp)}
      </time>
    </li>
  );
}

// ---------------------------------------------------------------------------

interface WithdrawSectionProps {
  address: string;
  apiBase: string;
  onWithdrawn: () => void;
}

/**
 * Lists the contributor's active (pending) applications and lets them
 * withdraw each one. Only rendered when viewing your own profile.
 */
function WithdrawSection({ address, apiBase, onWithdrawn }: WithdrawSectionProps) {
  const [applications, setApplications] = useState<
    Array<{ org_id: string; issue_id: number; title: string; created_at: string }>
  >([]);
  const [loading, setLoading]     = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [withdrawing, setWithdrawing] = useState<number | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // Lazily load applications on first expand
  const fetchApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/contributors/${encodeURIComponent(address)}/applications`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Array<{
        org_id: string;
        issue_id: number;
        title: string;
        created_at: string;
      }>;
      setApplications(data);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [apiBase, address]);

  // Load on mount
  useEffect(() => {
    void fetchApps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleWithdraw(orgId: string, issueId: number) {
    setWithdrawing(issueId);
    try {
      const res = await fetch(
        `${apiBase}/contributors/${encodeURIComponent(address)}/applications/${encodeURIComponent(orgId)}/${issueId}`,
        { method: 'DELETE' },
      );
      // Accept both 200 and 204 (no content) as success
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setApplications((prev) => prev.filter((a) => a.issue_id !== issueId));
      onWithdrawn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdraw failed');
    } finally {
      setWithdrawing(null);
    }
  }

  if (loading && !loaded) {
    return (
      <section className="cpp-withdraw" aria-label="Your active applications">
        <h2 className="cpp-section-title">Your applications</h2>
        <p className="cpp-loading-text" aria-live="polite">Loading applications…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="cpp-withdraw" aria-label="Your active applications">
        <h2 className="cpp-section-title">Your applications</h2>
        <p className="cpp-error-text" role="alert">{error}</p>
        <button className="btn btn-secondary" onClick={fetchApps} type="button">
          Retry
        </button>
      </section>
    );
  }

  if (loaded && applications.length === 0) {
    return (
      <section className="cpp-withdraw" aria-label="Your active applications">
        <h2 className="cpp-section-title">Your applications</h2>
        <p className="cpp-empty-text">No pending applications.</p>
      </section>
    );
  }

  return (
    <section className="cpp-withdraw" aria-label="Your active applications">
      <h2 className="cpp-section-title">Your applications</h2>
      <ul className="cpp-withdraw__list" role="list">
        {applications.map((app) => (
          <li key={`${app.org_id}-${app.issue_id}`} className="cpp-withdraw__item">
            <div className="cpp-withdraw__info">
              <span className="cpp-withdraw__org">{app.org_id}</span>
              <span className="cpp-withdraw__title">{app.title}</span>
              <span className="cpp-withdraw__id">#{app.issue_id}</span>
            </div>
            <button
              className="btn btn-secondary cpp-withdraw__btn"
              onClick={() => void handleWithdraw(app.org_id, app.issue_id)}
              disabled={withdrawing === app.issue_id}
              aria-label={`Withdraw application for issue ${app.issue_id}: ${app.title}`}
              type="button"
            >
              {withdrawing === app.issue_id ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function SkeletonProfile() {
  return (
    <main className="cpp" id="main-content" tabIndex={-1}>
      <div className="cpp-header">
        <div className="cpp-skeleton cpp-skeleton--title" aria-busy="true" aria-label="Loading profile…" />
        <div className="cpp-skeleton cpp-skeleton--subtitle" aria-busy="true" />
      </div>
      <div className="cpp-skeleton cpp-skeleton--gauge" aria-busy="true" />
      <div className="cpp-skeleton cpp-skeleton--section" aria-busy="true" />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ContributorProfilePage() {
  const { address } = useParams<{ address: string }>();
  const navigate    = useNavigate();
  const wallet      = useWallet();

  const { profile, state, error, refresh } = useContributorProfile(API_BASE, address);

  const isOwnProfile =
    !!wallet.publicKey &&
    !!address &&
    wallet.publicKey.toLowerCase() === address.toLowerCase();

  // Share button state
  const [shareCopied, setShareCopied] = useState(false);

  function handleShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      // Fallback: prompt
      window.prompt('Copy this link:', url);
    });
  }

  // ---------------------------------------------------------------------------
  // State renders
  // ---------------------------------------------------------------------------

  if ((state === 'idle' || state === 'loading') && !profile) {
    return <SkeletonProfile />;
  }

  if (state === 'not-found') {
    return (
      <main className="cpp" id="main-content" tabIndex={-1}>
        <ErrorState
          variant="not-found"
          title="Contributor not found"
          message="This address has no on-chain activity. It may not have applied for any issues yet."
          ctaLabel="Back to home"
          onCta={() => navigate('/')}
        />
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="cpp" id="main-content" tabIndex={-1}>
        <ErrorState
          variant="server-error"
          message={`Unable to load profile. ${error ?? ''}`}
          onRetry={refresh}
          ctaLabel="Back to home"
          onCta={() => navigate('/')}
        />
      </main>
    );
  }

  if (!profile) return null;

  const recentEvents = profile.recent_events.slice(0, 10);

  return (
    <main className="cpp" id="main-content" tabIndex={-1}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="cpp-header">
        <div className="cpp-header__identity">
          <h1 className="cpp-header__title">Contributor Profile</h1>
          <div className="cpp-header__address">
            <WalletAddress address={profile.address} />
            {isOwnProfile && (
              <span className="cpp-header__own-badge" aria-label="This is your profile">
                You
              </span>
            )}
          </div>
        </div>

        <div className="cpp-header__actions">
          <button
            className={`btn ${shareCopied ? 'btn-secondary cpp-share-btn--copied' : 'btn-secondary'} cpp-share-btn`}
            onClick={handleShare}
            type="button"
            aria-label="Copy profile URL to clipboard"
          >
            {shareCopied ? (
              <>
                <ShareCheckIcon />
                Copied!
              </>
            ) : (
              <>
                <ShareIcon />
                Share profile
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Global cap gauge ───────────────────────────────────────────── */}
      <section className="cpp-gauge-section" aria-label="Global application cap">
        <h2 className="cpp-section-title">Global applications</h2>
        <div className="cpp-gauge-wrap">
          <Gauge
            value={profile.global_application_count}
            max={GLOBAL_CAP}
            label="Applications"
            size={160}
            tooltip={`Maximum ${GLOBAL_CAP} pending applications across all organisations. Currently ${profile.global_application_count} pending.`}
          />
          {profile.global_application_count >= 12 && (
            <div className="cpp-gauge-warning" role="alert" aria-live="polite">
              <span aria-hidden="true">⚠️</span>
              {' '}Approaching global application cap (
              {profile.global_application_count}/{GLOBAL_CAP}).
            </div>
          )}
        </div>
      </section>

      {/* ── Per-org counts ─────────────────────────────────────────────── */}
      <section className="cpp-orgs-section" aria-label="Per-organisation activity">
        <h2 className="cpp-section-title">
          Organisations ({profile.orgs.length})
        </h2>
        {profile.orgs.length === 0 ? (
          <EmptyState
            variant="no-orgs"
            compact
          />
        ) : (
          <div className="cpp-org-list" role="list">
            {profile.orgs.map((org) => (
              <OrgRow key={org.org_id} org={org} />
            ))}
          </div>
        )}
      </section>

      {/* ── Withdraw section (own profile only) ────────────────────────── */}
      {isOwnProfile && (
        <WithdrawSection
          address={profile.address}
          apiBase={API_BASE}
          onWithdrawn={refresh}
        />
      )}

      {/* ── Recent events ──────────────────────────────────────────────── */}
      <section className="cpp-events-section" aria-label="Recent activity">
        <h2 className="cpp-section-title">Recent activity</h2>
        {recentEvents.length === 0 ? (
          <EmptyState variant="no-events" compact />
        ) : (
          <ol className="cpp-event-list" aria-live="polite">
            {recentEvents.map((ev) => (
              <EventItem key={ev.id} event={ev} />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function ShareCheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * OrgIssuesPage — issue #199, #532
 *
 * Browse open issues for an org, with inline Apply/Withdraw actions that
 * invoke the WorkloadGovernor contract via Freighter wallet.
 *
 * Pagination: issues load in pages of 20 via IntersectionObserver infinite
 * scroll. Skeleton cards are shown while the next page loads. A "no more
 * issues" sentinel is displayed when all pages have been fetched.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import {
  useInfiniteOrgIssues,
  type OrgIssue,
} from '../hooks/useInfiniteOrgIssues';
import type { Difficulty } from '../hooks/useOrgIssues';
import type { IssueStatus } from '../hooks/useOrgIssues';
import { useToast } from '../components/Toast';
import { IssueCardSkeleton } from '../components/SkeletonScreens';
import './OrgIssuesPage.css';

const GLOBAL_CAP = 15;
const ORG_CAP = 4;

/** Number of skeleton cards shown while the next page loads */
const SKELETON_COUNT = 3;

type SortOption = 'newest' | 'oldest' | 'most-applicants' | 'fewest-applicants';

const STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  applied: 'Applied',
  assigned: 'Assigned',
};

// ── IssueRow ──────────────────────────────────────────────────────────────────

interface IssueRowProps {
  issue: OrgIssue;
  canApply: boolean;
  capReachedReason: string | null;
  onApply: (issueId: string) => void;
  onWithdraw: (issueId: string) => void;
  busy: boolean;
  txHash: string | null;
}

function IssueRow({
  issue,
  canApply,
  capReachedReason,
  onApply,
  onWithdraw,
  busy,
  txHash,
}: IssueRowProps) {
  const showApply = issue.status === 'open';
  const showWithdraw = issue.status === 'applied';
  const isDisabled = !canApply || busy;
  const network = (import.meta.env.VITE_STELLAR_NETWORK ?? 'TESTNET').toLowerCase();

  return (
    <div className="org-issue-row">
      <div className="org-issue-row__info">
        <h3 className="org-issue-row__title">{issue.title}</h3>
        <div className="org-issue-row__meta">
          <span className="org-issue-row__id">{issue.issue_id}</span>
          {issue.reward_xlm !== undefined && (
            <span className="org-issue-row__reward">{issue.reward_xlm} XLM</span>
          )}
          {issue.labels?.length ? (
            <span className="org-issue-row__labels">{issue.labels.join(', ')}</span>
          ) : null}
          {issue.difficulty ? (
            <span className="org-issue-row__chip">{issue.difficulty}</span>
          ) : null}
          <span className={`org-issue-row__chip org-issue-row__chip--${issue.status}`}>
            {STATUS_LABEL[issue.status]}
          </span>
        </div>

        <div className="org-issue-row__actions">
          {showApply && (
            <button
              className="org-issue-row__btn org-issue-row__btn--apply"
              onClick={() => onApply(issue.issue_id)}
              disabled={isDisabled}
              aria-label={`Apply for issue: ${issue.title}`}
              title={capReachedReason ?? undefined}
              type="button"
            >
              {busy ? (
                <>
                  <span className="org-issue-row__spinner" aria-hidden="true" />
                  Applying…
                </>
              ) : (
                'Apply'
              )}
            </button>
          )}
          {showWithdraw && (
            <button
              className="org-issue-row__btn org-issue-row__btn--withdraw"
              onClick={() => onWithdraw(issue.issue_id)}
              disabled={busy}
              aria-label={`Withdraw application for: ${issue.title}`}
              type="button"
            >
              {busy ? (
                <>
                  <span className="org-issue-row__spinner" aria-hidden="true" />
                  Withdrawing…
                </>
              ) : (
                'Withdraw'
              )}
            </button>
          )}
          {txHash && (
            <a
              className="org-issue-row__tx-link"
              href={`https://stellar.expert/explorer/${network}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              aria-label="View transaction on Stellar Explorer"
            >
              View Tx →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return <div className="org-issue-row org-issue-row--skeleton" aria-busy="true" />;
}

// ── OrgIssuesPage ─────────────────────────────────────────────────────────────

interface OrgIssuesPageProps {
  apiBase?: string;
}

export function OrgIssuesPage({ apiBase = '/api' }: OrgIssuesPageProps) {
  const { org_id } = useParams<{ org_id: string }>();
  const wallet = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const { add: addToast } = useToast();

  const {
    issues,
    loading,
    hasMore,
    loadMore,
    error,
    globalAppCount,
    orgAssignCount,
    refresh,
    setIssueStatus,
  } = useInfiniteOrgIssues(apiBase, org_id ?? '', wallet.publicKey ?? null);

  const [busyIssue, setBusyIssue] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [searchText, setSearchText] = useState(searchParams.get('search') ?? '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>(searchParams.getAll('label'));
  const [selectedDifficulties, setSelectedDifficulties] = useState<Difficulty[]>(
    searchParams
      .getAll('difficulty')
      .filter((value): value is Difficulty =>
        ['beginner', 'intermediate', 'advanced'].includes(value),
      ),
  );
  const [sort, setSort] = useState<SortOption>(
    (searchParams.get('sort') as SortOption) ?? 'newest',
  );

  // ── Debounced search ──────────────────────────────────────────────────────

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchText(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (searchText) nextParams.set('search', searchText);
    selectedLabels.forEach((label) => nextParams.append('label', label));
    selectedDifficulties.forEach((difficulty) => nextParams.append('difficulty', difficulty));
    if (sort !== 'newest') nextParams.set('sort', sort);
    setSearchParams(nextParams, { replace: true });
  }, [searchText, selectedLabels, selectedDifficulties, sort, setSearchParams]);

  // ── IntersectionObserver sentinel for infinite scroll ────────────────────

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // ── Cap logic ─────────────────────────────────────────────────────────────

  const globalCapReached = globalAppCount >= GLOBAL_CAP;
  const orgCapReached = orgAssignCount >= ORG_CAP;
  const canApply = wallet.publicKey !== null && !globalCapReached && !orgCapReached;

  let capReachedReason: string | null = null;
  if (!wallet.publicKey) capReachedReason = 'Connect your wallet to apply.';
  else if (globalCapReached)
    capReachedReason = `Global limit reached: ${globalAppCount}/${GLOBAL_CAP} applications.`;
  else if (orgCapReached)
    capReachedReason = `Org limit reached: ${orgAssignCount}/${ORG_CAP} assignments.`;

  // ── Filtering & sorting ───────────────────────────────────────────────────

  const availableLabels = useMemo(() => {
    return Array.from(new Set(issues.flatMap((issue) => issue.labels ?? []))).sort();
  }, [issues]);

  const activeFilterCount = useMemo(() => {
    return (
      Number(Boolean(searchText)) +
      selectedLabels.length +
      selectedDifficulties.length +
      Number(sort !== 'newest')
    );
  }, [searchText, selectedLabels.length, selectedDifficulties.length, sort]);

  const filteredIssues = useMemo(() => {
    const normalized = issues.filter((issue) => {
      const matchesSearch = issue.title.toLowerCase().includes(searchText.toLowerCase());
      const matchesLabels =
        selectedLabels.length === 0 ||
        (issue.labels ?? []).some((label) => selectedLabels.includes(label));
      const matchesDifficulty =
        selectedDifficulties.length === 0 ||
        (issue.difficulty ? selectedDifficulties.includes(issue.difficulty) : false);
      return matchesSearch && matchesLabels && matchesDifficulty;
    });

    return [...normalized].sort((left, right) => {
      switch (sort) {
        case 'oldest':
          return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
        case 'most-applicants':
          return (right.applicant_count ?? 0) - (left.applicant_count ?? 0);
        case 'fewest-applicants':
          return (left.applicant_count ?? 0) - (right.applicant_count ?? 0);
        case 'newest':
        default:
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }
    });
  }, [issues, searchText, selectedLabels, selectedDifficulties, sort]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleApply(issueId: string) {
    if (!wallet.publicKey) return;
    setBusyIssue(issueId);
    setTxHash(null);

    try {
      setIssueStatus(issueId, 'applied');

      const res = await fetch(
        `${apiBase}/orgs/${encodeURIComponent(org_id!)}/issues/${encodeURIComponent(issueId)}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contributor: wallet.publicKey }),
        },
      );
      if (!res.ok) throw new Error(`Apply failed: ${res.status}`);
      const data = (await res.json()) as { tx_hash?: string };
      if (data.tx_hash) setTxHash(data.tx_hash);
      const issue = issues.find((entry) => entry.issue_id === issueId);
      addToast(issue ? `Applied for "${issue.title}"` : 'Applied for issue', 'success');
    } catch (err) {
      setIssueStatus(issueId, 'open');
      addToast(err instanceof Error ? err.message : 'Apply failed', 'error');
    } finally {
      setBusyIssue(null);
    }
  }

  async function handleWithdraw(issueId: string) {
    if (!wallet.publicKey) return;
    const confirmed = window.confirm(
      'Withdraw this application? This will free one global cap slot.',
    );
    if (!confirmed) return;

    setBusyIssue(issueId);
    setTxHash(null);

    try {
      setIssueStatus(issueId, 'open');

      const txRes = await fetch(`${apiBase}/transactions/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributor: wallet.publicKey,
          org_id: org_id,
          issue_id: Number(issueId),
          sequence: '0',
        }),
      });
      if (!txRes.ok) throw new Error(`Withdraw failed: ${txRes.status}`);
      const issue = issues.find((entry) => entry.issue_id === issueId);
      addToast(issue ? `Withdrawn from "${issue.title}"` : 'Withdrawn from issue', 'info');
    } catch (err) {
      setIssueStatus(issueId, 'applied');
      addToast(err instanceof Error ? err.message : 'Withdraw failed', 'error');
    } finally {
      setBusyIssue(null);
    }
  }

  const showCapBanner = !loading && wallet.publicKey && (globalCapReached || orgCapReached);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="org-issues-page" id="main-content" tabIndex={-1}>
      <div className="org-issues-page__header">
        <div>
          <h1 className="org-issues-page__title">Issues: {org_id}</h1>
          <p className="org-issues-page__subtitle">Browse and apply for open issues</p>
        </div>
        <button
          className="org-issues-page__refresh-btn"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh issues"
          type="button"
        >
          ↺ Refresh
        </button>
      </div>

      {!wallet.publicKey && (
        <div className="org-issues-page__connect">
          <span className="org-issues-page__connect-text">
            Connect your wallet to apply for issues.
          </span>
          <button className="btn btn-primary btn-sm" onClick={wallet.connect} type="button">
            Connect Freighter
          </button>
        </div>
      )}

      {showCapBanner && (
        <div className="org-issues-page__cap-banner" role="alert">
          ⚠️ {capReachedReason}
        </div>
      )}

      {error && (
        <div className="org-issues-page__error" role="alert">
          Failed to load issues: {error}
        </div>
      )}

      {/* ── Filters ── */}
      <section className="org-issues-page__filters" aria-label="Issue filters">
        <div className="org-issues-page__filters-row">
          <input
            className="org-issues-page__search"
            type="search"
            placeholder="Search issues"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search issues"
          />
          <button
            className="org-issues-page__filter-btn"
            type="button"
            onClick={() => setShowFilters((value) => !value)}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="org-issues-page__filter-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="org-issues-page__filter-panel">
            <div className="org-issues-page__filter-group">
              <h2>Labels</h2>
              {availableLabels.map((label) => (
                <label key={label} className="org-issues-page__checkbox">
                  <input
                    type="checkbox"
                    checked={selectedLabels.includes(label)}
                    onChange={() => {
                      setSelectedLabels((current) =>
                        current.includes(label)
                          ? current.filter((value) => value !== label)
                          : [...current, label],
                      );
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="org-issues-page__filter-group">
              <h2>Difficulty</h2>
              {(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map((difficulty) => (
                <label key={difficulty} className="org-issues-page__checkbox">
                  <input
                    type="checkbox"
                    checked={selectedDifficulties.includes(difficulty)}
                    onChange={() => {
                      setSelectedDifficulties((current) =>
                        current.includes(difficulty)
                          ? current.filter((value) => value !== difficulty)
                          : [...current, difficulty],
                      );
                    }}
                  />
                  <span>{difficulty}</span>
                </label>
              ))}
            </div>

            <div className="org-issues-page__filter-group">
              <h2>Sort</h2>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="most-applicants">Most Applicants</option>
                <option value="fewest-applicants">Fewest Applicants</option>
              </select>
            </div>

            <button
              className="org-issues-page__clear-btn"
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchText('');
                setSelectedLabels([]);
                setSelectedDifficulties([]);
                setSort('newest');
              }}
            >
              Clear all filters
            </button>
          </div>
        )}
      </section>

      {/* ── Issue list ── */}
      {loading && issues.length === 0 ? (
        /* Initial load: show full-page skeleton */
        <div className="org-issues-page__list" aria-label="Loading issues" aria-busy="true">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filteredIssues.length === 0 && !loading ? (
        <p className="org-issues-page__empty">No issues match the current filters.</p>
      ) : (
        <div className="org-issues-page__list">
          {filteredIssues.map((issue) => (
            <IssueRow
              key={issue.issue_id}
              issue={issue}
              canApply={canApply}
              capReachedReason={capReachedReason}
              onApply={handleApply}
              onWithdraw={handleWithdraw}
              busy={busyIssue === issue.issue_id}
              txHash={busyIssue === issue.issue_id ? txHash : null}
            />
          ))}

          {/* Skeleton cards shown while next page loads */}
          {loading && (
            <div
              className="org-issues-page__page-skeletons"
              aria-label="Loading more issues"
              aria-busy="true"
            >
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <IssueCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* IntersectionObserver sentinel — invisible element at list bottom */}
          {hasMore && !loading && (
            <div
              ref={sentinelRef}
              className="org-issues-page__scroll-sentinel"
              aria-hidden="true"
              data-testid="scroll-sentinel"
            />
          )}

          {/* End-of-list message once all pages are loaded */}
          {!hasMore && issues.length > 0 && (
            <p className="org-issues-page__end-of-list" role="status" aria-live="polite">
              All issues loaded · {issues.length} total
            </p>
          )}
        </div>
      )}
    </main>
  );
}

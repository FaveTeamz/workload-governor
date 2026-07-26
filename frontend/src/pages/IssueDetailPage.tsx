import { useParams, useNavigate } from 'react-router-dom';
import { useIssueDetail } from '../hooks/useIssueDetail';
import { useWallet } from '../hooks/useWallet';
import { CopyButton } from '../components/CopyButton';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { useState, useCallback } from 'react';
import './IssueDetailPage.css';

// ---------------------------------------------------------------------------
// Lightweight Markdown → sanitised HTML
// ---------------------------------------------------------------------------

/**
 * Converts a small but practical subset of Markdown to safe HTML.
 * No external dependency required.
 *
 * Supported: fenced code blocks, headings (h1–h6), horizontal rules,
 * unordered / ordered lists, inline code, bold, italic, links,
 * strikethrough, and paragraphs.
 *
 * All raw HTML is escaped before any Markdown substitution so that
 * injected `<script>` or `on*=` attributes cannot survive.
 */
function renderMarkdown(raw: string): string {
  // 1. Escape all HTML first so user content can never inject tags
  let out = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 2. Fenced code blocks  ```lang\n…\n```
  out = out.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const cls = lang.trim() ? ` class="language-${esc(lang.trim())}"` : '';
    return `<pre><code${cls}>${code}</code></pre>`;
  });

  // 3. Headings  # H1 … ###### H6
  out = out.replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, text) => {
    const level = hashes.length;
    return `<h${level}>${text}</h${level}>`;
  });

  // 4. Horizontal rule  --- / *** / ___
  out = out.replace(/^[-*_]{3,}\s*$/gm, '<hr>');

  // 5. Unordered lists  - item / * item
  out = out.replace(/((?:^[ \t]*[-*]\s+.+\n?)+)/gm, (block) => {
    const items = block.replace(/^[ \t]*[-*]\s+(.+)$/gm, '<li>$1</li>');
    return `<ul>${items}</ul>`;
  });

  // 6. Ordered lists  1. item
  out = out.replace(/((?:^[ \t]*\d+\.\s+.+\n?)+)/gm, (block) => {
    const items = block.replace(/^[ \t]*\d+\.\s+(.+)$/gm, '<li>$1</li>');
    return `<ol>${items}</ol>`;
  });

  // 7. Inline transformations
  out = out
    // Inline code  `code`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold  **text** or __text__
    .replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
    // Italic  *text* or _text_
    .replace(/([*_])(.+?)\1/g, '<em>$2</em>')
    // Strikethrough  ~~text~~
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Links  [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
      // Only allow http/https/mailto schemes
      const safe = /^(https?:|mailto:)/.test(href) ? href : '#';
      return `<a href="${safe}" target="_blank" rel="noreferrer noopener">${text}</a>`;
    });

  // 8. Wrap lone text lines in <p> (lines not already inside a block element)
  out = out.replace(/^(?!<[a-z]|[ \t]*$)(.+)$/gm, '<p>$1</p>');

  return out;
}

/** Simple attribute-value escaper used inside renderMarkdown */
function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<string, string> = {
  applied:   'Applied',
  assigned:  'Assigned',
  completed: 'Completed',
  revoked:   'Revoked',
};

const EVENT_VARIANT: Record<string, 'info' | 'success' | 'error' | 'warning' | 'neutral'> = {
  applied:   'info',
  assigned:  'success',
  completed: 'success',
  revoked:   'error',
};

function shortAddr(addr: string) {
  return addr && addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// IssueDetailPage
// ---------------------------------------------------------------------------

interface IssueDetailPageProps {
  /** Backend base URL. Defaults to "/api". */
  apiBase?: string;
  /** Called when the contributor clicks Apply. */
  onApply?: (orgId: string, issueId: string) => Promise<void>;
  /** Called when the contributor clicks Withdraw. */
  onWithdraw?: (orgId: string, issueId: string) => Promise<void>;
}

export function IssueDetailPage({
  apiBase = '/api',
  onApply,
  onWithdraw,
}: IssueDetailPageProps) {
  const { org_id = '', issue_id = '' } = useParams<{ org_id: string; issue_id: string }>();
  const navigate = useNavigate();
  const { publicKey } = useWallet();

  const { data, loading, error, refetch } = useIssueDetail(apiBase, org_id, issue_id);

  const [actionBusy, setActionBusy] = useState<'apply' | 'withdraw' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const shareUrl = window.location.href;

  const hasApplied = data
    ? data.events.some(
        (e) => e.event_type === 'applied' && e.contributor === publicKey,
      )
    : false;

  const handleApply = useCallback(async () => {
    if (!onApply) return;
    setActionBusy('apply');
    setActionError(null);
    try {
      await onApply(org_id, issue_id);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setActionBusy(null);
    }
  }, [onApply, org_id, issue_id, refetch]);

  const handleWithdraw = useCallback(async () => {
    if (!onWithdraw) return;
    setActionBusy('withdraw');
    setActionError(null);
    try {
      await onWithdraw(org_id, issue_id);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Withdraw failed');
    } finally {
      setActionBusy(null);
    }
  }, [onWithdraw, org_id, issue_id, refetch]);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading && !data) {
    return (
      <main className="issue-detail" id="main-content" tabIndex={-1}>
        <p className="issue-detail__loading" aria-live="polite" aria-busy="true">
          Loading issue…
        </p>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="issue-detail" id="main-content" tabIndex={-1}>
        <div className="issue-detail__error" role="alert">
          <p>Failed to load issue: {error}</p>
          <Button variant="secondary" size="sm" onClick={refetch}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            ← Back
          </Button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { issue, applicant_count, assigned_to, events } = data;
  const labels = issue.labels
    ? issue.labels.split(',').map((l) => l.trim()).filter(Boolean)
    : [];

  const isAssigned = issue.status === 'assigned' || assigned_to !== null;

  return (
    <main className="issue-detail" id="main-content" tabIndex={-1}>
      {/* ── Back navigation ── */}
      <nav className="issue-detail__breadcrumb" aria-label="Breadcrumb">
        <button
          className="issue-detail__back"
          onClick={() => navigate(-1)}
          aria-label="Back to issues list"
        >
          ← Issues
        </button>
        <span aria-hidden="true">/</span>
        <span>{org_id}</span>
        <span aria-hidden="true">/</span>
        <span>#{issue_id}</span>
      </nav>

      <div className="issue-detail__layout">
        {/* ── Main column ── */}
        <article className="issue-detail__main" aria-labelledby="issue-title">
          {/* Header */}
          <header className="issue-detail__header">
            <h1 className="issue-detail__title" id="issue-title">{issue.title}</h1>

            <div className="issue-detail__meta">
              <span className="issue-detail__org">{org_id}</span>
              <span aria-hidden="true">·</span>
              <span className={`issue-detail__status issue-detail__status--${issue.status}`}>
                {issue.status}
              </span>
              <span aria-hidden="true">·</span>
              <time
                className="issue-detail__date"
                dateTime={issue.created_at}
                title={new Date(issue.created_at).toISOString()}
              >
                {fmtDate(issue.created_at)}
              </time>
            </div>

            {/* Labels */}
            {labels.length > 0 && (
              <div className="issue-detail__labels" aria-label="Labels">
                {labels.map((label) => (
                  <Badge key={label} variant="neutral">
                    {label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Stats row */}
            <div className="issue-detail__stats">
              <span
                className="issue-detail__stat"
                aria-label={`${applicant_count} applicant${applicant_count !== 1 ? 's' : ''}`}
              >
                <span className="issue-detail__stat-icon" aria-hidden="true">👥</span>
                {applicant_count} applicant{applicant_count !== 1 ? 's' : ''}
              </span>
              {assigned_to && (
                <span
                  className="issue-detail__stat"
                  aria-label={`Assigned to ${assigned_to}`}
                >
                  <span className="issue-detail__stat-icon" aria-hidden="true">✅</span>
                  Assigned to{' '}
                  <code className="issue-detail__addr" title={assigned_to}>
                    {shortAddr(assigned_to)}
                  </code>
                </span>
              )}
            </div>
          </header>

          {/* Body: rendered Markdown */}
          <section
            className="issue-detail__body markdown-body"
            aria-label="Issue description"
          >
            {issue.body ? (
              <div
                // Content is produced by renderMarkdown which escapes all raw
                // HTML first — no user-supplied tags survive.
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.body) }}
              />
            ) : (
              <p className="issue-detail__no-body">No description provided.</p>
            )}
          </section>

          {/* Timeline */}
          <section className="issue-detail__timeline" aria-label="Issue timeline">
            <h2 className="issue-detail__section-title">Timeline</h2>
            {events.length === 0 ? (
              <p className="issue-detail__no-events">No events yet.</p>
            ) : (
              <ol className="timeline">
                {events.map((ev) => (
                  <li key={ev.id} className={`timeline__item timeline__item--${ev.event_type}`}>
                    <div className="timeline__dot" aria-hidden="true" />
                    <div className="timeline__content">
                      <div className="timeline__header">
                        <Badge variant={EVENT_VARIANT[ev.event_type] ?? 'neutral'}>
                          {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                        </Badge>
                        {ev.contributor && (
                          <code
                            className="timeline__addr"
                            title={ev.contributor}
                            aria-label={`Contributor: ${ev.contributor}`}
                          >
                            {shortAddr(ev.contributor)}
                          </code>
                        )}
                      </div>
                      <time
                        className="timeline__time"
                        dateTime={ev.timestamp}
                        title={new Date(ev.timestamp).toISOString()}
                      >
                        {fmtDate(ev.timestamp)}
                      </time>
                      {ev.tx_hash && (
                        <div className="timeline__tx">
                          <code
                            className="timeline__hash"
                            title={ev.tx_hash}
                            aria-label={`Transaction hash: ${ev.tx_hash}`}
                          >
                            {ev.tx_hash.slice(0, 12)}…
                          </code>
                          <CopyButton
                            text={ev.tx_hash}
                            label={`Copy transaction hash ${ev.tx_hash}`}
                            copiedLabel="Hash copied"
                            className="timeline__copy"
                          />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </article>

        {/* ── Sidebar ── */}
        <aside className="issue-detail__sidebar" aria-label="Issue actions">
          {/* Apply / Withdraw */}
          <div className="sidebar-card">
            <h2 className="sidebar-card__title">Your application</h2>

            {!publicKey && (
              <p className="sidebar-card__hint">Connect your wallet to apply.</p>
            )}

            {publicKey && !isAssigned && (
              <>
                {hasApplied ? (
                  <Button
                    variant="secondary"
                    onClick={handleWithdraw}
                    disabled={actionBusy !== null}
                    aria-busy={actionBusy === 'withdraw'}
                    aria-label="Withdraw your application for this issue"
                    className="sidebar-card__action"
                  >
                    {actionBusy === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleApply}
                    disabled={actionBusy !== null}
                    aria-busy={actionBusy === 'apply'}
                    aria-label="Apply for this issue"
                    className="sidebar-card__action"
                  >
                    {actionBusy === 'apply' ? 'Applying…' : 'Apply'}
                  </Button>
                )}
                {actionError && (
                  <p className="sidebar-card__error" role="alert">
                    {actionError}
                  </p>
                )}
              </>
            )}

            {isAssigned && assigned_to !== publicKey && (
              <p className="sidebar-card__hint">
                This issue has already been assigned.
              </p>
            )}

            {isAssigned && assigned_to === publicKey && (
              <p className="sidebar-card__hint sidebar-card__hint--success">
                You are assigned to this issue.
              </p>
            )}
          </div>

          {/* GitHub link */}
          {issue.github_url && (
            <div className="sidebar-card">
              <h2 className="sidebar-card__title">GitHub</h2>
              <a
                className="sidebar-card__link"
                href={issue.github_url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`View issue on GitHub: ${issue.title}`}
              >
                View on GitHub ↗
              </a>
            </div>
          )}

          {/* Share */}
          <div className="sidebar-card">
            <h2 className="sidebar-card__title">Share</h2>
            <div className="sidebar-card__share">
              <input
                className="sidebar-card__url"
                type="text"
                value={shareUrl}
                readOnly
                aria-label="Issue URL"
              />
              <CopyButton
                text={shareUrl}
                label="Copy issue URL"
                copiedLabel="URL copied"
                className="sidebar-card__copy"
                aria-label="Copy issue URL to clipboard"
              />
            </div>
          </div>

          {/* Cap status */}
          <div className="sidebar-card">
            <h2 className="sidebar-card__title">Competitiveness</h2>
            <dl className="sidebar-card__stats">
              <dt>Applicants</dt>
              <dd
                className={`sidebar-cap ${
                  applicant_count >= 10
                    ? 'sidebar-cap--high'
                    : applicant_count >= 4
                    ? 'sidebar-cap--medium'
                    : 'sidebar-cap--low'
                }`}
                aria-label={`${applicant_count} applicants`}
              >
                {applicant_count}
              </dd>
              <dt>Status</dt>
              <dd className={`issue-detail__status issue-detail__status--${issue.status}`}>
                {issue.status}
              </dd>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}

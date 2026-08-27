import { useState, useEffect, useRef, useId } from "react";

/** Issue status values */
export type IssueStatus = "open" | "applied" | "assigned" | "completed";

/** Detail info shown in the expanded section */
export interface IssueCardDetails {
  /** Total number of current applicants */
  applicantCount?: number;
  /** Contributor's remaining global cap slots (max 15) */
  globalSlotsRemaining?: number;
  /** Contributor's remaining org-level slots (max 4) */
  orgSlotsRemaining?: number;
  /** ISO-8601 timestamp when the existing application TTL expires */
  ttlExpiresAt?: string | null;
}

export interface IssueCardProps {
  id: string;
  org: string;
  title: string;
  status: IssueStatus;
  details?: IssueCardDetails;
  onApply?: (id: string) => Promise<void> | void;
  onWithdraw?: (id: string) => Promise<void> | void;
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  open:      "Open",
  applied:   "Applied",
  assigned:  "Assigned",
  completed: "Completed",
};

/** Format a TTL expiry timestamp into a human-readable countdown */
function formatTtl(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function DetailRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="issue-card__detail-row">
      <span className="issue-card__detail-label">{label}</span>
      <span className={`issue-card__detail-value${warn ? " issue-card__detail-value--warn" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function IssueCard({
  id,
  org,
  title,
  status,
  details,
  onApply,
  onWithdraw,
}: IssueCardProps) {
  const [busy, setBusy]         = useState(false);
  const [expanded, setExpanded] = useState(false);
  const detailsId               = useId();
  const detailsRef              = useRef<HTMLDivElement>(null);
  const toggleRef               = useRef<HTMLButtonElement>(null);

  /** Close on Escape key when the card or its children are focused */
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExpanded(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  async function handle(action: "apply" | "withdraw") {
    setBusy(true);
    try {
      if (action === "apply") await onApply?.(id);
      else await onWithdraw?.(id);
    } finally {
      setBusy(false);
    }
  }

  const atGlobalCap = (details?.globalSlotsRemaining ?? Infinity) === 0;
  const atOrgCap    = (details?.orgSlotsRemaining    ?? Infinity) === 0;

  return (
    <article
      className={`issue-card issue-card--${status}${expanded ? " issue-card--expanded" : ""}`}
      aria-label={`Issue: ${title}`}
    >
      {/* ── Top row: meta + toggle ── */}
      <div className="issue-card__meta">
        <span className="issue-card__org" aria-label={`Organisation: ${org}`}>{org}</span>
        <span
          className={`issue-card__chip issue-card__chip--${status}`}
          aria-label={`Status: ${STATUS_LABEL[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>

        {details && (
          <button
            ref={toggleRef}
            className="issue-card__toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? "Collapse application details" : "Show application details"}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className={`issue-card__toggle-icon${expanded ? " issue-card__toggle-icon--open" : ""}`} aria-hidden="true">
              ▾
            </span>
            <span className="issue-card__toggle-text">Details</span>
          </button>
        )}
      </div>

      {/* ── Title ── */}
      <h3 className="issue-card__title">{title}</h3>

      {/* ── Expandable detail section ── */}
      {details && (
        <div
          id={detailsId}
          ref={detailsRef}
          className={`issue-card__details${expanded ? " issue-card__details--open" : ""}`}
          aria-hidden={!expanded}
          role="region"
          aria-label="Application details"
        >
          <div className="issue-card__details-inner">
            <DetailRow
              label="Applicants"
              value={details.applicantCount != null ? String(details.applicantCount) : "—"}
            />
            <DetailRow
              label="Your global slots left"
              value={details.globalSlotsRemaining != null ? String(details.globalSlotsRemaining) : "—"}
              warn={atGlobalCap}
            />
            <DetailRow
              label="Your org slots left"
              value={details.orgSlotsRemaining != null ? String(details.orgSlotsRemaining) : "—"}
              warn={atOrgCap}
            />
            {status === "applied" && (
              <DetailRow
                label="Application TTL"
                value={formatTtl(details.ttlExpiresAt)}
              />
            )}
            {(atGlobalCap || atOrgCap) && (
              <p className="issue-card__cap-warning" role="alert">
                {atGlobalCap
                  ? "You've reached your global application limit (15)."
                  : "You've reached your org assignment limit (4)."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="issue-card__actions">
        {status === "open" && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handle("apply")}
            disabled={busy || atGlobalCap || atOrgCap}
            aria-busy={busy}
            aria-label={`Apply for issue: ${title}`}
          >
            {busy ? "Applying…" : "Apply"}
          </button>
        )}
        {status === "applied" && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handle("withdraw")}
            disabled={busy}
            aria-busy={busy}
            aria-label={`Withdraw application for: ${title}`}
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        )}
      </div>
    </article>
  );
}

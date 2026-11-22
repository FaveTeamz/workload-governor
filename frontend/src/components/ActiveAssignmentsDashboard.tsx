/**
 * ActiveAssignmentsDashboard — Issue #7
 *
 * Displays all active assignments for the logged-in contributor, grouped by
 * organisation, with per-org capacity progress bars (0–4 max) and an empty
 * state when no assignments exist.
 *
 * Acceptance criteria:
 *  ✓  Assignments load from chain on dashboard mount
 *  ✓  Progress bar correctly reflects 0–4 capacity per org
 *  ✓  Empty state shown when no active assignments exist
 */

import { useActiveAssignments, type OrgGroup } from "../hooks/useActiveAssignments";
import { EmptyState } from "./EmptyState";
import { IssueCardSkeleton } from "./SkeletonScreens";

// ---------------------------------------------------------------------------
// OrgCapacityBar
// ---------------------------------------------------------------------------

interface OrgCapacityBarProps {
  org: string;
  count: number;
  cap: number;
}

function barColor(count: number, cap: number): string {
  const r = count / cap;
  if (r >= 1) return "var(--color-error-500, #ef4444)";
  if (r >= 0.75) return "var(--color-warning-500, #f59e0b)";
  return "var(--color-success-500, #22c55e)";
}

function OrgCapacityBar({ org, count, cap }: OrgCapacityBarProps) {
  const pct = Math.min((count / cap) * 100, 100);
  const color = barColor(count, cap);

  return (
    <div className="aad-capacity-bar">
      <div className="aad-capacity-bar__header">
        <span className="aad-capacity-bar__org">{org}</span>
        <span
          className="aad-capacity-bar__count"
          style={{ color }}
          aria-label={`${count} of ${cap} assignments`}
        >
          {count}/{cap}
        </span>
      </div>
      <div
        className="aad-capacity-bar__track"
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-label={`${org} capacity: ${count} of ${cap}`}
      >
        <div
          className="aad-capacity-bar__fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssignmentRow
// ---------------------------------------------------------------------------

interface AssignmentRowProps {
  issueId: string;
  assignedDate: string;
}

function AssignmentRow({ issueId, assignedDate }: AssignmentRowProps) {
  const formatted = new Date(assignedDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <li className="aad-assignment-row">
      <span className="aad-assignment-row__issue" aria-label={`Issue #${issueId}`}>
        #{issueId}
      </span>
      <time
        className="aad-assignment-row__date"
        dateTime={assignedDate}
        aria-label={`Assigned on ${formatted}`}
      >
        Assigned {formatted}
      </time>
    </li>
  );
}

// ---------------------------------------------------------------------------
// OrgSection
// ---------------------------------------------------------------------------

function OrgSection({ group }: { group: OrgGroup }) {
  return (
    <section
      className="aad-org-section"
      aria-label={`Assignments for ${group.org}`}
    >
      <div className="aad-org-section__header">
        <h3 className="aad-org-section__name">{group.org}</h3>
      </div>

      <OrgCapacityBar org={group.org} count={group.count} cap={group.cap} />

      <ul className="aad-assignment-list" aria-label={`Issue list for ${group.org}`}>
        {group.assignments.map((a) => (
          <AssignmentRow
            key={`${a.org}-${a.issueId}`}
            issueId={a.issueId}
            assignedDate={a.assignedDate}
          />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ActiveAssignmentsDashboard
// ---------------------------------------------------------------------------

export interface ActiveAssignmentsDashboardProps {
  /** Connected contributor's Stellar public key */
  contributor: string | null;
}

export function ActiveAssignmentsDashboard({
  contributor,
}: ActiveAssignmentsDashboardProps) {
  const { groups, loadState, error, reload } = useActiveAssignments(contributor);

  if (!contributor) {
    return (
      <EmptyState
        variant="no-assignments"
        ctaLabel="Connect wallet"
        onCta={() => {}}
      />
    );
  }

  if (loadState === "loading" || loadState === "idle") {
    return (
      <section
        className="aad-root"
        aria-label="Active assignments dashboard"
        aria-busy="true"
      >
        <IssueCardSkeleton />
        <IssueCardSkeleton />
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="aad-root" aria-label="Active assignments dashboard">
        <div className="aad-error" role="alert">
          <p className="aad-error__message">
            {error ?? "Failed to load assignments."}
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={reload}
            aria-label="Retry loading assignments"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (groups.length === 0) {
    return (
      <section className="aad-root" aria-label="Active assignments dashboard">
        <EmptyState
          variant="no-assignments"
          ctaLabel="Browse open issues"
          onCta={() => window.open("https://github.com", "_blank", "noreferrer")}
        />
      </section>
    );
  }

  return (
    <section
      className="aad-root"
      aria-label="Active assignments dashboard"
      data-testid="active-assignments-dashboard"
    >
      <div className="aad-header">
        <h2 className="aad-header__title">Active Assignments</h2>
        <button
          className="btn btn-ghost btn-sm"
          onClick={reload}
          aria-label="Refresh active assignments"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="aad-org-list">
        {groups.map((group) => (
          <OrgSection key={group.org} group={group} />
        ))}
      </div>
    </section>
  );
}

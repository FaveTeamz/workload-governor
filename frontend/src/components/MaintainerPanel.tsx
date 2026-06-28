import { useState, useRef } from "react";
import type { KeyboardEvent } from "react";
import { EmptyState } from "./EmptyState";

export interface Application {
  id: string;
  contributor: string;
  org: string;
  issueTitle: string;
  appliedDate: string;
}

export interface Assignment {
  id: string;
  contributor: string;
  org: string;
  issueTitle: string;
}

interface Props {
  applications: Application[];
  assignments: Assignment[];
  onAssign: (app: Application) => Promise<void>;
  onComplete: (assignment: Assignment) => Promise<void>;
  onRevoke: (assignment: Assignment) => Promise<void>;
}

function truncate(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function AppRow({
  app,
  onAssign,
}: {
  app: Application;
  onAssign: (a: Application) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  function startConfirm() {
    setConfirming(true);
    setTimeout(() => confirmRef.current?.focus(), 50);
  }

  async function confirm() {
    setBusy(true);
    try {
      await onAssign(app);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") setConfirming(false);
  }

  return (
    <li className="panel-row" onKeyDown={handleKeyDown}>
      <div className="row-info">
        <span
          className="contributor"
          title={app.contributor}
          aria-label={`Contributor: ${app.contributor}`}
        >
          {truncate(app.contributor)}
        </span>
        <span className="org" aria-label={`Organisation: ${app.org}`}>
          {app.org}
        </span>
        <span
          className="issue-title"
          aria-label={`Issue: ${app.issueTitle}`}
        >
          {app.issueTitle}
        </span>
        <time
          className="date"
          dateTime={app.appliedDate}
          aria-label={`Applied on ${new Date(app.appliedDate).toLocaleDateString()}`}
        >
          {new Date(app.appliedDate).toLocaleDateString()}
        </time>
      </div>

      <div className="row-actions">
        {!confirming ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={startConfirm}
            aria-label={`Assign ${app.issueTitle} to ${truncate(app.contributor)}`}
          >
            Assign
          </button>
        ) : (
          <>
            <button
              ref={confirmRef}
              className="btn btn-primary btn-sm"
              onClick={confirm}
              disabled={busy}
              aria-label={`Confirm assignment of ${app.issueTitle} to ${truncate(app.contributor)}`}
              aria-busy={busy}
            >
              {busy ? "Assigning…" : "Confirm"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
              aria-label="Cancel assignment"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function AssignRow({
  asgn,
  onComplete,
  onRevoke,
}: {
  asgn: Assignment;
  onComplete: (a: Assignment) => Promise<void>;
  onRevoke: (a: Assignment) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"complete" | "revoke" | null>(null);

  async function handle(action: "complete" | "revoke") {
    setBusy(action);
    try {
      if (action === "complete") await onComplete(asgn);
      else await onRevoke(asgn);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="panel-row">
      <div className="row-info">
        <span
          className="contributor"
          title={asgn.contributor}
          aria-label={`Contributor: ${asgn.contributor}`}
        >
          {truncate(asgn.contributor)}
        </span>
        <span className="org" aria-label={`Organisation: ${asgn.org}`}>
          {asgn.org}
        </span>
        <span className="issue-title" aria-label={`Issue: ${asgn.issueTitle}`}>
          {asgn.issueTitle}
        </span>
      </div>

      <div className="row-actions">
        <button
          className="btn btn-complete btn-sm"
          onClick={() => handle("complete")}
          disabled={busy !== null}
          aria-label={`Mark ${asgn.issueTitle} as complete for ${truncate(asgn.contributor)}`}
          aria-busy={busy === "complete"}
        >
          {busy === "complete" ? "…" : "Complete"}
        </button>
        <button
          className="btn btn-revoke btn-sm"
          onClick={() => handle("revoke")}
          disabled={busy !== null}
          aria-label={`Revoke assignment of ${asgn.issueTitle} from ${truncate(asgn.contributor)}`}
          aria-busy={busy === "revoke"}
        >
          {busy === "revoke" ? "…" : "Revoke"}
        </button>
      </div>
    </li>
  );
}

export function MaintainerPanel({
  applications,
  assignments,
  onAssign,
  onComplete,
  onRevoke,
}: Props) {
  return (
    <section className="maintainer-panel" aria-label="Maintainer Panel">
      <div className="panel-columns">
        {/* Left: pending applications */}
        <div className="panel-column">
          <h2 id="applications-heading">
            Pending Applications
            <span
              className="count-badge"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${applications.length} pending applications`}
            >
              {applications.length}
            </span>
          </h2>
          {applications.length === 0 ? (
            <EmptyState
              variant="no-applications"
              compact
              ctaLabel="Browse issues"
              onCta={() => window.open("https://github.com", "_blank", "noreferrer")}
            />
          ) : (
            <ul
              className="panel-list"
              aria-labelledby="applications-heading"
              aria-label="Pending applications list"
            >
              {applications.map((app) => (
                <AppRow key={app.id} app={app} onAssign={onAssign} />
              ))}
            </ul>
          )}
        </div>

        {/* Right: active assignments */}
        <div className="panel-column">
          <h2 id="assignments-heading">
            Active Assignments
            <span
              className="count-badge"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${assignments.length} active assignments`}
            >
              {assignments.length}
            </span>
          </h2>
          {assignments.length === 0 ? (
            <EmptyState
              variant="no-assignments"
              compact
              ctaLabel="Apply for an issue"
              onCta={() => window.open("https://github.com", "_blank", "noreferrer")}
            />
          ) : (
            <ul
              className="panel-list"
              aria-labelledby="assignments-heading"
              aria-label="Active assignments list"
            >
              {assignments.map((asgn) => (
                <AssignRow
                  key={asgn.id}
                  asgn={asgn}
                  onComplete={onComplete}
                  onRevoke={onRevoke}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

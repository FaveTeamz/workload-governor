/**
 * AssignmentCard — closes #648 (color-blind status indicators)
 *
 * Added `status` prop with icon + label so state is never communicated
 * by color alone.
 */
import { Icon, type IconName } from "./Icon";

export type AssignmentStatus = "assigned" | "completed" | "revoked";

interface StatusMeta {
  icon: IconName;
  label: string;
}

const STATUS_META: Record<AssignmentStatus, StatusMeta> = {
  assigned:  { icon: "assign",       label: "Assigned"  },
  completed: { icon: "check-circle", label: "Completed" },
  revoked:   { icon: "x-circle",     label: "Revoked"   },
};

export interface AssignmentCardProps {
  issueId: string;
  org: string;
  title: string;
  contributor: string;
  /** Defaults to "assigned" */
  status?: AssignmentStatus;
  onComplete?: (issueId: string) => void;
  onRevoke?: (issueId: string) => void;
}

export function AssignmentCard({
  issueId,
  org,
  title,
  contributor,
  status = "assigned",
  onComplete,
  onRevoke,
}: AssignmentCardProps) {
  const { icon, label } = STATUS_META[status];

  return (
    <article
      className={`assignment-card assignment-card--${status}`}
      aria-label={`Assignment: ${title}`}
    >
      <div className="assignment-card__meta">
        <span className="assignment-card__org" aria-label={`Organisation: ${org}`}>{org}</span>
        <span className="assignment-card__contributor" title={contributor}>
          {contributor.length > 12
            ? `${contributor.slice(0, 6)}…${contributor.slice(-4)}`
            : contributor}
        </span>

        {/* Color-blind-friendly status indicator */}
        <span
          className={`assignment-card__status assignment-card__status--${status}`}
          aria-label={`Status: ${label}`}
        >
          <Icon name={icon} size="xs" aria-hidden={true} />
          <span>{label}</span>
        </span>
      </div>

      <h3 className="assignment-card__title">{title}</h3>

      <div className="assignment-card__actions">
        {onComplete && status === "assigned" && (
          <button
            className="btn btn-complete btn-sm"
            onClick={() => onComplete(issueId)}
            aria-label={`Complete: ${title}`}
          >
            Complete
          </button>
        )}
        {onRevoke && status === "assigned" && (
          <button
            className="btn btn-revoke btn-sm"
            onClick={() => onRevoke(issueId)}
            aria-label={`Revoke: ${title}`}
          >
            Revoke
          </button>
        )}
      </div>
    </article>
  );
}

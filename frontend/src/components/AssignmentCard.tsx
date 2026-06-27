export interface AssignmentCardProps {
  issueId: string;
  org: string;
  title: string;
  contributor: string;
  onComplete?: (issueId: string) => void;
  onRevoke?: (issueId: string) => void;
}

export function AssignmentCard({ issueId, org, title, contributor, onComplete, onRevoke }: AssignmentCardProps) {
  return (
    <article className="assignment-card" aria-label={`Assignment: ${title}`}>
      <div className="assignment-card__meta">
        <span className="assignment-card__org" aria-label={`Organisation: ${org}`}>{org}</span>
        <span className="assignment-card__contributor" title={contributor}>
          {contributor.length > 12 ? `${contributor.slice(0, 6)}…${contributor.slice(-4)}` : contributor}
        </span>
      </div>
      <h3 className="assignment-card__title">{title}</h3>
      <div className="assignment-card__actions">
        {onComplete && (
          <button className="btn btn-complete btn-sm" onClick={() => onComplete(issueId)} aria-label={`Complete: ${title}`}>
            Complete
          </button>
        )}
        {onRevoke && (
          <button className="btn btn-revoke btn-sm" onClick={() => onRevoke(issueId)} aria-label={`Revoke: ${title}`}>
            Revoke
          </button>
        )}
      </div>
    </article>
  );
}

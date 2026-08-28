'use client';

type IssueStatus = 'open' | 'assigned' | 'completed';

export type Issue = {
  id: string;
  title: string;
  org: string;
  status: IssueStatus;
  reward?: number;
};

type IssueCardProps = {
  issue: Issue;
  onApply?: (issueId: string) => void;
};

type IssueCardGridProps = {
  issues: Issue[];
  onApply?: (issueId: string) => void;
};

const STATUS_STYLES: Record<IssueStatus, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  assigned: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

/**
 * Individual issue card.
 * The "Apply" button meets WCAG 2.5.5 minimum touch target of 44×44 px.
 */
function IssueCard({ issue, onApply }: IssueCardProps) {
  return (
    <article
      data-testid="issue-card"
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Header: org + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-[var(--color-text-secondary)]">
          {issue.org}
        </span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
            STATUS_STYLES[issue.status]
          }`}
        >
          {issue.status}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold leading-snug text-[var(--color-text-primary)]">
        {issue.title}
      </h3>

      {/* Footer: reward + action */}
      <div className="mt-auto flex items-center justify-between gap-2">
        {issue.reward != null && (
          <span className="text-sm font-medium text-brand-600 dark:text-brand-500">
            {issue.reward} XLM
          </span>
        )}

        {issue.status === 'open' && onApply && (
          <button
            type="button"
            onClick={() => onApply(issue.id)}
            aria-label={`Apply for: ${issue.title}`}
            className="touch-target ml-auto rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            Apply
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Responsive grid of issue cards.
 *
 * Breakpoints (per issue #318):
 *  - Default (< 640px):  1 column
 *  - sm (640px+):        2 columns
 *  - lg (1024px+):       3 columns
 */
export default function IssueCardGrid({ issues, onApply }: IssueCardGridProps) {
  return (
    <div
      data-testid="issue-card-grid"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} onApply={onApply} />
      ))}
    </div>
  );
}

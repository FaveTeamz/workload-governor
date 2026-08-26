export type ApplicationStatus = "pending" | "assigned" | "completed" | "withdrawn";

export interface ApplicationBadgeProps {
  status: ApplicationStatus;
}

const LABEL: Record<ApplicationStatus, string> = {
  pending:   "Pending",
  assigned:  "Assigned",
  completed: "Completed",
  withdrawn: "Withdrawn",
};

export function ApplicationBadge({ status }: ApplicationBadgeProps) {
  return (
    <span
      className={`application-badge application-badge--${status}`}
      aria-label={`Application status: ${LABEL[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}

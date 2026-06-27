import React from "react";

export type EmptyVariant = "no-issues" | "no-applications" | "no-assignments" | "no-events";

interface EmptyStateProps {
  variant: EmptyVariant;
  ctaLabel?: string;
  onCta?: () => void;
}

const CONTENT: Record<EmptyVariant, { title: string; message: string; icon: string }> = {
  "no-issues": {
    title:   "No issues found",
    message: "There are no open issues at the moment. Check back soon or adjust your filters.",
    icon:    "search",
  },
  "no-applications": {
    title:   "No applications yet",
    message: "You haven't applied to any issues. Browse open issues to get started.",
    icon:    "inbox",
  },
  "no-assignments": {
    title:   "No active assignments",
    message: "You have no active assignments. Apply for an issue to get one.",
    icon:    "clipboard",
  },
  "no-events": {
    title:   "No events recorded",
    message: "Contract events will appear here once activity begins.",
    icon:    "history",
  },
};

const ICONS: Record<string, React.ReactElement> = {
  search: (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="empty-state__svg">
      <circle cx="28" cy="28" r="16" stroke="currentColor" strokeWidth="3.5" />
      <line x1="40" y1="40" x2="56" y2="56" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="22" y1="28" x2="34" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="28" y1="22" x2="28" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="empty-state__svg">
      <rect x="8" y="20" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="3.5" />
      <path d="M8 38h14l4 6h12l4-6h14" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      <line x1="32" y1="8" x2="32" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <polyline points="24,14 32,8 40,14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="empty-state__svg">
      <rect x="14" y="12" width="36" height="44" rx="4" stroke="currentColor" strokeWidth="3.5" />
      <rect x="22" y="8" width="20" height="8" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <line x1="22" y1="28" x2="42" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="36" x2="36" y2="36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="empty-state__svg">
      <path d="M10 32a22 22 0 1 1 4 13" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <polyline points="10,18 10,32 24,32" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="32" y1="24" x2="32" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="32" y1="34" x2="38" y2="40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
};

export function EmptyState({ variant, ctaLabel, onCta }: EmptyStateProps) {
  const { title, message, icon } = CONTENT[variant];

  return (
    <div className="empty-state" role="status" aria-label={title}>
      <div className="empty-state__icon">{ICONS[icon]}</div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__message">{message}</p>
      {ctaLabel && onCta && (
        <button className="btn btn-primary btn-sm empty-state__cta" onClick={onCta}>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

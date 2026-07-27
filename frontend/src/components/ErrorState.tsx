import React from "react";

export type ErrorVariant = "not-found" | "forbidden" | "server-error" | "generic";

interface ErrorStateProps {
  variant?: ErrorVariant;
  /** Override the heading (defaults to variant preset) */
  title?: string;
  /** Override the body copy (defaults to variant preset) */
  message?: string;
  /** Primary action — e.g. "Go to dashboard" */
  ctaLabel?: string;
  onCta?: () => void;
  /** Secondary retry action */
  onRetry?: () => void;
}

const PRESETS: Record<ErrorVariant, { title: string; message: string; illustration: string; code: string }> = {
  "not-found": {
    title:        "Page not found",
    message:      "We couldn't find what you were looking for. The link may be broken or the page may have moved.",
    illustration: "/illustrations/error-404.svg",
    code:         "404",
  },
  "forbidden": {
    title:        "Access denied",
    message:      "You don't have permission to view this page. Contact your organisation maintainer if you think this is a mistake.",
    illustration: "/illustrations/error-404.svg",
    code:         "403",
  },
  "server-error": {
    title:        "Something went wrong",
    message:      "Our servers hit an unexpected problem. The team has been notified — please try again in a moment.",
    illustration: "/illustrations/error-server.svg",
    code:         "500",
  },
  "generic": {
    title:        "Something went wrong",
    message:      "An unexpected error occurred. Please try again or return to the dashboard.",
    illustration: "/illustrations/error-server.svg",
    code:         "ERR",
  },
};

const ErrorIcon: React.FC<{ variant: ErrorVariant }> = ({ variant }) => {
  if (variant === "not-found" || variant === "forbidden") {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="error-state__svg">
        <circle cx="28" cy="28" r="16" stroke="currentColor" strokeWidth="3.5" />
        <line x1="40" y1="40" x2="56" y2="56" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="23" y1="23" x2="33" y2="33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="33" y1="23" x2="23" y2="33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="error-state__svg">
      <path d="M32 6 L58 54 H6 Z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      <line x1="32" y1="26" x2="32" y2="40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="47" r="2.5" fill="currentColor" />
    </svg>
  );
};

export function ErrorState({
  variant = "generic",
  title,
  message,
  ctaLabel,
  onCta,
  onRetry,
}: ErrorStateProps) {
  const preset = PRESETS[variant];
  const heading = title ?? preset.title;
  const body = message ?? preset.message;

  return (
    <div className="error-state" role="alert" aria-label={heading}>
      <img
        src={preset.illustration}
        alt=""
        className="error-state__illustration"
        aria-hidden="true"
        width={200}
        height={150}
      />
      <div className="error-state__icon">
        <ErrorIcon variant={variant} />
      </div>
      <p className="error-state__code">{preset.code}</p>
      <h2 className="error-state__title">{heading}</h2>
      <p className="error-state__message">{body}</p>
      <div className="error-state__actions">
        {onRetry && (
          <button className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
        {ctaLabel && onCta && (
          <button className="btn btn-primary" onClick={onCta}>
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}

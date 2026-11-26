import React, { Component, ErrorInfo, ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import "./ErrorBoundary.css";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ErrorPayload {
  message: string;
  stack?: string;
  componentStack?: string;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback element */
  fallback?: ReactNode;
  /**
   * A value whose identity is compared on each render.
   * When it changes the boundary resets automatically —
   * used to reset on navigation (pass the current route / hash).
   */
  resetKey?: string | number;
  /** Called after the boundary resets */
  onReset?: () => void;
  /**
   * Telemetry callback invoked in componentDidCatch with the caught error
   * and its React component stack.  Use this to forward error details to
   * a monitoring service (e.g. Sentry, Datadog).
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Base URL prepended to /api/errors (defaults to '') */
  apiBase?: string;
  /**
   * Optional variant (e.g. 'page' or 'panel'). `"view"` renders the per-view
   * fallback (#1265): illustration, "Something went wrong displaying this
   * view", a "Reload View" button and collapsible technical details.
   */
  variant?: "page" | "panel" | "view" | string;
  /** Optional label for boundary identification */
  label?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// ── ErrorBoundary ─────────────────────────────────────────────────────────────

/**
 * React class-based error boundary.
 *
 * When a descendant throws, renders the user-friendly {@link ErrorState}
 * component with a "Try Again" action button instead of an unstyled string.
 *
 * Telemetry:
 * - Calls the `onError` prop with `(error, errorInfo)` so callers can forward
 *   the full stack trace (including the React component stack) to a monitoring
 *   service.
 * - Posts the error payload to `POST /api/errors` for backend logging.
 *
 * Auto-reset: the boundary resets automatically when `resetKey` changes so
 * navigating away from the broken page clears the error state.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static displayName = "ErrorBoundary";

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Developer-facing log, tagged with the boundary label (#1265).
    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
      error,
      errorInfo.componentStack,
    );

    // ── Telemetry callback ────────────────────────────────────────────────────
    // Forward the full error + React component stack to the caller so they
    // can relay it to their monitoring service (Sentry, Datadog, etc.).
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch {
        // Never allow telemetry errors to crash the error boundary itself
      }
    }

    // ── Backend error logger ──────────────────────────────────────────────────
    // POST the error payload (message, JS stack, React component stack) to the
    // backend telemetry endpoint for server-side aggregation.
    this.logError({
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  /** Auto-reset when navigation key changes (e.g. route change). */
  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.reset();
    }
  }

  private logError(payload: ErrorPayload): void {
    const base = this.props.apiBase ?? "";
    fetch(`${base}/api/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Never throw from an error boundary
    });
  }

  private reset(): void {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    this.props.onReset?.();
  }

  handleRetry(): void {
    this.reset();
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Prefer caller-supplied custom fallback over the built-in ErrorState UI
    if (this.props.fallback) {
      return this.props.fallback;
    }

    if (this.props.variant === "view") {
      return (
        <ViewErrorFallback
          error={this.state.error}
          componentStack={this.state.errorInfo?.componentStack ?? undefined}
          onReload={this.handleRetry}
        />
      );
    }

    // Render the styled ErrorState component with a "Try Again" retry action.
    // The error message is surfaced as a subtitle override so developers can
    // diagnose the failure from the UI in non-production environments.
    return (
      <ErrorState
        variant="server-error"
        message={
          this.state.error?.message ??
          "An unexpected error occurred. Please try again or return to the dashboard."
        }
        onRetry={this.handleRetry}
      />
    );
  }
}


// ── Per-view fallback (#1265) ────────────────────────────────────────────────

interface ViewErrorFallbackProps {
  error?: Error;
  componentStack?: string;
  onReload: () => void;
}

/**
 * Fallback for a single view: the rest of the app (navigation, toasts) keeps
 * working. "Reload View" re-mounts only the failed view. The technical details
 * stay collapsed by default.
 */
export function ViewErrorFallback({ error, componentStack, onReload }: ViewErrorFallbackProps) {
  const details = [error?.name && error?.message ? `${error.name}: ${error.message}` : error?.message, error?.stack, componentStack]
    .filter(Boolean)
    .join("\n\n");

  return (
    <section className="view-error" role="alert" aria-live="assertive">
      <svg className="view-error__icon" viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
        <path
          d="M12 2 1 21h22L12 2Zm0 6 7.5 13h-15L12 8Zm-1 4v4h2v-4h-2Zm0 6v2h2v-2h-2Z"
          fill="currentColor"
        />
      </svg>
      <h2 className="view-error__title">Something went wrong displaying this view</h2>
      <p className="view-error__message">
        The rest of the app is still working. Reload this view to try again.
      </p>
      <button type="button" className="view-error__reload" onClick={onReload}>
        Reload View
      </button>
      {details && (
        <details className="view-error__details">
          <summary>Technical details</summary>
          <pre>{details}</pre>
        </details>
      )}
    </section>
  );
}

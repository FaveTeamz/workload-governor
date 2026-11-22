import React, { Component, ErrorInfo, ReactNode } from "react";
import { ErrorState } from "./ErrorState";

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
  /** Optional variant (e.g. 'page' or 'panel') */
  variant?: "page" | "panel" | string;
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

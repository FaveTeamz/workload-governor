import React, { Component, ErrorInfo, ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ErrorPayload {
  message: string;
  stack?: string;
  componentStack?: string;
}

interface ErrorBoundaryProps {
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
  /** Base URL prepended to /api/errors (defaults to '') */
  apiBase?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// ── ErrorBoundary ─────────────────────────────────────────────────────────────

/**
 * React class-based error boundary.
 *
 * Catches errors thrown in any descendant, renders a fallback UI with a
 * "Retry" button, logs the error to POST /api/errors, and resets automatically
 * when `resetKey` changes (navigation).
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
    this.logError({
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  /** Auto-reset when navigation key changes */
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

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{ padding: "2rem", textAlign: "center" }}
      >
        <h2>Something went wrong</h2>
        <p>{this.state.error?.message}</p>
        <button
          type="button"
          onClick={this.handleRetry}
          aria-label="Retry"
        >
          Retry
        </button>
      </div>
    );
  }
}

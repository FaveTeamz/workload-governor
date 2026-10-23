import React, { Component, ErrorInfo, ReactNode } from "react";
import i18n from "../i18n";

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
  /** Telemetry callback sending error metadata and stack trace */
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
 * Catches errors thrown in any descendant, renders a localized fallback UI with a
 * "Try Again" button, reports errors to the onError telemetry hook and POST /api/errors,
 * and resets automatically when `resetKey` changes.
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

    // Telemetry callback
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch {
        // Never allow telemetry errors to crash the error boundary
      }
    }

    // Backend error logger
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

    const fallbackMessage = i18n.t("error.boundary_fallback", {
      defaultValue: "Something went wrong. Please try again.",
    });

    return (
      <div
        role="alert"
        aria-live="assertive"
        className={`error-boundary error-boundary--${this.props.variant ?? "default"}`}
        style={{ padding: "2rem", textAlign: "center" }}
      >
        <h2>{fallbackMessage}</h2>
        {this.state.error?.message && (
          <p className="error-boundary__message">{this.state.error.message}</p>
        )}
        <button
          type="button"
          onClick={this.handleRetry}
          aria-label="Retry (Try Again)"
          className="btn btn-primary error-boundary__retry-btn"
        >
          Try Again
        </button>
      </div>
    );
  }
}

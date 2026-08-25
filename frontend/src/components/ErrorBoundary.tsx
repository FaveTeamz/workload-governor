/**
 * ErrorBoundary — closes #280
 *
 * Class-based React error boundary that catches unhandled runtime errors in any
 * component subtree, logs them to POST /api/errors, and renders a friendly
 * fallback UI instead of a blank screen.
 *
 * Features:
 *  • Top-level boundary wrapping the entire App
 *  • Retry button that resets the boundary and re-renders the subtree
 *  • Error details posted to POST /api/errors (component stack included)
 *  • resetKey prop — change it externally (e.g. on navigation) to auto-reset
 *  • In development: full component stack trace is visible below the fallback
 *
 * Usage (top-level):
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * Usage (panel-level):
 *   <ErrorBoundary variant="panel" label="Issue list">
 *     <IssueList />
 *   </ErrorBoundary>
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Error reporting
// ---------------------------------------------------------------------------

interface ErrorPayload {
  message: string;
  stack: string | undefined;
  componentStack: string | null | undefined;
  url: string;
  timestamp: string;
}

async function reportError(error: Error, info: ErrorInfo): Promise<void> {
  const payload: ErrorPayload = {
    message:        error.message,
    stack:          error.stack,
    componentStack: info.componentStack,
    url:            window.location.href,
    timestamp:      new Date().toISOString(),
  };

  try {
    await fetch("/api/errors", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch {
    // Reporting must never throw — silently fail so the fallback UI still renders.
    // In development we also log to the console.
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] Failed to report error to /api/errors", payload);
    }
  }
}

// ---------------------------------------------------------------------------
// State & Props
// ---------------------------------------------------------------------------

interface State {
  hasError:       boolean;
  error:          Error | null;
  componentStack: string | null;
}

type BoundaryVariant = "full" | "panel";

interface Props {
  children:   ReactNode;
  /** "full" = page-level overlay; "panel" = inline card (default: "full"). */
  variant?:   BoundaryVariant;
  /** Human-readable name for the panel, shown in the fallback heading. */
  label?:     string;
  /**
   * Changing this key resets the boundary — useful for simulating route-change
   * resets when a router is not available. Pass e.g. a pathname string or a
   * counter that increments on navigation.
   */
  resetKey?:  string | number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<Props, State> {
  static defaultProps: Partial<Props> = {
    variant:  "full",
    resetKey: 0,
  };

  state: State = { hasError: false, error: null, componentStack: null };

  // React calls this when an error is thrown anywhere in the subtree.
  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  // Called after the UI updates to the error state. Report and log here.
  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    reportError(error, info);

    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] Caught error:", error);
      console.error("[ErrorBoundary] Component stack:", info.componentStack);
    }
  }

  // When the resetKey prop changes (e.g. on navigation), automatically reset.
  componentDidUpdate(prevProps: Props): void {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  render(): ReactNode {
    const { hasError, error, componentStack } = this.state;
    const { children, variant = "full", label } = this.props;
    const isDev = import.meta.env.DEV;

    if (!hasError) return children;

    return variant === "full"
      ? (
        <FullPageFallback
          error={error}
          componentStack={componentStack}
          isDev={isDev}
          onRetry={this.reset}
        />
      )
      : (
        <PanelFallback
          label={label}
          error={error}
          componentStack={componentStack}
          isDev={isDev}
          onRetry={this.reset}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Fallback UIs
// ---------------------------------------------------------------------------

interface FallbackProps {
  error:          Error | null;
  componentStack: string | null;
  isDev:          boolean;
  onRetry:        () => void;
}

function FullPageFallback({ error, componentStack, isDev, onRetry }: FallbackProps) {
  return (
    <div className="eb-overlay" role="alert" aria-live="assertive" aria-atomic="true">
      <div className="eb-card">
        {/* Illustration */}
        <div className="eb-illustration" aria-hidden="true">
          <svg viewBox="0 0 96 96" fill="none" className="eb-svg">
            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="3" />
            <line x1="48" y1="28" x2="48" y2="54" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <circle cx="48" cy="66" r="3.5" fill="currentColor" />
          </svg>
        </div>

        <h1 className="eb-title">Something went wrong</h1>
        <p className="eb-message">
          An unexpected error occurred. Your work is safe — click <strong>Retry</strong> to
          reload this section, or refresh the page if the problem persists.
        </p>

        {error && (
          <p className="eb-error-summary" aria-label="Error message">
            {error.message}
          </p>
        )}

        <button
          className="btn btn-primary eb-retry"
          onClick={onRetry}
          aria-label="Retry — reload the application"
        >
          ↺ Retry
        </button>

        {/* Dev-only: full stack trace */}
        {isDev && (error?.stack || componentStack) && (
          <details className="eb-details" open>
            <summary className="eb-details__summary">Stack trace (dev only)</summary>
            <pre className="eb-pre">
              {error?.stack}
              {componentStack && `\n\n— Component stack —\n${componentStack}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

interface PanelFallbackProps extends FallbackProps {
  label?: string;
}

function PanelFallback({ label, error, componentStack, isDev, onRetry }: PanelFallbackProps) {
  return (
    <div className="eb-panel" role="alert" aria-live="assertive" aria-atomic="true">
      <span className="eb-panel__icon" aria-hidden="true">⚠</span>
      <div className="eb-panel__body">
        <strong className="eb-panel__title">
          {label ? `${label} failed to load` : "This section failed to load"}
        </strong>
        {error && (
          <p className="eb-panel__msg">{error.message}</p>
        )}
      </div>
      <button
        className="btn btn-ghost btn-sm eb-panel__retry"
        onClick={onRetry}
        aria-label={`Retry loading ${label ?? "this section"}`}
      >
        Retry
      </button>

      {isDev && (error?.stack || componentStack) && (
        <details className="eb-details eb-details--panel">
          <summary className="eb-details__summary">Dev trace</summary>
          <pre className="eb-pre">
            {error?.stack}
            {componentStack && `\n\n— Component stack —\n${componentStack}`}
          </pre>
        </details>
      )}
    </div>
  );
}

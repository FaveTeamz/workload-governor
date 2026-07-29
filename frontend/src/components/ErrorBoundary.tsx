import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Content to protect */
  children: ReactNode;
  /** Optional display name shown in the fallback UI */
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Increment to force a re-mount of the children subtree */
  retryKey: number;
}

/**
 * Generic error boundary that catches uncaught render errors in the
 * wrapped subtree, logs them to the console (or a future error-tracking
 * service), and renders a fallback UI with a retry button.
 *
 * Usage:
 *   <ErrorBoundary sectionName="Dashboard">
 *     <Dashboard />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console now; swap this call for Sentry / Datadog / etc. later.
    console.error(
      `[ErrorBoundary] Uncaught error in "${this.props.sectionName ?? "section"}"`,
      error,
      info.componentStack,
    );
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    const { hasError, error, retryKey } = this.state;
    const { children, sectionName = "This section" } = this.props;

    if (hasError) {
      return (
        <div className="error-boundary" role="alert" aria-live="assertive">
          <div className="error-boundary__icon" aria-hidden="true">⚠</div>
          <h2 className="error-boundary__title">Something went wrong</h2>
          <p className="error-boundary__desc">
            {sectionName} encountered an unexpected error and could not be
            displayed.
          </p>
          {error && (
            <pre className="error-boundary__detail">
              {error.message}
            </pre>
          )}
          <button
            className="btn btn-primary"
            onClick={this.handleRetry}
            aria-label={`Retry loading ${sectionName}`}
          >
            Retry
          </button>
        </div>
      );
    }

    // key change re-mounts the entire subtree on retry
    return (
      <div key={retryKey} style={{ display: "contents" }}>
        {children}
      </div>
    );
  }
}

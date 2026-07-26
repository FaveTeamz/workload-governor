import React from "react";
import { ErrorState } from "./ErrorState";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional override for the fallback heading */
  title?: string;
  /** Optional override for the fallback body text */
  message?: string;
  /**
   * URL of the backend error-logging endpoint.
   * Defaults to /api/errors. Pass null to disable logging.
   */
  logEndpoint?: string | null;
  /**
   * A value whose identity is compared on each render.
   * When it changes the boundary resets automatically —
   * used to reset on navigation (pass the current route / hash).
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React class-based error boundary.
 *
 * Catches errors thrown in any descendant, renders a fallback UI,
 * logs the error to the backend, and exposes a Retry mechanism.
 *
 * Navigation reset: pass the current route/hash as `resetKey`.
 * When `resetKey` changes the boundary resets automatically.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static defaultProps: Partial<ErrorBoundaryProps> = {
    logEndpoint: "/api/errors",
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const { logEndpoint } = this.props;
    if (logEndpoint == null) return;

    // Fire-and-forget — tests can inspect via mocked fetch
    fetch(logEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      }),
    }).catch(() => {
      // Swallow network errors — logging must never cause secondary crashes
    });
  }

  /** Reset when `resetKey` changes (e.g. on navigation). */
  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry(): void {
    this.setState({ hasError: false, error: null });
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { title, message } = this.props;

    return (
      <ErrorState
        variant="server-error"
        title={title}
        message={message}
        onRetry={this.handleRetry}
      />
    );
  }
}

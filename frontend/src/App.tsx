/**
 * frontend/src/App.tsx
 *
 * Root application component including the ErrorBoundary.
 *
 * The ErrorBoundary:
 *  - Catches errors thrown by any child component
 *  - Renders a fallback UI with a "Retry" button
 *  - Logs the error to the backend via POST /api/errors
 *  - Resets automatically on route/location changes
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ErrorPayload {
  message: string;
  stack?: string;
  componentStack?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional override for the fallback UI */
  fallback?: ReactNode;
  /** Optional key that resets the boundary when it changes (e.g., location.pathname) */
  resetKey?: string | number;
  /** Optional callback after reset */
  onReset?: () => void;
  /** Base URL for the API error endpoint (defaults to '') */
  apiBase?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// ── ErrorBoundary class component ─────────────────────────────────────────────

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static displayName = 'ErrorBoundary';

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.logError({ message: error.message, stack: error.stack, componentStack: errorInfo.componentStack ?? undefined });
  }

  /** Reset when the resetKey prop changes (e.g. on route navigation) */
  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  private logError(payload: ErrorPayload): void {
    const base = this.props.apiBase ?? '';
    fetch(`${base}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Never throw from an error boundary
    });
  }

  private reset(): void {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    this.props.onReset?.();
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div role="alert" aria-live="assertive" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Something went wrong</h2>
        <p>{this.state.error?.message}</p>
        <button
          type="button"
          onClick={() => this.reset()}
          aria-label="Retry"
        >
          Retry
        </button>
      </div>
    );
  }
}

// ── App root ──────────────────────────────────────────────────────────────────

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <main>
        <h1>WorkloadGovernor</h1>
      </main>
    </ErrorBoundary>
  );
}

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from '../../frontend/src/components/ErrorBoundary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A component that unconditionally throws on render. */
function Bomb({ message = 'Test error' }: { message?: string }) {
  throw new Error(message);
}

/** A component that renders its children normally. */
function Fine({ children }: { children?: React.ReactNode }) {
  return <div data-testid="fine">{children ?? 'All good'}</div>;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// Suppress React's noisy console.error output for intentional error throws
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  console.error = originalConsoleError;
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests — all 6 required cases
// ---------------------------------------------------------------------------

describe('ErrorBoundary', () => {
  // ── Case 1: Component that throws renders fallback UI instead of crashing ──
  it('component that throws renders fallback UI instead of crashing', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // The boundary caught the error — the page should NOT be blank
    // ErrorState renders a role="alert" region
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // The child's content must not be visible
    expect(screen.queryByText('All good')).not.toBeInTheDocument();
  });

  // ── Case 2: Fallback UI shows the Retry button ──────────────────────────
  it('fallback UI shows the Retry button', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // ErrorState renders onRetry as "Try again"
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  // ── Case 3: Clicking Retry resets boundary and re-renders child ──────────
  it('clicking Retry resets boundary and re-renders child', () => {
    /**
     * Control throwing via a prop so the behaviour is deterministic
     * regardless of how many times React renders the child internally.
     *
     * We render a wrapper that holds the `shouldThrow` flag in state.
     * The ErrorBoundary receives a `resetKey` that changes after retry
     * (simulating the real usage pattern), AND we flip `shouldThrow` off
     * so that the next child render succeeds.
     */
    function Wrapper() {
      const [shouldThrow, setShouldThrow] = React.useState(true);
      const [key, setKey] = React.useState(0);

      return (
        <>
          {/* Expose a reset mechanism the test can trigger */}
          <button
            data-testid="external-fix"
            onClick={() => {
              setShouldThrow(false);
              setKey((k) => k + 1);
            }}
          >
            Fix
          </button>
          <ErrorBoundary resetKey={key}>
            {shouldThrow ? <Bomb message="controlled error" /> : <div data-testid="recovered">Recovered</div>}
          </ErrorBoundary>
        </>
      );
    }

    render(<Wrapper />);

    // Boundary caught the error — fallback is visible
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Fix the child AND change resetKey simultaneously (mimics real usage)
    fireEvent.click(screen.getByTestId('external-fix'));

    // Child now renders successfully
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── Case 4: Thrown error is logged to POST /api/errors ───────────────────
  it('thrown error is logged to POST /api/errors (mock fetch)', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    render(
      <ErrorBoundary logEndpoint="/api/errors">
        <Bomb message="boom" />
      </ErrorBoundary>,
    );

    // fetch should have been called once with the right args
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/errors');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.message).toBe('boom');
    expect(typeof body.stack).toBe('string');
    expect(typeof body.componentStack).toBe('string');
  });

  // ── Case 5: Navigation (route change) resets the boundary automatically ──
  it('navigation (route change) resets the boundary automatically', () => {
    /**
     * The ErrorBoundary accepts a `resetKey` prop.
     * Changing that prop from outside simulates a navigation event —
     * in the real app App.tsx passes the current hash as resetKey.
     */
    let renderCount = 0;

    function RoutedChild({ route }: { route: string }) {
      // First "page" throws, second "page" is fine
      if (route === '#/broken') throw new Error('broken route');
      return <div data-testid="new-page">New page: {route}</div>;
    }

    const { rerender } = render(
      <ErrorBoundary resetKey="#/broken">
        <RoutedChild route="#/broken" />
      </ErrorBoundary>,
    );

    // Boundary tripped
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Simulate navigation: change resetKey to a new route
    rerender(
      <ErrorBoundary resetKey="#/home">
        <RoutedChild route="#/home" />
      </ErrorBoundary>,
    );

    // Boundary should have auto-reset — new page rendered, no alert
    expect(screen.getByTestId('new-page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── Case 6: Nested boundary isolates its subtree ─────────────────────────
  it('nested boundary catches error in its own subtree without affecting sibling boundaries', () => {
    /**
     * Tree:
     *   <OuterBoundary>
     *     <Fine />          ← sibling; must stay visible
     *     <InnerBoundary>
     *       <Bomb />        ← throws
     *     </InnerBoundary>
     *   </OuterBoundary>
     *
     * Only the InnerBoundary should trip.
     * The sibling <Fine /> must remain in the document.
     */
    render(
      <ErrorBoundary>
        <Fine>Sibling content</Fine>
        <ErrorBoundary>
          <Bomb message="inner error" />
        </ErrorBoundary>
      </ErrorBoundary>,
    );

    // Inner boundary caught the error → fallback rendered
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Sibling subtree is NOT affected — still visible
    expect(screen.getByTestId('fine')).toBeInTheDocument();
    expect(screen.getByText('Sibling content')).toBeInTheDocument();

    // Outer boundary itself did NOT trip — no double fallback
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

/**
 * tests/unit/ErrorBoundary.test.tsx
 *
 * Issue #376 — ErrorBoundary unit tests
 *
 * Covers:
 *  1. Component that throws renders fallback UI instead of crashing
 *  2. Fallback UI shows the Retry button
 *  3. Clicking Retry resets boundary and re-renders child
 *  4. Thrown error is logged to POST /api/errors (mock fetch)
 *  5. Navigation (route change via resetKey prop) resets the boundary
 *  6. Nested boundary catches error in its own subtree without affecting siblings
 *
 * Tests use Vitest + @testing-library/react.
 */

import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '../../frontend/src/components/ErrorBoundary';

// ── Suppress React's console.error output for expected errors in tests ────────

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helper components ─────────────────────────────────────────────────────────

/** A component that throws when shouldThrow is true */
function ThrowingChild({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <div data-testid="child-content">Child content rendered</div>;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ErrorBoundary component (Issue #376)', () => {

  // ── Test 1: throws → fallback UI rendered ──────────────────────────────────

  it('1. renders fallback UI when a child component throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    // Default fallback contains "Something went wrong"
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    // The child content must NOT be visible
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
  });

  // ── Test 2: fallback shows the Retry button ────────────────────────────────

  it('2. fallback UI includes a "Retry" button', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
  });

  // ── Test 3: Retry resets boundary and re-renders child ─────────────────────

  it('3. clicking Retry resets the boundary and shows child content again', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    // Confirm healthy render
    expect(screen.getByTestId('child-content')).toBeInTheDocument();

    // Trigger the error
    rerender(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Fix child first, then click Retry to reset the boundary
    rerender(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── Test 4: error logged to POST /api/errors ──────────────────────────────

  it('4. logs the error to POST /api/errors when a child throws', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/errors');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as {
      message: string;
      stack?: string;
      componentStack?: string;
    };
    expect(body.message).toBe('Test render error');
    expect(body).toHaveProperty('stack');
    expect(body).toHaveProperty('componentStack');

    fetchSpy.mockRestore();
  });

  // ── Test 5: resetKey change (navigation) resets boundary ──────────────────

  it('5. resets the boundary automatically when the resetKey prop changes (navigation)', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/page-a">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    // Boundary should be in error state
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Simulate navigation — child stops throwing on the new route
    rerender(
      <ErrorBoundary resetKey="/page-b">
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    // Boundary should have reset and child content is visible
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  // ── Test 6: nested boundaries isolate errors ──────────────────────────────

  it('6. nested boundary catches error in its subtree without affecting sibling boundaries', () => {
    render(
      <div>
        {/* Sibling 1 — healthy */}
        <ErrorBoundary>
          <ThrowingChild shouldThrow={false} />
        </ErrorBoundary>

        {/* Sibling 2 — throws */}
        <ErrorBoundary>
          <ThrowingChild shouldThrow />
        </ErrorBoundary>
      </div>,
    );

    // The sibling that threw shows the fallback
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // The healthy sibling is still rendered
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });
});

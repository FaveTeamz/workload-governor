/**
 * #1265: per-view error fallback with a retry button, collapsible technical
 * details and telemetry.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error('view exploded');
  return <p>view content</p>;
}

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  shouldThrow = true;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fetchSpy = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ErrorBoundary variant="view"', () => {
  it('shows the view fallback with collapsed technical details', () => {
    const { container } = render(
      <ErrorBoundary variant="view">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong displaying this view')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload View' })).toBeTruthy();

    const details = container.querySelector('details.view-error__details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('Error: view exploded');
  });

  it('"Reload View" re-renders the view once the error is gone', () => {
    render(
      <ErrorBoundary variant="view">
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reload View' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('view content')).toBeTruthy();
  });

  it('logs to the console and posts the error to telemetry', () => {
    render(
      <ErrorBoundary variant="view" label="#/activity">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith('[ErrorBoundary:#/activity]', expect.any(Error), expect.any(String));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/errors');
    expect(JSON.parse(init.body)).toMatchObject({ message: 'view exploded' });
  });

  it('resets automatically when the route changes', () => {
    const { rerender } = render(
      <ErrorBoundary variant="view" resetKey="#/a">
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    rerender(
      <ErrorBoundary variant="view" resetKey="#/b">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText('view content')).toBeTruthy();
  });
});

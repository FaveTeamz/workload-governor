import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NetworkBanner from '../../frontend/components/NetworkBanner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace global fetch with a controllable mock */
function mockFetch(ok: boolean) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
  } as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NetworkBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the network name banner', async () => {
    mockFetch(true);
    await act(async () => {
      render(<NetworkBanner pollIntervalMs={10_000} />);
      await Promise.resolve();
    });
    // The environment banner should always be present
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('shows offline banner when Horizon is unreachable', async () => {
    mockFetch(false);

    render(<NetworkBanner pollIntervalMs={10_000} />);

    // Let the initial health check promise resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not show offline banner when Horizon is reachable', async () => {
    mockFetch(true);

    render(<NetworkBanner pollIntervalMs={10_000} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  // ── #542 core: connect → disconnect → reconnect cycle ────────────────────

  it('banner dismisses after reconnect (fix #542 stale closure)', async () => {
    // Start offline
    const fetchSpy = mockFetch(false);

    render(<NetworkBanner pollIntervalMs={1_000} />);

    // Let initial check run (offline)
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('offline-banner')).toBeTruthy();

    // Now simulate Horizon coming back
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);

    // Advance timer to trigger the next poll
    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve(); // flush microtasks
    });

    // Banner should be gone after reconnect
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('banner re-appears if connection drops again after reconnect', async () => {
    const fetchSpy = mockFetch(true);

    render(<NetworkBanner pollIntervalMs={1_000} />);

    // Initial state — connected
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    // Go offline
    fetchSpy.mockResolvedValue({ ok: false, status: 503 } as Response);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('offline-banner')).toBeTruthy();

    // Come back online
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    // Drop again
    fetchSpy.mockResolvedValue({ ok: false, status: 503 } as Response);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('does not show offline banner on initial render before first check', async () => {
    // fetch never resolves during this test - use a pending promise
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    // Do NOT flush promises — banner should not flash before first check
    await act(async () => {
      render(<NetworkBanner pollIntervalMs={10_000} />);
    });
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('clears polling interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    mockFetch(true);

    const { unmount } = render(<NetworkBanner pollIntervalMs={10_000} />);
    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });
});

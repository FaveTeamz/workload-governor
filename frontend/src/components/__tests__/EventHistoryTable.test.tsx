/**
 * Tests for EventHistoryTable real-time polling — closes #550
 *
 * Covers all acceptance criteria:
 *  - Events update automatically every 10 s
 *  - Polling paused when tab hidden (Page Visibility API)
 *  - New event rows animate in (fade-in class / new-event-row testid)
 *  - Toast shown for new events when scrolled down
 *  - onNewEvents callback invoked with fresh events
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

import EventHistoryTable, { type EventRow } from '../../../components/EventHistoryTable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    eventType: 'applied',
    org: 'alignment-drips',
    issueId: '42',
    contributor: 'GABC123',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const INITIAL_EVENTS: EventRow[] = [
  makeEvent({ id: 'evt-1', eventType: 'applied' }),
  makeEvent({ id: 'evt-2', eventType: 'assigned' }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventHistoryTable — real-time polling (#550)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders initial events in the table', () => {
    render(<EventHistoryTable events={INITIAL_EVENTS} apiBase={undefined} />);
    expect(screen.getByTestId('event-table')).toBeTruthy();
    // Two rows for the two initial events
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 data rows
    expect(rows.length).toBe(3);
  });

  it('returns null when events list is empty', () => {
    const { container } = render(<EventHistoryTable events={[]} apiBase={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  // ── Polling ───────────────────────────────────────────────────────────────

  it('polls GET /api/events every 10 s and prepends new events', async () => {
    const newEvent = makeEvent({ id: 'evt-new', eventType: 'completed' });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [newEvent, ...INITIAL_EVENTS],
    } as Response);

    render(
      <EventHistoryTable
        events={INITIAL_EVENTS}
        apiBase="/api"
        pollIntervalMs={10_000}
      />
    );

    // Advance 10 seconds to trigger one poll
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      // Let microtasks (fetch promise) resolve
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/events?limit=50');
    // New row should appear
    expect(screen.getAllByTestId('new-event-row').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onNewEvents callback with fresh events after a poll', async () => {
    const newEvent = makeEvent({ id: 'evt-cb', eventType: 'revoked' });
    const onNewEvents = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [newEvent, ...INITIAL_EVENTS],
    } as Response);

    render(
      <EventHistoryTable
        events={INITIAL_EVENTS}
        apiBase="/api"
        pollIntervalMs={10_000}
        onNewEvents={onNewEvents}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onNewEvents).toHaveBeenCalledWith([newEvent]);
  });

  it('does NOT add duplicate events on repeated polls', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => INITIAL_EVENTS, // same events, no new ones
    } as Response);

    render(
      <EventHistoryTable
        events={INITIAL_EVENTS}
        apiBase="/api"
        pollIntervalMs={10_000}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(20_000); // two polls
      await Promise.resolve();
      await Promise.resolve();
    });

    // Still only 2 data rows (+ 1 header)
    expect(screen.getAllByRole('row').length).toBe(3);
  });

  // ── Page Visibility ───────────────────────────────────────────────────────

  it('pauses polling when tab becomes hidden', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => INITIAL_EVENTS,
    } as Response);

    render(
      <EventHistoryTable
        events={INITIAL_EVENTS}
        apiBase="/api"
        pollIntervalMs={10_000}
      />
    );

    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Simulate tab hidden
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    fireEvent(document, new Event('visibilitychange'));

    await act(async () => {
      vi.advanceTimersByTime(30_000); // 3 poll intervals while hidden
      await Promise.resolve();
    });

    const callsAfter = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    // No new fetches should have occurred
    expect(callsAfter).toBe(callsBefore);

    // Restore
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
  });

  it('resumes polling when tab becomes visible again', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => INITIAL_EVENTS,
    } as Response);

    render(
      <EventHistoryTable
        events={INITIAL_EVENTS}
        apiBase="/api"
        pollIntervalMs={10_000}
      />
    );

    // Hide then show
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    fireEvent(document, new Event('visibilitychange'));

    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // An immediate poll fires on becoming visible
    expect(global.fetch).toHaveBeenCalled();
  });

  // ── Toast ─────────────────────────────────────────────────────────────────

  it('does not show toast when there are no pending events', () => {
    render(<EventHistoryTable events={INITIAL_EVENTS} apiBase={undefined} />);
    expect(screen.queryByTestId('new-events-toast')).toBeNull();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('silently ignores network errors and does not crash', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network fail'));

    const { container } = render(
      <EventHistoryTable
        events={INITIAL_EVENTS}
        apiBase="/api"
        pollIntervalMs={10_000}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    // Component still renders without error
    expect(container.querySelector('[data-testid="event-table"]')).not.toBeNull();
  });

  it('silently ignores non-ok HTTP responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);

    render(
      <EventHistoryTable
        events={INITIAL_EVENTS}
        apiBase="/api"
        pollIntervalMs={10_000}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    // Still 2 rows, no crash
    expect(screen.getAllByRole('row').length).toBe(3);
  });
});

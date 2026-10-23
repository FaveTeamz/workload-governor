/**
 * Tests for IssueCard TTL countdown — closes #553
 *
 * Covers all TTL threshold states:
 *   - ok      (> 24 h): green, Extend TTL button disabled
 *   - warn    (< 24 h, > 1 h): amber, Extend TTL button enabled
 *   - crit    (< 1 h): red, Extend TTL button enabled
 *   - expired (0 s): countdown shows "Expired", button disabled
 *
 * Also tests that the timer updates every minute and that the Extend TTL
 * callback is invoked correctly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// We import IssueCardGrid (default export) plus the Issue type
import IssueCardGrid, { type Issue } from '../../../components/IssueCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW_SECONDS = Math.floor(Date.now() / 1000);

function makeAppliedIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    title: 'Fix the thing',
    org: 'alignment-drips',
    status: 'applied',
    expiryTimestamp: NOW_SECONDS + 3 * 24 * 60 * 60, // 3 days away (ok state)
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TTL state tests
// ---------------------------------------------------------------------------

describe('IssueCard TTL countdown (#553)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows TTL countdown on an applied card that has an expiryTimestamp', () => {
    const issue = makeAppliedIssue({ expiryTimestamp: NOW_SECONDS + 3 * 24 * 60 * 60 });
    render(<IssueCardGrid issues={[issue]} />);
    expect(screen.getByTestId('ttl-countdown')).toBeTruthy();
  });

  it('does NOT show TTL countdown on an open card', () => {
    render(
      <IssueCardGrid issues={[{
        id: 'i', title: 'Open issue', org: 'org', status: 'open',
      }]} />
    );
    expect(screen.queryByTestId('ttl-countdown')).toBeNull();
  });

  it('does NOT show TTL countdown when expiryTimestamp is absent on an applied card', () => {
    const issue = makeAppliedIssue({ expiryTimestamp: undefined });
    render(<IssueCardGrid issues={[issue]} />);
    expect(screen.queryByTestId('ttl-countdown')).toBeNull();
  });

  // ── State: ok (> 24 h) ──────────────────────────────────────────────────

  it('ok state: countdown shows days/hours and Extend TTL button is disabled', () => {
    const expiry = NOW_SECONDS + 3 * 24 * 60 * 60; // 3 days
    const mockExtend = vi.fn().mockResolvedValue(true);
    const issue = makeAppliedIssue({ expiryTimestamp: expiry, onExtendTTL: mockExtend });
    render(<IssueCardGrid issues={[issue]} />);

    const countdown = screen.getByTestId('ttl-countdown');
    expect(countdown.dataset.ttlState).toBe('ok');
    expect(countdown.textContent).toMatch(/\d+d/); // shows days

    const btn = screen.getByTestId('extend-ttl-btn');
    expect(btn).toBeDisabled();
  });

  // ── State: warn (< 24 h, > 1 h) ────────────────────────────────────────

  it('warn state: countdown is amber and Extend TTL button is enabled', async () => {
    const expiry = NOW_SECONDS + 12 * 60 * 60; // 12 hours
    const mockExtend = vi.fn().mockResolvedValue(true);
    const issue = makeAppliedIssue({ expiryTimestamp: expiry, onExtendTTL: mockExtend });
    render(<IssueCardGrid issues={[issue]} />);

    const countdown = screen.getByTestId('ttl-countdown');
    expect(countdown.dataset.ttlState).toBe('warn');

    const btn = screen.getByTestId('extend-ttl-btn');
    expect(btn).not.toBeDisabled();
  });

  // ── State: crit (< 1 h) ────────────────────────────────────────────────

  it('crit state: countdown is red and Extend TTL button is enabled', () => {
    const expiry = NOW_SECONDS + 30 * 60; // 30 minutes
    const mockExtend = vi.fn().mockResolvedValue(true);
    const issue = makeAppliedIssue({ expiryTimestamp: expiry, onExtendTTL: mockExtend });
    render(<IssueCardGrid issues={[issue]} />);

    const countdown = screen.getByTestId('ttl-countdown');
    expect(countdown.dataset.ttlState).toBe('crit');

    const btn = screen.getByTestId('extend-ttl-btn');
    expect(btn).not.toBeDisabled();
  });

  // ── State: expired ──────────────────────────────────────────────────────

  it('expired state: shows "Expired" text and Extend TTL button is disabled', () => {
    const expiry = NOW_SECONDS - 100; // already expired
    const mockExtend = vi.fn().mockResolvedValue(true);
    const issue = makeAppliedIssue({ expiryTimestamp: expiry, onExtendTTL: mockExtend });
    render(<IssueCardGrid issues={[issue]} />);

    const countdown = screen.getByTestId('ttl-countdown');
    expect(countdown.textContent).toBe('Expired');
    expect(countdown.dataset.ttlState).toBe('expired');

    const btn = screen.getByTestId('extend-ttl-btn');
    expect(btn).toBeDisabled();
  });

  // ── Extend TTL button ───────────────────────────────────────────────────

  it('clicking Extend TTL calls onExtendTTL with the issue id', async () => {
    const expiry = NOW_SECONDS + 30 * 60; // crit state — button enabled
    const mockExtend = vi.fn().mockResolvedValue(true);
    const issue = makeAppliedIssue({ expiryTimestamp: expiry, onExtendTTL: mockExtend });
    vi.useRealTimers(); // don't let fake timers block the promise resolution
    render(<IssueCardGrid issues={[issue]} />);

    const btn = screen.getByTestId('extend-ttl-btn');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockExtend).toHaveBeenCalledWith('issue-1');
  });

  it('shows success message after successful extension', async () => {
    const expiry = NOW_SECONDS + 30 * 60;
    const mockExtend = vi.fn().mockResolvedValue(true);
    const issue = makeAppliedIssue({ expiryTimestamp: expiry, onExtendTTL: mockExtend });
    vi.useRealTimers();
    render(<IssueCardGrid issues={[issue]} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('extend-ttl-btn'));
    });

    expect(screen.getByRole('status').textContent).toContain('TTL extended');
  });

  it('shows failure message when extension returns false', async () => {
    const expiry = NOW_SECONDS + 30 * 60;
    const mockExtend = vi.fn().mockResolvedValue(false);
    const issue = makeAppliedIssue({ expiryTimestamp: expiry, onExtendTTL: mockExtend });
    vi.useRealTimers();
    render(<IssueCardGrid issues={[issue]} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('extend-ttl-btn'));
    });

    expect(screen.getByRole('status').textContent).toContain('failed');
  });

  // ── Timer updates every minute ──────────────────────────────────────────

  it('timer updates the displayed countdown every 60 seconds', () => {
    // Start with 2h 2m (warn state)
    const expiry = NOW_SECONDS + 2 * 60 * 60 + 2 * 60; // 2h 2m
    const issue = makeAppliedIssue({ expiryTimestamp: expiry });
    render(<IssueCardGrid issues={[issue]} />);

    const before = screen.getByTestId('ttl-countdown').textContent;

    // Advance 60 seconds
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const after = screen.getByTestId('ttl-countdown').textContent;
    // Text should have changed (minutes decremented)
    expect(after).not.toBe(before);
  });
});

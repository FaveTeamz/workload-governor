/**
 * IssueCard.test.tsx — tests for Issue #272
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueCard, formatRelativeTime } from './IssueCard';
import type { IssueCardProps } from './IssueCard';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEFAULT_PROPS: IssueCardProps = {
  id: 'issue-42',
  org: 'stellar-org',
  title: 'Fix memory leak in contract executor',
  issueNumber: 42,
  status: 'open',
};

function renderCard(props: Partial<IssueCardProps> = {}) {
  return render(<IssueCard {...DEFAULT_PROPS} {...props} />);
}

// ── formatRelativeTime ────────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns "just now" for dates within the last minute', () => {
    const now = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('returns "X minutes ago" for dates within the last hour', () => {
    const now = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(now)).toBe('5 minutes ago');
  });

  it('returns "1 minute ago" (singular) for exactly 1 minute', () => {
    const now = new Date(Date.now() - 60_000).toISOString();
    expect(formatRelativeTime(now)).toBe('1 minute ago');
  });

  it('returns "X hours ago" for dates within the last day', () => {
    const now = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatRelativeTime(now)).toBe('3 hours ago');
  });

  it('returns "1 hour ago" (singular)', () => {
    const now = new Date(Date.now() - 3600_000).toISOString();
    expect(formatRelativeTime(now)).toBe('1 hour ago');
  });

  it('returns "X days ago" for dates within the last month', () => {
    const now = new Date(Date.now() - 2 * 86400_000).toISOString();
    expect(formatRelativeTime(now)).toBe('2 days ago');
  });

  it('returns "1 day ago" (singular)', () => {
    const now = new Date(Date.now() - 86400_000).toISOString();
    expect(formatRelativeTime(now)).toBe('1 day ago');
  });

  it('returns "X months ago" for older dates', () => {
    const now = new Date(Date.now() - 60 * 86400_000).toISOString();
    expect(formatRelativeTime(now)).toBe('2 months ago');
  });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('IssueCard rendering', () => {
  it('renders the org name', () => {
    renderCard();
    expect(screen.getByText('stellar-org')).toBeTruthy();
  });

  it('renders the issue title', () => {
    renderCard();
    expect(screen.getByText('Fix memory leak in contract executor')).toBeTruthy();
  });

  it('renders the issue number', () => {
    renderCard();
    expect(screen.getByText('#42')).toBeTruthy();
  });

  it('renders labels as Badge components', () => {
    renderCard({
      labels: [
        { name: 'bug', color: '#d73a4a' },
        { name: 'good first issue' },
      ],
    });
    expect(screen.getByText('bug')).toBeTruthy();
    expect(screen.getByText('good first issue')).toBeTruthy();
  });

  it('renders timePosted as relative time', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    renderCard({ timePosted: twoHoursAgo });
    expect(screen.getByText('2 hours ago')).toBeTruthy();
  });

  it('renders slot counts', () => {
    renderCard({ globalAppCount: 12, globalAppMax: 15, orgAppCount: 2, orgAppMax: 4 });
    expect(screen.getByText('12/15 global slots')).toBeTruthy();
    expect(screen.getByText('2/4 org slots')).toBeTruthy();
  });

  it('uses article element with correct class and aria-label', () => {
    renderCard({ status: 'open' });
    const article = screen.getByRole('article');
    expect(article.className).toContain('issue-card--open');
    expect(article.getAttribute('aria-label')).toBe('Issue: Fix memory leak in contract executor');
  });

  it('renders h3 title with correct class', () => {
    renderCard();
    const h3 = screen.getByRole('heading', { level: 3 });
    expect(h3.className).toContain('issue-card__title');
    expect(h3.textContent).toBe('Fix memory leak in contract executor');
  });
});

// ── Apply button state ─────────────────────────────────────────────────────────

describe('Apply button — cap enforcement', () => {
  it('Apply button is enabled when under both caps', () => {
    renderCard({ globalAppCount: 5, globalAppMax: 15, orgAppCount: 1, orgAppMax: 4 });
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('Apply button is disabled when globalAppCount >= globalAppMax', () => {
    renderCard({ globalAppCount: 15, globalAppMax: 15 });
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('shows global cap tooltip when globalAppCount >= globalAppMax', () => {
    renderCard({ globalAppCount: 15, globalAppMax: 15 });
    // Tooltip text is rendered in the DOM (aria-hidden but present)
    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip).toBeTruthy();
    expect(tooltip!.textContent).toContain('Global application limit reached');
    expect(tooltip!.textContent).toContain('15/15');
  });

  it('Apply button is disabled when orgAppCount >= orgAppMax', () => {
    renderCard({ orgAppCount: 4, orgAppMax: 4 });
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('shows org cap tooltip when orgAppCount >= orgAppMax', () => {
    renderCard({ orgAppCount: 4, orgAppMax: 4 });
    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip).toBeTruthy();
    expect(tooltip!.textContent).toContain('Org assignment limit reached');
    expect(tooltip!.textContent).toContain('4/4');
  });

  it('global cap takes priority over org cap in tooltip message', () => {
    renderCard({ globalAppCount: 15, globalAppMax: 15, orgAppCount: 4, orgAppMax: 4 });
    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip!.textContent).toContain('Global application limit reached');
  });
});

// ── Apply flow ─────────────────────────────────────────────────────────────────

describe('Apply flow', () => {
  it('clicking Apply calls onApply with the issue id', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderCard({ onApply });
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    await act(async () => { fireEvent.click(btn); });
    expect(onApply).toHaveBeenCalledWith('issue-42');
  });

  it('shows "Applying…" while busy', async () => {
    let resolve!: () => void;
    const onApply = vi.fn().mockImplementation(
      () => new Promise<void>((res) => { resolve = res; }),
    );
    renderCard({ onApply });
    const btn = screen.getByRole('button', { name: /apply for issue/i });

    act(() => { fireEvent.click(btn); });
    expect(screen.getByText('Applying…')).toBeTruthy();

    await act(async () => { resolve(); });
  });

  it('shows "Applied ✓" on success', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderCard({ onApply });
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    await act(async () => { fireEvent.click(btn); });
    expect(screen.getByText('Applied ✓')).toBeTruthy();
  });

  it('shows error message when onApply throws', async () => {
    const onApply = vi.fn().mockRejectedValue(new Error('Contract rejected'));
    renderCard({ onApply });
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    await act(async () => { fireEvent.click(btn); });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Contract rejected');
  });

  it('renders error using role="alert"', async () => {
    const onApply = vi.fn().mockRejectedValue(new Error('Nope'));
    renderCard({ onApply });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /apply for issue/i })); });
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

// ── openTxModal ───────────────────────────────────────────────────────────────

describe('Apply flow — openTxModal', () => {
  it('awaits openTxModal before calling onApply', async () => {
    const order: string[] = [];
    const openTxModal = vi.fn().mockImplementation(async () => {
      order.push('modal');
    });
    const onApply = vi.fn().mockImplementation(async () => {
      order.push('apply');
    });
    renderCard({ openTxModal, onApply });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply for issue/i }));
    });
    expect(order).toEqual(['modal', 'apply']);
  });

  it('does NOT call onApply when openTxModal throws AbortError', async () => {
    const abortError = new DOMException('User cancelled', 'AbortError');
    const openTxModal = vi.fn().mockRejectedValue(abortError);
    const onApply = vi.fn();
    renderCard({ openTxModal, onApply });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply for issue/i }));
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('does NOT call onApply when openTxModal rejects with a generic error', async () => {
    const openTxModal = vi.fn().mockRejectedValue(new Error('Network error'));
    const onApply = vi.fn();
    renderCard({ openTxModal, onApply });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply for issue/i }));
    });
    expect(onApply).not.toHaveBeenCalled();
  });
});

// ── Status variants ───────────────────────────────────────────────────────────

describe('Status variants', () => {
  it('status="applied" shows Withdraw button', () => {
    renderCard({ status: 'applied' });
    expect(screen.getByRole('button', { name: /withdraw application/i })).toBeTruthy();
  });

  it('status="applied" shows Applied badge', () => {
    renderCard({ status: 'applied' });
    expect(screen.getByText('Applied')).toBeTruthy();
  });

  it('clicking Withdraw calls onWithdraw with the issue id', async () => {
    const onWithdraw = vi.fn().mockResolvedValue(undefined);
    renderCard({ status: 'applied', onWithdraw });
    const btn = screen.getByRole('button', { name: /withdraw application/i });
    await act(async () => { fireEvent.click(btn); });
    expect(onWithdraw).toHaveBeenCalledWith('issue-42');
  });

  it('status="assigned" shows Assigned badge', () => {
    renderCard({ status: 'assigned' });
    expect(screen.getByText('Assigned')).toBeTruthy();
  });

  it('status="completed" shows Completed badge', () => {
    renderCard({ status: 'completed' });
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it('does not render Apply button for status="applied"', () => {
    renderCard({ status: 'applied' });
    expect(screen.queryByRole('button', { name: /apply for issue/i })).toBeNull();
  });
});

// ── Keyboard navigation ───────────────────────────────────────────────────────

describe('Keyboard navigation', () => {
  it('Apply button is reachable via tabIndex (not negative)', () => {
    renderCard();
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    const tabIndex = btn.getAttribute('tabindex');
    // No explicit tabIndex set means it's naturally focusable
    expect(tabIndex === null || Number(tabIndex) >= 0).toBe(true);
  });

  it('disabled Apply button has aria-disabled="true"', () => {
    renderCard({ globalAppCount: 15, globalAppMax: 15 });
    const btn = screen.getByRole('button', { name: /apply for issue/i });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });
});

// ── Snapshot ──────────────────────────────────────────────────────────────────

describe('IssueCard snapshot', () => {
  it('matches snapshot for open status with labels and slots', () => {
    const { container } = renderCard({
      labels: [{ name: 'bug', color: '#d73a4a' }, { name: 'enhancement' }],
      globalAppCount: 3,
      orgAppCount: 1,
      timePosted: '2026-08-22T10:00:00.000Z',
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});

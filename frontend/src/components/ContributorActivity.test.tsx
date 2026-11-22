import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { calculateStreak, streakTier, StreakBadge } from './StreakBadge';
import { ActivityChart } from './ActivityChart';
import { ContributorActivity } from './ContributorActivity';
import type { MonthlyActivity } from '../hooks/useActivityStats';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMonths(completedValues: number[]): MonthlyActivity[] {
  return completedValues.map((completed, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    applied: 1,
    assigned: 1,
    completed,
  }));
}

const TWELVE_MONTHS: MonthlyActivity[] = Array.from({ length: 12 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, '0')}`,
  applied: i + 1,
  assigned: Math.floor((i + 1) / 2),
  completed: i % 3 === 0 ? 1 : 0,
}));

// ---------------------------------------------------------------------------
// calculateStreak
// ---------------------------------------------------------------------------

describe('calculateStreak', () => {
  it('returns 0 for empty array', () => {
    expect(calculateStreak([])).toBe(0);
  });

  it('returns 0 when all months have 0 completions', () => {
    expect(calculateStreak(makeMonths([0, 0, 0]))).toBe(0);
  });

  it('counts consecutive completed months from the end', () => {
    // last 3 months completed
    expect(calculateStreak(makeMonths([0, 1, 1, 1]))).toBe(3);
  });

  it('ignores trailing zero months (current month may be in progress)', () => {
    // months: 1,1,1, then 0 trailing — streak is still 3
    expect(calculateStreak(makeMonths([1, 1, 1, 0]))).toBe(3);
  });

  it('stops at an interior zero', () => {
    // 1,1,0,1,1 → streak is 2 (last two non-zero before the trailing gap)
    expect(calculateStreak(makeMonths([1, 1, 0, 1, 1]))).toBe(2);
  });

  it('returns 1 for exactly one completed month at the end', () => {
    expect(calculateStreak(makeMonths([0, 0, 1]))).toBe(1);
  });

  it('returns full length when all months are completed', () => {
    expect(calculateStreak(makeMonths([1, 1, 1, 1, 1, 1]))).toBe(6);
  });

  it('counts completions > 1 as contributing to streak', () => {
    expect(calculateStreak(makeMonths([2, 3, 5]))).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// streakTier
// ---------------------------------------------------------------------------

describe('streakTier', () => {
  it('none for 0', () => expect(streakTier(0)).toBe('none'));
  it('none for 1', () => expect(streakTier(1)).toBe('none'));
  it('none for 2', () => expect(streakTier(2)).toBe('none'));
  it('bronze for 3', () => expect(streakTier(3)).toBe('bronze'));
  it('bronze for 5', () => expect(streakTier(5)).toBe('bronze'));
  it('silver for 6', () => expect(streakTier(6)).toBe('silver'));
  it('silver for 11', () => expect(streakTier(11)).toBe('silver'));
  it('gold for 12', () => expect(streakTier(12)).toBe('gold'));
  it('gold for 20', () => expect(streakTier(20)).toBe('gold'));
});

// ---------------------------------------------------------------------------
// StreakBadge
// ---------------------------------------------------------------------------

describe('StreakBadge', () => {
  it('renders nothing when streak is 0', () => {
    const { container } = render(<StreakBadge activity={makeMonths([0, 0])} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when streak is below bronze (< 3)', () => {
    const { container } = render(<StreakBadge activity={makeMonths([0, 0, 0, 0, 1, 1])} />);
    // streak = 2 → none
    expect(container.firstChild).toBeNull();
  });

  it('renders bronze badge for streak of 3', () => {
    const { container } = render(<StreakBadge activity={makeMonths([0, 0, 0, 1, 1, 1])} />);
    expect(container.querySelector('.streak-badge--bronze')).toBeTruthy();
  });

  it('renders silver badge for streak of 6', () => {
    const activity = makeMonths([1, 1, 1, 1, 1, 1]);
    const { container } = render(<StreakBadge activity={activity} />);
    expect(container.querySelector('.streak-badge--silver')).toBeTruthy();
  });

  it('renders gold badge for streak of 12', () => {
    const activity = makeMonths(Array(12).fill(1));
    const { container } = render(<StreakBadge activity={activity} />);
    expect(container.querySelector('.streak-badge--gold')).toBeTruthy();
  });

  it('has an aria-label describing the streak', () => {
    const activity = makeMonths([0, 0, 0, 1, 1, 1]);
    const { container } = render(<StreakBadge activity={activity} />);
    const badge = container.querySelector('[role="img"]');
    expect(badge?.getAttribute('aria-label')).toMatch(/3.*month/i);
  });

  it('displays the numeric streak count', () => {
    render(<StreakBadge activity={makeMonths([0, 0, 0, 1, 1, 1])} />);
    expect(screen.getByText('3')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ActivityChart
// ---------------------------------------------------------------------------

describe('ActivityChart', () => {
  it('renders empty state when activity is empty', () => {
    render(<ActivityChart activity={[]} />);
    expect(screen.getByText(/no activity data/i)).toBeTruthy();
  });

  it('renders an SVG when data is present', () => {
    const { container } = render(<ActivityChart activity={TWELVE_MONTHS} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders the sr-only accessible data table', () => {
    render(<ActivityChart activity={TWELVE_MONTHS} />);
    const table = screen.getByRole('table', { name: /monthly activity data/i });
    expect(table).toBeTruthy();
    expect(table.classList.contains('sr-only')).toBe(true);
  });

  it('data table has a row for each month', () => {
    render(<ActivityChart activity={TWELVE_MONTHS} />);
    const rows = screen.getAllByRole('row');
    // 1 header + 12 data rows
    expect(rows.length).toBe(13);
  });

  it('data table column headers are Applied, Assigned, Completed', () => {
    render(<ActivityChart activity={TWELVE_MONTHS} />);
    expect(screen.getByRole('columnheader', { name: 'Applied' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Assigned' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Completed' })).toBeTruthy();
  });

  it('data table rows contain the correct applied value', () => {
    const single: MonthlyActivity[] = [
      { month: '2026-01', applied: 7, assigned: 3, completed: 2 },
    ];
    render(<ActivityChart activity={single} />);
    // Row header is the month; cells contain the values
    expect(screen.getByRole('cell', { name: '7' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '3' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '2' })).toBeTruthy();
  });

  it('renders legend items for applied, assigned, completed', () => {
    const { container } = render(<ActivityChart activity={TWELVE_MONTHS} />);
    const legend = container.querySelector('.activity-chart__legend');
    expect(legend?.textContent).toMatch(/applied/i);
    expect(legend?.textContent).toMatch(/assigned/i);
    expect(legend?.textContent).toMatch(/completed/i);
  });

  it('section has accessible label', () => {
    render(<ActivityChart activity={TWELVE_MONTHS} />);
    expect(screen.getByRole('region', { name: /monthly activity bar chart/i })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ContributorActivity (integration)
// ---------------------------------------------------------------------------

const MOCK_RESPONSE = { activity: TWELVE_MONTHS };

describe('ContributorActivity', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESPONSE),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<ContributorActivity address="GABC123" />);
    expect(screen.getByText(/loading activity/i)).toBeTruthy();
  });

  it('renders the chart after data loads', async () => {
    render(<ContributorActivity address="GABC123" />);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /monthly activity bar chart/i })).toBeTruthy(),
    );
  });

  it('renders the Activity heading', async () => {
    render(<ContributorActivity address="GABC123" />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /activity/i })).toBeTruthy(),
    );
  });

  it('fetches the correct URL', async () => {
    render(<ContributorActivity address="GABC123" apiBase="/api" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/contributors/GABC123/activity',
      expect.anything(),
    );
  });

  it('shows error state when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'internal server error' }),
    } as Response);
    render(<ContributorActivity address="GABC123" />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeTruthy(),
    );
    expect(screen.getByText(/internal server error/i)).toBeTruthy();
  });

  it('shows Retry button on error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'oops' }),
    } as Response);
    render(<ContributorActivity address="GABC123" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy(),
    );
  });
});

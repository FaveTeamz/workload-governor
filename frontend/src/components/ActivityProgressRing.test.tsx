import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityProgressRing } from './ActivityProgressRing';

describe('ActivityProgressRing', () => {
  it.each([
    [0, 4, 100], [1, 4, 75], [2, 4, 50], [3, 4, 25], [4, 4, 0],
    [-1, 4, 100], [5, 4, 0], [5, 0, 100], [NaN, 4, 100], [5, Infinity, 100],
  ])('renders the correct offset for %s out of %s', (value, max, offset) => {
    const { container } = render(<ActivityProgressRing value={value} max={max} streakDays={0} badgeLevel="bronze" />);
    const arc = container.querySelector<SVGCircleElement>('.activity-ring__progress');
    expect(arc?.style.getPropertyValue('--activity-ring-offset')).toBe(String(offset));
  });

  it.each([
    ['bronze', 'Bronze', '🥉'], ['silver', 'Silver', '🥈'],
    ['gold', 'Gold', '🥇'], ['platinum', 'Platinum', '💎'],
  ] as const)('renders the %s milestone', (badgeLevel, label, icon) => {
    const { container } = render(<ActivityProgressRing value={2} max={4} streakDays={1} badgeLevel={badgeLevel} />);
    expect(container.firstElementChild?.classList.contains(`activity-ring--${badgeLevel}`)).toBe(true);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(icon)).toBeTruthy();
    expect(screen.getByText('day')).toBeTruthy();
    expect(screen.getByRole('img', { name: '2 of 4 weekly tasks completed, 50%. 1 day streak.' })).toBeTruthy();
  });

  it('updates progress when the value changes', () => {
    const { rerender } = render(<ActivityProgressRing value={1} max={4} streakDays={2} badgeLevel="bronze" />);
    rerender(<ActivityProgressRing value={3} max={4} streakDays={2} badgeLevel="bronze" />);
    expect(screen.getByRole('img', { name: /75%/ })).toBeTruthy();
    expect(screen.getByText('days')).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ContributorProfile, getWorkloadAnnouncement } from '../ContributorProfile';

describe('ContributorProfile ARIA live region (#851)', () => {
  const defaultProps = {
    walletAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTG坡6P4L3KFXO5QLP3X4',
    completions: 8,
    fairnessScore: 0.95,
  };

  it('renders an element with aria-live="polite" and aria-atomic="true"', () => {
    render(<ContributorProfile {...defaultProps} pendingApplications={3} />);

    const liveRegion = screen.getByTestId('workload-live-region');
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion.getAttribute('aria-atomic')).toBe('true');
    expect(liveRegion.getAttribute('role')).toBe('status');
  });

  it('announces workload update text when pendingApplications is provided', () => {
    render(<ContributorProfile {...defaultProps} pendingApplications={3} maxApplications={15} />);

    const liveRegion = screen.getByTestId('workload-live-region');
    expect(liveRegion.textContent).toBe('Workload updated: 3 of 15 applications used');
  });

  it('updates live region content when pending applications prop changes', () => {
    const { rerender } = render(
      <ContributorProfile {...defaultProps} pendingApplications={3} maxApplications={15} />,
    );

    const liveRegion = screen.getByTestId('workload-live-region');
    expect(liveRegion.textContent).toBe('Workload updated: 3 of 15 applications used');

    // Simulate contributor applying for a new issue
    rerender(
      <ContributorProfile {...defaultProps} pendingApplications={4} maxApplications={15} />,
    );

    expect(liveRegion.textContent).toBe('Workload updated: 4 of 15 applications used');

    // Simulate contributor withdrawing an application
    rerender(
      <ContributorProfile {...defaultProps} pendingApplications={2} maxApplications={15} />,
    );

    expect(liveRegion.textContent).toBe('Workload updated: 2 of 15 applications used');
  });

  it('announces workload update when both applications and assignments are provided', () => {
    render(
      <ContributorProfile
        {...defaultProps}
        pendingApplications={3}
        maxApplications={15}
        assignments={2}
        maxAssignments={4}
      />,
    );

    const liveRegion = screen.getByTestId('workload-live-region');
    expect(liveRegion.textContent).toBe(
      'Workload updated: 3 of 15 applications used, 2 of 4 assignments active',
    );
  });

  it('live region is visually hidden (sr-only) to prevent visual regression in styling', () => {
    render(<ContributorProfile {...defaultProps} pendingApplications={5} />);

    const liveRegion = screen.getByTestId('workload-live-region');
    expect(liveRegion.className).toContain('sr-only');
    expect(liveRegion.style.position).toBe('absolute');
    expect(liveRegion.style.width).toBe('1px');
    expect(liveRegion.style.height).toBe('1px');
    expect(liveRegion.style.overflow).toBe('hidden');
  });

  it('helper getWorkloadAnnouncement formats announcements accurately', () => {
    expect(getWorkloadAnnouncement(3, 15)).toBe('Workload updated: 3 of 15 applications used');
    expect(getWorkloadAnnouncement(undefined, 15, 2, 4)).toBe('Workload updated: 2 of 4 assignments active');
    expect(getWorkloadAnnouncement(1, 15, 2, 4)).toBe(
      'Workload updated: 1 of 15 applications used, 2 of 4 assignments active',
    );
    expect(getWorkloadAnnouncement()).toBe('');
  });
});

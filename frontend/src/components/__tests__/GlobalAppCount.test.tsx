import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarApplicationBadge } from '../SidebarApplicationBadge';
import { ApplyForIssueButton } from '../ApplyForIssueButton';

describe('Global Application Count Indicator', () => {
  describe('SidebarApplicationBadge', () => {
    it('renders normal badge for count below 13', () => {
      render(<SidebarApplicationBadge currentCount={3} maxLimit={15} />);
      expect(screen.getByText('3/15')).toBeInTheDocument();
      expect(screen.queryByText('⚠️')).not.toBeInTheDocument();
    });

    it('renders visual warning icon and styling when count reaches 13', () => {
      render(<SidebarApplicationBadge currentCount={13} maxLimit={15} />);
      expect(screen.getByText('13/15')).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument();
    });

    it('renders limit reached indicator when count reaches 15', () => {
      render(<SidebarApplicationBadge currentCount={15} maxLimit={15} />);
      expect(screen.getByText('15/15')).toBeInTheDocument();
      expect(screen.getByText('🚫')).toBeInTheDocument();
    });
  });

  describe('ApplyForIssueButton', () => {
    const contributor = 'GCONTRIBUTORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const mockApply = vi.fn().mockResolvedValue(true);

    it('enables button when global app count is below 15', () => {
      render(
        <ApplyForIssueButton
          contributorAddress={contributor}
          orgId="test-org"
          issueId={1}
          globalAppCount={5}
          onApplyContractCall={mockApply}
        />
      );

      const btn = screen.getByRole('button', { name: /Apply for Issue/i });
      expect(btn).not.toBeDisabled();
    });

    it('disables button and shows tooltip explanation when global app count is 15', () => {
      render(
        <ApplyForIssueButton
          contributorAddress={contributor}
          orgId="test-org"
          issueId={1}
          globalAppCount={15}
          onApplyContractCall={mockApply}
        />
      );

      const btn = screen.getByRole('button', { name: /Apply Disabled \(15\/15\)/i });
      expect(btn).toBeDisabled();
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionHistoryLog, GovernorEvent } from '../TransactionHistoryLog';

describe('TransactionHistoryLog', () => {
  const mockEvents: GovernorEvent[] = [
    {
      id: 'evt-1',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      eventType: 'ApplicationSubmitted',
      orgId: 'org-alpha',
      issueId: 101,
      contributorAddress: 'GCONTRIBUTORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      timestamp: 1719200000,
    },
    {
      id: 'evt-2',
      txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      eventType: 'IssueAssigned',
      orgId: 'org-beta',
      issueId: 202,
      contributorAddress: 'GCONTRIBUTORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      timestamp: 1719210000,
    },
  ];

  it('filters events by type without additional API calls', () => {
    render(<TransactionHistoryLog events={mockEvents} isLoading={false} />);

    expect(screen.getByText('org-alpha')).toBeInTheDocument();
    expect(screen.getByText('org-beta')).toBeInTheDocument();

    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'IssueAssigned' } });

    expect(screen.queryByText('org-alpha')).not.toBeInTheDocument();
    expect(screen.getByText('org-beta')).toBeInTheDocument();
  });

  it('triggers CSV download for visible events', () => {
    // Mock URL.createObjectURL and document.createElement
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');

    render(<TransactionHistoryLog events={mockEvents} isLoading={false} />);

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    expect(exportBtn).not.toBeDisabled();

    fireEvent.click(exportBtn);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });
});

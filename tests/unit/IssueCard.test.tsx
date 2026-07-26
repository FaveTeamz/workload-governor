import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

interface IssueCardProps {
  id: string;
  title: string;
  status: 'open' | 'applied' | 'assigned';
  onApply: (id: string) => void;
  onWithdraw: (id: string) => void;
}

function IssueCard({ id, title, status, onApply, onWithdraw }: IssueCardProps) {
  return (
    <div>
      <span>{title}</span>
      {status === 'assigned' && <span>assigned</span>}
      {status === 'open' && <button onClick={() => onApply(id)}>Apply</button>}
      {status === 'applied' && <button onClick={() => onWithdraw(id)}>Withdraw</button>}
    </div>
  );
}

describe('IssueCard', () => {
  const baseProps = {
    id: 'issue-1',
    title: 'Fix bug',
    onApply: vi.fn(),
    onWithdraw: vi.fn(),
  };

  it('status=open: shows Apply, no Withdraw, no assigned badge', () => {
    const { getByRole, queryByRole, queryByText } = render(
      <IssueCard {...baseProps} status="open" />
    );
    expect(getByRole('button', { name: 'Apply' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Withdraw' })).toBeNull();
    expect(queryByText('assigned')).toBeNull();
  });

  it('status=applied: shows Withdraw, no Apply button', () => {
    const { getByRole, queryByRole } = render(
      <IssueCard {...baseProps} status="applied" />
    );
    expect(getByRole('button', { name: 'Withdraw' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('status=assigned: shows assigned badge, no Apply, no Withdraw', () => {
    const { getByText, queryByRole } = render(
      <IssueCard {...baseProps} status="assigned" />
    );
    expect(getByText('assigned')).toBeTruthy();
    expect(queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('clicking Apply calls onApply with the issue id', () => {
    const onApply = vi.fn();
    const { getByRole } = render(
      <IssueCard {...baseProps} status="open" onApply={onApply} />
    );
    fireEvent.click(getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('issue-1');
  });
});

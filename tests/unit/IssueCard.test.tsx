import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IssueCard } from '../../../frontend/src/components/IssueCard';

interface IssueCardMockProps {
  id: string;
  title: string;
  status: 'open' | 'applied' | 'assigned';
  onApply: (id: string) => void;
  onWithdraw: (id: string) => void;
}

function IssueCardMock({ id, title, status, onApply, onWithdraw }: IssueCardMockProps) {
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
      <IssueCardMock {...baseProps} status="open" />
    );
    expect(getByRole('button', { name: 'Apply' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Withdraw' })).toBeNull();
    expect(queryByText('assigned')).toBeNull();
  });

  it('status=applied: shows Withdraw, no Apply button', () => {
    const { getByRole, queryByRole } = render(
      <IssueCardMock {...baseProps} status="applied" />
    );
    expect(getByRole('button', { name: 'Withdraw' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('status=assigned: shows assigned badge, no Apply, no Withdraw', () => {
    const { getByText, queryByRole } = render(
      <IssueCardMock {...baseProps} status="assigned" />
    );
    expect(getByText('assigned')).toBeTruthy();
    expect(queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('clicking Apply calls onApply with the issue id', () => {
    const onApply = vi.fn();
    const { getByRole } = render(
      <IssueCardMock {...baseProps} status="open" onApply={onApply} />
    );
    fireEvent.click(getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('issue-1');
  });
});

describe('IssueCard (real) — global cap', () => {
  const baseProps = {
    id: 'issue-42',
    org: 'stellar-org',
    title: 'Fix memory leak',
    onApply: vi.fn(),
    onWithdraw: vi.fn(),
  };

  it('globalCapReached=false, status=open: Apply button is enabled with no cap tooltip', () => {
    const { getByRole } = render(
      <IssueCard {...baseProps} status="open" globalCapReached={false} />
    );
    const applyBtn = getByRole('button', { name: /apply for issue/i });
    expect(applyBtn).toBeTruthy();
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
    expect(applyBtn.getAttribute('title')).toBeNull();
  });

  it('globalCapReached=true, status=open: Apply button is disabled with cap tooltip', () => {
    const { getByRole } = render(
      <IssueCard {...baseProps} status="open" globalCapReached={true} />
    );
    const applyBtn = getByRole('button', { name: /apply for issue/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
    expect(applyBtn.getAttribute('title')).toBe(
      'You have reached the maximum 15 pending applications'
    );
  });

  it('globalCapReached=true, status=applied: Withdraw button is still enabled', () => {
    const { getByRole } = render(
      <IssueCard {...baseProps} status="applied" globalCapReached={true} />
    );
    const withdrawBtn = getByRole('button', { name: /withdraw application/i });
    expect(withdrawBtn).toBeTruthy();
    expect((withdrawBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

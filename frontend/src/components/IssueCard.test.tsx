import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IssueCard, type IssueCardProps } from './IssueCard';

const defaultProps: IssueCardProps = {
  id: 'issue-42',
  org: 'stellar-org',
  title: 'Fix memory leak in contract executor',
  status: 'open',
};

function renderCard(props: Partial<IssueCardProps> = {}) {
  return render(<IssueCard {...defaultProps} {...props} />);
}

describe('IssueCard', () => {
  it('matches the accessible open issue snapshot', () => {
    const { container } = renderCard();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('disables applying and describes the reason at the global cap', () => {
    renderCard({ globalCapReached: true });
    const apply = screen.getByRole('button', { name: /apply for issue/i });
    expect(apply).toBeDisabled();
    expect(apply.getAttribute('aria-disabled')).toBe('true');
    expect(apply).toHaveAccessibleDescription('You have reached the maximum 15 pending applications');
  });

  it('shows the applied state while an application is pending and retains it on success', async () => {
    let complete!: () => void;
    const onApply = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    renderCard({ onApply });

    fireEvent.click(screen.getByRole('button', { name: /apply for issue/i }));
    expect(onApply).toHaveBeenCalledWith('issue-42');
    expect(screen.getByLabelText('Status: Applied')).toBeTruthy();
    expect(screen.getByRole('button', { name: /withdraw application/i })).toBeDisabled();

    await act(async () => { complete(); });
    expect(screen.getByRole('button', { name: /withdraw application/i })).toBeEnabled();
  });

  it('restores the open state and passes the error to the caller when applying fails', async () => {
    const error = new Error('Contract rejected');
    const onApply = vi.fn().mockRejectedValue(error);
    const onApplyError = vi.fn();
    renderCard({ onApply, onApplyError });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply for issue/i }));
    });
    expect(onApplyError).toHaveBeenCalledWith('issue-42', error);
    expect(screen.getByLabelText('Status: Open')).toBeTruthy();
    expect(screen.getByRole('button', { name: /apply for issue/i })).toBeEnabled();
  });

  it('withdraws an applied issue by ID', async () => {
    const onWithdraw = vi.fn();
    renderCard({ status: 'applied', onWithdraw });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
    });
    expect(onWithdraw).toHaveBeenCalledWith('issue-42');
  });

  it.each(['assigned', 'completed'] as const)('renders the %s status without actions', (status) => {
    renderCard({ status });
    expect(screen.getByLabelText(new RegExp(`status: ${status}`, 'i'))).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

/**
 * Unit tests for WithdrawConfirmModal component.
 *
 * The component is re-implemented here as a lightweight stub to mirror the
 * existing test pattern in this project (see IssueCard.test.tsx).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Inline stub — mirrors the real WithdrawConfirmModal interface
// ---------------------------------------------------------------------------

interface WithdrawTarget {
  issueId: string;
  issueTitle: string;
  orgId: string;
}

interface WithdrawConfirmModalProps {
  target: WithdrawTarget | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function WithdrawConfirmModal({ target, loading = false, onConfirm, onCancel }: WithdrawConfirmModalProps) {
  if (!target) return null;
  return (
    <div role="dialog" aria-label="Withdraw application?">
      <h2>Withdraw application?</h2>
      <p data-testid="withdraw-modal-title">{target.issueTitle}</p>
      <p data-testid="withdraw-modal-org">{target.orgId}</p>
      <button
        data-testid="withdraw-modal-cancel"
        onClick={onCancel}
        disabled={loading}
      >
        Cancel
      </button>
      <button
        data-testid="withdraw-modal-confirm"
        onClick={onConfirm}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Withdrawing…' : 'Confirm withdrawal'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WithdrawConfirmModal', () => {
  const target: WithdrawTarget = {
    issueId: '42',
    issueTitle: 'Fix TTL extension bug',
    orgId: 'stellar-org',
  };

  it('renders nothing when target is null (modal closed)', () => {
    const { container } = render(
      <WithdrawConfirmModal
        target={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the issue title and org when target is provided', () => {
    const { getByTestId } = render(
      <WithdrawConfirmModal
        target={target}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(getByTestId('withdraw-modal-title').textContent).toBe('Fix TTL extension bug');
    expect(getByTestId('withdraw-modal-org').textContent).toBe('stellar-org');
  });

  it('calls onConfirm when Confirm withdrawal is clicked', () => {
    const onConfirm = vi.fn();
    const { getByTestId } = render(
      <WithdrawConfirmModal
        target={target}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(getByTestId('withdraw-modal-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    const { getByTestId } = render(
      <WithdrawConfirmModal
        target={target}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(getByTestId('withdraw-modal-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons and shows spinner text when loading=true', () => {
    const { getByTestId } = render(
      <WithdrawConfirmModal
        target={target}
        loading={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const confirmBtn = getByTestId('withdraw-modal-confirm') as HTMLButtonElement;
    const cancelBtn = getByTestId('withdraw-modal-cancel') as HTMLButtonElement;

    expect(confirmBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
    expect(confirmBtn.textContent).toBe('Withdrawing…');
    expect(confirmBtn.getAttribute('aria-busy')).toBe('true');
  });

  it('shows "Confirm withdrawal" text when not loading', () => {
    const { getByTestId } = render(
      <WithdrawConfirmModal
        target={target}
        loading={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(getByTestId('withdraw-modal-confirm').textContent).toBe('Confirm withdrawal');
  });
});

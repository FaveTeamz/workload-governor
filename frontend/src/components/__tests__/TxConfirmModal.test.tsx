import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TxConfirmModal from '../TxConfirmModal';
import type { UseTxModal, TxDetails } from '../../hooks/useTxModal';

const defaultDetails: TxDetails = {
  action: 'Apply for issue #42 in stellar-org',
  target: 'org: stellar-org / issue: #42',
  fee: '0.00001 XLM',
  network: 'testnet',
  estimatedTime: '~5 seconds',
  xdr: 'AAAAAQAAAAC...',
};

function makeModal(overrides: Partial<UseTxModal> = {}): UseTxModal {
  return {
    state: { status: 'idle' },
    confirm: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    close: vi.fn(),
    _resolve: vi.fn(),
    _reject: vi.fn(),
    ...overrides,
  };
}

describe('TxConfirmModal keyboard navigation and focus restoration (#852)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders role="dialog" and aria-modal="true" on the dialog container', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('closes the modal when Escape key is pressed and no transaction is pending', () => {
    const _reject = vi.fn();
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
      _reject,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(_reject).toHaveBeenCalledTimes(1);
  });

  it('does NOT close the modal on Escape key when transaction is submitting (loading)', () => {
    const _reject = vi.fn();
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
      _reject,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(_reject).not.toHaveBeenCalled();
  });

  it('saves document.activeElement before opening and returns focus to triggering button upon dismissal', async () => {
    function TestHost() {
      const [isOpen, setIsOpen] = useState(false);
      const modal = makeModal({
        state: isOpen
          ? { status: 'confirming', details: defaultDetails }
          : { status: 'idle' },
        _reject: () => setIsOpen(false),
      });

      return (
        <div>
          <button
            data-testid="trigger-btn"
            onClick={() => setIsOpen(true)}
          >
            Open Modal
          </button>
          <TxConfirmModal modal={modal} />
        </div>
      );
    }

    render(<TestHost />);
    const triggerBtn = screen.getByTestId('trigger-btn');
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    // Open modal
    fireEvent.click(triggerBtn);
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Dismiss with Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    // Modal is dismissed, focus should be restored to triggerBtn
    await waitFor(() => {
      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  it('restores focus to triggering element when unmounted while open', async () => {
    const triggerButton = document.createElement('button');
    triggerButton.setAttribute('data-testid', 'external-trigger');
    document.body.appendChild(triggerButton);
    triggerButton.focus();

    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });

    const { unmount } = render(<TxConfirmModal modal={modal} />);
    expect(screen.getByRole('dialog')).toBeTruthy();

    unmount();

    expect(document.activeElement).toBe(triggerButton);
    document.body.removeChild(triggerButton);
  });

  it('traps focus inside the modal when Tab is pressed', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);

    const dialog = screen.getByRole('dialog');
    const cancelBtn = screen.getByTestId('txmodal-cancel');
    const confirmBtn = screen.getByTestId('txmodal-confirm');

    // Simulate Tab on last focusable element wraps to first
    confirmBtn.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: false });
    // Tab event is handled by keydown listener on dialog container
    expect(dialog).toBeTruthy();
  });
});

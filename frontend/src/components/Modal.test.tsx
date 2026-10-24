/**
 * Modal.test.tsx — close button accessibility tests (#1061)
 *
 * Verifies that the Modal and related modal components expose properly
 * labelled close/action buttons for assistive-technology users.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from './Modal';

// ── Modal close button ────────────────────────────────────────────────────────

describe('Modal — close button aria-label', () => {
  function renderModal(onClose = vi.fn()) {
    return render(
      <Modal open title="Test dialog" onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
  }

  it('renders a close button with aria-label="Close"', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('close button has type="button" to avoid unintended form submission', () => {
    renderModal();
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the dialog is labelled by the title element', () => {
    renderModal();
    const dialog = document.querySelector('dialog');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('modal-title');
    expect(screen.getByText('Test dialog')).toBeTruthy();
  });

  it('renders children inside the modal body', () => {
    renderModal();
    expect(screen.getByText('Content')).toBeTruthy();
  });
});

// ── Modal — open / close state ────────────────────────────────────────────────

describe('Modal — open/close state', () => {
  it('is present in the DOM when open=true', () => {
    render(
      <Modal open title="Open modal" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>
    );
    // The native dialog has the "open" attribute when showModal() is called
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
  });

  it('is not open when open=false', () => {
    render(
      <Modal open={false} title="Closed modal" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>
    );
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(false);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Escape test" onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    fireEvent.keyDown(document.querySelector('dialog')!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Modal — footer slot ───────────────────────────────────────────────────────

describe('Modal — footer slot', () => {
  it('renders footer content when provided', () => {
    render(
      <Modal
        open
        title="Footer test"
        onClose={vi.fn()}
        footer={<button type="button">Save</button>}
      >
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('does not render the footer element when not provided', () => {
    const { container } = render(
      <Modal open title="No footer" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>
    );
    expect(container.querySelector('.modal__footer')).toBeNull();
  });
});

// ── WithdrawConfirmModal — button aria-labels ─────────────────────────────────

import { WithdrawConfirmModal } from './WithdrawConfirmModal';

const WITHDRAW_TARGET = {
  issueId: '42',
  issueTitle: 'Fix memory leak in executor',
  orgId: 'stellar-org',
};

describe('WithdrawConfirmModal — button accessibility', () => {
  it('renders a "Cancel" button', () => {
    render(
      <WithdrawConfirmModal
        target={WITHDRAW_TARGET}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('renders a "Confirm withdrawal" button', () => {
    render(
      <WithdrawConfirmModal
        target={WITHDRAW_TARGET}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Confirm withdrawal' })).toBeTruthy();
  });

  it('Cancel button calls onCancel when clicked', () => {
    const onCancel = vi.fn();
    render(
      <WithdrawConfirmModal
        target={WITHDRAW_TARGET}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Confirm button calls onConfirm when clicked', () => {
    const onConfirm = vi.fn();
    render(
      <WithdrawConfirmModal
        target={WITHDRAW_TARGET}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('both buttons are disabled while loading=true', () => {
    render(
      <WithdrawConfirmModal
        target={WITHDRAW_TARGET}
        loading
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    // Confirm button shows "Withdrawing…" while loading
    expect(screen.getByRole('button', { name: /withdrawing/i })).toBeTruthy();
    expect((screen.getByRole('button', { name: /withdrawing/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('modal is not open when target=null', () => {
    render(
      <WithdrawConfirmModal
        target={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(false);
  });
});

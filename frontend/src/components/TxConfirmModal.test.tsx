import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TxConfirmModal from './TxConfirmModal';
import type { UseTxModal, TxDetails } from '../hooks/useTxModal';

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── TxConfirmModal ────────────────────────────────────────────────────────────

describe('TxConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure body scroll is restored
    document.body.style.overflow = '';
  });

  // ── Idle state ────────────────────────────────────────────────────────────

  it('renders null when status is idle', () => {
    const modal = makeModal({ state: { status: 'idle' } });
    const { container } = render(<TxConfirmModal modal={modal} />);
    expect(container.firstChild).toBeNull();
  });

  // ── Confirming state ──────────────────────────────────────────────────────

  it('renders modal when status is confirming', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows action text from details.action', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByText('Apply for issue #42 in stellar-org')).toBeTruthy();
  });

  it('shows target from details.target', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByText('org: stellar-org / issue: #42')).toBeTruthy();
  });

  it('shows fee from details.fee', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByText('0.00001 XLM')).toBeTruthy();
  });

  it('shows network badge from details.network', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-network-badge').textContent).toBe('TESTNET');
  });

  it('shows estimated time when provided', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByText('~5 seconds')).toBeTruthy();
  });

  it('does not render estimated time when not provided', () => {
    const details: TxDetails = { ...defaultDetails, estimatedTime: undefined };
    const modal = makeModal({ state: { status: 'confirming', details } });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.queryByText('~5 seconds')).toBeNull();
  });

  // ── Confirm button ────────────────────────────────────────────────────────

  it('Confirm button calls _resolve', () => {
    const _resolve = vi.fn();
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
      _resolve,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.click(screen.getByTestId('txmodal-confirm'));
    expect(_resolve).toHaveBeenCalledTimes(1);
  });

  it('shows custom confirmLabel on confirm button', () => {
    const details: TxDetails = { ...defaultDetails, confirmLabel: 'Confirm Application' };
    const modal = makeModal({ state: { status: 'confirming', details } });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-confirm').textContent).toBe('Confirm Application');
  });

  it('shows default "Confirm & Sign" label when confirmLabel is not set', () => {
    const details: TxDetails = { ...defaultDetails, confirmLabel: undefined };
    const modal = makeModal({ state: { status: 'confirming', details } });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-confirm').textContent).toBe('Confirm & Sign');
  });

  // ── Cancel button ─────────────────────────────────────────────────────────

  it('Cancel button calls _reject', () => {
    const _reject = vi.fn();
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
      _reject,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.click(screen.getByTestId('txmodal-cancel'));
    expect(_reject).toHaveBeenCalledTimes(1);
  });

  // ── ARIA attributes ───────────────────────────────────────────────────────

  it('dialog has role=dialog, aria-modal=true, aria-labelledby, aria-describedby', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('txmodal-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('txmodal-subtitle');
  });

  // ── Loading state ─────────────────────────────────────────────────────────

  it('shows spinner and "Signing…" when status is loading', () => {
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-spinner')).toBeTruthy();
    expect(screen.getByTestId('txmodal-confirm').textContent).toContain('Signing…');
  });

  it('disables confirm button when loading', () => {
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-confirm')).toBeDisabled();
  });

  it('disables cancel button when loading', () => {
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-cancel')).toBeDisabled();
  });

  it('confirm button has aria-busy=true when loading', () => {
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-confirm').getAttribute('aria-busy')).toBe('true');
  });

  // ── Error state ───────────────────────────────────────────────────────────

  it('shows error message when status is error', () => {
    const modal = makeModal({
      state: { status: 'error', details: defaultDetails, message: 'Transaction rejected' },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-error').textContent).toBe('Transaction rejected');
  });

  it('error message has role=alert', () => {
    const modal = makeModal({
      state: { status: 'error', details: defaultDetails, message: 'Something went wrong' },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('Retry button in error state calls _resolve', () => {
    const _resolve = vi.fn();
    const modal = makeModal({
      state: { status: 'error', details: defaultDetails, message: 'Error' },
      _resolve,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.click(screen.getByTestId('txmodal-retry'));
    expect(_resolve).toHaveBeenCalledTimes(1);
  });

  it('Dismiss button in error state calls close', () => {
    const close = vi.fn();
    const modal = makeModal({
      state: { status: 'error', details: defaultDetails, message: 'Error' },
      close,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.click(screen.getByTestId('txmodal-dismiss'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not show Cancel/Confirm buttons in error state', () => {
    const modal = makeModal({
      state: { status: 'error', details: defaultDetails, message: 'Error' },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.queryByTestId('txmodal-cancel')).toBeNull();
    expect(screen.queryByTestId('txmodal-confirm')).toBeNull();
  });

  // ── XDR collapsible ───────────────────────────────────────────────────────

  it('shows XDR toggle button when xdr is provided', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.getByTestId('txmodal-xdr-toggle')).toBeTruthy();
  });

  it('XDR content is hidden initially', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.queryByTestId('txmodal-xdr-content')).toBeNull();
  });

  it('toggles XDR section open on click', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    const toggle = screen.getByTestId('txmodal-xdr-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('txmodal-xdr-content').textContent).toBe('AAAAAQAAAAC...');
  });

  it('toggles XDR section closed on second click', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    render(<TxConfirmModal modal={modal} />);
    const toggle = screen.getByTestId('txmodal-xdr-toggle');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('txmodal-xdr-content')).toBeNull();
  });

  it('does not show XDR toggle when xdr is not provided', () => {
    const details: TxDetails = { ...defaultDetails, xdr: undefined };
    const modal = makeModal({ state: { status: 'confirming', details } });
    render(<TxConfirmModal modal={modal} />);
    expect(screen.queryByTestId('txmodal-xdr-toggle')).toBeNull();
  });

  // ── Keyboard: Escape ──────────────────────────────────────────────────────

  it('Escape key calls _reject when confirming', () => {
    const _reject = vi.fn();
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
      _reject,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(_reject).toHaveBeenCalledTimes(1);
  });

  it('Escape key does NOT call _reject when loading', () => {
    const _reject = vi.fn();
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
      _reject,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(_reject).not.toHaveBeenCalled();
  });

  // ── Backdrop click ────────────────────────────────────────────────────────

  it('backdrop click calls _reject when not loading', () => {
    const _reject = vi.fn();
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
      _reject,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.click(screen.getByTestId('txmodal-backdrop'));
    expect(_reject).toHaveBeenCalledTimes(1);
  });

  it('backdrop click does NOT call _reject when loading', () => {
    const _reject = vi.fn();
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
      _reject,
    });
    render(<TxConfirmModal modal={modal} />);
    fireEvent.click(screen.getByTestId('txmodal-backdrop'));
    expect(_reject).not.toHaveBeenCalled();
  });

  // ── Destructive mode ──────────────────────────────────────────────────────

  it('destructive mode: dialog has txmodal--destructive class', () => {
    const details: TxDetails = { ...defaultDetails, destructive: true };
    const modal = makeModal({ state: { status: 'confirming', details } });
    render(<TxConfirmModal modal={modal} />);
    const dialog = screen.getByTestId('txmodal-dialog');
    expect(dialog.className).toContain('txmodal--destructive');
  });

  it('destructive mode: shows warning icon ⚠️', () => {
    const details: TxDetails = { ...defaultDetails, destructive: true };
    const modal = makeModal({ state: { status: 'confirming', details } });
    const { container } = render(<TxConfirmModal modal={modal} />);
    expect(container.textContent).toContain('⚠️');
  });

  it('non-destructive apply action shows 📝 icon', () => {
    const details: TxDetails = { ...defaultDetails, action: 'Apply for issue #1', destructive: false };
    const modal = makeModal({ state: { status: 'confirming', details } });
    const { container } = render(<TxConfirmModal modal={modal} />);
    expect(container.textContent).toContain('📝');
  });

  it('non-destructive assign action shows ✅ icon', () => {
    const details: TxDetails = { ...defaultDetails, action: 'Assign contributor', destructive: false };
    const modal = makeModal({ state: { status: 'confirming', details } });
    const { container } = render(<TxConfirmModal modal={modal} />);
    expect(container.textContent).toContain('✅');
  });

  // ── Snapshot test ─────────────────────────────────────────────────────────

  it('matches snapshot for confirming state', () => {
    const modal = makeModal({
      state: { status: 'confirming', details: defaultDetails },
    });
    const { container } = render(<TxConfirmModal modal={modal} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for loading state', () => {
    const modal = makeModal({
      state: { status: 'loading', details: defaultDetails },
    });
    const { container } = render(<TxConfirmModal modal={modal} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for error state', () => {
    const modal = makeModal({
      state: { status: 'error', details: defaultDetails, message: 'Freighter rejected the transaction' },
    });
    const { container } = render(<TxConfirmModal modal={modal} />);
    expect(container).toMatchSnapshot();
  });
});

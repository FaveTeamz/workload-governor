/**
 * NavBar.test.tsx — unit tests for the wallet status indicator (issue #531).
 *
 * Covers:
 *   - WalletStatusDot renders the correct state class and aria-label
 *     for all three states (connected / connecting / disconnected)
 *   - resolveWalletStatus returns the correct status from wallet props
 *   - NavBar renders the dot in all three states via props
 *   - Dot is visible for all viewport sizes (component-level check)
 *   - Connect button is disabled while connecting
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  NavBar,
  WalletStatusDot,
  resolveWalletStatus,
  type WalletStatus,
} from '../NavBar';

// ---------------------------------------------------------------------------
// WalletStatusDot — unit tests
// ---------------------------------------------------------------------------

describe('WalletStatusDot', () => {
  const states: WalletStatus[] = ['connected', 'connecting', 'disconnected'];

  it.each(states)('renders with status "%s"', (status) => {
    render(<WalletStatusDot status={status} />);
    const dot = screen.getByTestId('wallet-status-dot');
    expect(dot).toBeTruthy();
  });

  it('has role="status" for screen readers', () => {
    render(<WalletStatusDot status="connected" />);
    const dot = screen.getByRole('status');
    expect(dot).toBeTruthy();
  });

  it('has aria-label "Wallet connected" when connected', () => {
    render(<WalletStatusDot status="connected" />);
    const dot = screen.getByRole('status');
    expect(dot.getAttribute('aria-label')).toBe('Wallet connected');
  });

  it('has aria-label "Wallet connecting" when connecting', () => {
    render(<WalletStatusDot status="connecting" />);
    const dot = screen.getByRole('status');
    expect(dot.getAttribute('aria-label')).toBe('Wallet connecting');
  });

  it('has aria-label "Wallet disconnected" when disconnected', () => {
    render(<WalletStatusDot status="disconnected" />);
    const dot = screen.getByRole('status');
    expect(dot.getAttribute('aria-label')).toBe('Wallet disconnected');
  });

  it('applies the wallet-status-dot--connected CSS modifier when connected', () => {
    render(<WalletStatusDot status="connected" />);
    const dot = screen.getByTestId('wallet-status-dot');
    expect(dot.className).toContain('wallet-status-dot--connected');
  });

  it('applies the wallet-status-dot--connecting CSS modifier when connecting', () => {
    render(<WalletStatusDot status="connecting" />);
    const dot = screen.getByTestId('wallet-status-dot');
    expect(dot.className).toContain('wallet-status-dot--connecting');
  });

  it('applies the wallet-status-dot--disconnected CSS modifier when disconnected', () => {
    render(<WalletStatusDot status="disconnected" />);
    const dot = screen.getByTestId('wallet-status-dot');
    expect(dot.className).toContain('wallet-status-dot--disconnected');
  });

  it('renders a visually-hidden text description', () => {
    render(<WalletStatusDot status="disconnected" />);
    // The sr-only span carries the same label text
    expect(screen.getByText('Wallet disconnected')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// resolveWalletStatus — pure function tests
// ---------------------------------------------------------------------------

describe('resolveWalletStatus', () => {
  it('returns "connected" when publicKey is present and not connecting', () => {
    expect(resolveWalletStatus('GABC1234', false)).toBe('connected');
  });

  it('returns "disconnected" when publicKey is null and not connecting', () => {
    expect(resolveWalletStatus(null, false)).toBe('disconnected');
  });

  it('returns "connecting" when connecting is true, regardless of publicKey', () => {
    expect(resolveWalletStatus(null, true)).toBe('connecting');
  });

  it('returns "connecting" even when publicKey is present but connecting is true', () => {
    // Connecting takes priority — shouldn't show green mid-handshake
    expect(resolveWalletStatus('GABC1234', true)).toBe('connecting');
  });

  it('returns "disconnected" when publicKey is undefined and not connecting', () => {
    expect(resolveWalletStatus(undefined, false)).toBe('disconnected');
  });
});

// ---------------------------------------------------------------------------
// NavBar — integration tests (status dot via rendered props)
// ---------------------------------------------------------------------------

describe('NavBar — wallet status indicator', () => {
  it('shows a disconnected dot when no wallet address is provided', () => {
    render(<NavBar />);
    const dot = screen.getByTestId('wallet-status-dot');
    expect(dot.getAttribute('aria-label')).toBe('Wallet disconnected');
    expect(dot.className).toContain('wallet-status-dot--disconnected');
  });

  it('shows a connected dot when a wallet address is provided', () => {
    render(
      <NavBar walletAddress="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN" />,
    );
    const dot = screen.getByTestId('wallet-status-dot');
    expect(dot.getAttribute('aria-label')).toBe('Wallet connected');
    expect(dot.className).toContain('wallet-status-dot--connected');
  });

  it('shows a connecting dot when connecting=true', () => {
    render(<NavBar connecting={true} />);
    const dot = screen.getByTestId('wallet-status-dot');
    expect(dot.getAttribute('aria-label')).toBe('Wallet connecting');
    expect(dot.className).toContain('wallet-status-dot--connecting');
  });

  it('dot is always present in the DOM regardless of wallet state', () => {
    const { rerender } = render(<NavBar />);
    expect(screen.getByTestId('wallet-status-dot')).toBeTruthy();

    rerender(<NavBar walletAddress="GABC" />);
    expect(screen.getByTestId('wallet-status-dot')).toBeTruthy();

    rerender(<NavBar connecting={true} />);
    expect(screen.getByTestId('wallet-status-dot')).toBeTruthy();
  });

  it('connect button is disabled while connecting', () => {
    render(<NavBar connecting={true} />);
    const btn = screen.getByRole('button', { name: /connecting wallet/i });
    expect(btn).toBeDisabled();
  });

  it('connect button shows "Connecting…" text while connecting', () => {
    render(<NavBar connecting={true} />);
    expect(screen.getByText('Connecting…')).toBeTruthy();
  });

  it('displays truncated wallet address when connected', () => {
    const address = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
    render(<NavBar walletAddress={address} />);
    // Should show first 6 chars + ellipsis + last 4 chars
    expect(screen.getByText('GAAZI4…CCWN')).toBeTruthy();
  });

  it('shows the Disconnect button when connected', () => {
    render(
      <NavBar
        walletAddress="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        onDisconnect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /disconnect wallet/i })).toBeTruthy();
  });

  it('calls onDisconnect when the Disconnect button is clicked', async () => {
    const onDisconnect = vi.fn();
    const { container } = render(
      <NavBar
        walletAddress="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        onDisconnect={onDisconnect}
      />,
    );
    const btn = screen.getByRole('button', { name: /disconnect wallet/i });
    btn.click();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    // Suppress unused var warning
    void container;
  });

  it('dot has role="status" for assistive technology', () => {
    render(<NavBar />);
    // getByRole('status') finds the dot
    const statusEl = screen.getByRole('status');
    expect(statusEl.getAttribute('data-testid')).toBe('wallet-status-dot');
  });
});

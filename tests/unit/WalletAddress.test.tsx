import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletAddress, truncateAddress } from '../../src/WalletAddress';

// ── truncateAddress ──────────────────────────────────────────────────────────

describe('truncateAddress', () => {
  it('returns first 4 + last 4 chars separated by ...', () => {
    expect(truncateAddress('GABCDEFGHIJKLMNOPWXYZ')).toBe('GABC...WXYZ');
  });

  it('returns address unchanged when 8 chars or fewer', () => {
    expect(truncateAddress('GABC1234')).toBe('GABC1234');
    expect(truncateAddress('SHORT')).toBe('SHORT');
  });

  it('returns empty string for empty input', () => {
    expect(truncateAddress('')).toBe('');
  });
});

// ── WalletAddress component ──────────────────────────────────────────────────

const FULL_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456';

describe('WalletAddress', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.useFakeTimers();
  });

  it('displays truncated address', () => {
    const { getByText } = render(<WalletAddress address={FULL_ADDRESS} />);
    expect(getByText(truncateAddress(FULL_ADDRESS))).toBeTruthy();
  });

  it('shows full address as tooltip on the truncated span', () => {
    const { getByTitle } = render(<WalletAddress address={FULL_ADDRESS} />);
    expect(getByTitle(FULL_ADDRESS)).toBeTruthy();
  });

  it('renders a copy button with accessible label', () => {
    const { getByRole } = render(<WalletAddress address={FULL_ADDRESS} />);
    expect(getByRole('button', { name: `Copy address ${FULL_ADDRESS}` })).toBeTruthy();
  });

  it('copies the full address to clipboard when copy button is clicked', async () => {
    const { getByRole } = render(<WalletAddress address={FULL_ADDRESS} />);
    const btn = getByRole('button', { name: `Copy address ${FULL_ADDRESS}` });
    await act(async () => { fireEvent.click(btn); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(FULL_ADDRESS);
  });

  it('shows checkmark briefly after copy then reverts', async () => {
    const { getByRole } = render(<WalletAddress address={FULL_ADDRESS} />);
    const btn = getByRole('button', { name: `Copy address ${FULL_ADDRESS}` });

    await act(async () => { fireEvent.click(btn); });
    expect(btn.textContent).toBe('✓');

    act(() => { vi.advanceTimersByTime(1500); });
    expect(btn.textContent).toBe('⧉');
  });
});

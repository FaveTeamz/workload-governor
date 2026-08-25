import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TTLExtensionButton } from '../TTLExtensionButton';

describe('TTLExtensionButton', () => {
  const contributor = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const orgId = 'alignment-drips';
  const issueId = 42;

  it('disables button when TTL is not near expiry', () => {
    // Expiry in 3 days (259,200s), threshold is 24 hours (86,400s)
    const farExpiry = Math.floor(Date.now() / 1000) + 259200;
    const mockExtend = vi.fn().mockResolvedValue(true);

    render(
      <TTLExtensionButton
        contributorAddress={contributor}
        orgId={orgId}
        issueId={issueId}
        expiryTimestamp={farExpiry}
        nearExpiryThresholdSeconds={86400}
        onExtendTTL={mockExtend}
      />
    );

    const button = screen.getByRole('button', { name: /Extend TTL/i });
    expect(button).toBeDisabled();
  });

  it('enables button and executes extend contract call when near expiry', async () => {
    // Expiry in 2 hours (7200s), threshold is 24 hours (86,400s)
    const nearExpiry = Math.floor(Date.now() / 1000) + 7200;
    const mockExtend = vi.fn().mockResolvedValue(true);

    render(
      <TTLExtensionButton
        contributorAddress={contributor}
        orgId={orgId}
        issueId={issueId}
        expiryTimestamp={nearExpiry}
        nearExpiryThresholdSeconds={86400}
        onExtendTTL={mockExtend}
      />
    );

    const button = screen.getByRole('button', { name: /Extend TTL/i });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(mockExtend).toHaveBeenCalledWith(contributor, orgId, issueId);
    });
  });
});

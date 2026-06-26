import React, { useState } from 'react';

interface WalletAddressProps {
  address: string;
}

/** Truncates a Stellar address to GABC...WXYZ format. */
export function truncateAddress(address: string): string {
  if (!address || address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Displays a Stellar wallet address truncated to first 4 + last 4 chars.
 * - Hover tooltip shows the full address.
 * - Copy button copies the full address; shows a checkmark for 1.5 s.
 */
export function WalletAddress({ address }: WalletAddressProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="wallet-address" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      <span title={address} style={{ fontFamily: 'monospace', cursor: 'default' }}>
        {truncateAddress(address)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy address ${address}`}
        title="Copy address"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          lineHeight: 1,
          color: 'inherit',
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  );
}

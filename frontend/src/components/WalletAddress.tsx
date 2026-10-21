import { useState } from 'react';

export interface WalletAddressProps {
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
 * - Copy button copies the full address to the clipboard.
 *   - Uses the Clipboard API when available.
 *   - Falls back to window.prompt() on browsers without clipboard access.
 * - Shows a checkmark (✓) for 2 seconds after a successful copy.
 * - Accessible: the button has a descriptive aria-label.
 */
export function WalletAddress({ address }: WalletAddressProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(address);
      } else {
        // Fallback: open a prompt so the user can copy manually
        window.prompt('Copy this address:', address);
        return; // no feedback — we can't confirm user actually copied
      }
    } catch {
      // If clipboard access was denied, fall back to prompt
      window.prompt('Copy this address:', address);
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span
      className="wallet-address"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
    >
      <span title={address} style={{ fontFamily: 'monospace', cursor: 'default' }}>
        {truncateAddress(address)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Address copied' : `Copy address ${address}`}
        title={copied ? 'Copied!' : 'Copy address'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          lineHeight: 1,
          color: 'inherit',
          fontSize: '1em',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  );
}

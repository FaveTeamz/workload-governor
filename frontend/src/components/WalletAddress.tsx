import { CopyButton } from './CopyButton';

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
 * - Copy button copies the full address; shows a check icon for 2 s.
 * - Screen reader is notified on copy success via aria-live.
 */
export function WalletAddress({ address }: WalletAddressProps) {
  return (
    <span
      className="wallet-address"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
    >
      <span title={address} style={{ fontFamily: 'monospace', cursor: 'default' }}>
        {truncateAddress(address)}
      </span>
      <CopyButton
        text={address}
        label={`Copy address ${address}`}
        copiedLabel="Address copied"
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
      />
    </span>
  );
}

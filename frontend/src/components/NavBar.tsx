export interface NavBarProps {
  walletAddress?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function NavBar({ walletAddress, onConnect, onDisconnect }: NavBarProps) {
  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <a className="navbar__brand" href="/" aria-label="WorkloadGovernor home">
        <span aria-hidden="true">⚙</span> WorkloadGovernor
      </a>
      <div className="navbar__wallet">
        {walletAddress ? (
          <>
            <span className="navbar__address" title={walletAddress} aria-label={`Connected wallet: ${walletAddress}`}>
              {`${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={onDisconnect} aria-label="Disconnect wallet">
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onConnect} aria-label="Connect wallet">
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}

import { useState } from "react";

export interface NavBarProps {
  walletAddress?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function NavBar({ walletAddress, onConnect, onDisconnect }: NavBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <a className="navbar__brand" href="/" aria-label="WorkloadGovernor home">
        <span aria-hidden="true">⚙</span> WorkloadGovernor
      </a>

      {/* Hamburger button — visible only on mobile */}
      <button
        className="navbar__hamburger"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="navbar-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hamburger-bar" />
        <span className="hamburger-bar" />
        <span className="hamburger-bar" />
      </button>

      {/* Nav menu — collapses on mobile */}
      <div
        id="navbar-menu"
        className={`navbar__menu${open ? " navbar__menu--open" : ""}`}
      >
        <div className="navbar__wallet">
          {walletAddress ? (
            <>
              <span
                className="navbar__address"
                title={walletAddress}
                aria-label={`Connected wallet: ${walletAddress}`}
              >
                {`${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { onDisconnect?.(); setOpen(false); }}
                aria-label="Disconnect wallet"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { onConnect?.(); setOpen(false); }}
              aria-label="Connect wallet"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

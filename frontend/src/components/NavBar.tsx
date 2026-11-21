import { useState, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

export interface NavBarProps {
  walletAddress?: string | null;
  walletError?: string | null;
  networkMismatch?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function NavBar({ walletAddress, walletError, networkMismatch, onConnect, onDisconnect }: NavBarProps) {
  const [open, setOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Trap focus inside the drawer while it is open (WCAG 2.1 SC 2.1.2)
  useFocusTrap(menuRef, open);

  const showInstallPrompt = !walletAddress && walletError && /install/i.test(walletError);
  const expectedNet = (typeof import.meta !== "undefined" && import.meta.env?.VITE_STELLAR_NETWORK
    ? import.meta.env.VITE_STELLAR_NETWORK
    : "TESTNET"
  ).toUpperCase();

  function closeMenu() {
    setOpen(false);
    // useFocusTrap restores focus to the previously-focused element (hamburger)
    // when active transitions false→false, but we also call focus() directly
    // so it works even if the hook cleanup is deferred.
    hamburgerRef.current?.focus();
  }

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeMenu();
    }
  }

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <a className="navbar__brand" href="#/" aria-label="WorkloadGovernor home">
        <span aria-hidden="true">⚙</span> WorkloadGovernor
      </a>

      <button
        ref={hamburgerRef}
        data-testid="hamburger-btn"
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

      {/* The drawer — focus is trapped here while open */}
      <div
        id="navbar-menu"
        ref={menuRef}
        data-testid="navbar-menu"
        className={`navbar__menu${open ? " navbar__menu--open" : ""}`}
        onKeyDown={handleMenuKeyDown}
      >
        <a className="navbar__link" href="#/activity" onClick={() => { setOpen(false); }}>
          Activity
        </a>

        <div className="navbar__wallet">
          {networkMismatch && walletAddress && (
            <div className="navbar__network-warning" role="alert">
              Wrong network — switch to {expectedNet} in Freighter
            </div>
          )}
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
          ) : showInstallPrompt ? (
            <a
              href="https://www.freighter.app"
              target="_blank"
              rel="noreferrer"
              className="navbar__install-link"
            >
              Install Freighter
            </a>
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

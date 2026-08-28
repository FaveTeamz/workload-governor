import { useState } from "react";
import type { Theme } from "../hooks/useTheme";

export interface NavBarProps {
  walletAddress?: string | null;
  walletError?: string | null;
  networkMismatch?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export function NavBar({ walletAddress, walletError, networkMismatch, onConnect, onDisconnect, theme = "dark", onToggleTheme }: NavBarProps) {
  const [open, setOpen] = useState(false);

  const showInstallPrompt = !walletAddress && walletError && /install/i.test(walletError);
  const expectedNet = (import.meta.env.VITE_STELLAR_NETWORK ?? "TESTNET").toUpperCase();

  const isDark = theme === "dark";
  const themeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  const themeIcon = isDark ? "☀️" : "🌙";

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <a className="navbar__brand" href="#/" aria-label="WorkloadGovernor home">
        <span aria-hidden="true">⚙</span> WorkloadGovernor
      </a>

      <button
        className="navbar__theme-toggle"
        aria-label={themeLabel}
        title={themeLabel}
        onClick={onToggleTheme}
        type="button"
      >
        <span className="navbar__theme-icon" aria-hidden="true">{themeIcon}</span>
      </button>

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

      <div
        id="navbar-menu"
        className={`navbar__menu${open ? " navbar__menu--open" : ""}`}
      >
        <a className="navbar__link" href="#/activity" onClick={() => setOpen(false)}>
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

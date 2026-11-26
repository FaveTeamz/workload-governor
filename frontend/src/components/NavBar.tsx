import { useState, useRef, useEffect } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import "./navbar.css";

// ── Wallet status types & helpers ───────────────────────────────────────────

export type WalletStatus = "connected" | "connecting" | "disconnected";

export interface WalletStatusDotProps {
  status: WalletStatus;
}

export function WalletStatusDot({ status }: WalletStatusDotProps) {
  const labels: Record<WalletStatus, string> = {
    connected: "Wallet connected",
    connecting: "Wallet connecting",
    disconnected: "Wallet disconnected",
  };
  return (
    <span
      role="status"
      aria-label={labels[status]}
      data-testid="wallet-status-dot"
      className={`wallet-status-dot wallet-status-dot--${status}`}
    >
      <span className="sr-only">{labels[status]}</span>
    </span>
  );
}

export function resolveWalletStatus(
  publicKey?: string | null,
  connecting?: boolean
): WalletStatus {
  if (connecting) return "connecting";
  if (publicKey) return "connected";
  return "disconnected";
}

// ── Navigation Links ─────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Dashboard", href: "#/" },
  { label: "Issues", href: "#/issues" },
  { label: "Assignments", href: "#/assignments" },
  { label: "Activity", href: "#/activity" },
];

// ── NavBar Props ─────────────────────────────────────────────────────────────

export interface NavBarProps {
  walletAddress?: string | null;
  walletError?: string | null;
  networkMismatch?: boolean;
  connecting?: boolean;
  network?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function NavBar({
  walletAddress,
  walletError,
  networkMismatch,
  connecting,
  network,
  onConnect,
  onDisconnect,
}: NavBarProps) {
  const [open, setOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Trap focus inside the drawer while it is open (WCAG 2.1 SC 2.1.2)
  useFocusTrap(menuRef, open);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const walletStatus = resolveWalletStatus(walletAddress, connecting);
  const showInstallPrompt = !walletAddress && !connecting && walletError && /install/i.test(walletError);
  const expectedNet = (
    network ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_STELLAR_NETWORK
      ? import.meta.env.VITE_STELLAR_NETWORK
      : "TESTNET")
  ).toUpperCase();

  function closeMenu() {
    setOpen(false);
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
      <div className="navbar__brand-wrap">
        <a className="navbar__brand navbar__logo" href="#/" aria-label="WorkloadGovernor home">
          <span aria-hidden="true" className="navbar__logo-icon">⚙</span>
          <span className="navbar__brand-name">WorkloadGovernor</span>
        </a>

        {/* Network badge visible next to logo */}
        <span
          data-testid="network-badge"
          className={`navbar__network-badge navbar__network-badge--${expectedNet.toLowerCase()}`}
          aria-label={`Network: ${expectedNet}`}
        >
          {expectedNet}
        </span>
      </div>

      {/* Hamburger button (mobile) */}
      <button
        ref={hamburgerRef}
        data-testid="hamburger-btn"
        className="navbar__hamburger"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="navbar-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span data-testid="hamburger-button" className="sr-only">
          {open ? "Close menu" : "Open menu"}
        </span>
        <span className="navbar__hamburger-bar hamburger-bar" />
        <span className="navbar__hamburger-bar hamburger-bar" />
        <span className="navbar__hamburger-bar hamburger-bar" />
      </button>

      {/* Backdrop for mobile drawer */}
      {open && (
        <div
          data-testid="drawer-backdrop"
          className="navbar__backdrop"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Main navigation menu: inline on desktop (>=768px), slide drawer on mobile (<768px) */}
      <div
        id="navbar-menu"
        ref={menuRef}
        data-testid="navbar-menu"
        className={`navbar__menu${open ? " navbar__menu--open" : ""}`}
        onKeyDown={handleMenuKeyDown}
      >
        <div data-testid="mobile-drawer" className={`navbar__drawer-wrapper navbar__drawer${open ? " navbar__drawer--open" : ""}`}>
          <div data-testid="mobile-menu" className="navbar__drawer-inner">
            <ul className="navbar__links" role="list" data-testid="nav-links">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    className="navbar__link"
                    href={link.href}
                    onClick={() => { setOpen(false); }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="navbar__wallet">
              {networkMismatch && walletAddress && (
                <div className="navbar__network-warning" role="alert">
                  Wrong network — switch to {expectedNet} in Freighter
                </div>
              )}
              <WalletStatusDot status={walletStatus} />
              {walletAddress ? (
                <>
                  <span
                    className="navbar__address"
                    title={walletAddress}
                    aria-label={`Connected wallet: ${walletAddress}`}
                    data-testid="wallet-address"
                  >
                    {`${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm navbar__btn"
                    onClick={() => { onDisconnect?.(); setOpen(false); }}
                    aria-label="Disconnect wallet"
                  >
                    Disconnect
                  </button>
                </>
              ) : connecting ? (
                <button
                  className="btn btn-primary btn-sm navbar__btn"
                  disabled
                  aria-label="Connecting wallet"
                >
                  Connecting…
                </button>
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
                  className="btn btn-primary btn-sm navbar__btn"
                  onClick={() => { onConnect?.(); setOpen(false); }}
                  aria-label="Connect wallet"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export const Navbar = NavBar;
export default NavBar;

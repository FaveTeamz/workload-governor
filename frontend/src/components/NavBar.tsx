/**
 * NavBar — Vite/React app navigation bar.
 *
 * Wallet status indicator (issue #531):
 *   🟢 connected   — publicKey present, not connecting
 *   🟡 connecting  — connecting === true
 *   🔴 disconnected — no publicKey and not connecting
 */
import { useState } from "react";

// ── WalletStatusDot ───────────────────────────────────────────────────────────

export type WalletStatus = "connected" | "connecting" | "disconnected";

const STATUS_LABEL: Record<WalletStatus, string> = {
  connected: "Wallet connected",
  connecting: "Wallet connecting",
  disconnected: "Wallet disconnected",
};

/** Resolves the three-state status from the wallet prop values. */
export function resolveWalletStatus(
  walletAddress: string | null | undefined,
  connecting: boolean,
): WalletStatus {
  if (connecting) return "connecting";
  if (walletAddress) return "connected";
  return "disconnected";
}

interface WalletStatusDotProps {
  status: WalletStatus;
}

/**
 * A small coloured dot badge that communicates wallet connection state.
 * Renders a visually hidden label for screen readers.
 */
export function WalletStatusDot({ status }: WalletStatusDotProps) {
  return (
    <span
      className={`wallet-status-dot wallet-status-dot--${status}`}
      role="status"
      aria-label={STATUS_LABEL[status]}
      data-testid="wallet-status-dot"
    >
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

// ── NavBar ────────────────────────────────────────────────────────────────────

export interface NavBarProps {
  walletAddress?: string | null;
  walletError?: string | null;
  networkMismatch?: boolean;
  /** True while the wallet connection handshake is in progress */
  connecting?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function NavBar({
  walletAddress,
  walletError,
  networkMismatch,
  connecting = false,
  onConnect,
  onDisconnect,
}: NavBarProps) {
  const [open, setOpen] = useState(false);

  const showInstallPrompt =
    !walletAddress && walletError && /install/i.test(walletError);
  const expectedNet = (
    import.meta.env.VITE_STELLAR_NETWORK ?? "TESTNET"
  ).toUpperCase();

  const walletStatus = resolveWalletStatus(walletAddress, connecting);

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <a className="navbar__brand" href="#/" aria-label="WorkloadGovernor home">
        <span aria-hidden="true">⚙</span> WorkloadGovernor
      </a>

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
        <a className="navbar__link" href="#/dashboard" onClick={() => setOpen(false)}>
          Dashboard
        </a>

        <div className="navbar__wallet">
          {networkMismatch && walletAddress && (
            <div className="navbar__network-warning" role="alert">
              Wrong network — switch to {expectedNet} in Freighter
            </div>
          )}

          {/* Wallet status dot — always visible */}
          <WalletStatusDot status={walletStatus} />

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
                onClick={() => {
                  onDisconnect?.();
                  setOpen(false);
                }}
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
              onClick={() => {
                onConnect?.();
                setOpen(false);
              }}
              disabled={connecting}
              aria-label={connecting ? "Connecting wallet…" : "Connect wallet"}
            >
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

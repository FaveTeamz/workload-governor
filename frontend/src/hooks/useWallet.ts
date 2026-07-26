/**
 * useWallet — manages Freighter wallet connection state.
 *
 * In production this would call the @stellar/freighter-api package.
 * Currently provides a simulation layer so the UI can be built and tested
 * without the extension installed.
 *
 * Persists the connected address to sessionStorage so a page refresh keeps
 * the session alive but a tab close / browser restart requires re-connecting
 * (matching Freighter's actual behaviour).
 */

import { useState, useCallback } from "react";

const SESSION_KEY = "wg_wallet_address";

// Simulated Stellar address for dev mode.
const DEMO_ADDRESS = "GBXXX1ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTU1234";

export interface WalletState {
  /** Public key of the connected wallet, or null if disconnected. */
  address: string | null;
  /** True while a connect/disconnect action is in flight. */
  connecting: boolean;
  /** Error from the last failed connect attempt. */
  error: string | null;
  /** Request wallet connection via Freighter (or demo mode). */
  connect: () => Promise<void>;
  /** Clear session state and disconnect. */
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_KEY)
  );
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      // Try to use real Freighter API if available in window.
      // The cast avoids importing the extension SDK as a hard dependency.
      const freighter = (
        window as Window & {
          freighter?: { getPublicKey: () => Promise<string> };
        }
      ).freighter;

      const pubKey = freighter
        ? await freighter.getPublicKey()
        : await simulateConnect();

      sessionStorage.setItem(SESSION_KEY, pubKey);
      setAddress(pubKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setAddress(null);
    setError(null);
  }, []);

  return { address, connecting, error, connect, disconnect };
}

/** 400 ms simulated round-trip; returns a demo public key. */
function simulateConnect(): Promise<string> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(DEMO_ADDRESS), 400)
  );
}

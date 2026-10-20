import { useState, useEffect, useCallback } from "react";
import {
  isConnected as freighterIsConnected,
  getAddress as freighterGetAddress,
  getNetwork as freighterGetNetwork,
} from "@stellar/freighter-api";

const STORAGE_KEY = "wg_wallet_pubkey";
const EXPECTED_NETWORK = "TESTNET";

/** Message type sent by the Freighter browser extension. */
interface FreighterMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: any;
}

export interface WalletState {
  publicKey: string | null;
  error: string | null;
  connecting: boolean;
  /** True when the Freighter extension is installed and responding. */
  isInstalled: boolean;
  /** True when the wallet is connected to a different network than expected. */
  networkMismatch: boolean;
}

export interface UseWallet extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): UseWallet {
  const [publicKey, setPublicKey] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [networkMismatch, setNetworkMismatch] = useState(false);

  // Re-hydrate from storage on mount (covers page-reload scenario)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !publicKey) setPublicKey(stored);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoized handler for Freighter extension messages (account/network changes).
  // Using useCallback ensures the function identity is stable across renders so
  // the listener is never re-attached unnecessarily — fixes the infinite re-render
  // loop on network change (issue #1047).
  const handleMessage = useCallback((event: MessageEvent) => {
    const data = event.data as FreighterMessage | null;
    if (!data || typeof data !== "object") return;

    if (data.type === "FREIGHTER_ACCOUNT_CHANGED") {
      const newKey: string | null = data.detail?.publicKey ?? null;
      if (newKey) {
        localStorage.setItem(STORAGE_KEY, newKey);
        setPublicKey(newKey);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setPublicKey(null);
      }
    }

    if (data.type === "FREIGHTER_NETWORK_CHANGED") {
      const network: string | undefined = data.detail?.network;
      if (network) {
        setNetworkMismatch(network.toUpperCase() !== EXPECTED_NETWORK);
      }
    }

    if (data.type === "FREIGHTER_DISCONNECTED") {
      localStorage.removeItem(STORAGE_KEY);
      setPublicKey(null);
      setError(null);
      setNetworkMismatch(false);
    }
  }, []); // stable: no external state deps; state setters are guaranteed stable

  // Attach the memoized handler once. The cleanup function properly removes the
  // exact same function reference so listeners never accumulate across re-renders.
  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { isConnected, error: connErr } = await freighterIsConnected();
      if (!isConnected || connErr) {
        setIsInstalled(false);
        setError("Freighter extension not found. Please install it.");
        return;
      }
      setIsInstalled(true);

      const { address, error: addrErr } = await freighterGetAddress();
      if (addrErr) {
        setError(addrErr);
        return;
      }

      // Check network after a successful address fetch
      try {
        const { network } = await freighterGetNetwork();
        setNetworkMismatch(
          (network ?? "").toUpperCase() !== EXPECTED_NETWORK
        );
      } catch {
        // Non-fatal: network check failure should not block connection
      }

      localStorage.setItem(STORAGE_KEY, address);
      setPublicKey(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPublicKey(null);
    setError(null);
    setNetworkMismatch(false);
  }, []);

  return {
    publicKey,
    error,
    connecting,
    isInstalled,
    networkMismatch,
    connect,
    disconnect,
  };
}

import { useState, useEffect } from "react";

const STORAGE_KEY = "wg_wallet_pubkey";

export interface WalletState {
  publicKey: string | null;
  error: string | null;
  connecting: boolean;
}

export interface UseWallet extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

// Thin wrapper so we can mock in tests
function getFreighter() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).__freighter_api__ ??
    // dynamic import at runtime; tests inject __freighter_api__ before calling
    null;
}

export function useWallet(): UseWallet {
  const [publicKey, setPublicKey] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Re-hydrate from storage on mount (covers page-reload scenario)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !publicKey) setPublicKey(stored);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const freighter = getFreighter();
      if (!freighter) {
        setError("Freighter extension not found. Please install it.");
        return;
      }
      const { isConnected } = await freighter.isConnected();
      if (!isConnected) {
        setError("Freighter extension not found. Please install it.");
        return;
      }
      const { address, error: addrErr } = await freighter.getAddress();
      if (addrErr) {
        setError(addrErr);
        return;
      }
      localStorage.setItem(STORAGE_KEY, address);
      setPublicKey(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    localStorage.removeItem(STORAGE_KEY);
    setPublicKey(null);
    setError(null);
  }

  return { publicKey, error, connecting, connect, disconnect };
}

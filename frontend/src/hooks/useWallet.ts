import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "wg_wallet_pubkey";

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
}

export interface UseWallet extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

// Thin wrapper so we can mock in tests
function getFreighter() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).__freighter_api__ ?? null;
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

  // Listen for wallet extension messages (e.g. account-changed events).
  // FIX #545: the cleanup function returns removeEventListener so the
  // listener is detached when the component unmounts, preventing accumulation
  // of stale callbacks across mount/unmount cycles.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as FreighterMessage | null;
      if (!data || typeof data !== "object") return;

      if (data.type === "FREIGHTER_ACCOUNT_CHANGED") {
        const newKey: string | null = data.detail?.publicKey ?? null;
        if (newKey) {
          localStorage.setItem(STORAGE_KEY, newKey);
          setPublicKey(newKey);
        } else {
          // Extension signalled a disconnect
          localStorage.removeItem(STORAGE_KEY);
          setPublicKey(null);
        }
      }

      if (data.type === "FREIGHTER_DISCONNECTED") {
        localStorage.removeItem(STORAGE_KEY);
        setPublicKey(null);
        setError(null);
      }
    }

    window.addEventListener("message", handleMessage);

    // Cleanup: remove the listener when the component unmounts or the effect
    // re-runs so listeners never accumulate.
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []); // runs once; setPublicKey / setError are stable dispatch functions

  const connect = useCallback(async () => {
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
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPublicKey(null);
    setError(null);
  }, []);

  return { publicKey, error, connecting, connect, disconnect };
}

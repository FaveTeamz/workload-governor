import { useState, useEffect, useCallback } from 'react';
import {
  isConnected as freighterIsConnected,
  getAddress as freighterGetAddress,
  getNetwork as freighterGetNetwork,
} from '@stellar/freighter-api';

const STORAGE_KEY = 'wg_wallet_pubkey';

/**
 * Cross-tab wallet state synchronization channel name.
 * Used by BroadcastChannel to broadcast connect/disconnect events to
 * all open browser tabs so a wallet extension disconnect in one tab
 * is immediately reflected in every other tab (issue #1051).
 */
const CHANNEL_NAME = 'wg_wallet_sync';

/** Message types broadcast across tabs. */
type SyncMessageType = 'connect' | 'disconnect';

interface SyncMessage {
  type: SyncMessageType;
  publicKey: string | null;
}

export interface WalletState {
  publicKey: string | null;
  error: string | null;
  connecting: boolean;
  networkMismatch: boolean;
}

export interface UseWallet extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  isInstalled: boolean;
}

function expectedNetwork(): string {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STELLAR_NETWORK) ||
    'TESTNET'
  ).toUpperCase();
}

export function useWallet(): UseWallet {
  const [publicKey, setPublicKey] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [networkMismatch, setNetworkMismatch] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);

  // ── Cross-tab synchronization (issue #1051) ──────────────────
  // Broadcast wallet state changes to other open tabs so that
  // disconnecting the wallet extension in one tab immediately
  // clears the authenticated state in all remaining tabs.
  const broadcast = useCallback(
    (type: SyncMessageType, key: string | null) => {
      // BroadcastChannel (modern browsers)
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const channel = new BroadcastChannel(CHANNEL_NAME);
          const msg: SyncMessage = { type, publicKey: key };
          channel.postMessage(msg);
          channel.close();
        } catch {
          // BroadcastChannel may be unavailable in some contexts
        }
      }
      // localStorage event is the fallback — it fires in *other*
      // tabs but not the originating tab, so it complements the
      // BroadcastChannel approach without double-firing.
    },
    [],
  );

  // Listen for wallet state changes from other tabs
  useEffect(() => {
    // ── BroadcastChannel listener ──
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (event: MessageEvent<SyncMessage>) => {
          const { type, publicKey: incomingKey } = event.data;
          if (type === 'disconnect') {
            localStorage.removeItem(STORAGE_KEY);
            setPublicKey(null);
            setError(null);
            setNetworkMismatch(false);
            setConnecting(false);
          } else if (type === 'connect' && incomingKey) {
            localStorage.setItem(STORAGE_KEY, incomingKey);
            setPublicKey(incomingKey);
            setError(null);
          }
        };
      } catch {
        channel = null;
      }
    }

    // ── Storage event listener (fallback for browsers without
    //    BroadcastChannel, or as a secondary sync path) ──
    function handleStorageEvent(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;

      if (event.newValue === null) {
        // Another tab removed the key → wallet disconnected
        setPublicKey(null);
        setError(null);
        setNetworkMismatch(false);
        setConnecting(false);
      } else if (event.newValue) {
        // Another tab set a new key → wallet connected
        setPublicKey(event.newValue);
        setError(null);
      }
    }

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      if (channel) {
        channel.close();
      }
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  // Auto-reconnect: rehydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !publicKey) {
      setPublicKey(stored);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect(): Promise<void> {
    setConnecting(true);
    setError(null);
    setNetworkMismatch(false);

    try {
      // Step 1: Check if Freighter is installed/connected
      const connResult = await freighterIsConnected();
      if (connResult.error || !connResult.isConnected) {
        setIsInstalled(false);
        setError('Freighter extension not found. Please install it.');
        return;
      }

      setIsInstalled(true);

      // Step 2: Get the wallet address
      const addrResult = await freighterGetAddress();
      if (addrResult.error) {
        setError(addrResult.error);
        return;
      }

      const address = addrResult.address;

      // Step 3: Check network
      const netResult = await freighterGetNetwork();
      if (!netResult.error && netResult.network) {
        if (netResult.network.toUpperCase() !== expectedNetwork()) {
          setNetworkMismatch(true);
        }
      }

      // Persist and set public key
      localStorage.setItem(STORAGE_KEY, address);
      setPublicKey(address);
      // Broadcast to other tabs (issue #1051)
      broadcast('connect', address);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setConnecting(false);
    }
  }

  function disconnect(): void {
    localStorage.removeItem(STORAGE_KEY);
    setPublicKey(null);
    setError(null);
    setNetworkMismatch(false);
    // Broadcast to other tabs (issue #1051)
    broadcast('disconnect', null);
  }

  return {
    publicKey,
    error,
    connecting,
    networkMismatch,
    connect,
    disconnect,
    isInstalled,
  };
}

import { useState, useEffect, useCallback, useRef } from "react";
import {
  isAllowed as freighterIsAllowed,
  isConnected as freighterIsConnected,
  getAddress as freighterGetAddress,
  getNetwork as freighterGetNetwork,
} from "@stellar/freighter-api";

const STORAGE_KEY = "wg_wallet_pubkey";
export const WALLET_DISCONNECTED_MESSAGE = "Wallet disconnected. Please reconnect to continue.";
const HEARTBEAT_INTERVAL = 500;
const EXPECTED_NETWORK = "TESTNET";

/** Message type sent by the Freighter browser extension. */
interface FreighterMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: any;
}

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
  const [publicKey, updatePublicKey] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [networkMismatch, setNetworkMismatch] = useState(false);

  const connection = useRef({ key: publicKey, revision: 0 });

  const setPublicKey = useCallback((key: string | null) => {
    connection.current = { key, revision: connection.current.revision + 1 };
    updatePublicKey(key);
  }, []);

  const clearWallet = useCallback(() => {
    setPublicKey(null);
    setError(null);
    setNetworkMismatch(false);
    setConnecting(false);
  }, [setPublicKey]);

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
            if (!localStorage.getItem(STORAGE_KEY)) clearWallet();
          } else if (type === 'connect' && incomingKey) {
            if (localStorage.getItem(STORAGE_KEY) !== incomingKey) return;
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
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      if (event.storageArea && event.storageArea !== localStorage) return;

      if (event.newValue === null) {
        // Another tab removed the key → wallet disconnected
        clearWallet();
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
  }, [clearWallet, setPublicKey]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    clearWallet();
    broadcast('disconnect', null);
  }, [broadcast, clearWallet]);

  useEffect(() => {
    let checking = false;
    let active = true;

    async function verifyAuthorization() {
      const snapshot = connection.current;
      const revision = snapshot.revision;
      if (!snapshot.key || checking) return;
      checking = true;
      try {
        const permission = await freighterIsAllowed();
        const address = permission.isAllowed && !permission.error
          ? await freighterGetAddress()
          : null;
        if (active && connection.current.revision === revision &&
            (!address || address.error || address.address !== snapshot.key)) {
          disconnect();
        }
      } catch {
        if (active && connection.current.revision === revision) disconnect();
      } finally {
        checking = false;
      }
    }

    function checkVisibleTab() {
      if (document.visibilityState !== 'hidden') void verifyAuthorization();
    }

    const heartbeat = window.setInterval(checkVisibleTab, HEARTBEAT_INTERVAL);
    window.addEventListener('focus', verifyAuthorization);
    document.addEventListener('visibilitychange', checkVisibleTab);
    return () => {
      active = false;
      window.clearInterval(heartbeat);
      window.removeEventListener('focus', verifyAuthorization);
      document.removeEventListener('visibilitychange', checkVisibleTab);
    };
  }, [disconnect]);

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
        disconnect();
      }
    }

    if (data.type === "FREIGHTER_NETWORK_CHANGED") {
      const network: string | undefined = data.detail?.network;
      if (network) {
        setNetworkMismatch(network.toUpperCase() !== EXPECTED_NETWORK);
      }
    }

    if (data.type === "FREIGHTER_DISCONNECTED") {
      disconnect();
    }
  }, [disconnect, setPublicKey]);

  // Attach the memoized handler once. The cleanup function properly removes the
  // exact same function reference so listeners never accumulate across re-renders.
  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  const connect = useCallback(async () => {
    const revision = ++connection.current.revision;
    const isCurrent = () => connection.current.revision === revision;
    setConnecting(true);
    setError(null);
    try {
      const { isConnected, error: connErr } = await freighterIsConnected();
      if (!isCurrent()) return;
      if (!isConnected || connErr) {
        setIsInstalled(false);
        setError("Freighter extension not found. Please install it.");
        return;
      }
      setIsInstalled(true);

      const { address, error: addrErr } = await freighterGetAddress();
      if (!isCurrent()) return;
      if (addrErr || !address) {
        setError(addrErr || "Freighter did not return a wallet address.");
        return;
      }

      // Check network after a successful address fetch
      try {
        const { network } = await freighterGetNetwork();
        if (isCurrent()) setNetworkMismatch(
          (network ?? "").toUpperCase() !== EXPECTED_NETWORK
        );
      } catch {
        // Non-fatal: network check failure should not block connection
      }

      if (!isCurrent()) return;
      localStorage.setItem(STORAGE_KEY, address);
      setPublicKey(address);
      setConnecting(false);
      broadcast('connect', address);
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (isCurrent()) setConnecting(false);
    }
  }, [broadcast, setPublicKey]);

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

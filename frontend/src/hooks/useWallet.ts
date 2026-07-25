/**
 * frontend/src/hooks/useWallet.ts
 *
 * React hook that manages Freighter wallet connection state.
 *
 * States:
 *  - not_installed:  Freighter extension not present
 *  - not_connected:  Extension present but user has not connected
 *  - connected:      User connected, publicKey available
 *  - network_mismatch: Connected but on wrong network
 *  - error:          Connection attempt rejected or other failure
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isConnected,
  isAllowed,
  getPublicKey,
  requestAccess,
  getNetwork,
} from '@stellar/freighter-api';

export type WalletErrorCode = 'user_rejected' | 'unknown';

export interface WalletState {
  installed: boolean;
  connected: boolean;
  publicKey?: string;
  networkMismatch?: boolean;
  error?: WalletErrorCode;
  loading: boolean;
  /** Manually trigger a connection request */
  connect: () => Promise<void>;
  /** Disconnect (clears local state; Freighter has no programmatic disconnect) */
  disconnect: () => void;
}

const EXPECTED_NETWORK = 'TESTNET';
const STORAGE_KEY = 'wg_wallet_connected';

export function useWallet(): WalletState {
  const [installed, setInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | undefined>();
  const [networkMismatch, setNetworkMismatch] = useState<boolean | undefined>();
  const [error, setError] = useState<WalletErrorCode | undefined>();
  const [loading, setLoading] = useState(true);

  /** Resolve the full wallet state from Freighter */
  const syncState = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    let freighterInstalled = false;
    try {
      // isConnected() returns { isConnected: boolean } or throws when not installed
      const result = await isConnected();
      freighterInstalled = typeof result === 'object' ? result.isConnected : (result as boolean);
    } catch {
      freighterInstalled = false;
    }

    setInstalled(freighterInstalled);

    if (!freighterInstalled) {
      setConnected(false);
      setPublicKey(undefined);
      setNetworkMismatch(undefined);
      setLoading(false);
      return;
    }

    // Check if the user has already granted access
    let allowed = false;
    try {
      const result = await isAllowed();
      allowed = typeof result === 'object' ? result.isAllowed : (result as boolean);
    } catch {
      allowed = false;
    }

    if (!allowed) {
      setConnected(false);
      setPublicKey(undefined);
      setNetworkMismatch(undefined);
      setLoading(false);
      return;
    }

    // Retrieve public key and network
    try {
      const [pkResult, networkResult] = await Promise.all([
        getPublicKey(),
        getNetwork(),
      ]);

      const pk: string =
        typeof pkResult === 'object' && pkResult !== null && 'publicKey' in pkResult
          ? (pkResult as { publicKey: string }).publicKey
          : (pkResult as string);

      const network: string =
        typeof networkResult === 'object' && networkResult !== null && 'network' in networkResult
          ? (networkResult as { network: string }).network
          : (networkResult as string);

      setPublicKey(pk);
      setConnected(true);
      setNetworkMismatch(network.toUpperCase() !== EXPECTED_NETWORK);
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      setConnected(false);
      setPublicKey(undefined);
      setNetworkMismatch(undefined);
    }

    setLoading(false);
  }, []);

  /** Auto-reconnect if the user was previously connected */
  useEffect(() => {
    const wasConnected = localStorage.getItem(STORAGE_KEY) === 'true';
    if (wasConnected) {
      syncState();
    } else {
      // Still probe for installed state
      isConnected()
        .then((r) => {
          const ok = typeof r === 'object' ? r.isConnected : (r as boolean);
          setInstalled(ok);
        })
        .catch(() => setInstalled(false))
        .finally(() => setLoading(false));
    }
  }, [syncState]);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await requestAccess();
      const pk: string =
        typeof result === 'object' && result !== null && 'publicKey' in result
          ? (result as { publicKey: string }).publicKey
          : (result as string);

      if (!pk) {
        setError('user_rejected');
        setConnected(false);
        setLoading(false);
        return;
      }

      await syncState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied')) {
        setError('user_rejected');
      } else {
        setError('unknown');
      }
      setConnected(false);
      setLoading(false);
    }
  }, [syncState]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConnected(false);
    setPublicKey(undefined);
    setNetworkMismatch(undefined);
    setError(undefined);
  }, []);

  return {
    installed,
    connected,
    publicKey,
    networkMismatch,
    error,
    loading,
    connect,
    disconnect,
  };
}

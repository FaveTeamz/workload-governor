import { useState, useEffect } from 'react';
import {
  isConnected as freighterIsConnected,
  getAddress as freighterGetAddress,
  getNetwork as freighterGetNetwork,
} from '@stellar/freighter-api';

const STORAGE_KEY = 'wg_wallet_pubkey';

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

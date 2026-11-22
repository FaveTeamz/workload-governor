import React, { createContext, useContext } from 'react';
import { useWallet } from '../hooks/useWallet';
import type { UseWallet } from '../hooks/useWallet';

// Re-export the type so consumers can import from context directly
export type { UseWallet };

const WalletContext = createContext<UseWallet | null>(null);

/**
 * WalletProvider wraps the app (or a subtree) and makes the wallet state
 * available to any descendant via `useWalletContext()`.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

/**
 * Consume the wallet context. Throws if called outside a `<WalletProvider>`.
 */
export function useWalletContext(): UseWallet {
  const ctx = useContext(WalletContext);
  if (ctx === null) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return ctx;
}

export { WalletContext };

import { useState, useEffect } from "react";
import { useWallet } from "./useWallet";

export type AuthStatus = "loading" | "authorized" | "forbidden" | "no-wallet";

/**
 * Checks whether the connected wallet holds a maintainer role for `orgId`.
 *
 * In production replace `checkMaintainerRole` with a real contract query
 * (`is_maintainer` view call).  The hook is kept thin so swapping is trivial.
 */
async function checkMaintainerRole(
  publicKey: string,
  orgId: string
): Promise<boolean> {
  // TODO: replace with real Soroban contract view call
  // e.g. StellarSdk.rpc.simulateTransaction(...)
  const mocked = localStorage.getItem(`wg_maintainer_${orgId}`);
  if (mocked !== null) return mocked === publicKey;
  // Default: deny (safe default)
  return false;
}

export function useMaintainerAuth(orgId: string): AuthStatus {
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    if (!publicKey) {
      setStatus("no-wallet");
      return;
    }
    setStatus("loading");
    let cancelled = false;
    checkMaintainerRole(publicKey, orgId).then((ok) => {
      if (!cancelled) setStatus(ok ? "authorized" : "forbidden");
    });
    return () => { cancelled = true; };
  }, [publicKey, orgId]);

  return status;
}

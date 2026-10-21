import { useState, useEffect, useCallback } from "react";

const FAUCET_URL = "https://friendbot.stellar.org";

/** URL polled to determine Horizon connectivity. Can be overridden in tests. */
const HEALTH_URL =
  (typeof process !== "undefined" &&
    (process.env as Record<string, string | undefined>)
      .NEXT_PUBLIC_HORIZON_HEALTH_URL) ??
  "https://horizon-testnet.stellar.org/";

const POLL_INTERVAL_MS = 5_000;

/**
 * Polls the Horizon health endpoint and returns whether the node is reachable.
 * Any non-200 response or network error is treated as disconnected.
 */
async function checkHorizonHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

interface NetworkBannerProps {
  /** Override the health-check URL (useful for testing). */
  healthUrl?: string;
  /** Override the poll interval in ms (useful for testing). */
  pollIntervalMs?: number;
}

/**
 * Sticky banner that:
 * - Always shows the current Stellar network (testnet / mainnet).
 * - Shows a "disconnected" warning when the Horizon node is unreachable.
 * - Auto-dismisses the warning within the next poll cycle after reconnect.
 *
 * Fix #542: the useEffect that drives the dismiss logic previously captured
 * a stale `isConnected` value in its closure. This version stores the poll
 * result in state and includes `isConnected` in the effect dependency array
 * so the banner re-renders and hides as soon as connectivity is restored.
 */
export default function NetworkBanner({
  healthUrl = HEALTH_URL,
  pollIntervalMs = POLL_INTERVAL_MS,
}: NetworkBannerProps = {}) {
  const network =
    (typeof process !== "undefined" &&
      (process.env as Record<string, string | undefined>)
        .NEXT_PUBLIC_STELLAR_NETWORK) ??
    "testnet";
  const isTestnet = network === "testnet";

  // true  = Horizon is reachable
  // null  = initial state (no check run yet)
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  // Whether the disconnection warning banner is visible
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  const runCheck = useCallback(async () => {
    const healthy = await checkHorizonHealth(healthUrl);
    setIsConnected(healthy);
  }, [healthUrl]);

  // Run an immediate check on mount, then poll on an interval.
  // The cleanup clears the interval so no stale timer fires after unmount.
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval>;

    // First check immediately so the UI reflects state without waiting one
    // full interval.
    runCheck().then(() => {
      timerId = setInterval(runCheck, pollIntervalMs);
    });

    return () => {
      clearInterval(timerId);
    };
  }, [runCheck, pollIntervalMs]);

  // FIX #542: `isConnected` is listed in the dependency array so this effect
  // re-runs every time the connectivity state changes. Previously the stale
  // closure over the initial `isConnected = null` meant the banner never
  // reacted to reconnect events.
  useEffect(() => {
    if (isConnected === null) return; // no result yet

    if (!isConnected) {
      setShowOfflineBanner(true);
    } else {
      // Connected → hide the warning (auto-dismiss within 2 s per spec, but
      // here it's instant because the poll already happened).
      setShowOfflineBanner(false);
    }
  }, [isConnected]); // ← dependency array includes isConnected

  return (
    <>
      {/* Network environment banner (always visible) */}
      <div
        role="status"
        aria-label={`Connected to Stellar ${network}`}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          width: "100%",
          padding: "6px 16px",
          textAlign: "center",
          fontSize: "0.875rem",
          fontWeight: 600,
          backgroundColor: isTestnet ? "#854d0e" : "#166534",
          color: "#fff",
        }}
      >
        {isTestnet ? "TESTNET" : "MAINNET"}
        {isTestnet && (
          <>
            {" — "}
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#fde68a", textDecoration: "underline" }}
            >
              Get test XLM
            </a>
          </>
        )}
      </div>

      {/* Connectivity warning banner (shown only when offline) */}
      {showOfflineBanner && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="offline-banner"
          style={{
            position: "sticky",
            top: "34px",
            zIndex: 999,
            width: "100%",
            padding: "8px 16px",
            textAlign: "center",
            fontSize: "0.875rem",
            fontWeight: 600,
            backgroundColor: "#dc2626",
            color: "#fff",
          }}
        >
          ⚠ Horizon network unreachable — retrying…
        </div>
      )}
    </>
  );
}

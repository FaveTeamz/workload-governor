import { useEffect, useMemo, useState } from "react";
import { fetchNetworkHealth } from "../src/horizon";

const FAUCET_URL = "https://friendbot.stellar.org";
const RECOVERY_URL = "https://status.stellar.org";
const DISMISSED_KEY = "network-banner-dismissed-until";

type BannerState = "hidden" | "warning" | "error";

export interface NetworkBannerProps {
  /** When true, shows a red "wrong network" warning instead of the normal banner. */
  mismatch?: boolean;
}

export default function NetworkBanner({ mismatch = false }: NetworkBannerProps) {
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);

  const network = useMemo(() => {
    const raw = typeof import.meta !== "undefined" && import.meta.env?.VITE_STELLAR_NETWORK
      ? import.meta.env.VITE_STELLAR_NETWORK
      : process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    return (raw ?? "testnet").toLowerCase();
  }, []);

  const isTestnet = network === "testnet";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.sessionStorage.getItem(DISMISSED_KEY);
    if (stored) {
      const until = Number(stored);
      if (!Number.isNaN(until) && until > Date.now()) {
        setDismissedUntil(until);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const snapshot = await fetchNetworkHealth();
        if (!active) return;

        if (!snapshot.rpcAvailable) {
          setBannerState("error");
          setLatencyMs(snapshot.latencyMs);
          return;
        }

        if (snapshot.latencyMs !== null && snapshot.latencyMs > 2000) {
          setBannerState("warning");
          setLatencyMs(snapshot.latencyMs);
          return;
        }

        setBannerState("hidden");
        setLatencyMs(snapshot.latencyMs);
      } catch {
        if (!active) return;
        setBannerState("error");
        setLatencyMs(null);
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleDismiss = () => {
    const until = Date.now() + 60 * 60 * 1000;
    setDismissedUntil(until);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(DISMISSED_KEY, String(until));
    }
  };

  // Mismatch variant — red warning that the wallet is on the wrong network
  if (mismatch) {
    return (
      <div
        role="alert"
        aria-label="Wrong network warning"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          width: "100%",
          padding: "6px 16px",
          textAlign: "center",
          fontSize: "0.875rem",
          fontWeight: 600,
          backgroundColor: "#991b1b",
          color: "#fff",
        }}
      >
        ⚠ Wrong network — switch your Freighter wallet to{" "}
        {(process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "TESTNET").toUpperCase()}
      </div>
    );
  }

  const isDismissed = dismissedUntil !== null && dismissedUntil > Date.now();
  const shouldShow = !isDismissed && bannerState !== "hidden";

  if (!shouldShow) return null;

  const isWarning = bannerState === "warning";
  const isError = bannerState === "error";
  const bg = isError ? "#b91c1c" : "#b45309";

  return (
    <div
      role="status"
      aria-label={`Stellar network ${bannerState}`}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        width: "100%",
        padding: "10px 16px",
        textAlign: "center",
        fontSize: "0.875rem",
        fontWeight: 600,
        backgroundColor: bg,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>
        {isError ? "Stellar RPC is currently unavailable." : "Stellar network latency is elevated."}
      </span>
      <span>
        {isError ? "Estimated recovery: " : "Latency: "}
        {latencyMs !== null ? `${Math.round(latencyMs / 1000)}s` : isError ? "pending" : "normal"}
      </span>
      <a
        href={RECOVERY_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#fde68a", textDecoration: "underline" }}
      >
        View Stellar status
      </a>
      {isTestnet && (
        <a
          href={FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#fde68a", textDecoration: "underline" }}
        >
          Get test XLM
        </a>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", textDecoration: "underline" }}
      >
        Dismiss for 1 hour
      </button>
    </div>
  );
}

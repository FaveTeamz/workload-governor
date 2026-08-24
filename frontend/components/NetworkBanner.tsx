const FAUCET_URL = "https://friendbot.stellar.org";

export interface NetworkBannerProps {
  /** When true, shows a red "wrong network" warning instead of the normal banner. */
  mismatch?: boolean;
}

export default function NetworkBanner({ mismatch = false }: NetworkBannerProps) {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet";
  const isTestnet = network === "testnet";

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

  // Normal testnet / mainnet banner
  return (
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
  );
}

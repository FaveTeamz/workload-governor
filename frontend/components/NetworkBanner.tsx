const FAUCET_URL = "https://friendbot.stellar.org";

export default function NetworkBanner() {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet";
  const isTestnet = network === "testnet";

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

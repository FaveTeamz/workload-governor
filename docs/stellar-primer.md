# Stellar Ecosystem Primer

A quick-start reference for contributors new to Stellar, Soroban, and Freighter.

---

## Stellar Network

**Stellar** is a public, open-source blockchain designed for fast, low-cost payments and asset transfers. Key concepts:

- **Lumens (XLM)** – The native asset of the Stellar network. XLM is used to pay transaction fees and to fund account minimum reserves (currently 1 XLM base + 0.5 XLM per entry).
- **Accounts** – Identified by a 56-character public key (e.g. `GABC...`). Each account holds balances, sequence numbers, and signers. An account must hold the minimum XLM reserve to exist on-chain.
- **Transactions** – A bundle of up to 100 operations (payments, contract invocations, etc.) submitted atomically. Every transaction references the source account's current sequence number, ensuring replay protection. Fees are paid in XLM (stroop = 0.0000001 XLM).
- **Consensus** – Stellar uses the Stellar Consensus Protocol (SCP), a federated Byzantine agreement model. Ledgers close in ~5 seconds with finality—no forks.

📖 [Stellar developer docs](https://developers.stellar.org/docs)

---

## Soroban Smart Contracts

**Soroban** is Stellar's smart-contract platform, introduced in Protocol 20.

- **WASM** – Contracts are compiled to WebAssembly (`wasm32v1-none` target). The WASM binary is uploaded to the network once and referenced by its hash. This contract is built with `stellar contract build`.
- **Contract invocations** – Calling a contract function is a Stellar transaction operation (`InvokeContractOp`). Arguments are encoded as XDR `ScVal` types (addresses, symbols, integers, etc.).
- **Resource fees** – Soroban adds a resource fee model on top of the base transaction fee. Resources are metered per invocation: CPU instructions, memory, ledger reads/writes, and event bytes. Unused resource budget is refunded. The `stellar contract invoke` CLI estimates fees automatically.
- **Storage tiers** – Soroban has three storage tiers:
  - **Temporary** – Cheap, expires after a configurable TTL (used for application entries and global counts in this contract).
  - **Persistent** – More expensive, survives ledger archival via TTL extension (used for admin, maintainer, and assignment records).
  - **Instance** – Scoped to the contract instance; renewed with the instance TTL.

📖 [Soroban smart contracts docs](https://developers.stellar.org/docs/build/smart-contracts/overview)  
📖 [Soroban storage & TTL](https://developers.stellar.org/docs/build/smart-contracts/storage-ttl)  
📖 [Resource fees](https://developers.stellar.org/docs/build/smart-contracts/resource-fee)

---

## Freighter Wallet

**Freighter** is the official Stellar browser-extension wallet (available for Chrome/Firefox). It is the primary signing surface for web front-ends integrating with this contract.

- **Signing** – Freighter holds the user's private key locally. When a dApp requests a transaction, Freighter prompts the user to approve and returns a signed XDR envelope. The dApp then submits it to Horizon/RPC.
- **Testnet vs Mainnet** – Freighter can be switched between networks in its settings. **Testnet** XLM is free via the [Stellar friendbot](https://friendbot.stellar.org). Always test on testnet before mainnet. Contract IDs differ between networks—never mix them.
- **`@stellar/freighter-api`** – The npm package for dApp integration: `isConnected()`, `getPublicKey()`, `signTransaction()`.

📖 [Freighter docs](https://docs.freighter.app)  
📖 [Freighter API reference](https://docs.freighter.app/docs/guide/usingFreighterWebApp)

---

## Further Reading

| Topic | Link |
|---|---|
| Stellar concepts overview | https://developers.stellar.org/docs/learn/fundamentals |
| Soroban getting started | https://developers.stellar.org/docs/build/smart-contracts/getting-started |
| Stellar CLI reference | https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli |
| Horizon API | https://developers.stellar.org/docs/data/horizon |
| Soroban RPC | https://developers.stellar.org/docs/data/rpc |
| Testnet friendbot | https://friendbot.stellar.org |

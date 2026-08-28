/**
 * soroban.ts — Soroban RPC client helpers
 *
 * Provides:
 *   - A configured SorobanRpc.Server instance
 *   - extendApplicationTtl() — calls the WorkloadGovernor contract
 *   - getLatestLedger()      — used by the health check
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import logger from "./logger.js";

// ─── Configuration ─────────────────────────────────────────────────────────

const RPC_URL      = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE ??
  StellarSdk.Networks.TESTNET;
const CONTRACT_ID  = process.env.CONTRACT_ID ?? "";
const SOURCE_SECRET = process.env.SOROBAN_SOURCE_SECRET ?? "";

// ─── Server instance ────────────────────────────────────────────────────────

export const rpcServer = new StellarSdk.SorobanRpc.Server(RPC_URL, { allowHttp: true });

// ─── Health probe ────────────────────────────────────────────────────────────

/**
 * Fetch the latest ledger sequence.
 * Used by the health check to verify the RPC node is responding.
 */
export async function getLatestLedger(): Promise<number> {
  const resp = await rpcServer.getLatestLedger();
  return resp.sequence;
}

// ─── TTL extension ───────────────────────────────────────────────────────────

export interface ApplicationRef {
  contributor: string; // Stellar G-address
  orgId: string;       // Symbol — max 9 chars, alphanumeric + _
  issueId: number;     // u32
}

/**
 * Submit a batch of extend_application_ttl calls in a single transaction.
 *
 * The WorkloadGovernor contract exposes:
 *   extend_application_ttl(contributor: Address, org_id: Symbol, issue_id: u32)
 *
 * We invoke it once per application in the batch.
 * Returns the transaction hash on success.
 *
 * @throws if the transaction fails or the source account is not configured
 */
export async function extendApplicationTtlBatch(
  applications: ApplicationRef[],
): Promise<string> {
  if (!SOURCE_SECRET) {
    throw new Error("SOROBAN_SOURCE_SECRET is not set — cannot submit transactions");
  }
  if (!CONTRACT_ID) {
    throw new Error("CONTRACT_ID is not set");
  }
  if (applications.length === 0) {
    throw new Error("extendApplicationTtlBatch called with empty batch");
  }

  const sourceKeypair = StellarSdk.Keypair.fromSecret(SOURCE_SECRET);
  const sourceAccount = await rpcServer.getAccount(sourceKeypair.publicKey());

  // Build one operation per application in the batch
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const operations = applications.map(({ contributor, orgId, issueId }) =>
    contract.call(
      "extend_application_ttl",
      StellarSdk.nativeToScVal(contributor, { type: "address" }),
      StellarSdk.nativeToScVal(orgId,        { type: "symbol"  }),
      StellarSdk.nativeToScVal(issueId,      { type: "u32"     }),
    ),
  );

  let txBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  for (const op of operations) {
    txBuilder = txBuilder.addOperation(op);
  }

  const tx = txBuilder.setTimeout(30).build();

  // Simulate to get the resource footprint
  const simResult = await rpcServer.simulateTransaction(tx);
  if (StellarSdk.SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(sourceKeypair);

  const sendResult = await rpcServer.sendTransaction(preparedTx);
  if (sendResult.status === "ERROR") {
    throw new Error(`Transaction rejected: ${sendResult.errorResult?.toXDR("base64")}`);
  }

  const hash = sendResult.hash;

  // Poll for confirmation
  let getResult = await rpcServer.getTransaction(hash);
  for (let i = 0; i < 30 && getResult.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1_000));
    getResult = await rpcServer.getTransaction(hash);
  }

  if (getResult.status === "FAILED") {
    throw new Error(`Transaction ${hash} failed on-chain`);
  }

  logger.info({ hash, batchSize: applications.length }, "TTL extension batch confirmed");
  return hash;
}

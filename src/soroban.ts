import {
  SorobanRpc,
  Contract,
  Networks,
  TransactionBuilder,
  Account,
  Address,
  nativeToScVal,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';

export interface ResourceEstimate {
  fee: string;
  instructions: number;
  readBytes: number;
  writeBytes: number;
}

const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
const CONTRACT_ID =
  process.env.CONTRACT_ID ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

export class SorobanService {
  private server: SorobanRpc.Server;
  private contract: Contract;

  constructor(rpcUrl = 'https://soroban-testnet.stellar.org') {
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: true });
    this.contract = new Contract(CONTRACT_ID);
  }

  /** Build a raw (unsigned, pre-simulated) transaction and return its XDR. */
  private buildRaw(
    sourceAddress: string,
    sequence: string,
    fnName: string,
    args: xdr.ScVal[],
  ): Transaction {
    const account = new Account(sourceAddress, sequence);
    return new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK,
    })
      .addOperation(this.contract.call(fnName, ...args))
      .setTimeout(30)
      .build();
  }

  async simulate(tx: Transaction): Promise<ResourceEstimate> {
    const result = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(result.error);
    }
    const sim = result as SorobanRpc.Api.SimulateTransactionSuccessResponse;
    return {
      fee: sim.minResourceFee,
      instructions: sim.transactionData.build().resources().instructions(),
      readBytes: sim.transactionData.build().resources().readBytes(),
      writeBytes: sim.transactionData.build().resources().writeBytes(),
    };
  }

  buildApplyTx(
    contributor: string,
    orgId: string,
    issueId: number,
    sequence: string,
  ): Transaction {
    return this.buildRaw(contributor, sequence, 'apply_for_issue', [
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
      nativeToScVal(issueId, { type: 'u32' }),
    ]);
  }

  buildWithdrawTx(
    contributor: string,
    orgId: string,
    issueId: number,
    sequence: string,
  ): Transaction {
    return this.buildRaw(contributor, sequence, 'withdraw_application', [
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
      nativeToScVal(issueId, { type: 'u32' }),
    ]);
  }

  buildAssignTx(
    maintainer: string,
    contributor: string,
    orgId: string,
    issueId: number,
    sequence: string,
  ): Transaction {
    return this.buildRaw(maintainer, sequence, 'assign_issue', [
      new Address(maintainer).toScVal(),
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
      nativeToScVal(issueId, { type: 'u32' }),
    ]);
  }

  buildCompleteTx(
    maintainer: string,
    contributor: string,
    orgId: string,
    issueId: number,
    sequence: string,
  ): Transaction {
    return this.buildRaw(maintainer, sequence, 'complete_assignment', [
      new Address(maintainer).toScVal(),
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
      nativeToScVal(issueId, { type: 'u32' }),
    ]);
  }

  buildRevokeTx(
    maintainer: string,
    contributor: string,
    orgId: string,
    issueId: number,
    sequence: string,
  ): Transaction {
    return this.buildRaw(maintainer, sequence, 'revoke_assignment', [
      new Address(maintainer).toScVal(),
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
      nativeToScVal(issueId, { type: 'u32' }),
    ]);
  }
}

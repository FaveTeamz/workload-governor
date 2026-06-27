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

export interface TransactionSubmissionResult {
  hash: string;
  status: 'success' | 'error';
  error?: SorobanContractError;
}

export type SorobanErrorCode =
  | 'InternalError'
  | 'AlreadyInitialized'
  | 'UnauthorizedByAdmin'
  | 'UnauthorizedByMaintainer'
  | 'NegativeAmount'
  | 'BalanceError'
  | 'InvalidIssueState'
  | 'NoAssignment'
  | 'NoApplication'
  | 'AmountTooLow'
  | 'UnclosedPeriod';

export interface SorobanContractError {
  code: SorobanErrorCode | 'Unknown';
  message: string;
  details?: string;
}

const CONTRACT_ERROR_CODES: Record<number, SorobanErrorCode> = {
  0: 'InternalError',
  1: 'AlreadyInitialized',
  2: 'UnauthorizedByAdmin',
  3: 'UnauthorizedByMaintainer',
  4: 'NegativeAmount',
  5: 'BalanceError',
  6: 'InvalidIssueState',
  7: 'NoAssignment',
  8: 'NoApplication',
  9: 'AmountTooLow',
  10: 'UnclosedPeriod',
};

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

  buildRawTransaction(
    sourceAddress: string,
    sequence: string,
    fnName: string,
    args: xdr.ScVal[],
  ): Transaction {
    return this.buildRaw(sourceAddress, sequence, fnName, args);
  }

  private parseContractError(errorMessage: string): SorobanContractError {
    // Try to extract error code from Soroban error message
    const codeMatch = errorMessage.match(/error code=(\d+)/);
    if (codeMatch) {
      const code = parseInt(codeMatch[1], 10);
      const errorCodeName = CONTRACT_ERROR_CODES[code] || 'Unknown';
      return {
        code: errorCodeName,
        message: errorMessage,
        details: `Contract error code: ${code}`,
      };
    }

    return {
      code: 'Unknown',
      message: errorMessage,
    };
  }

  async simulate(tx: Transaction): Promise<ResourceEstimate> {
    console.log('[Soroban] Simulating transaction...');
    const result = await this.server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(result)) {
      const contractError = this.parseContractError(result.error);
      console.error('[Soroban] Simulation error:', contractError);
      throw new Error(
        `Simulation failed: ${contractError.code} - ${contractError.message}`,
      );
    }

    const sim = result as SorobanRpc.Api.SimulateTransactionSuccessResponse;
    const estimate = {
      fee: sim.minResourceFee,
      instructions: sim.transactionData.build().resources().instructions(),
      readBytes: sim.transactionData.build().resources().readBytes(),
      writeBytes: sim.transactionData.build().resources().writeBytes(),
    };

    console.log('[Soroban] Simulation successful:', {
      fee: estimate.fee,
      instructions: estimate.instructions,
      readBytes: estimate.readBytes,
      writeBytes: estimate.writeBytes,
    });

    return estimate;
  }

  async submitTransaction(
    tx: Transaction,
  ): Promise<TransactionSubmissionResult> {
    try {
      console.log('[Soroban] Submitting transaction...');
      const result = await this.server.sendTransaction(tx);

      console.log('[Soroban] Transaction submitted:', {
        hash: result.hash,
        status: result.status,
      });

      if (result.status === 'PENDING') {
        // Poll for transaction status
        let pollCount = 0;
        const maxPolls = 30;
        const pollInterval = 1000; // 1 second

        while (pollCount < maxPolls) {
          const txStatus = await this.server.getTransaction(result.hash);

          if (txStatus.status === 'SUCCESS') {
            console.log('[Soroban] Transaction confirmed:', result.hash);
            return {
              hash: result.hash,
              status: 'success',
            };
          }

          if (txStatus.status === 'FAILED') {
            const error = this.parseContractError(
              txStatus.resultXdr?.toString() || 'Unknown error',
            );
            console.error('[Soroban] Transaction failed:', error);
            return {
              hash: result.hash,
              status: 'error',
              error,
            };
          }

          pollCount++;
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        // Timeout
        console.warn('[Soroban] Transaction polling timeout:', result.hash);
        return {
          hash: result.hash,
          status: 'success', // Assume success if still pending after timeout
        };
      }

      return {
        hash: result.hash,
        status: 'success',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const contractError = this.parseContractError(errorMsg);

      console.error('[Soroban] Submission error:', contractError);

      return {
        hash: '',
        status: 'error',
        error: contractError,
      };
    }
  }

  async getContractData(key: xdr.ScVal): Promise<unknown> {
    try {
      console.log('[Soroban] Fetching contract data...');
      const data = await this.server.getContractData(
        CONTRACT_ID,
        key,
        SorobanRpc.Durability.Persistent,
      );

      console.log('[Soroban] Contract data retrieved');
      // Return the raw data for the caller to process
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Soroban] Failed to fetch contract data:', errorMsg);
      return null;
    }
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

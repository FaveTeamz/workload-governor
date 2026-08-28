import {
  SorobanRpc,
  Contract,
  Networks,
  TransactionBuilder,
  Account,
  Address,
  nativeToScVal,
  scValToNative,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';

export interface ResourceEstimate {
  fee: string;
  instructions: number;
  readBytes: number;
  writeBytes: number;
}

/** Fee breakdown returned by estimateFee(), with XLM-denominated values. */
export interface FeeEstimate {
  /** Base network fee in XLM (fixed per-operation fee). */
  base_fee_xlm: string;
  /** Resource fee in XLM, with 20% cushion applied. */
  resource_fee_xlm: string;
  /** Total fee in XLM (base + cushioned resource fee). */
  total_fee_xlm: string;
  /** Cushion percentage applied to the resource fee (always 20). */
  fee_cushion_pct: number;
}

/**
 * Contract functions supported by estimateFee().
 * Kept as a const tuple so callers can do type-safe membership checks.
 */
export const SUPPORTED_FUNCTIONS = [
  'apply_for_issue',
  'withdraw_application',
  'assign_issue',
  'complete_assignment',
  'revoke_assignment',
] as const;

export type SupportedFunction = (typeof SUPPORTED_FUNCTIONS)[number];

/** Stroops per XLM. */
const STROOPS_PER_XLM = 10_000_000n;

/** Dummy G-address used as the source for fee-estimation transactions. */
const FEE_ESTIMATE_SOURCE =
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

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

// ─── Typed error classes for read functions ───────────────────────────────────

/**
 * Thrown when the Soroban RPC node returns a network-level error (connection
 * refused, timeout, non-200 HTTP status, etc.).
 */
export class SorobanRpcError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SorobanRpcError';
  }
}

/**
 * Thrown when the RPC response is received successfully but its payload
 * cannot be parsed into the expected type (missing fields, wrong ScVal type,
 * null retval, etc.).
 */
export class SorobanParseError extends Error {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'SorobanParseError';
  }
}

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

  async getAccountSequence(address: string): Promise<string> {
    try {
      const account = await this.server.getAccount(address);
      return typeof account.sequenceNumber === 'function'
        ? account.sequenceNumber()
        : (account as any).sequence ?? '1';
    } catch {
      return '1';
    }
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

  /**
   * Estimate the transaction fee for a given contract function name.
   *
   * Builds a representative dummy transaction (with placeholder argument
   * values) and runs simulateTransaction to obtain the real resource fee
   * from the Soroban RPC node.  A 20% cushion is added to the resource fee
   * to reduce the chance of fee-insufficient errors under network congestion.
   *
   * @param fnName - One of the {@link SUPPORTED_FUNCTIONS} values.
   * @returns A {@link FeeEstimate} with all amounts denominated in XLM.
   * @throws Error if `fnName` is not in SUPPORTED_FUNCTIONS or simulation fails.
   */
  async estimateFee(fnName: SupportedFunction): Promise<FeeEstimate> {
    // Build a dummy placeholder transaction for the requested function.
    // We use a fixed dummy contributor / maintainer address so no real
    // account is needed for the simulation (simulate-only calls never
    // debit the source account).
    const dummy = FEE_ESTIMATE_SOURCE;
    const dummyOrg = 'sample_org';
    const dummyIssue = 1;
    const dummySeq = '0';

    let tx: Transaction;
    switch (fnName) {
      case 'apply_for_issue':
        tx = this.buildApplyTx(dummy, dummyOrg, dummyIssue, dummySeq);
        break;
      case 'withdraw_application':
        tx = this.buildWithdrawTx(dummy, dummyOrg, dummyIssue, dummySeq);
        break;
      case 'assign_issue':
        tx = this.buildAssignTx(dummy, dummy, dummyOrg, dummyIssue, dummySeq);
        break;
      case 'complete_assignment':
        tx = this.buildCompleteTx(dummy, dummy, dummyOrg, dummyIssue, dummySeq);
        break;
      case 'revoke_assignment':
        tx = this.buildRevokeTx(dummy, dummy, dummyOrg, dummyIssue, dummySeq);
        break;
    }

    const estimate = await this.simulate(tx);

    // Base fee is the fixed 100 stroops set in TransactionBuilder (per
    // operation).  Resource fee comes from the simulation.
    const BASE_FEE_STROOPS = 100n;
    const CUSHION_PCT = 20;

    const resourceFeeStroops = BigInt(estimate.fee);
    const cushionedResourceFeeStroops =
      resourceFeeStroops + (resourceFeeStroops * BigInt(CUSHION_PCT)) / 100n;

    const toXlm = (stroops: bigint): string => {
      const whole = stroops / STROOPS_PER_XLM;
      const frac = stroops % STROOPS_PER_XLM;
      // Zero-pad fractional part to 7 digits and strip trailing zeros.
      const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '') || '0';
      return `${whole}.${fracStr}`;
    };

    const baseFeeXlm = toXlm(BASE_FEE_STROOPS);
    const resourceFeeXlm = toXlm(cushionedResourceFeeStroops);
    const totalFeeXlm = toXlm(BASE_FEE_STROOPS + cushionedResourceFeeStroops);

    return {
      base_fee_xlm: baseFeeXlm,
      resource_fee_xlm: resourceFeeXlm,
      total_fee_xlm: totalFeeXlm,
      fee_cushion_pct: CUSHION_PCT,
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

  // ─── Read-only contract query helpers ───────────────────────────────────────
  //
  // These helpers submit a simulate-only call (no fee, no sequence bump) and
  // parse the return value.  They throw typed errors so callers can distinguish
  // network failures (SorobanRpcError) from bad payloads (SorobanParseError).

  /**
   * Call a read-only contract function and return the simulation retval as a
   * native JS value.
   *
   * @throws SorobanRpcError on network / RPC failure
   * @throws SorobanParseError when the response cannot be decoded
   */
  private async callReadOnly(
    fnName: string,
    args: xdr.ScVal[],
    callerAddress?: string,
  ): Promise<unknown> {
    // Use a canonical Stellar testnet account as the source for read-only simulations.
    // Any valid Stellar G-address works — the account does not need to exist on-chain
    // for simulate-only calls.
    const sourceAddress =
      callerAddress ?? 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
    const dummyAccount = new Account(sourceAddress, '0');
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: NETWORK,
    })
      .addOperation(this.contract.call(fnName, ...args))
      .setTimeout(30)
      .build();

    let result: SorobanRpc.Api.SimulateTransactionResponse;
    try {
      result = await this.server.simulateTransaction(tx);
    } catch (err) {
      throw new SorobanRpcError(
        `RPC network error calling ${fnName}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new SorobanRpcError(
        `RPC simulation error for ${fnName}: ${result.error}`,
        result,
      );
    }

    const success = result as SorobanRpc.Api.SimulateTransactionSuccessResponse;
    if (!success.result?.retval) {
      throw new SorobanParseError(
        `No retval in simulation response for ${fnName}`,
        result,
      );
    }

    try {
      return scValToNative(success.result.retval);
    } catch (err) {
      throw new SorobanParseError(
        `Failed to parse retval for ${fnName}: ${err instanceof Error ? err.message : String(err)}`,
        success.result.retval,
      );
    }
  }

  /**
   * Query the global pending-application count for a contributor.
   *
   * Maps to contract function: `get_global_application_count(contributor: Address) → u32`
   *
   * @throws SorobanRpcError on network failure
   * @throws SorobanParseError when the response cannot be decoded as a number
   */
  async getGlobalApplicationCount(contributor: string): Promise<number> {
    const raw = await this.callReadOnly('get_global_application_count', [
      new Address(contributor).toScVal(),
    ], contributor);
    if (typeof raw !== 'number' && typeof raw !== 'bigint') {
      throw new SorobanParseError(
        `Expected u32 for get_global_application_count, got ${typeof raw}`,
        raw,
      );
    }
    return Number(raw);
  }

  /**
   * Query the active-assignment count for a contributor within a specific org.
   *
   * Maps to contract function: `get_org_assignment_count(contributor: Address, org_id: Symbol) → u32`
   *
   * @throws SorobanRpcError on network failure
   * @throws SorobanParseError when the response cannot be decoded as a number
   */
  async getOrgAssignmentCount(contributor: string, orgId: string): Promise<number> {
    const raw = await this.callReadOnly('get_org_assignment_count', [
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
    ], contributor);
    if (typeof raw !== 'number' && typeof raw !== 'bigint') {
      throw new SorobanParseError(
        `Expected u32 for get_org_assignment_count, got ${typeof raw}`,
        raw,
      );
    }
    return Number(raw);
  }

  /**
   * Check whether a contributor has an active application for a given issue.
   *
   * Maps to contract function: `has_applied(contributor: Address, org_id: Symbol, issue_id: u32) → bool`
   *
   * @throws SorobanRpcError on network failure
   * @throws SorobanParseError when the response cannot be decoded as boolean
   */
  async hasApplied(contributor: string, orgId: string, issueId: number): Promise<boolean> {
    const raw = await this.callReadOnly('has_applied', [
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
      nativeToScVal(issueId, { type: 'u32' }),
    ], contributor);
    if (typeof raw !== 'boolean') {
      throw new SorobanParseError(
        `Expected bool for has_applied, got ${typeof raw}`,
        raw,
      );
    }
    return raw;
  }

  /**
   * Check whether a contributor is actively assigned to a given issue.
   *
   * Maps to contract function: `is_assigned(contributor: Address, org_id: Symbol, issue_id: u32) → bool`
   *
   * @throws SorobanRpcError on network failure
   * @throws SorobanParseError when the response cannot be decoded as boolean
   */
  async isAssigned(contributor: string, orgId: string, issueId: number): Promise<boolean> {
    const raw = await this.callReadOnly('is_assigned', [
      new Address(contributor).toScVal(),
      nativeToScVal(orgId, { type: 'symbol' }),
      nativeToScVal(issueId, { type: 'u32' }),
    ], contributor);
    if (typeof raw !== 'boolean') {
      throw new SorobanParseError(
        `Expected bool for is_assigned, got ${typeof raw}`,
        raw,
      );
    }
    return raw;
  }
}

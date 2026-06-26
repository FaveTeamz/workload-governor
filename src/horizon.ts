import {
  Horizon,
  NotFoundError,
} from '@stellar/stellar-sdk';

export interface AccountData {
  id: string;
  sequence: string;
  subentryCount: number;
  balances: Array<{
    balance: string;
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

export interface TransactionData {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  fee_charged: number;
  operation_count: number;
}

interface ExponentialBackoffOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export class HorizonService {
  private server: Horizon.Server;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(
    horizonUrl?: string,
    backoffOptions: ExponentialBackoffOptions = {},
  ) {
    const url =
      horizonUrl ||
      process.env.STELLAR_HORIZON_URL ||
      'https://horizon-testnet.stellar.org';

    this.server = new Horizon.Server(url);
    this.maxRetries = backoffOptions.maxRetries ?? 5;
    this.initialDelayMs = backoffOptions.initialDelayMs ?? 100;
    this.maxDelayMs = backoffOptions.maxDelayMs ?? 10000;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.initialDelayMs * Math.pow(2, attempt);
    return Math.min(exponentialDelay, this.maxDelayMs);
  }

  async fetchAccount(accountId: string): Promise<AccountData> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const account = await this.server.accounts().accountId(accountId).call();
        return {
          id: account.id,
          sequence: account.sequence,
          subentryCount: account.subentry_count,
          balances: account.balances.map((balance) => {
            const balanceWithOptional = balance as Record<string, unknown>;
            return {
              balance: balance.balance,
              asset_type: balance.asset_type,
              asset_code: balanceWithOptional.asset_code as string | undefined,
              asset_issuer: balanceWithOptional.asset_issuer as string | undefined,
            };
          }),
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new Error(`Account not found: ${accountId}`);
        }

        lastError = error as Error;
        const statusCode = (error as Record<string, unknown>)?.response?.status as number | undefined;

        // Retry on rate limit (429) or service unavailable (503)
        if (statusCode === 429 || statusCode === 503) {
          if (attempt < this.maxRetries - 1) {
            const delay = this.calculateDelay(attempt);
            await this.sleep(delay);
            continue;
          }
        }

        // Don't retry on other network errors
        throw lastError;
      }
    }

    throw (
      lastError || new Error(`Failed to fetch account after ${this.maxRetries} attempts`)
    );
  }

  async fetchTransactionHistory(
    accountId: string,
    limit: number = 10,
  ): Promise<TransactionData[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const transactions = await this.server
          .transactions()
          .forAccount(accountId)
          .limit(limit)
          .order('desc')
          .call();

        return transactions.records.map((tx) => ({
          id: tx.id,
          hash: tx.hash,
          ledger: tx.ledger_attr,
          created_at: tx.created_at,
          fee_charged: typeof tx.fee_charged === 'string'
            ? parseInt(tx.fee_charged, 10)
            : tx.fee_charged,
          operation_count: tx.operation_count,
        }));
      } catch (error) {
        lastError = error as Error;
        const statusCode = (error as Record<string, unknown>)?.response?.status as number | undefined;

        // Retry on rate limit (429) or service unavailable (503)
        if (statusCode === 429 || statusCode === 503) {
          if (attempt < this.maxRetries - 1) {
            const delay = this.calculateDelay(attempt);
            await this.sleep(delay);
            continue;
          }
        }

        throw lastError;
      }
    }

    throw (
      lastError || new Error(`Failed to fetch transactions after ${this.maxRetries} attempts`)
    );
  }

  streamEvents(
    accountId: string,
    onUpdate: (event: Record<string, unknown>) => void,
    onError: (error: Error) => void,
  ): void {
    this.server
      .transactions()
      .forAccount(accountId)
      .stream({
        onmessage: onUpdate as (event: Record<string, unknown>) => void,
        onerror: onError,
      });
  }
}

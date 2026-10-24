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

  private getRetryAfterMs(error: unknown): number | undefined {
    const response = (error as { response?: { headers?: unknown } })?.response;
    const headers = response?.headers as
      | { get?: (name: string) => string | null; [key: string]: unknown }
      | undefined;
    const headerEntry = headers && Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'retry-after',
    );
    const retryAfter = headers?.get?.('retry-after') ?? headerEntry?.[1];

    if (typeof retryAfter !== 'string') return undefined;

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const retryAt = Date.parse(retryAfter);
    return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
  }

  private getRetryDelay(attempt: number, error: unknown, statusCode: number): number {
    const jitteredBackoff = Math.random() * this.calculateDelay(attempt);
    const retryAfter = statusCode === 429 ? this.getRetryAfterMs(error) : undefined;
    return Math.round(jitteredBackoff + (retryAfter ?? 0));
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
            return {
              balance: balance.balance,
              asset_type: balance.asset_type,
              asset_code:
                'asset_code' in balance ? (balance.asset_code as string) : undefined,
              asset_issuer:
                'asset_issuer' in balance ? (balance.asset_issuer as string) : undefined,
            };
          }),
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new Error(`Account not found: ${accountId}`);
        }

        lastError = error as Error;
        const errorResponse = (error as unknown as { response?: { status: number; headers?: Record<string, string> } })?.response;
        const statusCode = typeof errorResponse?.status === 'number' ? errorResponse.status : undefined;

        // Retry on rate limit (429) or service unavailable (503)
        if (statusCode === 429 || statusCode === 503) {
          if (attempt < this.maxRetries - 1) {
            const finalDelay = this.getRetryDelay(attempt, error, statusCode);
            console.warn(`[horizon] Retrying after ${statusCode} (attempt ${attempt + 1}/${this.maxRetries}, delay ${finalDelay}ms)`);
            await this.sleep(finalDelay);
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
        const errorResponse = (error as unknown as { response?: { status: number; headers?: Record<string, string> } })?.response;
        const statusCode = typeof errorResponse?.status === 'number' ? errorResponse.status : undefined;

        // Retry on rate limit (429) or service unavailable (503)
        if (statusCode === 429 || statusCode === 503) {
          if (attempt < this.maxRetries - 1) {
            const finalDelay = this.getRetryDelay(attempt, error, statusCode);
            console.warn(`[horizon] Retrying after ${statusCode} (attempt ${attempt + 1}/${this.maxRetries}, delay ${finalDelay}ms)`);
            await this.sleep(finalDelay);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdate: (event: any) => void,
    onError: (error: Error) => void,
  ): void {
    this.server
      .transactions()
      .forAccount(accountId)
      .stream({
        onmessage: onUpdate,
        onerror: onError,
      });
  }
}

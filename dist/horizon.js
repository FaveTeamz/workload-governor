"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HorizonService = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
class HorizonService {
    constructor(horizonUrl, backoffOptions = {}) {
        const url = horizonUrl ||
            process.env.STELLAR_HORIZON_URL ||
            'https://horizon-testnet.stellar.org';
        this.server = new stellar_sdk_1.Horizon.Server(url);
        this.maxRetries = backoffOptions.maxRetries ?? 5;
        this.initialDelayMs = backoffOptions.initialDelayMs ?? 100;
        this.maxDelayMs = backoffOptions.maxDelayMs ?? 10000;
    }
    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    calculateDelay(attempt) {
        const exponentialDelay = this.initialDelayMs * Math.pow(2, attempt);
        return Math.min(exponentialDelay, this.maxDelayMs);
    }
    async fetchAccount(accountId) {
        let lastError;
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
                            asset_code: 'asset_code' in balance ? balance.asset_code : undefined,
                            asset_issuer: 'asset_issuer' in balance ? balance.asset_issuer : undefined,
                        };
                    }),
                };
            }
            catch (error) {
                if (error instanceof stellar_sdk_1.NotFoundError) {
                    throw new Error(`Account not found: ${accountId}`);
                }
                lastError = error;
                const errorResponse = error?.response?.status;
                const statusCode = typeof errorResponse === 'number' ? errorResponse : undefined;
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
        throw (lastError || new Error(`Failed to fetch account after ${this.maxRetries} attempts`));
    }
    async fetchTransactionHistory(accountId, limit = 10) {
        let lastError;
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
            }
            catch (error) {
                lastError = error;
                const errorResponse = error?.response?.status;
                const statusCode = typeof errorResponse === 'number' ? errorResponse : undefined;
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
        throw (lastError || new Error(`Failed to fetch transactions after ${this.maxRetries} attempts`));
    }
    streamEvents(accountId, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdate, onError) {
        this.server
            .transactions()
            .forAccount(accountId)
            .stream({
            onmessage: onUpdate,
            onerror: onError,
        });
    }
}
exports.HorizonService = HorizonService;

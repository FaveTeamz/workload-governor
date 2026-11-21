"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanService = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const CONTRACT_ERROR_CODES = {
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
const NETWORK = process.env.STELLAR_NETWORK_PASSPHRASE ?? stellar_sdk_1.Networks.TESTNET;
const CONTRACT_ID = process.env.CONTRACT_ID ??
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
class SorobanService {
    constructor(rpcUrl = 'https://soroban-testnet.stellar.org') {
        this.server = new stellar_sdk_1.SorobanRpc.Server(rpcUrl, { allowHttp: true });
        this.contract = new stellar_sdk_1.Contract(CONTRACT_ID);
    }
    /** Build a raw (unsigned, pre-simulated) transaction and return its XDR. */
    buildRaw(sourceAddress, sequence, fnName, args) {
        const account = new stellar_sdk_1.Account(sourceAddress, sequence);
        return new stellar_sdk_1.TransactionBuilder(account, {
            fee: '100',
            networkPassphrase: NETWORK,
        })
            .addOperation(this.contract.call(fnName, ...args))
            .setTimeout(30)
            .build();
    }
    buildRawTransaction(sourceAddress, sequence, fnName, args) {
        return this.buildRaw(sourceAddress, sequence, fnName, args);
    }
    parseContractError(errorMessage) {
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
    async simulate(tx) {
        console.log('[Soroban] Simulating transaction...');
        const result = await this.server.simulateTransaction(tx);
        if (stellar_sdk_1.SorobanRpc.Api.isSimulationError(result)) {
            const contractError = this.parseContractError(result.error);
            console.error('[Soroban] Simulation error:', contractError);
            throw new Error(`Simulation failed: ${contractError.code} - ${contractError.message}`);
        }
        const sim = result;
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
    async submitTransaction(tx) {
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
                        const error = this.parseContractError(txStatus.resultXdr?.toString() || 'Unknown error');
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
        }
        catch (error) {
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
    async getContractData(key) {
        try {
            console.log('[Soroban] Fetching contract data...');
            const data = await this.server.getContractData(CONTRACT_ID, key, stellar_sdk_1.SorobanRpc.Durability.Persistent);
            console.log('[Soroban] Contract data retrieved');
            // Return the raw data for the caller to process
            return data;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('[Soroban] Failed to fetch contract data:', errorMsg);
            return null;
        }
    }
    buildApplyTx(contributor, orgId, issueId, sequence) {
        return this.buildRaw(contributor, sequence, 'apply_for_issue', [
            new stellar_sdk_1.Address(contributor).toScVal(),
            (0, stellar_sdk_1.nativeToScVal)(orgId, { type: 'symbol' }),
            (0, stellar_sdk_1.nativeToScVal)(issueId, { type: 'u32' }),
        ]);
    }
    buildWithdrawTx(contributor, orgId, issueId, sequence) {
        return this.buildRaw(contributor, sequence, 'withdraw_application', [
            new stellar_sdk_1.Address(contributor).toScVal(),
            (0, stellar_sdk_1.nativeToScVal)(orgId, { type: 'symbol' }),
            (0, stellar_sdk_1.nativeToScVal)(issueId, { type: 'u32' }),
        ]);
    }
    buildAssignTx(maintainer, contributor, orgId, issueId, sequence) {
        return this.buildRaw(maintainer, sequence, 'assign_issue', [
            new stellar_sdk_1.Address(maintainer).toScVal(),
            new stellar_sdk_1.Address(contributor).toScVal(),
            (0, stellar_sdk_1.nativeToScVal)(orgId, { type: 'symbol' }),
            (0, stellar_sdk_1.nativeToScVal)(issueId, { type: 'u32' }),
        ]);
    }
    buildCompleteTx(maintainer, contributor, orgId, issueId, sequence) {
        return this.buildRaw(maintainer, sequence, 'complete_assignment', [
            new stellar_sdk_1.Address(maintainer).toScVal(),
            new stellar_sdk_1.Address(contributor).toScVal(),
            (0, stellar_sdk_1.nativeToScVal)(orgId, { type: 'symbol' }),
            (0, stellar_sdk_1.nativeToScVal)(issueId, { type: 'u32' }),
        ]);
    }
    buildRevokeTx(maintainer, contributor, orgId, issueId, sequence) {
        return this.buildRaw(maintainer, sequence, 'revoke_assignment', [
            new stellar_sdk_1.Address(maintainer).toScVal(),
            new stellar_sdk_1.Address(contributor).toScVal(),
            (0, stellar_sdk_1.nativeToScVal)(orgId, { type: 'symbol' }),
            (0, stellar_sdk_1.nativeToScVal)(issueId, { type: 'u32' }),
        ]);
    }
}
exports.SorobanService = SorobanService;

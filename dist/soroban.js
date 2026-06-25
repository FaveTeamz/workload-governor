"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanService = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
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
    async simulate(tx) {
        const result = await this.server.simulateTransaction(tx);
        if (stellar_sdk_1.SorobanRpc.Api.isSimulationError(result)) {
            throw new Error(result.error);
        }
        const sim = result;
        return {
            fee: sim.minResourceFee,
            instructions: sim.transactionData.build().resources().instructions(),
            readBytes: sim.transactionData.build().resources().readBytes(),
            writeBytes: sim.transactionData.build().resources().writeBytes(),
        };
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

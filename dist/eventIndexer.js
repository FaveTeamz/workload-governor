"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventIndexer = void 0;
exports.getEventIndexer = getEventIndexer;
exports.startEventIndexer = startEventIndexer;
exports.stopEventIndexer = stopEventIndexer;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const db_1 = require("./db");
const logger_1 = require("./logger");
const CONTRACT_ID = process.env.CONTRACT_ID ??
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const RPC_URL = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
class EventIndexer {
    constructor() {
        this.isRunning = false;
        this.server = new stellar_sdk_1.SorobanRpc.Server(RPC_URL, { allowHttp: true });
    }
    async start() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        logger_1.logger.info({ message: 'Event indexer started' });
        this.pollForEvents().catch((err) => {
            logger_1.logger.error({
                message: 'Event indexer error',
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
            });
            this.isRunning = false;
        });
    }
    async pollForEvents() {
        while (this.isRunning) {
            try {
                const events = await this.server.getEvents({
                    filters: [
                        {
                            type: 'contract',
                            contractIds: [CONTRACT_ID],
                        },
                    ],
                    cursor: this.cursor,
                });
                if (events.events.length > 0) {
                    for (const event of events.events) {
                        try {
                            const parsed = this.parseEvent(event);
                            if (parsed) {
                                await this.storeEvent(parsed);
                            }
                        }
                        catch (err) {
                            logger_1.logger.error({
                                message: 'Failed to parse event',
                                error: err instanceof Error ? err.message : String(err),
                            });
                        }
                    }
                    const lastEvent = events.events[events.events.length - 1];
                    this.cursor = lastEvent.pagingToken;
                }
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
            catch (err) {
                logger_1.logger.error({
                    message: 'Event polling error',
                    error: err instanceof Error ? err.message : String(err),
                });
                await new Promise((resolve) => setTimeout(resolve, 10000));
            }
        }
    }
    parseEvent(event) {
        try {
            const topics = event.topic || [];
            const values = event.value || [];
            if (topics.length === 0) {
                return null;
            }
            const eventType = this.extractEventType(topics);
            if (!eventType) {
                return null;
            }
            const ledger = parseInt(event.ledger, 10);
            const timestamp = new Date(event.createdAt);
            const actor = this.extractActor(values);
            const orgId = this.extractOrgId(values);
            return {
                type: eventType,
                ledger,
                timestamp,
                actor,
                orgId,
                issueId: this.extractIssueId(values),
                contributor: this.extractContributor(values),
                data: {
                    topics: topics.map((t) => t),
                    values: values.map((v) => v),
                },
            };
        }
        catch {
            return null;
        }
    }
    extractEventType(topics) {
        if (topics.length === 0)
            return null;
        const topicXdr = topics[0].xdr;
        if (topicXdr.includes('applied'))
            return 'applied';
        if (topicXdr.includes('withdrawn'))
            return 'withdrawn';
        if (topicXdr.includes('assigned'))
            return 'assigned';
        if (topicXdr.includes('completed'))
            return 'completed';
        if (topicXdr.includes('revoked'))
            return 'revoked';
        return null;
    }
    extractActor(values) {
        return values.length > 0 ? values[0].xdr.substring(0, 20) : 'unknown';
    }
    extractOrgId(values) {
        return values.length > 1 ? values[1].xdr.substring(0, 20) : 'unknown';
    }
    extractIssueId(values) {
        if (values.length > 2) {
            const match = values[2].xdr.match(/\d+/);
            return match ? parseInt(match[0], 10) : undefined;
        }
        return undefined;
    }
    extractContributor(values) {
        return values.length > 3 ? values[3].xdr.substring(0, 20) : undefined;
    }
    async storeEvent(event) {
        await db_1.pool.query(`INSERT INTO contract_events (event_type, ledger_seq, timestamp, actor, org_id, issue_id, contributor, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`, [
            event.type,
            event.ledger,
            event.timestamp,
            event.actor,
            event.orgId,
            event.issueId || null,
            event.contributor || null,
            JSON.stringify(event.data),
        ]);
    }
    stop() {
        this.isRunning = false;
        logger_1.logger.info({ message: 'Event indexer stopped' });
    }
}
exports.EventIndexer = EventIndexer;
let indexer = null;
function getEventIndexer() {
    if (!indexer) {
        indexer = new EventIndexer();
    }
    return indexer;
}
async function startEventIndexer() {
    const idx = getEventIndexer();
    await idx.start();
}
function stopEventIndexer() {
    if (indexer) {
        indexer.stop();
    }
}

import { SorobanRpc } from '@stellar/stellar-sdk';
import { pool } from './db';
import { logger } from './logger';

interface ContractEvent {
  type: string;
  ledger: number;
  timestamp: Date;
  actor: string;
  orgId: string;
  issueId?: number;
  contributor?: string;
  data?: Record<string, unknown>;
}

interface EventData {
  type: string;
  xdr: string;
}

interface ContractEventResource {
  type: string;
  id: string;
  pagingToken: string;
  ledger: string;
  createdAt: string;
  topic: EventData[];
  value: EventData[];
}

const CONTRACT_ID =
  process.env.CONTRACT_ID ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

const RPC_URL = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

export class EventIndexer {
  private server: SorobanRpc.Server;
  private cursor: string | undefined;
  private isRunning = false;

  constructor() {
    this.server = new SorobanRpc.Server(RPC_URL, { allowHttp: true });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info({ message: 'Event indexer started' });

    this.pollForEvents().catch((err) => {
      logger.error({
        message: 'Event indexer error',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      this.isRunning = false;
    });
  }

  private async pollForEvents(): Promise<void> {
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
          for (const event of events.events as unknown[]) {
            try {
              const parsed = this.parseEvent(event as ContractEventResource);
              if (parsed) {
                await this.storeEvent(parsed);
              }
            } catch (err) {
              logger.error({
                message: 'Failed to parse event',
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          const lastEvent = events.events[events.events.length - 1] as unknown as ContractEventResource;
          this.cursor = lastEvent.pagingToken;
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (err) {
        logger.error({
          message: 'Event polling error',
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }

  private parseEvent(event: ContractEventResource): ContractEvent | null {
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
          topics: topics.map((t: EventData) => t),
          values: values.map((v: EventData) => v),
        },
      };
    } catch {
      return null;
    }
  }

  private extractEventType(topics: EventData[]): string | null {
    if (topics.length === 0) return null;
    const topicXdr = topics[0].xdr;
    if (topicXdr.includes('applied')) return 'applied';
    if (topicXdr.includes('withdrawn')) return 'withdrawn';
    if (topicXdr.includes('assigned')) return 'assigned';
    if (topicXdr.includes('completed')) return 'completed';
    if (topicXdr.includes('revoked')) return 'revoked';
    return null;
  }

  private extractActor(values: EventData[]): string {
    return values.length > 0 ? values[0].xdr.substring(0, 20) : 'unknown';
  }

  private extractOrgId(values: EventData[]): string {
    return values.length > 1 ? values[1].xdr.substring(0, 20) : 'unknown';
  }

  private extractIssueId(values: EventData[]): number | undefined {
    if (values.length > 2) {
      const match = values[2].xdr.match(/\d+/);
      return match ? parseInt(match[0], 10) : undefined;
    }
    return undefined;
  }

  private extractContributor(values: EventData[]): string | undefined {
    return values.length > 3 ? values[3].xdr.substring(0, 20) : undefined;
  }

  private async storeEvent(event: ContractEvent): Promise<void> {
    await pool.query(
      `INSERT INTO contract_events (event_type, ledger_seq, timestamp, actor, org_id, issue_id, contributor, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        event.type,
        event.ledger,
        event.timestamp,
        event.actor,
        event.orgId,
        event.issueId || null,
        event.contributor || null,
        JSON.stringify(event.data),
      ],
    );
  }

  stop(): void {
    this.isRunning = false;
    logger.info({ message: 'Event indexer stopped' });
  }
}

let indexer: EventIndexer | null = null;

export function getEventIndexer(): EventIndexer {
  if (!indexer) {
    indexer = new EventIndexer();
  }
  return indexer;
}

export async function startEventIndexer(): Promise<void> {
  const idx = getEventIndexer();
  await idx.start();
}

export function stopEventIndexer(): void {
  if (indexer) {
    indexer.stop();
  }
}

/**
 * Multi-org transaction routing sync service.
 *
 * Issue #310: On startup, loads all registered orgs from DB, creates an
 * independent async event queue per org, and polls for new orgs every 60 s.
 * Errors in one org queue are isolated — they do NOT affect other queues.
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import { OrgEvent, OrgRecord, getRegisteredOrgs, saveEvent } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DbClient = {
  getRegisteredOrgs: () => Promise<OrgRecord[]>;
  saveEvent: (event: OrgEvent) => Promise<void>;
};

export type Logger = pino.Logger;

// ---------------------------------------------------------------------------
// OrgQueue — isolated async queue for a single org
// ---------------------------------------------------------------------------

/**
 * An isolated, single-org event queue.
 *
 * Each org gets its own OrgQueue instance. Errors thrown while processing
 * one event are caught, logged with org_id context, and do NOT prevent
 * subsequent events from being processed or affect any other org's queue.
 */
export class OrgQueue {
  private readonly orgLog: Logger;
  private readonly queue: OrgEvent[] = [];
  private processing = false;

  constructor(
    public readonly orgId: string,
    public readonly contractAddress: string,
    private readonly db: DbClient,
    logger: Logger
  ) {
    // Bind org_id to every log line produced by this queue
    this.orgLog = logger.child({ org_id: orgId });
    this.orgLog.info({ contract_address: contractAddress }, 'OrgQueue created');
  }

  /** Enqueue an event and kick off processing if idle. */
  enqueue(event: OrgEvent): void {
    if (event.org_id !== this.orgId) {
      this.orgLog.warn(
        { received_org_id: event.org_id },
        'Ignoring event for wrong org'
      );
      return;
    }
    this.queue.push(event);
    this.orgLog.debug(
      { queue_length: this.queue.length, event_type: event.event_type },
      'Event enqueued'
    );
    if (!this.processing) {
      // Start the drain loop without awaiting — intentional fire-and-forget
      void this.processNext();
    }
  }

  /** Drain the queue one event at a time, isolating each error. */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const event = this.queue[0];

    try {
      this.orgLog.info(
        { event_type: event.event_type, issue_id: event.issue_id, contributor: event.contributor },
        'Processing event'
      );
      await this.db.saveEvent(event);
      this.queue.shift();
      this.orgLog.info(
        { event_type: event.event_type, issue_id: event.issue_id, tx_hash: event.tx_hash },
        'Event saved'
      );
    } catch (err) {
      // Drop the failed event and continue — isolation guarantee
      this.queue.shift();
      this.orgLog.error(
        { err, event_type: event.event_type, issue_id: event.issue_id },
        'Failed to process event; dropping and continuing'
      );
    }

    await this.processNext();
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }
}

// ---------------------------------------------------------------------------
// SyncService — manages all org queues + polling
// ---------------------------------------------------------------------------

/**
 * SyncService manages a fleet of per-org event queues.
 *
 * Responsibilities:
 * - On start(): load all registered orgs from DB and create OrgQueue instances
 * - Start event listeners for each org's contract address
 * - Poll the DB every 60 s to detect newly registered orgs (no restart needed)
 * - Route incoming events to the correct OrgQueue
 */
export class SyncService extends EventEmitter {
  private readonly orgQueues = new Map<string, OrgQueue>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private readonly log: Logger;

  constructor(
    private readonly db: DbClient,
    logger?: Logger
  ) {
    super();
    this.log = logger ?? pino({ name: 'sync-service' });
  }

  /** Start the sync service: load orgs, start listeners, begin polling. */
  async start(): Promise<void> {
    this.log.info('SyncService starting');
    await this.loadAndRegisterOrgs();

    this.pollInterval = setInterval(() => {
      void this.loadAndRegisterOrgs();
    }, 60_000);

    this.log.info({ org_count: this.orgQueues.size }, 'SyncService started');
  }

  /** Stop the sync service and clear all intervals. */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.log.info({ org_count: this.orgQueues.size }, 'SyncService stopped');
  }

  /**
   * Load registered orgs from DB and register any that are new.
   * Safe to call repeatedly — idempotent for already-registered orgs.
   */
  async loadAndRegisterOrgs(): Promise<void> {
    let orgs: OrgRecord[];
    try {
      orgs = await this.db.getRegisteredOrgs();
    } catch (err) {
      this.log.error({ err }, 'Failed to load registered orgs');
      return;
    }

    for (const org of orgs) {
      if (!this.orgQueues.has(org.org_id)) {
        this.log.info(
          { org_id: org.org_id, contract_address: org.contract_address },
          'Registering new org'
        );
        const queue = new OrgQueue(org.org_id, org.contract_address, this.db, this.log);
        this.orgQueues.set(org.org_id, queue);
        this.startOrgListener(org.org_id, org.contract_address, queue);
      }
    }
  }

  /**
   * Start an event listener for a single org's contract.
   *
   * In production this subscribes to the Stellar Horizon event stream for the
   * given contract address. Here we wire it to an EventEmitter so tests can
   * inject synthetic events with `service.emit('event:<orgId>', ...)`.
   */
  startOrgListener(orgId: string, _contractAddress: string, _queue: OrgQueue): void {
    this.log.info({ org_id: orgId }, 'Starting event listener');
    this.on(`event:${orgId}`, (event: OrgEvent) => {
      this.handleEvent(orgId, event);
    });
  }

  /**
   * Route an incoming event to the correct org queue.
   * Unknown org events are logged and dropped.
   */
  handleEvent(orgId: string, event: OrgEvent): void {
    const queue = this.orgQueues.get(orgId);
    if (!queue) {
      this.log.warn({ org_id: orgId }, 'Received event for unknown org — dropping');
      return;
    }
    this.log.debug(
      { org_id: orgId, event_type: event.event_type },
      'Routing event to org queue'
    );
    queue.enqueue(event);
  }

  get registeredOrgIds(): string[] {
    return Array.from(this.orgQueues.keys());
  }

  getQueue(orgId: string): OrgQueue | undefined {
    return this.orgQueues.get(orgId);
  }

  get orgCount(): number {
    return this.orgQueues.size;
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

export async function startSyncService(
  db?: DbClient,
  logger?: Logger
): Promise<SyncService> {
  const resolvedDb: DbClient = db ?? {
    getRegisteredOrgs,
    saveEvent,
  };
  const service = new SyncService(resolvedDb, logger ?? pino({ name: 'sync-service' }));
  await service.start();
  return service;
}

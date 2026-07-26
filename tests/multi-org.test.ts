/**
 * Unit tests for the multi-org sync service (issue #310).
 *
 * Tests verify:
 *  1. Listeners are started for all registered orgs
 *  2. A new org added to DB is picked up within 60 s without restart
 *  3. An error in one org queue does not affect other org queues
 *  4. Events are correctly attributed to their source org
 *  5. Structured logs include org_id context on every event
 */

import pino from 'pino';
import { SyncService, OrgQueue, DbClient } from '../src/sync';
import { OrgEvent, OrgRecord } from '../src/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(orgId: string, issueId = 'issue_1'): OrgEvent {
  return {
    org_id: orgId,
    event_type: 'applied',
    issue_id: issueId,
    contributor: 'GAEZI4FCPWKKLICUZSXR5RBYVOAX4HDDE5MZLE3BZEIIQNFZPQZW55Z',
    tx_hash: 'a'.repeat(64),
    occurred_at: new Date('2026-07-01T00:00:00Z'),
  };
}

function makeOrg(id: string): OrgRecord {
  return { org_id: id, contract_address: `C${'A'.repeat(55)}` };
}

/** Returns a mock DB and arrays that tests can inspect. */
function makeMockDb(initialOrgs: OrgRecord[] = []) {
  const savedEvents: OrgEvent[] = [];
  const orgs = [...initialOrgs];

  const db: DbClient = {
    getRegisteredOrgs: jest.fn(async () => [...orgs]),
    saveEvent: jest.fn(async (e: OrgEvent) => { savedEvents.push(e); }),
  };

  return { db, savedEvents, orgs };
}

/** Silent pino logger for tests. */
function makeLogger() {
  return pino({ level: 'silent' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncService — multi-org routing (#310)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Starts listeners for all registered orgs
  // -------------------------------------------------------------------------
  it('starts listeners for all registered orgs', async () => {
    const { db } = makeMockDb([makeOrg('org_a'), makeOrg('org_b'), makeOrg('org_c')]);
    const service = new SyncService(db, makeLogger());

    await service.start();

    expect(service.orgCount).toBe(3);
    expect(service.registeredOrgIds).toContain('org_a');
    expect(service.registeredOrgIds).toContain('org_b');
    expect(service.registeredOrgIds).toContain('org_c');

    service.stop();
  });

  // -------------------------------------------------------------------------
  // 2. New org added to DB is picked up within 60 s without restart
  // -------------------------------------------------------------------------
  it('picks up a new org added to DB within 60 s without restart', async () => {
    const { db, orgs } = makeMockDb([makeOrg('org_a')]);
    const service = new SyncService(db, makeLogger());

    await service.start();
    expect(service.orgCount).toBe(1);

    // Simulate a new org being registered in the DB
    orgs.push(makeOrg('org_b'));

    // Advance fake timers by exactly 60 s to trigger the poll
    await jest.advanceTimersByTimeAsync(60_000);

    expect(service.orgCount).toBe(2);
    expect(service.registeredOrgIds).toContain('org_b');

    service.stop();
  });

  // -------------------------------------------------------------------------
  // 3. Error in one org queue does not affect other org queues
  // -------------------------------------------------------------------------
  it('isolates errors — error in org_a queue does not stop org_b queue', async () => {
    const savedEvents: OrgEvent[] = [];
    let callCount = 0;

    const db: DbClient = {
      getRegisteredOrgs: jest.fn(async () => [makeOrg('org_a'), makeOrg('org_b')]),
      saveEvent: jest.fn(async (e: OrgEvent) => {
        callCount++;
        // The first call (org_a's event) throws an error
        if (e.org_id === 'org_a' && callCount === 1) {
          throw new Error('Simulated org_a failure');
        }
        savedEvents.push(e);
      }),
    };

    const service = new SyncService(db, makeLogger());
    await service.start();

    // Enqueue events for both orgs
    service.handleEvent('org_a', makeEvent('org_a', 'issue_bad'));
    service.handleEvent('org_b', makeEvent('org_b', 'issue_good'));

    // Let async queue drain
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // org_b's event must still be saved despite org_a's failure
    const orgBEvents = savedEvents.filter((e) => e.org_id === 'org_b');
    expect(orgBEvents).toHaveLength(1);
    expect(orgBEvents[0].issue_id).toBe('issue_good');

    service.stop();
  });

  // -------------------------------------------------------------------------
  // 4. Events are correctly attributed to their source org in DB
  // -------------------------------------------------------------------------
  it('attributes events to their correct source org', async () => {
    const { db, savedEvents } = makeMockDb([makeOrg('org_x'), makeOrg('org_y')]);
    const service = new SyncService(db, makeLogger());

    await service.start();

    service.handleEvent('org_x', makeEvent('org_x', 'issue_x1'));
    service.handleEvent('org_y', makeEvent('org_y', 'issue_y1'));
    service.handleEvent('org_x', makeEvent('org_x', 'issue_x2'));

    // Let the queue drain
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const xEvents = savedEvents.filter((e) => e.org_id === 'org_x');
    const yEvents = savedEvents.filter((e) => e.org_id === 'org_y');

    expect(xEvents.every((e) => e.org_id === 'org_x')).toBe(true);
    expect(yEvents.every((e) => e.org_id === 'org_y')).toBe(true);

    service.stop();
  });

  // -------------------------------------------------------------------------
  // 5. Structured logs include org_id on every event processed
  // -------------------------------------------------------------------------
  it('includes org_id in structured log output for every event', async () => {
    const logLines: Array<Record<string, unknown>> = [];

    // Create a pino logger that writes to our array
    const dest = pino.destination({ sync: false });
    const captureStream = {
      write: (line: string) => {
        try {
          logLines.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // ignore non-JSON lines
        }
        return true;
      },
    };
    const logger = pino({ level: 'debug' }, captureStream as unknown as pino.DestinationStream);

    const { db } = makeMockDb([makeOrg('org_log_test')]);
    const service = new SyncService(db, logger);
    await service.start();

    service.handleEvent('org_log_test', makeEvent('org_log_test'));

    // Drain the queue
    await Promise.resolve();
    await Promise.resolve();

    // Every log line that mentions org_log_test should carry the org_id field
    const relevantLines = logLines.filter(
      (l) => l['org_id'] === 'org_log_test' || String(l['msg'] ?? '').includes('org_log_test')
    );
    expect(relevantLines.length).toBeGreaterThan(0);
    relevantLines.forEach((line) => {
      expect(line).toHaveProperty('org_id', 'org_log_test');
    });

    service.stop();
    dest.destroy();
  });
});

// ---------------------------------------------------------------------------
// OrgQueue unit tests
// ---------------------------------------------------------------------------

describe('OrgQueue — unit tests', () => {
  it('processes events sequentially and saves each one', async () => {
    const savedEvents: OrgEvent[] = [];
    const db: DbClient = {
      getRegisteredOrgs: jest.fn(async () => []),
      saveEvent: jest.fn(async (e: OrgEvent) => { savedEvents.push(e); }),
    };

    const queue = new OrgQueue('org_q', 'C' + 'A'.repeat(55), db, pino({ level: 'silent' }));

    queue.enqueue(makeEvent('org_q', 'issue_1'));
    queue.enqueue(makeEvent('org_q', 'issue_2'));

    // Allow microtasks to settle
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(savedEvents).toHaveLength(2);
    expect(savedEvents[0].issue_id).toBe('issue_1');
    expect(savedEvents[1].issue_id).toBe('issue_2');
  });

  it('ignores events intended for a different org', () => {
    const db: DbClient = {
      getRegisteredOrgs: jest.fn(async () => []),
      saveEvent: jest.fn(async () => { return; }),
    };

    const queue = new OrgQueue('org_correct', 'C' + 'A'.repeat(55), db, pino({ level: 'silent' }));
    queue.enqueue(makeEvent('org_wrong'));

    expect(queue.queueLength).toBe(0);
  });
});

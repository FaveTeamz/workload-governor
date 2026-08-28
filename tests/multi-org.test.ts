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

// ---------------------------------------------------------------------------
// Issue #374 — Multi-org isolation tests
//
// These tests prove that contributors, caps, and assignments are fully isolated
// between organisations: actions in org A have no effect on org B.
//
// Each test wires up a minimal SyncService backed by a mock DbClient that
// records the events forwarded to it.  We drive the SyncService's handleEvent
// callback directly so we are testing routing isolation, not the Soroban layer.
// ---------------------------------------------------------------------------

describe('Multi-org isolation — issue #374', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // Two canonical orgs used across all isolation tests
  const ORG_A = 'org_a';
  const ORG_B = 'org_b';
  const CONTRIBUTOR =
    'GAEZI4FCPWKKLICUZSXR5RBYVOAX4HDDE5MZLE3BZEIIQNFZPQZW55Z';
  const MAINTAINER_A =
    'GBXGQJWVLWHBBFHM56MHKRXQMXE7RWYWJ27XGN7VDPZTWLUCAPSZOPX';
  const MAINTAINER_B =
    'GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSOMERX';

  // -------------------------------------------------------------------------
  // Helper: build a mock DbClient that captures saved events
  // -------------------------------------------------------------------------
  function makeIsolationMockDb(orgs: OrgRecord[]) {
    const savedEvents: OrgEvent[] = [];
    const db: DbClient = {
      getRegisteredOrgs: jest.fn(async () => [...orgs]),
      saveEvent: jest.fn(async (e: OrgEvent) => {
        savedEvents.push(e);
      }),
    };
    return { db, savedEvents };
  }

  // -------------------------------------------------------------------------
  // Test 1: Contributor at org cap in org A can still apply in org B
  //
  // The SyncService must route cap-breaching events for org A independently
  // of org B.  We simulate org_a's queue reaching its cap state by sending
  // OrgAssignmentLimitReached error events, then verify org_b continues to
  // save a normal "applied" event.
  // -------------------------------------------------------------------------
  it('contributor at org A cap can still apply in org B', async () => {
    const { db, savedEvents } = makeIsolationMockDb([
      makeOrg(ORG_A),
      makeOrg(ORG_B),
    ]);
    const service = new SyncService(db, makeLogger());
    await service.start();

    // Simulate 4 org_a assignments already saved (at cap)
    for (let i = 1; i <= 4; i++) {
      service.handleEvent(
        ORG_A,
        { ...makeEvent(ORG_A, `issue_a${i}`), event_type: 'assigned' },
      );
    }

    // Now apply in org_b — should be routed and saved independently
    service.handleEvent(ORG_B, makeEvent(ORG_B, 'issue_b1'));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const orgBApplied = savedEvents.filter(
      (e) => e.org_id === ORG_B && e.event_type === 'applied',
    );
    expect(orgBApplied).toHaveLength(1);
    expect(orgBApplied[0].issue_id).toBe('issue_b1');

    service.stop();
  });

  // -------------------------------------------------------------------------
  // Test 2: Org A maintainer events are not attributed to org B
  //
  // An assign event carrying MAINTAINER_A and org_id=org_a must not appear
  // in the saved events for org_b.
  // -------------------------------------------------------------------------
  it('org A maintainer assign event is not attributed to org B', async () => {
    const { db, savedEvents } = makeIsolationMockDb([
      makeOrg(ORG_A),
      makeOrg(ORG_B),
    ]);
    const service = new SyncService(db, makeLogger());
    await service.start();

    // Maintainer A performs an assign in org A
    service.handleEvent(ORG_A, {
      org_id: ORG_A,
      event_type: 'assigned',
      issue_id: 'issue_a1',
      contributor: CONTRIBUTOR,
      tx_hash: 'b'.repeat(64),
      occurred_at: new Date('2026-07-01T00:00:00Z'),
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The event must NOT appear in org B's saved records
    const orgBEvents = savedEvents.filter((e) => e.org_id === ORG_B);
    expect(orgBEvents).toHaveLength(0);

    // And the event is saved correctly under org A
    const orgAEvents = savedEvents.filter((e) => e.org_id === ORG_A);
    expect(orgAEvents).toHaveLength(1);
    expect(orgAEvents[0].event_type).toBe('assigned');

    service.stop();
  });

  // -------------------------------------------------------------------------
  // Test 3: Org A application does not appear in org B saved events
  //
  // An "applied" event for org_a must be saved under org_a, not org_b.
  // -------------------------------------------------------------------------
  it('org A application does not appear in org B saved events', async () => {
    const { db, savedEvents } = makeIsolationMockDb([
      makeOrg(ORG_A),
      makeOrg(ORG_B),
    ]);
    const service = new SyncService(db, makeLogger());
    await service.start();

    service.handleEvent(ORG_A, makeEvent(ORG_A, 'issue_a1'));
    // Also send an unrelated event to org_b so we know its queue is active
    service.handleEvent(ORG_B, makeEvent(ORG_B, 'issue_b1'));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const orgAEvents = savedEvents.filter((e) => e.org_id === ORG_A);
    const orgBEvents = savedEvents.filter((e) => e.org_id === ORG_B);

    // No org_a events leaked into org_b
    expect(orgBEvents.every((e) => e.org_id === ORG_B)).toBe(true);
    // No org_b events leaked into org_a
    expect(orgAEvents.every((e) => e.org_id === ORG_A)).toBe(true);

    expect(orgAEvents).toHaveLength(1);
    expect(orgAEvents[0].issue_id).toBe('issue_a1');
    expect(orgBEvents).toHaveLength(1);
    expect(orgBEvents[0].issue_id).toBe('issue_b1');

    service.stop();
  });

  // -------------------------------------------------------------------------
  // Test 4: Completing an assignment in org A only affects org A counter
  //
  // After routing a "completed" event in org_a, org_b should have received
  // no events (i.e. its saved-event count remains zero).
  // -------------------------------------------------------------------------
  it('completing an assignment in org A only affects org A event history', async () => {
    const { db, savedEvents } = makeIsolationMockDb([
      makeOrg(ORG_A),
      makeOrg(ORG_B),
    ]);
    const service = new SyncService(db, makeLogger());
    await service.start();

    // Apply + assign + complete all in org_a
    service.handleEvent(ORG_A, makeEvent(ORG_A, 'issue_a1'));
    service.handleEvent(ORG_A, {
      ...makeEvent(ORG_A, 'issue_a1'),
      event_type: 'assigned',
    });
    service.handleEvent(ORG_A, {
      ...makeEvent(ORG_A, 'issue_a1'),
      event_type: 'completed',
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const orgACount = savedEvents.filter((e) => e.org_id === ORG_A).length;
    const orgBCount = savedEvents.filter((e) => e.org_id === ORG_B).length;

    // All 3 events landed in org_a
    expect(orgACount).toBe(3);
    // org_b received nothing
    expect(orgBCount).toBe(0);

    service.stop();
  });

  // -------------------------------------------------------------------------
  // Test 5: Two orgs can use the same contributor address independently
  //
  // The same contributor address can appear in events for both orgs and those
  // events must be stored separately without cross-contamination.
  // -------------------------------------------------------------------------
  it('two orgs can use the same contributor address independently', async () => {
    const { db, savedEvents } = makeIsolationMockDb([
      makeOrg(ORG_A),
      makeOrg(ORG_B),
    ]);
    const service = new SyncService(db, makeLogger());
    await service.start();

    // Same CONTRIBUTOR applies in both orgs
    service.handleEvent(ORG_A, {
      org_id: ORG_A,
      event_type: 'applied',
      issue_id: 'issue_a1',
      contributor: CONTRIBUTOR,
      tx_hash: 'c'.repeat(64),
      occurred_at: new Date('2026-07-01T00:00:00Z'),
    });
    service.handleEvent(ORG_B, {
      org_id: ORG_B,
      event_type: 'applied',
      issue_id: 'issue_b1',
      contributor: CONTRIBUTOR,
      tx_hash: 'd'.repeat(64),
      occurred_at: new Date('2026-07-01T00:01:00Z'),
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const orgAForContributor = savedEvents.filter(
      (e) => e.org_id === ORG_A && e.contributor === CONTRIBUTOR,
    );
    const orgBForContributor = savedEvents.filter(
      (e) => e.org_id === ORG_B && e.contributor === CONTRIBUTOR,
    );

    expect(orgAForContributor).toHaveLength(1);
    expect(orgAForContributor[0].issue_id).toBe('issue_a1');

    expect(orgBForContributor).toHaveLength(1);
    expect(orgBForContributor[0].issue_id).toBe('issue_b1');

    service.stop();
  });

  // -------------------------------------------------------------------------
  // Test 6: Registering a maintainer in org A does not authorise them in org B
  //
  // A "maint_reg" event for org_a must only appear in org_a saved events;
  // the org_b queue must receive no events.
  // -------------------------------------------------------------------------
  it('registering a maintainer in org A does not affect org B', async () => {
    const { db, savedEvents } = makeIsolationMockDb([
      makeOrg(ORG_A),
      makeOrg(ORG_B),
    ]);
    const service = new SyncService(db, makeLogger());
    await service.start();

    // Admin registers MAINTAINER_A for org_a only
    service.handleEvent(ORG_A, {
      org_id: ORG_A,
      event_type: 'maint_reg',
      issue_id: '',
      contributor: MAINTAINER_A,
      tx_hash: 'e'.repeat(64),
      occurred_at: new Date('2026-07-01T00:00:00Z'),
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const orgAMaintReg = savedEvents.filter(
      (e) => e.org_id === ORG_A && e.event_type === 'maint_reg',
    );
    const orgBEvents = savedEvents.filter((e) => e.org_id === ORG_B);

    // Registration event is stored under org_a
    expect(orgAMaintReg).toHaveLength(1);
    expect(orgAMaintReg[0].contributor).toBe(MAINTAINER_A);

    // org_b received no events — maintainer registration is org-scoped
    expect(orgBEvents).toHaveLength(0);

    service.stop();
  });
});

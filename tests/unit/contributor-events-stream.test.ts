/**
 * tests/unit/contributor-events-stream.test.ts
 *
 * Unit & integration tests for issue #1017:
 *   feat(backend): Add streaming server-sent events (SSE) endpoint for live application updates
 *
 * Acceptance Criteria verified:
 *  1. Implement GET /api/v1/contributors/:address/events/stream using Server-Sent Events (SSE).
 *  2. Push real-time event updates when indexer records relevant contract events.
 */

import { EventEmitter } from 'events';
import express, { Request, Response } from 'express';
import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';

const mockQuery = jest.fn();
const mockGetCache = jest.fn();
const mockSetCache = jest.fn();

jest.mock('../../src/db', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: jest.fn(),
    on: jest.fn(),
  },
  getCheckpoint: jest.fn(),
  saveCheckpoint: jest.fn(),
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

jest.mock('../../src/services/redis', () => ({
  __esModule: true,
  default: { on: jest.fn() },
  getCache: (...args: unknown[]) => mockGetCache(...args),
  setCache: (...args: unknown[]) => mockSetCache(...args),
  invalidateCache: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    getGlobalApplicationCount: jest.fn().mockResolvedValue(0),
  })),
}));

import contributorsRouter from '../../src/routes/contributors';
import { EventIndexer, ContractEventRecord } from '../../src/eventIndexer';
import {
  publishLiveEvent,
  subscribeToContributorEvents,
} from '../../src/services/event-bus';

const app = express();
app.use('/api/contributors', contributorsRouter);
app.use('/api/v1/contributors', contributorsRouter);

const CONTRIBUTOR_A = Keypair.random().publicKey();
const CONTRIBUTOR_B = Keypair.random().publicKey();
const INVALID_ADDR = 'not-a-valid-stellar-address';

/**
 * Helper to invoke the SSE route on our Express router with an in-memory
 * request/response pair so we can inspect headers, streamed chunks, heartbeats,
 * and close cleanup deterministically without open network sockets hanging.
 */
function openSseConnection(address: string) {
  const req = new EventEmitter() as unknown as Request;
  req.params = { address };

  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let statusCode = 200;
  let flushed = false;
  let jsonBody: unknown = undefined;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      jsonBody = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    flushHeaders() {
      flushed = true;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } as unknown as Response;

  // Dispatch through the Express router stack for /:address/events/stream
  const layer = (
    contributorsRouter as unknown as {
      stack: Array<{
        route?: {
          path: string;
          stack: Array<{ handle: (req: Request, res: Response, next: () => void) => void }>;
        };
      }>;
    }
  ).stack.find((l) => l.route?.path === '/:address/events/stream');

  if (!layer || !layer.route) {
    throw new Error('SSE route /:address/events/stream not found on contributorsRouter');
  }

  layer.route.stack[0].handle(req, res, () => {});

  return {
    req,
    headers,
    chunks,
    getStatus: () => statusCode,
    isFlushed: () => flushed,
    getJsonBody: () => jsonBody,
    close: () => req.emit('close'),
  };
}

describe('GET /api/v1/contributors/:address/events/stream (#1017)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 400 for an invalid Stellar address via HTTP', async () => {
    const res = await request(app).get(
      `/api/v1/contributors/${INVALID_ADDR}/events/stream`,
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid stellar address format' });
  });

  it('establishes an SSE stream with required headers and initial connected comment', () => {
    const conn = openSseConnection(CONTRIBUTOR_A);

    expect(conn.getStatus()).toBe(200);
    expect(conn.headers['content-type']).toBe('text/event-stream');
    expect(conn.headers['cache-control']).toBe('no-cache, no-transform');
    expect(conn.headers['connection']).toBe('keep-alive');
    expect(conn.isFlushed()).toBe(true);
    expect(conn.chunks).toEqual([': connected\n\n']);

    conn.close();
  });

  it('pushes real-time SSE updates when EventIndexer records relevant contract events for the contributor', async () => {
    const connA = openSseConnection(CONTRIBUTOR_A);
    const connB = openSseConnection(CONTRIBUTOR_B);

    const indexer = new EventIndexer();
    // Simulate successful DB insert (rowCount = 1)
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const assignedRecord: ContractEventRecord = {
      event_type: 'assigned',
      contributor: CONTRIBUTOR_A,
      org_id: 'org_stellar_001',
      issue_id: 42,
      tx_hash: '0xtx_assigned_42',
      event_index: 0,
      ledger: 1200,
      timestamp: new Date('2026-10-23T12:00:00.000Z'),
    };

    const inserted = await indexer.storeEvent(assignedRecord);
    expect(inserted).toBe(true);

    // Contributor A receives the assignment_created event
    expect(connA.chunks).toHaveLength(2);
    expect(connA.chunks[1]).toContain('event: assignment_created\n');
    const payloadA = JSON.parse(
      connA.chunks[1].replace(/^event: [^\n]+\ndata: /, '').trim(),
    );
    expect(payloadA).toEqual({
      eventType: 'assigned',
      contributor: CONTRIBUTOR_A,
      orgId: 'org_stellar_001',
      issueId: 42,
      txHash: '0xtx_assigned_42',
      ledger: 1200,
      timestamp: '2026-10-23T12:00:00.000Z',
    });

    // Contributor B does NOT receive Contributor A's event
    expect(connB.chunks).toEqual([': connected\n\n']);

    connA.close();
    connB.close();
  });

  it('pushes applied, withdrew, completed, and revoked contract events for the contributor', async () => {
    const conn = openSseConnection(CONTRIBUTOR_A);
    const indexer = new EventIndexer();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const eventTypes: Array<ContractEventRecord['event_type']> = [
      'applied',
      'withdrew',
      'completed',
      'revoked',
    ];

    for (let i = 0; i < eventTypes.length; i++) {
      await indexer.storeEvent({
        event_type: eventTypes[i],
        contributor: CONTRIBUTOR_A,
        org_id: 'org_stellar_001',
        issue_id: 100 + i,
        tx_hash: `0xtx_${i}`,
        event_index: i,
        ledger: 1300 + i,
        timestamp: new Date('2026-10-23T13:00:00.000Z'),
      });
    }

    // Initial ': connected' + 4 pushed events = 5 chunks
    expect(conn.chunks).toHaveLength(5);
    expect(conn.chunks[1]).toContain('event: application_created\n');
    expect(conn.chunks[2]).toContain('event: cap_updated\n');
    expect(conn.chunks[3]).toContain('event: cap_updated\n');
    expect(conn.chunks[4]).toContain('event: cap_updated\n');

    conn.close();
  });

  it('does not push events when EventIndexer skips a duplicate contract event (rowCount = 0)', async () => {
    const conn = openSseConnection(CONTRIBUTOR_A);
    const indexer = new EventIndexer();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const inserted = await indexer.storeEvent({
      event_type: 'assigned',
      contributor: CONTRIBUTOR_A,
      org_id: 'org_stellar_001',
      issue_id: 99,
      tx_hash: '0xtx_dup',
      event_index: 0,
      ledger: 1400,
      timestamp: new Date('2026-10-23T14:00:00.000Z'),
    });

    expect(inserted).toBe(false);
    expect(conn.chunks).toEqual([': connected\n\n']);

    conn.close();
  });

  it('sends periodic heartbeat comments and unsubscribes cleanly on client disconnect', () => {
    const conn = openSseConnection(CONTRIBUTOR_A);

    jest.advanceTimersByTime(15_000);
    expect(conn.chunks).toEqual([': connected\n\n', ': heartbeat\n\n']);

    // Disconnect client
    conn.close();

    // Advancing timer or publishing new events after close should not write to response
    jest.advanceTimersByTime(30_000);
    publishLiveEvent({
      type: 'assignment_created',
      contributor: CONTRIBUTOR_A,
      data: {
        eventType: 'assigned',
        contributor: CONTRIBUTOR_A,
        orgId: 'org_stellar_001',
        issueId: 77,
      },
    });

    expect(conn.chunks).toEqual([': connected\n\n', ': heartbeat\n\n']);
  });

  it('subscribeToContributorEvents ignores non-contributor events such as maint_reg', () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToContributorEvents(CONTRIBUTOR_A, (ev) => {
      received.push(ev);
    });

    publishLiveEvent({
      type: 'cap_updated',
      contributor: CONTRIBUTOR_A,
      data: {
        eventType: 'maint_reg',
        contributor: CONTRIBUTOR_A,
        orgId: 'org_stellar_001',
      },
    });

    expect(received).toHaveLength(0);
    unsubscribe();
  });
});

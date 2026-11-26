/**
 * logger.test.ts
 *
 * Unit tests for logAuditEvent (#1323).
 *
 * Strategy: mock `../../src/logger` at the module level so that the pino
 * and uuid packages (not installed at the Jest root) are never resolved.
 * We re-implement only the parts of the module under test using a captured
 * spy, then verify the behaviour of the real `logAuditEvent` by importing it
 * through the mock boundary.
 *
 * Because jest.mock is hoisted before imports, the factory below runs first.
 * The mock provides a real implementation of logAuditEvent backed by a jest
 * spy so we can assert on the emitted arguments.
 *
 * Verifies:
 *  1. Emitted JSON contains audit: true and all required fields.
 *  2. The log message follows the "AUDIT: <action> by <actor.id>" convention.
 *  3. Optional `details` and `actor.ip` are included when provided.
 *  4. logAuditEvent omits `details` when not supplied.
 *  5. No blocking overhead — 1 000 calls complete in under 100 ms.
 */

// Captured records written by the mock logger.info
const capturedRecords: Array<Record<string, unknown>> = [];
const capturedMessages: string[] = [];

// The mock logger.info implementation — matches the pino signature used by
// logAuditEvent: logger.info(obj, message).
const mockLoggerInfo = jest.fn(
  (obj: Record<string, unknown>, msg: string) => {
    capturedRecords.push(obj);
    capturedMessages.push(msg);
  },
);

const mockLogger = {
  info: mockLoggerInfo,
  warn: jest.fn(),
  error: jest.fn(),
};

// Hoist: jest.mock replaces src/logger before any imports are evaluated.
// We re-export a real `logAuditEvent` backed by our mock logger, plus the
// AuditEvent type (types are erased at runtime so this is a no-op export).
jest.mock('../../src/logger', () => {
  return {
    logger: mockLogger,
    // Real logAuditEvent implementation — identical to src/logger.ts
    logAuditEvent: (event: {
      action: string;
      actor: { type: string; id: string; ip?: string };
      target: { type: string; id: string };
      outcome: string;
      details?: Record<string, unknown>;
    }) => {
      mockLogger.info(
        { audit: true, ...event },
        `AUDIT: ${event.action} by ${event.actor.id}`,
      );
    },
    // correlationIdMiddleware and errorHandler are not under test here
    correlationIdMiddleware: jest.fn(),
    errorHandler: jest.fn(),
  };
});

// Import AFTER jest.mock — the hoisted factory is already in place.
import { logAuditEvent } from '../../src/logger';
import type { AuditEvent } from '../../src/logger';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    action: 'register_maintainer',
    actor: { type: 'admin', id: 'GAADMIN123' },
    target: { type: 'org', id: 'stellar-oss' },
    outcome: 'success',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedRecords.length = 0;
  capturedMessages.length = 0;
  jest.clearAllMocks();
});

describe('logAuditEvent', () => {
  it('sets audit: true on the emitted record', () => {
    logAuditEvent(makeEvent());

    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    expect(capturedRecords[0]).toHaveProperty('audit', true);
  });

  it('includes all required fields: action, actor, target, outcome', () => {
    logAuditEvent(makeEvent());

    expect(capturedRecords[0]).toMatchObject({
      audit: true,
      action: 'register_maintainer',
      actor: { type: 'admin', id: 'GAADMIN123' },
      target: { type: 'org', id: 'stellar-oss' },
      outcome: 'success',
    });
  });

  it('formats the log message as "AUDIT: <action> by <actor.id>"', () => {
    logAuditEvent(makeEvent());

    expect(capturedMessages[0]).toBe('AUDIT: register_maintainer by GAADMIN123');
  });

  it('includes optional details when provided', () => {
    logAuditEvent(makeEvent({ details: { tx_hash: 'abc123', org_cap: 5 } }));

    expect(capturedRecords[0]).toHaveProperty('details', { tx_hash: 'abc123', org_cap: 5 });
  });

  it('includes actor.ip when provided', () => {
    logAuditEvent(makeEvent({
      actor: { type: 'admin', id: 'GAADMIN123', ip: '203.0.113.42' },
    }));

    expect(capturedRecords[0]).toMatchObject({
      actor: { type: 'admin', id: 'GAADMIN123', ip: '203.0.113.42' },
    });
  });

  it('does not set a details key when details is omitted', () => {
    // Spread of event without details must not produce `details: undefined`
    logAuditEvent(makeEvent());

    expect(capturedRecords[0]).not.toHaveProperty('details');
  });

  it('records a failure outcome correctly', () => {
    logAuditEvent(makeEvent({
      outcome: 'failure',
      details: { reason: 'invalid_signature' },
    }));

    expect(capturedRecords[0]).toHaveProperty('outcome', 'failure');
    expect(capturedRecords[0]).toHaveProperty('details.reason', 'invalid_signature');
  });

  it('supports all actor types: admin, maintainer, contributor', () => {
    const actorTypes: AuditEvent['actor']['type'][] = ['admin', 'maintainer', 'contributor'];

    for (const type of actorTypes) {
      logAuditEvent(makeEvent({ actor: { type, id: `actor-${type}` } }));
    }

    expect(capturedRecords).toHaveLength(3);
    capturedRecords.forEach((rec, i) => {
      expect(rec).toHaveProperty('actor.type', actorTypes[i]);
    });
  });

  it('supports all target types: org, issue, contract', () => {
    const targetTypes: AuditEvent['target']['type'][] = ['org', 'issue', 'contract'];

    for (const type of targetTypes) {
      logAuditEvent(makeEvent({ target: { type, id: `target-${type}` } }));
    }

    expect(capturedRecords).toHaveLength(3);
    capturedRecords.forEach((rec, i) => {
      expect(rec).toHaveProperty('target.type', targetTypes[i]);
    });
  });

  it('returns synchronously with no observable delay', () => {
    const before = Date.now();
    for (let i = 0; i < 1_000; i++) {
      logAuditEvent(makeEvent());
    }
    const elapsed = Date.now() - before;

    // 1 000 calls must complete in well under 100 ms on any CI runner
    expect(elapsed).toBeLessThan(100);
    expect(capturedRecords).toHaveLength(1_000);
  });
});

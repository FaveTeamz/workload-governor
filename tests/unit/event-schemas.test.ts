import {
  isSupportedContractEvent,
  validateContractEvent,
} from '../../src/schemas/events';
import type { ContractEventTopic } from '../../src/schemas/events';

const ADDRESS = `G${'A'.repeat(55)}`;
const OTHER_ADDRESS = `G${'B'.repeat(55)}`;
const VALID_EVENT_CASES: Array<[ContractEventTopic, unknown[], string, string]> = [
  ['app_wdw', [ADDRESS, 'workload_governor', 42], 'withdrew', ADDRESS],
  ['assigned', [ADDRESS, OTHER_ADDRESS, 'workload_governor', 42], 'assigned', OTHER_ADDRESS],
  ['completed', [ADDRESS, OTHER_ADDRESS, 'workload_governor', 42], 'completed', OTHER_ADDRESS],
  ['revoked', [ADDRESS, OTHER_ADDRESS, 'workload_governor', 42], 'revoked', OTHER_ADDRESS],
];

describe('contract event schemas', () => {
  it('accepts the ABI tuple for an application event', () => {
    const result = validateContractEvent(
      'app_sub',
      ['app_sub', ADDRESS],
      [ADDRESS, 'workload_governor', 42],
    );

    expect(result).toEqual({
      success: true,
      event: {
        event_type: 'applied',
        contributor: ADDRESS,
        org_id: 'workload_governor',
        issue_id: 42,
      },
    });
  });

  it.each(VALID_EVENT_CASES)('accepts the %s ABI tuple', (name, data, eventType, contributor) => {
    expect(validateContractEvent(name, [name, ADDRESS], data)).toMatchObject({
      success: true,
      event: {
        event_type: eventType,
        contributor,
        org_id: 'workload_governor',
        issue_id: 42,
      },
    });
  });

  it('accepts the maintainer registration ABI tuple', () => {
    expect(
      validateContractEvent('maint_reg', ['maint_reg', ADDRESS], [OTHER_ADDRESS, 'org']),
    ).toMatchObject({
      success: true,
      event: {
        event_type: 'maintainer_registered',
        contributor: null,
        org_id: 'org',
        issue_id: null,
      },
    });
  });

  it('rejects tuples with missing fields or a non-u32 issue id', () => {
    expect(validateContractEvent('app_sub', ['app_sub', ADDRESS], [ADDRESS, 'org']))
      .toMatchObject({ success: false });
    expect(
      validateContractEvent('app_sub', ['app_sub', ADDRESS], [ADDRESS, 'org', 0x1_0000_0000]),
    ).toMatchObject({ success: false });
  });

  it('rejects an actor that differs from the payload address', () => {
    expect(
      validateContractEvent('assigned', ['assigned', ADDRESS], [
        ADDRESS,
        OTHER_ADDRESS,
        'org',
        7,
      ]),
    ).toMatchObject({ success: false });
  });

  it('recognizes only event topics handled by the indexer', () => {
    expect(isSupportedContractEvent('completed')).toBe(true);
    expect(isSupportedContractEvent('cap_prop')).toBe(false);
  });
});

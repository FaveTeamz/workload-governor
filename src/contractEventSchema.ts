import { scValToNative, xdr } from '@stellar/stellar-sdk';

type FieldType = 'scvSymbol' | 'scvAddress' | 'scvU32' | 'scvBool';

/** Event ABI emitted by src/events.rs. Keep exact tuple lengths and XDR types. */
const EVENT_DATA_ABI = {
  init: ['scvAddress', 'scvU32'],
  maint_reg: ['scvAddress', 'scvSymbol'],
  maint_dreg: ['scvAddress', 'scvSymbol'],
  applied: ['scvSymbol', 'scvU32'],
  withdrew: ['scvSymbol', 'scvU32'],
  assigned: ['scvAddress', 'scvSymbol', 'scvU32'],
  completed: ['scvAddress', 'scvSymbol', 'scvU32'],
  revoked: ['scvAddress', 'scvSymbol', 'scvU32'],
  mig_done: ['scvU32'],
  ms_set: ['scvU32', 'scvU32'],
  cap_prop: ['scvU32', 'scvU32'],
  cap_vote: ['scvU32', 'scvBool'],
  cap_exec: ['scvU32', 'scvU32'],
  adm_act: ['scvU32'],
} as const satisfies Record<string, readonly FieldType[]>;

export type ContractEventName = keyof typeof EVENT_DATA_ABI;

export class EventValidationError extends Error {}

/** Accept SDK v12 ScVals, raw RPC base64, and legacy { xdr } wrappers. */
function decode(value: unknown, path: string): xdr.ScVal {
  try {
    if (value instanceof xdr.ScVal) return value;
    const encoded = typeof value === 'object' && value !== null && 'xdr' in value
      ? value.xdr
      : value;
    if (typeof encoded === 'string' && encoded.length > 0) {
      return xdr.ScVal.fromXDR(encoded, 'base64');
    }
  } catch {
    throw new EventValidationError(`${path}: invalid XDR ScVal`);
  }
  throw new EventValidationError(`${path}: expected XDR ScVal`);
}

function field(value: xdr.ScVal, type: FieldType, path: string): unknown {
  if (value.switch().name !== type) {
    throw new EventValidationError(`${path}: expected ${type}, got ${value.switch().name}`);
  }
  const native = scValToNative(value);
  if (type === 'scvSymbol' && (typeof native !== 'string' || !/^[A-Za-z0-9_]{0,32}$/.test(native))) {
    throw new EventValidationError(`${path}: invalid Soroban symbol`);
  }
  if (type === 'scvU32' && (typeof native !== 'number' || !Number.isInteger(native) || native < 0 || native > 4294967295)) {
    throw new EventValidationError(`${path}: expected unsigned 32-bit integer`);
  }
  return native;
}

export interface ValidatedContractEvent {
  name: ContractEventName;
  entity: string;
  data: unknown[];
}

/** Validate wire types before native conversion, which erases symbol/string distinctions. */
export function validateContractEvent(topics: unknown, value: unknown): ValidatedContractEvent {
  if (!Array.isArray(topics) || topics.length !== 3) {
    throw new EventValidationError('topics: expected exactly 3 entries (WG, event name, address)');
  }
  const namespace = field(decode(topics[0], 'topics[0]'), 'scvSymbol', 'topics[0]');
  if (namespace !== 'WG') {
    throw new EventValidationError('topics[0]: expected WG namespace');
  }
  const name = field(decode(topics[1], 'topics[1]'), 'scvSymbol', 'topics[1]');
  if (typeof name !== 'string' || !Object.hasOwn(EVENT_DATA_ABI, name)) {
    throw new EventValidationError(`topics[1]: unknown event ${String(name)}`);
  }
  const entity = field(decode(topics[2], 'topics[2]'), 'scvAddress', 'topics[2]') as string;
  const data = decode(value, 'data');
  if (data.switch().name !== 'scvVec') {
    throw new EventValidationError('data: expected tuple (scvVec)');
  }
  const tuple = data.vec();
  const abi = EVENT_DATA_ABI[name as ContractEventName];
  if (!tuple || tuple.length !== abi.length) {
    throw new EventValidationError(`data: ${name} expects exactly ${abi.length} entries`);
  }
  return {
    name: name as ContractEventName,
    entity,
    data: abi.map((type, index) => field(tuple[index], type, `data[${index}]`)),
  };
}

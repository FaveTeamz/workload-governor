import { xdr as stellarXdr, scValToNative } from '@stellar/stellar-sdk';

/** Pure Soroban XDR decoding and validation, independent of database writes. */

export type ContractEventType =
  | 'applied'
  | 'withdrew'
  | 'assigned'
  | 'completed'
  | 'revoked'
  | 'maint_reg';

export interface ContractEventRecord {
  event_type: ContractEventType;
  contributor: string | null;
  org_id: string;
  issue_id: number | null;
  tx_hash: string;
  event_index: number;
  ledger: number;
  timestamp: Date;
}

export interface RpcEvent {
  type: string;
  id: string;
  pagingToken: string;
  ledger: string;
  createdAt: string;
  txHash?: string;
  topic: Array<{ type: string; xdr: string }>;
  value: { type: string; xdr: string };
}

interface ParsedData {
  org_id: string;
  issue_id: number | null;
}

function decodeScVal(xdrBase64: string): unknown {
  try {
    return scValToNative(stellarXdr.ScVal.fromXDR(xdrBase64, 'base64'));
  } catch {
    return null;
  }
}

function isWorkloadGovernorEvent(topics: string[]): boolean {
  return topics.length >= 3 && decodeScVal(topics[0]) === 'WG';
}

function extractEventType(topics: string[]): ContractEventType | null {
  if (topics.length < 3) return null;
  const value = decodeScVal(topics[1]);
  const known: ContractEventType[] = [
    'applied',
    'withdrew',
    'assigned',
    'completed',
    'revoked',
    'maint_reg',
  ];
  return typeof value === 'string' && known.includes(value as ContractEventType)
    ? (value as ContractEventType)
    : null;
}

function parseEventData(
  dataXdr: string,
  eventType: ContractEventType,
): ParsedData | null {
  const raw = decodeScVal(dataXdr);
  if (!Array.isArray(raw)) return null;

  if (eventType === 'maint_reg') {
    const orgId = raw[1];
    return typeof orgId === 'string' ? { org_id: orgId, issue_id: null } : null;
  }

  const [orgId, issueId] = eventType === 'applied' || eventType === 'withdrew'
    ? raw
    : [raw[1], raw[2]];
  return typeof orgId === 'string' &&
    typeof issueId === 'number' &&
    Number.isInteger(issueId) &&
    issueId >= 0
    ? { org_id: orgId, issue_id: issueId }
    : null;
}

export function parseRpcEvent(raw: RpcEvent): ContractEventRecord | null {
  try {
    if (raw.type !== 'contract') return null;

    const topics = raw.topic?.map((topic) => topic.xdr) ?? [];
    if (!isWorkloadGovernorEvent(topics)) return null;

    const eventType = extractEventType(topics);
    if (!eventType) return null;

    const contributorValue = decodeScVal(topics[2]);
    const contributor = eventType === 'maint_reg'
      ? null
      : typeof contributorValue === 'string'
        ? contributorValue
        : null;
    if (eventType !== 'maint_reg' && contributor === null) return null;

    const data = parseEventData(raw.value?.xdr ?? '', eventType);
    if (!data) return null;

    const ledger = Number(raw.ledger);
    const timestamp = new Date(raw.createdAt);
    if (!Number.isInteger(ledger) || ledger < 1 || Number.isNaN(timestamp.getTime())) {
      return null;
    }

    const idParts = raw.id.split('-');
    const eventIndex = idParts.length >= 3 ? Number.parseInt(idParts[2], 10) : 0;
    const txHash = raw.txHash ?? raw.id;
    if (!Number.isInteger(eventIndex) || eventIndex < 0 || !txHash) return null;

    return {
      event_type: eventType,
      contributor,
      org_id: data.org_id,
      issue_id: data.issue_id,
      tx_hash: txHash,
      event_index: eventIndex,
      ledger,
      timestamp,
    };
  } catch {
    return null;
  }
}
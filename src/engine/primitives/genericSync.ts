/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Content-Agnostic Outbox Sync, Conflict Ordering, P2P Wire Framing & Set Diff Primitives
 * (`@engine/primitives/genericSync.ts`).
 *
 * Zero DOM, zero Node built-ins, zero domain terminology.
 */

import {
  base64ToBytesPure as base64ToBytes,
  bytesToBase64Pure as bytesToBase64,
  bytesToUtf8String,
  utf8StringToBytes,
} from '../binaryEncoding';
import { isSafeObjectKey } from './sanitization';

export interface GenericSyncOperation<TEntityType extends string = string> {
  op_id: string;
  entity_type: TEntityType;
  entity_uuid: string;
  device_id: string;
  timestamp: string;
  logical_counter: number;
  record_rev?: number;
  field_name: string;
  new_value: unknown;
}

export interface GenericSyncConflictEntry<TEntityType extends string = string> {
  conflict_id: string;
  entity_type: TEntityType;
  entity_uuid: string;
  entity_label: string;
  field_name: string;
  winning_value: unknown;
  winning_device_id: string;
  winning_timestamp: string;
  losing_value: unknown;
  losing_device_id: string;
  losing_timestamp: string;
  detected_at: string;
  resolved: boolean;
}

export interface GenericDeltaExportEnvelope<
  TEntityType extends string = string,
  TFormat extends string = string,
> {
  format: TFormat;
  device_id: string;
  exported_at: string;
  operations: GenericSyncOperation<TEntityType>[];
}

export interface GenericSyncSchema<TEntityType extends string = string> {
  validEntityTypes: ReadonlySet<TEntityType>;
  allowedFieldsByEntity: Record<TEntityType, ReadonlySet<string>>;
}

export function generateGenericId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(16).slice(2, 10);
  const timePart = Date.now().toString(16);
  return `op-${timePart}-${randomPart}`;
}

export function nowIsoUtcGeneric(): string {
  return new Date().toISOString();
}

export function createGenericOutboxOperation<TEntityType extends string = string>(params: {
  entityType: TEntityType;
  entityUuid: string;
  deviceId: string;
  logicalCounter: number;
  fieldName: string;
  newValue: unknown;
  timestamp?: string;
  recordRev?: number;
  opId?: string;
  generateId?: () => string;
}): GenericSyncOperation<TEntityType> {
  const op: GenericSyncOperation<TEntityType> = {
    op_id: params.opId || (params.generateId ? params.generateId() : generateGenericId()),
    entity_type: params.entityType,
    entity_uuid: params.entityUuid,
    device_id: params.deviceId,
    timestamp: params.timestamp || nowIsoUtcGeneric(),
    logical_counter: params.logicalCounter,
    field_name: params.fieldName,
    new_value: params.newValue,
  };
  if (
    typeof params.recordRev === 'number' &&
    Number.isFinite(params.recordRev) &&
    params.recordRev >= 0
  ) {
    op.record_rev = Math.floor(params.recordRev);
  }
  return op;
}

/**
 * Deterministic total ordering of operations across multiple offline devices.
 */
export function compareGenericSyncOperations<TEntityType extends string = string>(
  a: GenericSyncOperation<TEntityType>,
  b: GenericSyncOperation<TEntityType>
): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  if (a.logical_counter !== b.logical_counter) {
    return a.logical_counter - b.logical_counter;
  }
  if (a.device_id !== b.device_id) return a.device_id < b.device_id ? -1 : 1;
  if (a.op_id !== b.op_id) return a.op_id < b.op_id ? -1 : 1;
  return 0;
}

/**
 * Ordering for two operations targeting the exact same `(entity_type, entity_uuid)`.
 * Higher monotonic `record_rev` always wins even when device wall-clocks skew.
 */
export function compareSameEntityGenericSyncOperations<TEntityType extends string = string>(
  a: GenericSyncOperation<TEntityType>,
  b: GenericSyncOperation<TEntityType>
): number {
  if (
    a.entity_type === b.entity_type &&
    a.entity_uuid === b.entity_uuid &&
    typeof a.record_rev === 'number' &&
    Number.isFinite(a.record_rev) &&
    typeof b.record_rev === 'number' &&
    Number.isFinite(b.record_rev) &&
    a.record_rev !== b.record_rev
  ) {
    return a.record_rev - b.record_rev;
  }
  return compareGenericSyncOperations(a, b);
}

/**
 * Returns the next monotonic `_rev` integer for a mutated record.
 */
export function bumpGenericRecordRevision(previous?: { _rev?: number } | null): number {
  const prevRev =
    previous &&
    typeof previous._rev === 'number' &&
    Number.isFinite(previous._rev) &&
    previous._rev >= 0
      ? Math.floor(previous._rev)
      : 0;
  return prevRev + 1;
}

/**
 * Computes field-level operations between two versions of any keyed record.
 */
export function diffGenericEntityFieldsToOperations<
  TEntityType extends string,
  T extends { id: string; _rev?: number },
>(params: {
  entityType: TEntityType;
  previous: T | undefined;
  next: T;
  deviceId: string;
  nextCounter: () => number;
  ignoreFields?: string[];
  timestamp?: string;
  recordRev?: number;
  generateId?: () => string;
}): GenericSyncOperation<TEntityType>[] {
  const ops: GenericSyncOperation<TEntityType>[] = [];
  const ignore = new Set(['updatedAt', 'createdAt', '_rev', ...(params.ignoreFields || [])]);
  const ts = params.timestamp || nowIsoUtcGeneric();
  const explicitRev =
    typeof params.recordRev === 'number' && Number.isFinite(params.recordRev)
      ? Math.floor(params.recordRev)
      : typeof params.next._rev === 'number' && Number.isFinite(params.next._rev)
      ? Math.floor(params.next._rev)
      : bumpGenericRecordRevision(params.previous);

  if (!params.previous) {
    ops.push(
      createGenericOutboxOperation({
        entityType: params.entityType,
        entityUuid: params.next.id,
        deviceId: params.deviceId,
        logicalCounter: params.nextCounter(),
        fieldName: '__create__',
        newValue: params.next,
        timestamp: ts,
        recordRev: explicitRev,
        generateId: params.generateId,
      })
    );
    return ops;
  }

  const keys = new Set([
    ...Object.keys(params.previous as Record<string, unknown>),
    ...Object.keys(params.next as Record<string, unknown>),
  ]);

  for (const key of keys) {
    if (ignore.has(key)) continue;
    const prevVal = (params.previous as Record<string, unknown>)[key];
    const nextVal = (params.next as Record<string, unknown>)[key];
    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      ops.push(
        createGenericOutboxOperation({
          entityType: params.entityType,
          entityUuid: params.next.id,
          deviceId: params.deviceId,
          logicalCounter: params.nextCounter(),
          fieldName: key,
          newValue: nextVal,
          timestamp: ts,
          recordRev: explicitRev,
          generateId: params.generateId,
        })
      );
    }
  }
  return ops;
}

/**
 * Validates any incoming sync operation against a caller-supplied entity/field schema.
 */
export function isValidGenericSyncOperation<TEntityType extends string>(
  op: unknown,
  schema: GenericSyncSchema<TEntityType>
): op is GenericSyncOperation<TEntityType> {
  if (!op || typeof op !== 'object' || Array.isArray(op)) return false;
  const candidate = op as Record<string, unknown>;
  if (typeof candidate.op_id !== 'string' || !candidate.op_id.trim()) return false;
  if (
    typeof candidate.entity_type !== 'string' ||
    !schema.validEntityTypes.has(candidate.entity_type as TEntityType)
  ) {
    return false;
  }
  if (typeof candidate.entity_uuid !== 'string' || !candidate.entity_uuid.trim()) return false;
  if (typeof candidate.device_id !== 'string' || !candidate.device_id.trim()) return false;
  if (typeof candidate.timestamp !== 'string' || !candidate.timestamp.trim()) return false;
  if (typeof candidate.logical_counter !== 'number' || !Number.isFinite(candidate.logical_counter)) {
    return false;
  }
  if (
    candidate.record_rev !== undefined &&
    (typeof candidate.record_rev !== 'number' ||
      !Number.isFinite(candidate.record_rev) ||
      candidate.record_rev < 0)
  ) {
    return false;
  }
  const field = candidate.field_name;
  if (typeof field !== 'string' || !isSafeObjectKey(field)) return false;
  if (field === '__create__' || field === '__delete__') {
    if (field === '__create__') {
      if (
        !candidate.new_value ||
        typeof candidate.new_value !== 'object' ||
        Array.isArray(candidate.new_value)
      ) {
        return false;
      }
    }
    return true;
  }
  const allowedFields = schema.allowedFieldsByEntity[candidate.entity_type as TEntityType];
  return Boolean(allowedFields && allowedFields.has(field));
}

export interface GenericP2pSignalEnvelope {
  v: 1;
  type: 'offer' | 'answer';
  deviceId: string;
  sdp: string;
  createdAtIso: string;
}

export interface GenericP2pWireConfig<
  TDeltaKind extends string = string,
  TAckKind extends string = string,
> {
  deltaKind: TDeltaKind;
  ackKind: TAckKind;
  signalPrefix: string;
  maxOperations?: number;
  invalidPayloadMessage?: string;
}

export type GenericP2pDeltaMessage<
  TEntityType extends string = string,
  TDeltaKind extends string = string,
> = {
  kind: TDeltaKind;
  senderDeviceId: string;
  sentAtIso: string;
  operations: GenericSyncOperation<TEntityType>[];
};

export type GenericP2pAckMessage<TAckKind extends string = string> = {
  kind: TAckKind;
  senderDeviceId: string;
  receivedCount: number;
  appliedCount: number;
  scopedOpsCount: number;
  conflictCount: number;
  ackAtIso: string;
};

export function createGenericP2pDeltaMessage<
  TEntityType extends string,
  TDeltaKind extends string,
>(params: {
  deltaKind: TDeltaKind;
  senderDeviceId: string;
  operations: GenericSyncOperation<TEntityType>[];
  includePeerRelays?: boolean;
  sentAtIso?: string;
  maxOperations?: number;
}): GenericP2pDeltaMessage<TEntityType, TDeltaKind> {
  const maxOps = params.maxOperations ?? 100_000;
  const filtered = params.includePeerRelays
    ? params.operations
    : params.operations.filter((op) => op.device_id === params.senderDeviceId);

  return {
    kind: params.deltaKind,
    senderDeviceId: params.senderDeviceId,
    sentAtIso: params.sentAtIso || nowIsoUtcGeneric(),
    operations: filtered.slice(-maxOps),
  };
}

export function parseGenericP2pWirePayload<
  TOperation,
  TAck extends Record<string, unknown> = Record<string, unknown>,
>(
  rawText: string,
  options: {
    ackKind: string;
    maxOperations?: number;
    validateOperation: (op: unknown) => op is TOperation;
    invalidPayloadMessage?: string;
  }
): {
  messageKind: 'delta' | 'ack';
  senderDeviceId: string;
  operations: TOperation[];
  ack?: TAck;
} {
  const maxOps = options.maxOperations ?? 100_000;
  const parsed = JSON.parse(rawText) as Record<string, unknown> | unknown[];
  if (parsed && !Array.isArray(parsed) && parsed.kind === options.ackKind) {
    return {
      messageKind: 'ack',
      senderDeviceId: String(parsed.senderDeviceId || 'peer'),
      operations: [],
      ack: parsed as TAck,
    };
  }

  let rawOps: unknown[] | null = null;
  let senderDeviceId = 'peer';

  if (Array.isArray(parsed)) {
    rawOps = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.operations)) {
      rawOps = parsed.operations;
    }
    if (typeof parsed.senderDeviceId === 'string' && parsed.senderDeviceId.trim()) {
      senderDeviceId = parsed.senderDeviceId.trim();
    } else if (typeof parsed.device_id === 'string' && parsed.device_id.trim()) {
      senderDeviceId = parsed.device_id.trim();
    }
  }

  if (!rawOps) {
    throw new Error(
      options.invalidPayloadMessage || 'Payload is not a valid P2P or delta outbox message.'
    );
  }
  if (rawOps.length > maxOps) {
    throw new Error(
      `Peer payload contains ${rawOps.length.toLocaleString()} operations, exceeding the ${maxOps.toLocaleString()} safety limit.`
    );
  }

  const validOps = rawOps.filter((op): op is TOperation => options.validateOperation(op));
  return {
    messageKind: 'delta',
    senderDeviceId,
    operations: validOps,
  };
}

export function encodeGenericP2pSignalToken(
  envelope: GenericP2pSignalEnvelope,
  signalPrefix = 'LAN-P2P1:'
): string {
  const bytes = utf8StringToBytes(JSON.stringify(envelope));
  return `${signalPrefix}${bytesToBase64(bytes)}`;
}

export function decodeGenericP2pSignalToken(
  rawToken: string,
  signalPrefix = 'LAN-P2P1:'
): GenericP2pSignalEnvelope {
  const clean = rawToken.trim();
  if (!clean) {
    throw new Error('Paste a peer connection code first.');
  }
  let jsonStr = clean;
  if (signalPrefix && clean.startsWith(signalPrefix)) {
    const b64 = clean.slice(signalPrefix.length).trim();
    const bytes = base64ToBytes(b64);
    jsonStr = bytesToUtf8String(bytes);
  }
  const parsed = JSON.parse(jsonStr) as Partial<GenericP2pSignalEnvelope>;
  if (
    !parsed ||
    parsed.v !== 1 ||
    (parsed.type !== 'offer' && parsed.type !== 'answer') ||
    typeof parsed.sdp !== 'string' ||
    !parsed.sdp.trim()
  ) {
    const prefixLabel = signalPrefix ? signalPrefix.replace(/:$/, '') : 'P2P';
    throw new Error(
      `Invalid LAN P2P pairing code. Copy the full ${prefixLabel} token from your peer device.`
    );
  }
  return {
    v: 1,
    type: parsed.type,
    deviceId:
      typeof parsed.deviceId === 'string' && parsed.deviceId.trim()
        ? parsed.deviceId.trim()
        : 'peer',
    sdp: parsed.sdp,
    createdAtIso: typeof parsed.createdAtIso === 'string' ? parsed.createdAtIso : nowIsoUtcGeneric(),
  };
}

export interface CollectionSetImpact {
  incomingCount: number;
  currentCount: number;
  netDelta: number;
  currentOnlyCount: number;
  newIncomingCount: number;
  matchedExistingCount: number;
}

/**
 * Pure set-difference helper computing replace vs. merge impact for any keyed collection.
 */
export function computeCollectionSetImpact(
  incomingIds: Iterable<string>,
  currentIds: Iterable<string>
): CollectionSetImpact {
  const incomingSet = new Set(incomingIds);
  const currentSet = new Set(currentIds);

  let currentOnlyCount = 0;
  for (const id of currentSet) {
    if (!incomingSet.has(id)) currentOnlyCount += 1;
  }

  let newIncomingCount = 0;
  let matchedExistingCount = 0;
  for (const id of incomingSet) {
    if (currentSet.has(id)) matchedExistingCount += 1;
    else newIncomingCount += 1;
  }

  return {
    incomingCount: incomingSet.size,
    currentCount: currentSet.size,
    netDelta: incomingSet.size - currentSet.size,
    currentOnlyCount,
    newIncomingCount,
    matchedExistingCount,
  };
}

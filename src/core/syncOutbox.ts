/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure Field-Level Multi-Worker Sync & Conflict Resolution Engine (`src/core/syncOutbox.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls.
 *
 * Implements:
 * - Immutable append-only operation outbox (`SyncOperation` entries keyed by `op_id`)
 * - Additive set-union semantics for grow-only barn logs (breedings, weights/care logs, shows)
 * - Field-level merging so Worker A editing weight + Worker B editing cage location merge cleanly
 * - Deterministic `timestamp + logical_counter + device_id` tie-breaking with non-destructive
 *   audit entries in `sync_conflicts` whenever two devices collide on the exact same field.
 */

import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  generateUuid,
  nowIsoUtc,
  ShowEvent,
  SpeciesProfile,
} from './models';
import { sanitizeSpeciesMemo } from './speciesMemo';

export type SyncEntityType =
  | 'animal'
  | 'breeding'
  | 'task'
  | 'careLog'
  | 'show'
  | 'cage'
  | 'species'
  | 'settings'
  | 'photo';

export interface SyncOperation {
  op_id: string;
  entity_type: SyncEntityType;
  entity_uuid: string;
  device_id: string;
  timestamp: string; // ISO-8601 UTC
  logical_counter: number;
  field_name: string; // '__create__', '__delete__', or a specific property name
  new_value: unknown;
}

export interface SyncConflictEntry {
  conflict_id: string;
  entity_type: SyncEntityType;
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

export interface DeltaExportFile {
  format: 'community-pedigree-delta-v1';
  device_id: string;
  exported_at: string;
  operations: SyncOperation[];
}

export function createOutboxOperation(params: {
  entityType: SyncEntityType;
  entityUuid: string;
  deviceId: string;
  logicalCounter: number;
  fieldName: string;
  newValue: unknown;
  timestamp?: string;
}): SyncOperation {
  return {
    op_id: generateUuid(),
    entity_type: params.entityType,
    entity_uuid: params.entityUuid,
    device_id: params.deviceId,
    timestamp: params.timestamp || nowIsoUtc(),
    logical_counter: params.logicalCounter,
    field_name: params.fieldName,
    new_value: params.newValue,
  };
}

/**
 * Deterministic total ordering of operations across multiple offline devices.
 */
export function compareSyncOperations(a: SyncOperation, b: SyncOperation): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  if (a.logical_counter !== b.logical_counter) {
    return a.logical_counter - b.logical_counter;
  }
  if (a.device_id !== b.device_id) return a.device_id < b.device_id ? -1 : 1;
  if (a.op_id !== b.op_id) return a.op_id < b.op_id ? -1 : 1;
  return 0;
}

/**
 * Computes fine-grained field-level `SyncOperation` diffs between two versions of a plain entity.
 */
export function diffEntityFieldsToOperations<T extends { id: string }>(params: {
  entityType: SyncEntityType;
  previous: T | undefined;
  next: T;
  deviceId: string;
  nextCounter: () => number;
  ignoreFields?: string[];
}): SyncOperation[] {
  const ops: SyncOperation[] = [];
  const ignore = new Set(['updatedAt', 'createdAt', ...(params.ignoreFields || [])]);
  const ts = nowIsoUtc();

  if (!params.previous) {
    ops.push(
      createOutboxOperation({
        entityType: params.entityType,
        entityUuid: params.next.id,
        deviceId: params.deviceId,
        logicalCounter: params.nextCounter(),
        fieldName: '__create__',
        newValue: params.next,
        timestamp: ts,
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
        createOutboxOperation({
          entityType: params.entityType,
          entityUuid: params.next.id,
          deviceId: params.deviceId,
          logicalCounter: params.nextCounter(),
          fieldName: key,
          newValue: nextVal,
          timestamp: ts,
        })
      );
    }
  }
  return ops;
}

export interface DeltaMergeResult {
  nextSnapshot: BarnDatabaseSnapshot;
  mergedOperations: SyncOperation[];
  newConflicts: SyncConflictEntry[];
  appliedOpCount: number;
}

function labelForEntity(
  type: SyncEntityType,
  uuid: string,
  snapshot: BarnDatabaseSnapshot
): string {
  if (type === 'animal') {
    const a = snapshot.animals.find((x) => x.id === uuid);
    return a ? `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}` : uuid;
  }
  if (type === 'breeding') {
    const b = snapshot.breedings.find((x) => x.id === uuid);
    return b ? `${b.damName} × ${b.sireName}` : uuid;
  }
  if (type === 'task') {
    const t = snapshot.tasks.find((x) => x.id === uuid);
    return t ? t.title : uuid;
  }
  if (type === 'species') {
    const s = snapshot.speciesProfiles.find((x) => x.id === uuid);
    return s ? s.name : uuid;
  }
  if (type === 'settings') return 'Barn Settings';
  return uuid;
}

function getCollectionMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, { ...item }]));
}

/**
 * Replays incoming worker delta operations into `localSnapshot` at the individual FIELD level.
 * Additive logs (`__create__` on careLogs, breedings, tasks, shows, animals, cages, photos)
 * merge non-destructively via set union; distinct field edits merge cleanly; and exact
 * same-field collisions across two distinct workers log a reversible `SyncConflictEntry`.
 */
export function mergeDeltaOperations(
  localSnapshot: BarnDatabaseSnapshot,
  existingOps: SyncOperation[],
  incomingOps: SyncOperation[],
  _localDeviceId: string
): DeltaMergeResult {
  const byOpId = new Map<string, SyncOperation>();
  for (const op of existingOps) {
    if (op && op.op_id) byOpId.set(op.op_id, op);
  }

  const unseenIncoming: SyncOperation[] = [];
  for (const op of incomingOps) {
    if (!op || !op.op_id) continue;
    if (!byOpId.has(op.op_id)) {
      byOpId.set(op.op_id, op);
      unseenIncoming.push(op);
    }
  }

  if (unseenIncoming.length === 0) {
    return {
      nextSnapshot: localSnapshot,
      mergedOperations: Array.from(byOpId.values()).sort(compareSyncOperations),
      newConflicts: [],
      appliedOpCount: 0,
    };
  }

  const allOpsSorted = Array.from(byOpId.values()).sort(compareSyncOperations);

  const animals = getCollectionMap<Animal>(localSnapshot.animals);
  const photos = getCollectionMap<AnimalPhoto>(localSnapshot.animalPhotos ?? []);
  const cages = getCollectionMap<CageLocation>(localSnapshot.cages);
  const breedings = getCollectionMap<BreedingRecord>(localSnapshot.breedings);
  const tasks = getCollectionMap<BarnTask>(localSnapshot.tasks);
  const careLogs = getCollectionMap<CareLog>(localSnapshot.careLogs);
  const shows = getCollectionMap<ShowEvent>(localSnapshot.shows);
  const speciesProfiles = getCollectionMap<SpeciesProfile>(localSnapshot.speciesProfiles);
  let settings: BarnSettings = { ...localSnapshot.settings };

  // Track the winning op per (entity_type, entity_uuid, field_name) to detect collisions
  const lastFieldOp = new Map<string, SyncOperation>();
  for (const op of existingOps) {
    const key = `${op.entity_type}::${op.entity_uuid}::${op.field_name}`;
    const prev = lastFieldOp.get(key);
    if (!prev || compareSyncOperations(prev, op) < 0) {
      lastFieldOp.set(key, op);
    }
  }

  const newConflicts: SyncConflictEntry[] = [];
  const unseenSorted = [...unseenIncoming].sort(compareSyncOperations);

  for (const op of unseenSorted) {
    const fieldKey = `${op.entity_type}::${op.entity_uuid}::${op.field_name}`;
    const existingFieldOp = lastFieldOp.get(fieldKey);

    // Check if there was a concurrent edit on the EXACT same field from a different device
    if (
      existingFieldOp &&
      op.field_name !== '__create__' &&
      op.field_name !== '__delete__' &&
      existingFieldOp.device_id !== op.device_id &&
      JSON.stringify(existingFieldOp.new_value) !== JSON.stringify(op.new_value)
    ) {
      // Only raise conflict if timestamps are within 7 days of independent offline edits
      const msA = Date.parse(existingFieldOp.timestamp) || 0;
      const msB = Date.parse(op.timestamp) || 0;
      if (Math.abs(msA - msB) <= 7 * 86400_000) {
        const opWins = compareSyncOperations(existingFieldOp, op) < 0;
        const winner = opWins ? op : existingFieldOp;
        const loser = opWins ? existingFieldOp : op;
        newConflicts.push({
          conflict_id: generateUuid(),
          entity_type: op.entity_type,
          entity_uuid: op.entity_uuid,
          entity_label: labelForEntity(op.entity_type, op.entity_uuid, localSnapshot),
          field_name: op.field_name,
          winning_value: winner.new_value,
          winning_device_id: winner.device_id,
          winning_timestamp: winner.timestamp,
          losing_value: loser.new_value,
          losing_device_id: loser.device_id,
          losing_timestamp: loser.timestamp,
          detected_at: nowIsoUtc(),
          resolved: false,
        });
      }
    }

    // Only apply if this operation beats any already-recorded op for the exact same field
    if (existingFieldOp && compareSyncOperations(op, existingFieldOp) < 0 && op.field_name !== '__create__') {
      continue;
    }
    lastFieldOp.set(fieldKey, op);

    const applyToMap = <T extends { id: string; updatedAt: string }>(map: Map<string, T>) => {
      if (op.field_name === '__create__' && op.new_value && typeof op.new_value === 'object') {
        if (!map.has(op.entity_uuid)) {
          map.set(op.entity_uuid, op.new_value as T);
        }
        return;
      }
      if (op.field_name === '__delete__') {
        map.delete(op.entity_uuid);
        return;
      }
      const target = map.get(op.entity_uuid);
      if (target) {
        (target as Record<string, unknown>)[op.field_name] = op.new_value;
        target.updatedAt = op.timestamp;
      }
    };

    switch (op.entity_type) {
      case 'animal':
        applyToMap(animals);
        break;
      case 'photo':
        applyToMap(photos);
        break;
      case 'cage':
        applyToMap(cages);
        break;
      case 'breeding':
        applyToMap(breedings);
        break;
      case 'task':
        applyToMap(tasks);
        break;
      case 'careLog':
        applyToMap(careLogs);
        break;
      case 'show':
        applyToMap(shows);
        break;
      case 'species':
        applyToMap(speciesProfiles);
        break;
      case 'settings':
        if (op.field_name !== '__create__' && op.field_name !== '__delete__') {
          (settings as unknown as Record<string, unknown>)[op.field_name] = op.new_value;
          settings.updatedAt = op.timestamp;
        }
        break;
    }
  }

  return {
    nextSnapshot: {
      settings,
      speciesProfiles: Array.from(speciesProfiles.values())
        .map((sp) => ({
          ...sp,
          memoText: sanitizeSpeciesMemo(sp.memoText),
          memoUpdatedAt: typeof sp.memoUpdatedAt === 'string' ? sp.memoUpdatedAt : '',
        }))
        .sort(
          (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
        ),
      animals: Array.from(animals.values()),
      animalPhotos: Array.from(photos.values()),
      cages: Array.from(cages.values()),
      breedings: Array.from(breedings.values()),
      tasks: Array.from(tasks.values()),
      careLogs: Array.from(careLogs.values()),
      shows: Array.from(shows.values()),
    },
    mergedOperations: allOpsSorted,
    newConflicts,
    appliedOpCount: unseenIncoming.length,
  };
}

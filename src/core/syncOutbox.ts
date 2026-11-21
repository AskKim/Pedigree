/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
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
  normalizeBreedScheduleOverrides,
  nowIsoUtc,
  ShowEvent,
  SpeciesProfile,
} from './models';
import { normalizeShowResults, mergeEnteredAnimalIdsWithResults } from './showResults';
import { sanitizeSpeciesMemo } from './speciesMemo';
import {
  isValidSyncOperation,
  MAX_DELTA_OPERATIONS,
  sanitizeCustomColors,
  sanitizeSafeRasterImageDataUrl,
} from './inputSanitization';

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
  /** Optional per-record monotonic revision counter protecting sequential edits against device clock rewinds. */
  record_rev?: number;
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
  recordRev?: number;
}): SyncOperation {
  const op: SyncOperation = {
    op_id: generateUuid(),
    entity_type: params.entityType,
    entity_uuid: params.entityUuid,
    device_id: params.deviceId,
    timestamp: params.timestamp || nowIsoUtc(),
    logical_counter: params.logicalCounter,
    field_name: params.fieldName,
    new_value: params.newValue,
  };
  if (typeof params.recordRev === 'number' && Number.isFinite(params.recordRev) && params.recordRev >= 0) {
    op.record_rev = Math.floor(params.recordRev);
  }
  return op;
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
 * Ordering for two operations targeting the EXACT same `(entity_type, entity_uuid)`.
 * When both carry monotonic `record_rev` numbers that differ, the higher revision
 * always wins even if one device's local wall-clock was rewound backward.
 */
export function compareSameEntitySyncOperations(a: SyncOperation, b: SyncOperation): number {
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
  return compareSyncOperations(a, b);
}

/**
 * Returns the next monotonic `_rev` integer for a mutated record.
 */
export function bumpRecordRevision(previous?: { _rev?: number } | null): number {
  const prevRev =
    previous && typeof previous._rev === 'number' && Number.isFinite(previous._rev) && previous._rev >= 0
      ? Math.floor(previous._rev)
      : 0;
  return prevRev + 1;
}

/**
 * Computes fine-grained field-level `SyncOperation` diffs between two versions of a plain entity.
 */
export function diffEntityFieldsToOperations<T extends { id: string; _rev?: number }>(params: {
  entityType: SyncEntityType;
  previous: T | undefined;
  next: T;
  deviceId: string;
  nextCounter: () => number;
  ignoreFields?: string[];
  timestamp?: string;
  recordRev?: number;
}): SyncOperation[] {
  const ops: SyncOperation[] = [];
  const ignore = new Set(['updatedAt', 'createdAt', '_rev', ...(params.ignoreFields || [])]);
  const ts = params.timestamp || nowIsoUtc();
  const explicitRev =
    typeof params.recordRev === 'number' && Number.isFinite(params.recordRev)
      ? Math.floor(params.recordRev)
      : typeof params.next._rev === 'number' && Number.isFinite(params.next._rev)
      ? Math.floor(params.next._rev)
      : bumpRecordRevision(params.previous);

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
        recordRev: explicitRev,
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
          recordRev: explicitRev,
        })
      );
    }
  }
  return ops;
}

/**
 * Strips base64 image payloads from an `AnimalPhoto` so delta/folder sync queues
 * only lightweight photo metadata while large image blobs travel via `.ZIP` backups.
 */
export function stripPhotoBlobsForSync(photo: AnimalPhoto): AnimalPhoto {
  return {
    ...photo,
    dataUrl: '',
    thumbnailDataUrl: '',
  };
}

/**
 * Computes field-level and create/delete `SyncOperation` entries across all synced
 * snapshot collections when transitioning from `previous` to `next` (for bulk operations
 * such as cross-species migrations). Photo diffs always ignore image blob fields.
 */
export function diffSnapshotsToSyncOperations(params: {
  previous: BarnDatabaseSnapshot;
  next: BarnDatabaseSnapshot;
  deviceId: string;
  nextCounter: () => number;
  timestamp?: string;
  includeSettings?: boolean;
}): SyncOperation[] {
  const ts = params.timestamp || nowIsoUtc();
  const ops: SyncOperation[] = [];

  const diffCollection = <T extends { id: string; _rev?: number }>(
    entityType: Exclude<SyncEntityType, 'settings'>,
    prevList: T[],
    nextList: T[]
  ) => {
    const prevById = new Map<string, T>(prevList.map((item) => [item.id, item]));
    const nextById = new Map<string, T>(nextList.map((item) => [item.id, item]));
    const ignoreFields =
      entityType === 'photo' ? ['dataUrl', 'thumbnailDataUrl'] : undefined;

    for (const nextItem of nextList) {
      const prevItem = prevById.get(nextItem.id);
      const safeNext =
        !prevItem && entityType === 'photo'
          ? (stripPhotoBlobsForSync(nextItem as unknown as AnimalPhoto) as unknown as T)
          : nextItem;
      const rev =
        typeof nextItem._rev === 'number' && Number.isFinite(nextItem._rev)
          ? Math.floor(nextItem._rev)
          : bumpRecordRevision(prevItem);

      ops.push(
        ...diffEntityFieldsToOperations({
          entityType,
          previous: prevItem,
          next: safeNext,
          deviceId: params.deviceId,
          nextCounter: params.nextCounter,
          ignoreFields,
          timestamp: ts,
          recordRev: rev,
        })
      );
    }

    for (const prevItem of prevList) {
      if (!nextById.has(prevItem.id)) {
        ops.push(
          createOutboxOperation({
            entityType,
            entityUuid: prevItem.id,
            deviceId: params.deviceId,
            logicalCounter: params.nextCounter(),
            fieldName: '__delete__',
            newValue: true,
            timestamp: ts,
            recordRev: bumpRecordRevision(prevItem),
          })
        );
      }
    }
  };

  diffCollection('species', params.previous.speciesProfiles, params.next.speciesProfiles);
  diffCollection('animal', params.previous.animals, params.next.animals);
  diffCollection('photo', params.previous.animalPhotos ?? [], params.next.animalPhotos ?? []);
  diffCollection('cage', params.previous.cages, params.next.cages);
  diffCollection('breeding', params.previous.breedings, params.next.breedings);
  diffCollection('task', params.previous.tasks, params.next.tasks);
  diffCollection('careLog', params.previous.careLogs, params.next.careLogs);
  diffCollection('show', params.previous.shows, params.next.shows);

  if (params.includeSettings) {
    ops.push(
      ...diffEntityFieldsToOperations({
        entityType: 'settings',
        previous: params.previous.settings,
        next: params.next.settings,
        deviceId: params.deviceId,
        nextCounter: params.nextCounter,
        ignoreFields: [
          'lastBackupMeta',
          'backupReminderSnoozedUntilMs',
          'autoOffloadRetiredToOpfs',
        ],
        timestamp: ts,
        recordRev: bumpRecordRevision(params.previous.settings),
      })
    );
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
  if (incomingOps.length > MAX_DELTA_OPERATIONS) {
    throw new Error(
      `Delta sync payload contains ${incomingOps.length.toLocaleString()} operations, exceeding the rational limit of ${MAX_DELTA_OPERATIONS.toLocaleString()}. Import a full backup .ZIP instead.`
    );
  }

  const byOpId = new Map<string, SyncOperation>();
  for (const op of existingOps) {
    if (isValidSyncOperation(op)) byOpId.set(op.op_id, op);
  }

  const unseenIncoming: SyncOperation[] = [];
  for (const op of incomingOps) {
    if (!isValidSyncOperation(op)) continue;
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
    if (!prev || compareSameEntitySyncOperations(prev, op) < 0) {
      lastFieldOp.set(key, op);
    }
  }

  const newConflicts: SyncConflictEntry[] = [];
  const unseenSorted = [...unseenIncoming].sort((a, b) =>
    a.entity_type === b.entity_type && a.entity_uuid === b.entity_uuid
      ? compareSameEntitySyncOperations(a, b)
      : compareSyncOperations(a, b)
  );

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
      // and neither operation strictly supersedes the other via sequential `_rev`
      const msA = Date.parse(existingFieldOp.timestamp) || 0;
      const msB = Date.parse(op.timestamp) || 0;
      const sequentialSupersede =
        typeof existingFieldOp.record_rev === 'number' &&
        typeof op.record_rev === 'number' &&
        existingFieldOp.record_rev !== op.record_rev &&
        Math.abs(existingFieldOp.record_rev - op.record_rev) > 0;
      if (Math.abs(msA - msB) <= 7 * 86400_000 || sequentialSupersede) {
        const opWins = compareSameEntitySyncOperations(existingFieldOp, op) < 0;
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
    if (existingFieldOp && compareSameEntitySyncOperations(op, existingFieldOp) < 0 && op.field_name !== '__create__') {
      continue;
    }
    lastFieldOp.set(fieldKey, op);

    const applyToMap = <T extends { id: string; updatedAt: string; _rev?: number }>(map: Map<string, T>) => {
      if (op.field_name === '__create__' && op.new_value && typeof op.new_value === 'object') {
        if (!map.has(op.entity_uuid)) {
          const clone: Record<string, unknown> = { ...(op.new_value as Record<string, unknown>), id: op.entity_uuid };
          if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
            clone._rev = Math.max(Number(clone._rev) || 0, Math.floor(op.record_rev));
          }
          if (op.entity_type === 'photo') {
            const rawData = typeof clone.dataUrl === 'string' ? clone.dataUrl.trim() : '';
            const rawThumb =
              typeof clone.thumbnailDataUrl === 'string' ? clone.thumbnailDataUrl.trim() : '';
            if (rawData) {
              const safeData = sanitizeSafeRasterImageDataUrl(rawData);
              if (!safeData) return;
              clone.dataUrl = safeData;
              clone.thumbnailDataUrl =
                (rawThumb ? sanitizeSafeRasterImageDataUrl(rawThumb) : '') || safeData;
            } else if (rawThumb) {
              const safeThumb = sanitizeSafeRasterImageDataUrl(rawThumb);
              if (!safeThumb) return;
              clone.dataUrl = safeThumb;
              clone.thumbnailDataUrl = safeThumb;
            } else {
              clone.dataUrl = '';
              clone.thumbnailDataUrl = '';
            }
          }
          if (op.entity_type === 'show') {
            const cleanResults = normalizeShowResults(clone.results, { dropEmpty: false });
            clone.results = cleanResults.length > 0 ? cleanResults : undefined;
            clone.enteredAnimalIds = mergeEnteredAnimalIdsWithResults(
              Array.isArray(clone.enteredAnimalIds) ? (clone.enteredAnimalIds as string[]) : [],
              cleanResults
            );
          }
          map.set(op.entity_uuid, clone as unknown as T);
        }
        return;
      }
      if (op.field_name === '__delete__') {
        map.delete(op.entity_uuid);
        return;
      }
      const target = map.get(op.entity_uuid);
      if (target) {
        let nextVal = op.new_value;
        if (
          op.entity_type === 'photo' &&
          (op.field_name === 'dataUrl' || op.field_name === 'thumbnailDataUrl')
        ) {
          const safeUrl = sanitizeSafeRasterImageDataUrl(nextVal);
          if (!safeUrl) return;
          nextVal = safeUrl;
        } else if (op.entity_type === 'show' && op.field_name === 'results') {
          const cleanResults = normalizeShowResults(nextVal, { dropEmpty: false });
          nextVal = cleanResults.length > 0 ? cleanResults : undefined;
        }
        (target as Record<string, unknown>)[op.field_name] = nextVal;
        target.updatedAt = op.timestamp;
        if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
          target._rev = Math.max(target._rev ?? 0, Math.floor(op.record_rev));
        }
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
          const nextSettingsVal =
            op.field_name === 'customColors'
              ? sanitizeCustomColors(op.new_value)
              : op.new_value;
          (settings as unknown as Record<string, unknown>)[op.field_name] = nextSettingsVal;
          settings.updatedAt = op.timestamp;
          if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
            settings._rev = Math.max(settings._rev ?? 0, Math.floor(op.record_rev));
          }
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
          breedOverrides: normalizeBreedScheduleOverrides(sp.breedOverrides),
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

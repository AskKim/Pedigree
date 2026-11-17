import { describe, expect, it } from 'vitest';
import { makeAnimal, makeEmptySnapshot } from './testFixtures';
import {
  analyzePhotoStorageFootprintPure,
  OVERSIZED_PHOTO_BYTES_THRESHOLD,
  pruneFullResPayloadsFromSnapshotPure,
  removeOrphanPhotosFromSnapshotPure,
} from '../photoMaintenance';
import {
  inspectParsedArchiveBeforeRestorePure,
  inspectSnapshotBeforeRestorePure,
} from '../archiveInspector';
import {
  buildCompleteBackupZipArchive,
  parseBackupArchiveInput,
} from '../backupArchive';
import {
  ENCRYPTED_ENVELOPE_FORMAT,
  EncryptedPayloadEnvelope,
  tryExtractEncryptedEnvelopeFromZip,
  tryParseEncryptedEnvelopeJson,
  wrapEncryptedZipContainer,
} from '../encryptedExport';
import {
  buildDeterministicGoogleCalendarEventId,
  buildGoogleCalendarEventPayload,
} from '../calendarExport';
import {
  bumpRecordRevision,
  compareSameEntitySyncOperations,
  createOutboxOperation,
  diffEntityFieldsToOperations,
  mergeDeltaOperations,
} from '../syncOutbox';
import { AnimalPhoto, BarnTask } from '../models';

function makeFakeBase64DataUrl(byteSize: number, mime = 'image/jpeg'): string {
  const b64Len = Math.ceil((byteSize * 4) / 3);
  return `data:${mime};base64,${'A'.repeat(b64Len)}`;
}

describe('Stage B pure domain features (IMP-023)', () => {
  describe('photoMaintenance — footprint analyzer, orphan cleanup, and full-res compaction', () => {
    it('audits per-species photo storage, removes orphan photos safely, and compacts full-res payloads to thumbnails', () => {
      const buck = makeAnimal('buck-1', { species: 'Rabbit', tattoo: 'BR1', sex: 'Male' });
      const ewe = makeAnimal('ewe-1', { species: 'Sheep', tattoo: 'SH1', sex: 'Female' });

      const thumbUrl = makeFakeBase64DataUrl(4 * 1024);
      const normalFullUrl = makeFakeBase64DataUrl(90 * 1024);
      const oversizedUrl = makeFakeBase64DataUrl(OVERSIZED_PHOTO_BYTES_THRESHOLD + 60 * 1024);

      const photos: AnimalPhoto[] = [
        {
          id: 'ph-rabbit',
          species: 'Rabbit',
          animalId: buck.id,
          isPrimary: true,
          sortOrder: 0,
          caption: 'Show pose',
          originalFileName: 'buck.jpg',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 900,
          originalBytes: 900_000,
          storedBytes: 90 * 1024,
          thumbnailDataUrl: thumbUrl,
          dataUrl: normalFullUrl,
          _rev: 1,
          createdAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-01T10:00:00.000Z',
        },
        {
          id: 'ph-sheep-big',
          species: 'Sheep',
          animalId: ewe.id,
          isPrimary: true,
          sortOrder: 0,
          caption: 'Fleece check',
          originalFileName: 'ewe.jpg',
          mimeType: 'image/jpeg',
          width: 3200,
          height: 2400,
          originalBytes: 2_500_000,
          storedBytes: OVERSIZED_PHOTO_BYTES_THRESHOLD + 60 * 1024,
          thumbnailDataUrl: thumbUrl,
          dataUrl: oversizedUrl,
          _rev: 2,
          createdAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-01T10:00:00.000Z',
        },
        {
          id: 'ph-orphan',
          species: 'Rabbit',
          animalId: 'deleted-animal-xyz',
          isPrimary: false,
          sortOrder: 1,
          caption: 'Orphan pic',
          originalFileName: 'orphan.jpg',
          mimeType: 'image/jpeg',
          width: 800,
          height: 600,
          originalBytes: 300_000,
          storedBytes: 50 * 1024,
          thumbnailDataUrl: thumbUrl,
          dataUrl: makeFakeBase64DataUrl(50 * 1024),
          _rev: 1,
          createdAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-01T10:00:00.000Z',
        },
      ];

      const snap = makeEmptySnapshot({
        animals: [buck, ewe],
        animalPhotos: photos,
      });

      const report = analyzePhotoStorageFootprintPure(snap, 'balanced');
      expect(report.totalPhotoCount).toBe(3);
      expect(report.orphanPhotoIds).toEqual(['ph-orphan']);
      expect(report.oversizedPhotoIds).toEqual(['ph-sheep-big']);
      expect(report.fullResPrunableIds).toEqual(['ph-rabbit', 'ph-sheep-big']);
      expect(report.speciesBreakdown.map((s) => s.species)).toEqual(['Sheep', 'Rabbit']);
      expect(report.estimatedReclaimableFullResBytes).toBeGreaterThan(500 * 1024);

      const orphanClean = removeOrphanPhotosFromSnapshotPure(snap);
      expect(orphanClean.removedCount).toBe(1);
      expect(orphanClean.removedPhotoIds).toEqual(['ph-orphan']);
      expect(orphanClean.reclaimedBytes).toBeGreaterThanOrEqual(50 * 1024);
      expect(orphanClean.nextSnapshot.animalPhotos?.map((p) => p.id)).toEqual([
        'ph-rabbit',
        'ph-sheep-big',
      ]);

      const pruned = pruneFullResPayloadsFromSnapshotPure(orphanClean.nextSnapshot);
      expect(pruned.prunedCount).toBe(2);
      expect(pruned.reclaimedBytes).toBeGreaterThan(500 * 1024);
      for (const p of pruned.nextSnapshot.animalPhotos ?? []) {
        expect(p.dataUrl).toBe(p.thumbnailDataUrl);
        expect(p._rev).toBeGreaterThan(1);
      }

      // Re-running compaction is a clean no-op
      const secondRun = pruneFullResPayloadsFromSnapshotPure(pruned.nextSnapshot);
      expect(secondRun.prunedCount).toBe(0);
    });
  });

  describe('archiveInspector — dry-run species breakdown, conflict preview, and replace/merge impact', () => {
    it('inspects ZIP backups without mutating current barn state and computes replace vs merge deltas', () => {
      const sharedBuck = makeAnimal('buck-shared', {
        name: 'Shared Buck',
        tattoo: 'DUP1',
        sex: 'Male',
        status: 'Active',
      });
      const localOnlyDoe = makeAnimal('doe-local', {
        name: 'Local Only Doe',
        tattoo: 'LOC1',
        sex: 'Female',
      });
      const incomingDupBuck = makeAnimal('buck-dup', {
        name: 'Duplicate Tattoo Buck',
        tattoo: 'DUP1',
        sex: 'Male',
      });
      const incomingArchived = makeAnimal('ewe-arch', {
        species: 'Sheep',
        name: 'Archived Ewe',
        tattoo: 'SH9',
        sex: 'Female',
        status: 'Sold',
        archived: true,
      });

      const current = makeEmptySnapshot({
        animals: [sharedBuck, localOnlyDoe],
      });
      const incoming = makeEmptySnapshot({
        animals: [sharedBuck, incomingDupBuck, incomingArchived],
      });

      const zipArchive = buildCompleteBackupZipArchive(incoming);
      const parsed = parseBackupArchiveInput(zipArchive.bytes, 'barn-backup.zip', current.settings);
      const inspection = inspectParsedArchiveBeforeRestorePure(parsed, current, {
        fileName: 'barn-backup.zip',
        encrypted: false,
      });

      expect(inspection.sourceFormat).toBe('zip');
      expect(inspection.animalCount).toBe(3);
      expect(inspection.activeAnimalCount).toBe(2);
      expect(inspection.archivedAnimalCount).toBe(1);
      expect(inspection.duplicateTattooCount).toBe(2);
      expect(inspection.speciesBreakdown.find((s) => s.species === 'Rabbit')?.animalCount).toBe(2);
      expect(inspection.speciesBreakdown.find((s) => s.species === 'Sheep')?.animalCount).toBe(1);

      expect(inspection.replaceImpact).toEqual({
        currentAnimalCount: 2,
        currentPhotoCount: 0,
        netAnimalDelta: 1,
        currentAnimalsNotInIncoming: 1,
      });
      expect(inspection.mergeImpact).toEqual({
        newAnimalsToAdd: 2,
        existingAnimalsMatched: 1,
        newPhotosToAdd: 0,
        existingPhotosMatched: 0,
      });
    });

    it('summarizes snapshots directly for SQLite pre-restore dry-run inspection', () => {
      const a1 = makeAnimal('a1', { tattoo: 'T1', sex: 'Male' });
      const snap = makeEmptySnapshot({ animals: [a1] });
      const insp = inspectSnapshotBeforeRestorePure(snap, null, {
        fileName: 'barn.sqlite',
        sourceFormat: 'sqlite',
      });
      expect(insp.sourceFormat).toBe('sqlite');
      expect(insp.animalCount).toBe(1);
      expect(insp.replaceImpact).toBeNull();
      expect(insp.mergeImpact).toBeNull();
    });
  });

  describe('syncOutbox monotonic _rev counters & clock-rewind safety', () => {
    it('lets higher record_rev beat an earlier wall-clock timestamp when comparing ops on the same entity', () => {
      const olderRevOp = createOutboxOperation({
        entityType: 'animal',
        entityUuid: 'ani-1',
        deviceId: 'dev-a',
        logicalCounter: 5,
        fieldName: 'weightGrams',
        newValue: 3800,
        timestamp: '2026-06-10T15:00:00.000Z',
        recordRev: 2,
      });
      const newerRevRewoundClockOp = createOutboxOperation({
        entityType: 'animal',
        entityUuid: 'ani-1',
        deviceId: 'dev-b',
        logicalCounter: 6,
        fieldName: 'weightGrams',
        newValue: 4100,
        // Device B's wall clock was rewound to 2025, yet record_rev advanced to 3!
        timestamp: '2025-01-01T08:00:00.000Z',
        recordRev: 3,
      });

      expect(compareSameEntitySyncOperations(olderRevOp, newerRevRewoundClockOp)).toBeLessThan(0);

      const startAnimal = makeAnimal('ani-1', { weightGrams: 3800, _rev: 2 });
      const localSnap = makeEmptySnapshot({ animals: [startAnimal] });

      const mergeResult = mergeDeltaOperations(
        localSnap,
        [olderRevOp],
        [newerRevRewoundClockOp],
        'dev-a'
      );

      const updated = mergeResult.nextSnapshot.animals.find((a) => a.id === 'ani-1');
      expect(updated?.weightGrams).toBe(4100);
      expect(updated?._rev).toBe(3);
      expect(mergeResult.newConflicts).toHaveLength(1);
      expect(mergeResult.newConflicts[0]?.winning_value).toBe(4100);
    });

    it('bumps _rev cleanly and propagates record_rev on field diffs', () => {
      const prev = makeAnimal('ani-2', { weightGrams: 3000, _rev: 4 });
      const rev = bumpRecordRevision(prev);
      expect(rev).toBe(5);
      const next = { ...prev, weightGrams: 3250, _rev: rev };

      let counter = 10;
      const ops = diffEntityFieldsToOperations({
        entityType: 'animal',
        previous: prev,
        next,
        deviceId: 'dev-a',
        nextCounter: () => ++counter,
        timestamp: '2026-06-01T12:00:00.000Z',
        recordRev: rev,
      });

      expect(ops).toHaveLength(1);
      expect(ops[0]?.field_name).toBe('weightGrams');
      expect(ops[0]?.record_rev).toBe(5);
    });
  });

  describe('calendarExport deterministic Google Calendar event IDs', () => {
    it('generates Google Calendar compliant [a-v0-9] deterministic IDs per task UUID', () => {
      const idA1 = buildDeterministicGoogleCalendarEventId('task-uuid-abc-123');
      const idA2 = buildDeterministicGoogleCalendarEventId('task-uuid-abc-123');
      const idB = buildDeterministicGoogleCalendarEventId('task-uuid-xyz-999');

      expect(idA1).toBe(idA2);
      expect(idA1).not.toBe(idB);
      expect(idA1).toMatch(/^[a-v0-9]{10,64}$/);

      const task: BarnTask = {
        id: 'task-uuid-abc-123',
        species: 'Rabbit',
        title: 'Place Nestbox',
        dueDateIso: '2026-05-12',
        priority: 'High',
        category: 'Nestbox',
        linkedAnimalId: '',
        linkedAnimalName: '',
        linkedBreedingId: '',
        completed: false,
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-01T10:00:00.000Z',
      };
      const payload = buildGoogleCalendarEventPayload(task);
      expect(payload?.id).toBe(idA1);
    });
  });

  describe('encryptedExport — envelope validation & ZIP wrapper round-trip', () => {
    it('wraps and extracts encrypted payload envelopes cleanly inside standard ZIP archives', () => {
      const sampleEnvelope: EncryptedPayloadEnvelope = {
        format: ENCRYPTED_ENVELOPE_FORMAT,
        cipher: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: 210_000,
        saltBase64: 'AAAAAAAAAAAAAAAAAAAAAA==',
        ivBase64: 'AAAAAAAAAAAAAAAA',
        payloadKind: 'zip_archive',
        originalFileName: 'barn.zip',
        createdAtIso: '2026-05-01T00:00:00.000Z',
        ciphertextBase64: 'BBBBBBBB',
      };

      const rawJson = JSON.stringify(sampleEnvelope);
      expect(tryParseEncryptedEnvelopeJson(rawJson)?.format).toBe(ENCRYPTED_ENVELOPE_FORMAT);
      expect(tryParseEncryptedEnvelopeJson('{"plain":true}')).toBeNull();

      const zipBytes = wrapEncryptedZipContainer(sampleEnvelope, 'barn.zip');
      const extracted = tryExtractEncryptedEnvelopeFromZip(zipBytes, 'barn-encrypted.zip');
      expect(extracted).toEqual(sampleEnvelope);

      const plainZip = buildCompleteBackupZipArchive(makeEmptySnapshot());
      expect(tryExtractEncryptedEnvelopeFromZip(plainZip.bytes, 'plain.zip')).toBeNull();
    });
  });
});

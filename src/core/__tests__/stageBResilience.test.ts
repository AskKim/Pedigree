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
  mergePhotosOnlyIntoSnapshot,
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
  diffSnapshotsToSyncOperations,
  mergeDeltaOperations,
  stripPhotoBlobsForSync,
} from '../syncOutbox';
import { migrateAnimalsToSpecies } from '../speciesMigration';
import { mergeBarnSnapshots } from '../syncAndExports';
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

    it('propagates __delete__ outbox ops across cages, breedings, tasks, careLogs, shows, photos, and species', () => {
      const snap = makeEmptySnapshot({
        cages: [
          {
            id: 'c-1',
            species: 'Rabbit',
            label: 'R-1',
            section: 'Main',
            capacity: 1,
            notes: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        breedings: [
          {
            id: 'b-1',
            species: 'Rabbit',
            sireId: 's-1',
            damId: 'd-1',
            sireName: 'S',
            damName: 'D',
            bredDateIso: '2026-01-01',
            expectedDueDateIso: '2026-02-01',
            actualBirthDateIso: '',
            projectedCoiPercent: 0,
            liveCount: 0,
            stillbornCount: 0,
            fosteredCount: 0,
            weanedCount: 0,
            offspringCreated: false,
            status: 'Bred',
            notes: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        tasks: [
          {
            id: 't-1',
            species: 'Rabbit',
            title: 'Place Nestbox',
            dueDateIso: '2026-01-28',
            priority: 'High',
            category: 'Nestbox',
            linkedAnimalId: '',
            linkedAnimalName: '',
            linkedBreedingId: 'b-1',
            completed: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        careLogs: [
          {
            id: 'l-1',
            species: 'Rabbit',
            animalId: 'a-1',
            dateIso: '2026-01-02',
            type: 'Weight Check',
            title: 'Monthly weigh-in',
            weightGrams: 1800,
            showLegEarned: false,
            notes: '',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        shows: [
          {
            id: 'sh-1',
            species: 'Rabbit',
            name: 'Spring Classic',
            location: 'Barn',
            sanctioningBody: 'ARBA',
            eventDateIso: '2026-04-01',
            entryDeadlineIso: '2026-03-25',
            enteredAnimalIds: [],
            notes: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        animalPhotos: [
          {
            id: 'ph-1',
            species: 'Rabbit',
            animalId: 'a-1',
            isPrimary: true,
            sortOrder: 0,
            caption: 'Profile',
            originalFileName: 'clover.webp',
            mimeType: 'image/webp',
            width: 800,
            height: 600,
            originalBytes: 120000,
            storedBytes: 32000,
            thumbnailDataUrl: 'data:image/webp;base64,AAA=',
            dataUrl: 'data:image/webp;base64,BBBB',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        speciesProfiles: [
          {
            id: 'sp-1',
            name: 'Rabbit',
            gestationDays: 31,
            rebreedDaysAfterBirth: 28,
            weanDaysAfterBirth: 42,
            birthEventLabel: 'Kindling',
            maleLabel: 'Buck',
            femaleLabel: 'Doe',
            offspringLabel: 'Kit',
            exampleBreeds: ['Holland Lop'],
            milestones: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const ts = '2026-02-01T12:00:00.000Z';
      const deleteOps = [
        createOutboxOperation({
          entityType: 'cage',
          entityUuid: 'c-1',
          deviceId: 'dev-b',
          logicalCounter: 1,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'breeding',
          entityUuid: 'b-1',
          deviceId: 'dev-b',
          logicalCounter: 2,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'task',
          entityUuid: 't-1',
          deviceId: 'dev-b',
          logicalCounter: 3,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'careLog',
          entityUuid: 'l-1',
          deviceId: 'dev-b',
          logicalCounter: 4,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'show',
          entityUuid: 'sh-1',
          deviceId: 'dev-b',
          logicalCounter: 5,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'photo',
          entityUuid: 'ph-1',
          deviceId: 'dev-b',
          logicalCounter: 6,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'species',
          entityUuid: 'sp-1',
          deviceId: 'dev-b',
          logicalCounter: 7,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
      ];

      const merged = mergeDeltaOperations(snap, [], deleteOps, 'dev-a');
      expect(merged.appliedOpCount).toBe(7);
      expect(merged.nextSnapshot.cages).toHaveLength(0);
      expect(merged.nextSnapshot.breedings).toHaveLength(0);
      expect(merged.nextSnapshot.tasks).toHaveLength(0);
      expect(merged.nextSnapshot.careLogs).toHaveLength(0);
      expect(merged.nextSnapshot.shows).toHaveLength(0);
      expect(merged.nextSnapshot.animalPhotos).toHaveLength(0);
      expect(merged.nextSnapshot.speciesProfiles).toHaveLength(0);
    });

    it('syncs metadata-only photo ops cleanly without binary blobs and hydrates blobs from ZIP/JSON restores', () => {
      const fullPhoto: AnimalPhoto = {
        id: 'ph-meta-1',
        species: 'Rabbit',
        animalId: 'ani-1',
        isPrimary: true,
        sortOrder: 0,
        caption: 'Initial pose',
        originalFileName: 'buck.webp',
        mimeType: 'image/webp',
        width: 1280,
        height: 960,
        originalBytes: 1_200_000,
        storedBytes: 88_000,
        thumbnailDataUrl: 'data:image/webp;base64,AAAA',
        dataUrl: 'data:image/webp;base64,BBBBBBBB',
        _rev: 1,
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
      };

      const stripped = stripPhotoBlobsForSync(fullPhoto);
      expect(stripped.dataUrl).toBe('');
      expect(stripped.thumbnailDataUrl).toBe('');

      const createOp = createOutboxOperation({
        entityType: 'photo',
        entityUuid: stripped.id,
        deviceId: 'dev-a',
        logicalCounter: 1,
        fieldName: '__create__',
        newValue: stripped,
        timestamp: '2026-06-01T10:00:00.000Z',
        recordRev: 1,
      });

      const unsafeSvgOp = createOutboxOperation({
        entityType: 'photo',
        entityUuid: 'ph-xss',
        deviceId: 'dev-a',
        logicalCounter: 2,
        fieldName: '__create__',
        newValue: {
          ...stripped,
          id: 'ph-xss',
          dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        },
        timestamp: '2026-06-01T10:00:00.000Z',
        recordRev: 1,
      });

      const peerBase = makeEmptySnapshot({
        animals: [makeAnimal('ani-1', { name: 'Clover', species: 'Rabbit' })],
      });
      const afterDelta = mergeDeltaOperations(peerBase, [], [createOp, unsafeSvgOp], 'dev-b');
      expect(afterDelta.nextSnapshot.animalPhotos).toHaveLength(1);
      const syncedPhoto = afterDelta.nextSnapshot.animalPhotos![0];
      expect(syncedPhoto.id).toBe('ph-meta-1');
      expect(syncedPhoto.dataUrl).toBe('');
      expect(syncedPhoto.caption).toBe('Initial pose');

      // Peer updates caption locally at a later timestamp before ZIP blob restore arrives
      const peerEditedSnap = {
        ...afterDelta.nextSnapshot,
        animalPhotos: [
          {
            ...syncedPhoto,
            caption: 'Renamed on Device B',
            _rev: 2,
            updatedAt: '2026-06-01T12:00:00.000Z',
          },
        ],
      };

      const rehydrated = mergePhotosOnlyIntoSnapshot(peerEditedSnap, [fullPhoto]);
      expect(rehydrated.photosUpdated).toBe(1);
      expect(rehydrated.nextSnapshot.animalPhotos?.[0]?.dataUrl).toBe('data:image/webp;base64,BBBBBBBB');
      expect(rehydrated.nextSnapshot.animalPhotos?.[0]?.caption).toBe('Renamed on Device B');

      const mergedJson = mergeBarnSnapshots(peerEditedSnap, makeEmptySnapshot({
        animals: peerEditedSnap.animals,
        animalPhotos: [fullPhoto],
      }));
      expect(mergedJson.snapshot.animalPhotos?.[0]?.dataUrl).toBe('data:image/webp;base64,BBBBBBBB');
      expect(mergedJson.snapshot.animalPhotos?.[0]?.caption).toBe('Renamed on Device B');
    });

    it('emits zero-blob outbox operations with bumped _rev values for cross-species migrations', () => {
      const rabbit = makeAnimal('r-1', { species: 'Rabbit', name: 'Hop', _rev: 2 });
      const photo: AnimalPhoto = {
        id: 'ph-r1',
        species: 'Rabbit',
        animalId: 'r-1',
        isPrimary: true,
        sortOrder: 0,
        caption: 'Profile',
        originalFileName: 'hop.webp',
        mimeType: 'image/webp',
        width: 800,
        height: 600,
        originalBytes: 100_000,
        storedBytes: 30_000,
        thumbnailDataUrl: 'data:image/webp;base64,THUMB',
        dataUrl: 'data:image/webp;base64,FULLDATA',
        _rev: 1,
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
      };
      const baseSnap = makeEmptySnapshot({
        animals: [rabbit],
        animalPhotos: [photo],
      });

      const migrated = migrateAnimalsToSpecies(baseSnap, ['r-1'], 'Guinea Pig');
      expect(migrated.snapshot.animals[0]?._rev).toBe(3);
      expect(migrated.snapshot.animalPhotos?.[0]?._rev).toBe(2);

      let counter = 100;
      const ops = diffSnapshotsToSyncOperations({
        previous: baseSnap,
        next: migrated.snapshot,
        deviceId: 'dev-a',
        nextCounter: () => ++counter,
        timestamp: '2026-06-02T09:00:00.000Z',
      });

      expect(ops.some((op) => op.entity_type === 'animal' && op.field_name === 'species' && op.new_value === 'Guinea Pig' && op.record_rev === 3)).toBe(true);
      expect(ops.some((op) => op.entity_type === 'photo' && op.field_name === 'species' && op.new_value === 'Guinea Pig' && op.record_rev === 2)).toBe(true);
      expect(JSON.stringify(ops)).not.toContain('FULLDATA');
      expect(JSON.stringify(ops)).not.toContain('THUMB');

      const peerMerged = mergeDeltaOperations(baseSnap, [], ops, 'dev-b');
      expect(peerMerged.nextSnapshot.animals[0]?.species).toBe('Guinea Pig');
      expect(peerMerged.nextSnapshot.animalPhotos?.[0]?.species).toBe('Guinea Pig');
      // Peer keeps its existing binary image payload intact!
      expect(peerMerged.nextSnapshot.animalPhotos?.[0]?.dataUrl).toBe('data:image/webp;base64,FULLDATA');
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

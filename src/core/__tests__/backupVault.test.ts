/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildArchivedAnimalsBundle,
  buildExportCanaryProbe,
  buildVaultBackupEnvelope,
  computePedigreeReferencedIds,
  CURRENT_BACKUP_SCHEMA_VERSION,
  deserializeVaultBackupPayload,
  extractArchiveIndexMetadataOnly,
  isZipMagicBytes,
  mergeRestoredArchiveIntoSnapshot,
  migrateAndValidateBackupEnvelope,
  serializeCompressedVaultBackupZip,
  serializeVaultBackupEnvelope,
  sha256HexPure,
  unpackArchivedAnimalBundle,
  verifyExportCanaryRoundTrip,
} from '../backupVault';
import { Animal, AnimalPhoto, BarnDatabaseSnapshot, CareLog } from '../models';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';

function makeAnimal(overrides: Partial<Animal>): Animal {
  return {
    id: 'a-1',
    tattoo: 'T1',
    name: 'Test Animal',
    species: 'Rabbit',
    breed: 'Holland Lop',
    variety: 'Tort',
    sex: 'Female',
    status: 'Active',
    archived: false,
    needsAttention: false,
    birthDateIso: '2023-02-10',
    weightGrams: 1700,
    genotype: [],
    genotypeRaw: '',
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: 'R-1',
    breederName: 'Barn Owner',
    ownerName: 'Barn Owner',
    sireId: '',
    damId: '',
    notes: 'Original notes',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRichSnapshot(): BarnDatabaseSnapshot {
  const sample = buildFullPredefinedSampleSnapshot();
  const sire = makeAnimal({
    id: 'arch-sire',
    name: 'Grand Sire',
    tattoo: 'GS1',
    sex: 'Male',
    status: 'Deceased',
    archived: true,
    deceasedDateIso: '2025-04-01',
    deathCause: 'Age',
  });
  const unlinkedSold = makeAnimal({
    id: 'arch-unlinked-sold',
    name: 'Sold Junior',
    tattoo: 'SJ9',
    sex: 'Female',
    status: 'Sold',
    archived: true,
    soldDateIso: '2025-05-12',
    buyerName: 'Maple Creek Rabbitry',
  });
  const activeChild = makeAnimal({
    id: 'active-doe',
    name: 'Active Daughter',
    tattoo: 'AD2',
    sex: 'Female',
    status: 'Active',
    archived: false,
    sireId: 'arch-sire',
  });

  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const photos: AnimalPhoto[] = [
    {
      id: 'photo-sire',
      species: 'Rabbit',
      animalId: 'arch-sire',
      isPrimary: true,
      sortOrder: 0,
      caption: 'Show table pose',
      originalFileName: 'sire.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      originalBytes: 100,
      storedBytes: 68,
      thumbnailDataUrl: tinyPng,
      dataUrl: tinyPng,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'photo-sold',
      species: 'Rabbit',
      animalId: 'arch-unlinked-sold',
      isPrimary: true,
      sortOrder: 0,
      caption: 'Sale photo',
      originalFileName: 'sold.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      originalBytes: 100,
      storedBytes: 68,
      thumbnailDataUrl: tinyPng,
      dataUrl: tinyPng,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];
  const careLogs: CareLog[] = [
    {
      id: 'log-sire',
      species: 'Rabbit',
      animalId: 'arch-sire',
      dateIso: '2024-06-01',
      type: 'Weight Check',
      title: 'Monthly weigh-in',
      weightGrams: 1850,
      withdrawalDays: 0,
      withdrawalClearDateIso: '',
      showLegEarned: false,
      notes: 'Steady weight',
      createdAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
    {
      id: 'log-active',
      species: 'Rabbit',
      animalId: 'active-doe',
      dateIso: '2025-06-01',
      type: 'Weight Check',
      title: 'Senior weigh-in',
      weightGrams: 1740,
      withdrawalDays: 0,
      withdrawalClearDateIso: '',
      showLegEarned: false,
      notes: '',
      createdAt: '2025-06-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
    },
  ];

  return {
    settings: {
      ...sample.settings,
      barnName: 'Cedar Ridge Barn',
      autoOffloadRetiredToOpfs: true,
    },
    speciesProfiles: sample.speciesProfiles.slice(0, 2),
    animals: [sire, unlinkedSold, activeChild],
    animalPhotos: photos,
    cages: [],
    breedings: [],
    tasks: [],
    careLogs,
    shows: [],
    feedBatches: [],
    feedAllocations: [],
  };
}

describe('backupVault envelopes, schema migration & root validation', () => {
  it('stamps _schemaVersion=6 and verifies SHA-256 checksum on round-trip', () => {
    const snap = makeRichSnapshot();
    const { envelope, jsonText } = serializeVaultBackupEnvelope(snap, {
      kind: 'monthly',
      note: 'Automated monthly verification',
    });

    expect(envelope._schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(envelope.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256HexPure('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );

    for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 250]) {
      const payload = 'a'.repeat(len);
      const expectedHex = createHash('sha256').update(payload, 'utf8').digest('hex');
      expect(sha256HexPure(payload)).toBe(expectedHex);
    }
    const unicodeSample = '🐇 Barn #1 — Pedigree UTF-8 Block Boundary Check '.repeat(5);
    expect(sha256HexPure(unicodeSample)).toBe(
      createHash('sha256').update(unicodeSample, 'utf8').digest('hex')
    );

    const restored = migrateAndValidateBackupEnvelope(jsonText, snap.settings);
    expect(restored.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(restored.migratedFromVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(restored.vaultKind).toBe('monthly');
    expect(restored.checksumValid).toBe(true);
    expect(restored.snapshot.settings.barnName).toBe('Cedar Ridge Barn');
    expect(restored.snapshot.settings.autoOffloadRetiredToOpfs).toBe(true);
    expect(restored.snapshot.animals).toHaveLength(3);
  });

  it('rejects tampered vault envelopes and malformed root JSON', () => {
    const snap = makeRichSnapshot();
    const direct = buildVaultBackupEnvelope(snap, { kind: 'manual' });
    expect(direct.vaultKind).toBe('manual');
    const { envelope } = serializeVaultBackupEnvelope(snap, { kind: 'manual' });

    envelope.snapshot.settings.barnName = 'Tampered Barn';
    expect(() =>
      migrateAndValidateBackupEnvelope(JSON.stringify(envelope))
    ).toThrow(/checksum verification failed/i);

    expect(() => migrateAndValidateBackupEnvelope('[]')).toThrow(
      /non-empty JSON object/i
    );
    expect(() =>
      migrateAndValidateBackupEnvelope(
        JSON.stringify({
          format: 'community-pedigree-vault-backup',
          _schemaVersion: 6,
          snapshot: { animals: 'bad' },
        })
      )
    ).toThrow(/missing required animals or speciesProfiles/i);
  });

  it('migrates legacy v4/v5 direct backup payloads cleanly to schema v6', () => {
    const snap = makeRichSnapshot();
    const legacyV4 = {
      format: 'community-pedigree-backup',
      version: 4,
      settings: {
        barnName: 'Legacy Barn',
        preferredUnit: 'lbs_oz',
        defaultSpecies: 'Rabbit',
        defaultGenerations: 4,
        themeMode: 'light',
      },
      speciesProfiles: snap.speciesProfiles,
      animals: snap.animals.map((a) => ({
        ...a,
        offloadedArchiveKey: 'arch-legacy-1',
        offloadedAtIso: '2025-06-01T00:00:00.000Z',
      })),
      cages: [],
      breedings: [],
      tasks: [],
      careLogs: snap.careLogs,
      shows: [],
      animalPhotos: [],
    };

    const migrated = migrateAndValidateBackupEnvelope(JSON.stringify(legacyV4));
    expect(migrated.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(migrated.migratedFromVersion).toBe(4);
    expect(migrated.checksumValid).toBeNull();
    expect(migrated.snapshot.settings.barnName).toBe('Legacy Barn');
    expect(migrated.snapshot.animals[0].offloadedArchiveKey).toBe('arch-legacy-1');
  });

  it('compresses vault envelopes into .vault.zip and deserializes both .vault.zip and legacy .json', () => {
    const snap = makeRichSnapshot();
    const { envelope, zipBytes } = serializeCompressedVaultBackupZip(snap, {
      kind: 'manual',
      note: 'Compressed vault check',
    });
    const { jsonText: prettyJson } = serializeVaultBackupEnvelope(snap, {
      kind: 'manual',
      note: 'Compressed vault check',
    });

    expect(isZipMagicBytes(zipBytes)).toBe(true);
    expect(zipBytes.byteLength).toBeLessThan(prettyJson.length);
    expect(envelope.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    const fromZip = deserializeVaultBackupPayload(zipBytes, snap.settings, 'manual-vault.vault.zip');
    expect(fromZip.checksumValid).toBe(true);
    expect(fromZip.snapshot.animals).toHaveLength(3);
    expect(fromZip.snapshot.settings.barnName).toBe('Cedar Ridge Barn');

    const fromLegacyJson = deserializeVaultBackupPayload(
      prettyJson,
      snap.settings,
      'manual-vault.json'
    );
    expect(fromLegacyJson.checksumValid).toBe(true);
    expect(fromLegacyJson.snapshot.animals).toHaveLength(3);

    expect(() =>
      deserializeVaultBackupPayload(
        new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
        snap.settings,
        'corrupt.vault.zip'
      )
    ).toThrow();
  });
});

describe('Export Canary probe round-trip verification', () => {
  it('passes valid canary probes and flags checksum or count tampering', () => {
    const snap = makeRichSnapshot();
    const probe = buildExportCanaryProbe(snap);
    expect(probe.format).toBe('community-pedigree-canary-v1');
    expect(probe.animalCount).toBe(3);

    expect(verifyExportCanaryRoundTrip(probe, JSON.stringify(probe))).toEqual({
      ok: true,
    });

    const altered = { ...probe, animalCount: 99 };
    const failed = verifyExportCanaryRoundTrip(probe, JSON.stringify(altered));
    expect(failed.ok).toBe(false);
    expect(failed.reason).toBeTruthy();

    const invalidJson = verifyExportCanaryRoundTrip(probe, '{corrupt');
    expect(invalidJson.ok).toBe(false);
  });
});

describe('Archived Herds bundle offload, Pedigree Stub preservation & restore', () => {
  it('retains a Pedigree Reference Stub only for ancestor-linked animals and removes unlinked ones cleanly', () => {
    const snap = makeRichSnapshot();
    const offloadIds = new Set(['arch-sire', 'arch-unlinked-sold']);
    const referenced = computePedigreeReferencedIds(snap.animals, offloadIds);
    expect(referenced.has('arch-sire')).toBe(true);
    expect(referenced.has('arch-unlinked-sold')).toBe(false);

    const built = buildArchivedAnimalsBundle(snap, ['arch-sire', 'arch-unlinked-sold']);
    expect(built.stubAnimalIds).toEqual(['arch-sire']);
    expect(built.removedAnimalIds).toEqual(['arch-unlinked-sold']);
    expect(built.indexEntry.animalCount).toBe(2);
    expect(built.indexEntry.photoCount).toBe(2);
    expect(built.indexEntry.careLogCount).toBe(1);

    // Active DB keeps the active daughter + stripped Pedigree Reference stub for Grand Sire
    expect(built.nextActiveSnapshot.animals.map((a) => a.id).sort()).toEqual([
      'active-doe',
      'arch-sire',
    ]);
    const stub = built.nextActiveSnapshot.animals.find((a) => a.id === 'arch-sire')!;
    expect(stub.offloadedArchiveKey).toBe(built.archiveKey);
    expect(stub.archived).toBe(true);
    // Active DB no longer carries photos or care logs for offloaded animals
    expect(built.nextActiveSnapshot.animalPhotos).toHaveLength(0);
    expect(built.nextActiveSnapshot.careLogs.map((l) => l.id)).toEqual(['log-active']);

    // Unpack archive ZIP and merge back to Active
    const unpacked = unpackArchivedAnimalBundle(built.zipBytes, snap.settings);
    expect(unpacked.animals).toHaveLength(2);
    expect(unpacked.animalPhotos).toHaveLength(2);
    expect(unpacked.careLogs).toHaveLength(1);

    const merged = mergeRestoredArchiveIntoSnapshot(built.nextActiveSnapshot, unpacked, {
      restoreToActiveStatus: true,
    });
    expect(merged.restoredAnimalCount).toBe(2);
    expect(merged.restoredPhotoCount).toBe(2);
    expect(merged.restoredCareLogCount).toBe(1);
    expect(merged.nextSnapshot.animals).toHaveLength(3);
    const restoredSire = merged.nextSnapshot.animals.find((a) => a.id === 'arch-sire')!;
    expect(restoredSire.offloadedArchiveKey).toBeUndefined();
    expect(restoredSire.status).toBe('Active');
    expect(restoredSire.archived).toBe(false);
    expect(merged.nextSnapshot.animalPhotos).toHaveLength(2);
    expect(merged.nextSnapshot.careLogs).toHaveLength(2);

    const rebuiltMeta = extractArchiveIndexMetadataOnly(built.zipBytes, built.fileName);
    expect(rebuiltMeta.archiveKey).toBe(built.indexEntry.archiveKey);
    expect(rebuiltMeta.animalCount).toBe(2);
    expect(rebuiltMeta.photoCount).toBe(2);
    expect(rebuiltMeta.careLogCount).toBe(1);
    expect(rebuiltMeta.checksumSha256).toBe(built.indexEntry.checksumSha256);
  });
});

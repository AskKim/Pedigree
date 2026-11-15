import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildBarnBackupZip,
  buildCleanZipBackupFileName,
  parseBarnBackupZip,
} from '../barnZipBackup';
import { AnimalPhoto } from '../models';
import { makeAnimal, makeEmptySnapshot, makeSettings } from './testFixtures';

const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const TINY_PNG_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

describe('barnZipBackup — organized ZIP export & import with images', () => {
  it('packages JSON, SQLite, CSV, per-species reports, README, manifest, and organized animal images into a single ZIP', () => {
    const photo: AnimalPhoto = {
      id: 'photo-12345678',
      species: 'Rabbit',
      animalId: 'r1',
      isPrimary: true,
      sortOrder: 0,
      caption: 'Show pose',
      originalFileName: 'daisy.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      originalBytes: TINY_PNG_BYTES.byteLength,
      storedBytes: TINY_PNG_BYTES.byteLength,
      thumbnailDataUrl: TINY_PNG_DATA_URL,
      dataUrl: TINY_PNG_DATA_URL,
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    };

    const snap = makeEmptySnapshot({
      settings: makeSettings({ barnName: 'Meadowbrook Rabbitry', breederName: 'Kim' }),
      animals: [makeAnimal('r1', { name: 'Oak Ridge Daisy', tattoo: 'D1', species: 'Rabbit' })],
      animalPhotos: [photo],
    });

    const fakeSqlite = new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65]);
    const built = buildBarnBackupZip(snap, {
      sqliteBytes: fakeSqlite,
      engineName: 'SQL.js Test',
      exportedAt: new Date('2026-11-15T15:00:00.000Z'),
    });

    expect(buildCleanZipBackupFileName('Meadowbrook Rabbitry', '2026-11-15')).toBe(
      'meadowbrook-rabbitry-full-backup-2026-11-15.zip'
    );
    expect(built.fileName).toBe('meadowbrook-rabbitry-full-backup-2026-11-15.zip');
    expect(built.manifest.counts.imageFilesExported).toBe(1);

    const unpacked = unzipSync(built.zipBytes);
    const paths = Object.keys(unpacked);

    expect(paths).toContain('README.txt');
    expect(paths).toContain('manifest.json');
    expect(paths).toContain('data/barn-backup.json');
    expect(paths).toContain('data/barn-database.sqlite');
    expect(paths).toContain('data/herd-all-species.csv');
    expect(paths).toContain('reports/barn-report-all-species.json');
    expect(paths.some((p) => p.startsWith('reports/species/rabbit-report'))).toBe(true);

    const imagePath = built.manifest.photoFiles[0].zipPath;
    expect(imagePath).toMatch(/^images\/rabbit\/oak-ridge-daisy-d1-1-photo-12\.png$/);
    expect(Array.from(unpacked[imagePath])).toEqual(Array.from(TINY_PNG_BYTES));

    const parsed = parseBarnBackupZip(built.zipBytes, makeSettings());
    expect(parsed.kind).toBe('snapshot');
    expect(parsed.summary.barnName).toBe('Meadowbrook Rabbitry');
    expect(parsed.summary.animalCount).toBe(1);
    expect(parsed.summary.photoCount).toBe(1);
    expect(parsed.summary.imageFilesFound).toBe(1);
    expect(parsed.snapshot?.animalPhotos[0].dataUrl).toBe(TINY_PNG_DATA_URL);
  });

  it('rehydrates missing photo dataUrl directly from images/ inside the ZIP archive', () => {
    const snap = makeEmptySnapshot({
      animals: [makeAnimal('r1', { name: 'Clover', tattoo: 'C1', species: 'Rabbit' })],
      animalPhotos: [
        {
          id: 'p-rehydrate',
          species: 'Rabbit',
          animalId: 'r1',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Side profile',
          originalFileName: 'clover.png',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          originalBytes: TINY_PNG_BYTES.byteLength,
          storedBytes: TINY_PNG_BYTES.byteLength,
          thumbnailDataUrl: TINY_PNG_DATA_URL,
          dataUrl: TINY_PNG_DATA_URL,
          createdAt: '2026-11-15T10:00:00.000Z',
          updatedAt: '2026-11-15T10:00:00.000Z',
        },
      ],
    });

    const built = buildBarnBackupZip(snap);
    const entries = unzipSync(built.zipBytes);

    // Strip embedded dataUrls from data/barn-backup.json to verify images/ rehydration
    const jsonObj = JSON.parse(strFromU8(entries['data/barn-backup.json']));
    jsonObj.animalPhotos[0].dataUrl = '';
    jsonObj.animalPhotos[0].thumbnailDataUrl = '';
    entries['data/barn-backup.json'] = strToU8(JSON.stringify(jsonObj, null, 2));

    const rezipped = zipSync(entries);
    const parsed = parseBarnBackupZip(rezipped, makeSettings());

    expect(parsed.kind).toBe('snapshot');
    expect(parsed.snapshot?.animalPhotos).toHaveLength(1);
    expect(parsed.snapshot?.animalPhotos[0].dataUrl).toBe(TINY_PNG_DATA_URL);
    expect(parsed.snapshot?.animalPhotos[0].caption).toBe('Side profile');
  });

  it('falls back to embedded .sqlite database when JSON backup is absent', () => {
    const fakeSqlite = new Uint8Array([1, 2, 3, 4, 5]);
    const zipBytes = zipSync({
      'data/barn-database.sqlite': fakeSqlite,
    });

    const parsed = parseBarnBackupZip(zipBytes, makeSettings());
    expect(parsed.kind).toBe('sqlite');
    expect(Array.from(parsed.sqliteBytes || [])).toEqual([1, 2, 3, 4, 5]);
  });
});

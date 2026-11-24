/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimalPhoto, BarnDatabaseSnapshot } from '../../core/models';
import {
  analyzePhotoStorageFootprintPure,
  OVERSIZED_PHOTO_BYTES_THRESHOLD,
  pruneFullResPayloadsFromSnapshotPure,
} from '../../core/photoMaintenance';
import { buildFullPredefinedSampleSnapshot } from '../../core/sampleData';
import {
  buildCompleteBackupZipArchive,
  buildPhotosOnlyZipArchive,
  parseBackupArchiveInput,
  streamCompleteBackupZipArchive,
  streamPhotosOnlyZipArchive,
} from '../../core/backupArchive';
import { generateBarnBackupJsonChunks } from '../../core/syncAndExports';
import {
  BoundedPhotoDataCache,
  hydrateSnapshotWithPhotoDataUrls,
  stripPhotoDataUrlsFromSnapshot,
} from '../photoHydration';
import {
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsWritableStream,
  setOpfsRootResolverForTest,
} from '../opfsStorage';
import {
  buildCompleteBackupZipOffThread,
  buildCompleteBackupZipToOpfsTmpOffThread,
  buildImporterWorkerSnapshot,
  buildPhotosOnlyZipOffThread,
  buildPhotosOnlyZipToOpfsTmpOffThread,
  buildSupportBundleZipOffThread,
  parseBackupArchiveOffThread,
  parseExternalImportOffThread,
  resetArchiveWorkerForTests,
} from '../offThreadWorkerClient';

function makeTestSnapshot(): BarnDatabaseSnapshot {
  const sample = buildFullPredefinedSampleSnapshot();
  const settings = sample.settings;
  const rabbitPhoto: AnimalPhoto = {
    id: 'photo-rabbit-1',
    species: 'Rabbit',
    animalId: 'a-rabbit-1',
    isPrimary: true,
    sortOrder: 0,
    caption: 'Front pose',
    originalFileName: 'clover.jpg',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    originalBytes: 1000,
    storedBytes: 68,
    thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const goatPhoto: AnimalPhoto = {
    id: 'photo-goat-1',
    species: 'Goat',
    animalId: 'a-goat-1',
    isPrimary: true,
    sortOrder: 0,
    caption: 'Dairy stand',
    originalFileName: 'daisy.jpg',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    originalBytes: 1200,
    storedBytes: 68,
    thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  return {
    settings,
    speciesProfiles: sample.speciesProfiles.slice(0, 2),
    animals: [
      {
        id: 'a-rabbit-1',
        species: 'Rabbit',
        name: 'Clover',
        tattoo: 'CLV1',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Female',
        birthDateIso: '2024-03-01',
        sireId: '',
        damId: '',
        weightGrams: 1650,
        status: 'Active',
        archived: false,
        needsAttention: false,
        legsCount: 0,
        registrationNumber: '',
        grandChampionNumber: '',
        cageLocation: 'R-1',
        breederName: 'Tester',
        ownerName: 'Tester',
        genotype: [],
        genotypeRaw: '',
        notes: '',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'a-goat-1',
        species: 'Goat',
        name: 'Daisy',
        tattoo: 'DSY1',
        breed: 'Nigerian Dwarf',
        variety: 'Chamoisee',
        sex: 'Female',
        birthDateIso: '2023-04-12',
        sireId: '',
        damId: '',
        weightGrams: 28000,
        status: 'Active',
        archived: false,
        needsAttention: false,
        legsCount: 0,
        registrationNumber: '',
        grandChampionNumber: '',
        cageLocation: 'G-1',
        breederName: 'Tester',
        ownerName: 'Tester',
        genotype: [],
        genotypeRaw: '',
        notes: '',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    animalPhotos: [rabbitPhoto, goatPhoto],
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    feedBatches: [],
    feedAllocations: [],
  };
}

function createSimpleOpfsMock() {
  const dirs = new Map<string, Map<string, Uint8Array>>();
  let writeCount = 0;

  const toUint8 = async (data: string | Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> => {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return new Uint8Array(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(await data.arrayBuffer());
  };

  const makeDir = (dirName: string): OpfsDirectoryHandle => {
    if (!dirs.has(dirName)) dirs.set(dirName, new Map());
    const files = dirs.get(dirName)!;
    return {
      kind: 'directory',
      name: dirName,
      async getDirectoryHandle(name, opts) {
        if (!dirs.has(name)) {
          if (!opts?.create) throw new Error(`Missing dir ${name}`);
          dirs.set(name, new Map());
        }
        return makeDir(name);
      },
      async getFileHandle(name, opts): Promise<OpfsFileHandle> {
        if (!files.has(name)) {
          if (!opts?.create) throw new Error(`Missing file ${name}`);
          files.set(name, new Uint8Array(0));
        }
        return {
          kind: 'file',
          name,
          async getFile() {
            const bytes = files.get(name) ?? new Uint8Array(0);
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            return new Blob([copy], { type: 'application/octet-stream' });
          },
          async createWritable(): Promise<OpfsWritableStream> {
            writeCount += 1;
            const chunks: Uint8Array[] = [];
            return {
              async write(data) {
                chunks.push(await toUint8(data));
              },
              async close() {
                const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
                const merged = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) {
                  merged.set(c, off);
                  off += c.byteLength;
                }
                files.set(name, merged);
              },
            };
          },
        };
      },
      async removeEntry(name) {
        if (!files.delete(name)) throw new Error(`Missing file ${name}`);
      },
      async *entries() {
        for (const [k] of files.entries()) {
          yield [k, await this.getFileHandle(k)] as [string, OpfsFileHandle];
        }
      },
    };
  };

  return {
    dirs,
    getWriteCount: () => writeCount,
    rootHandle: makeDir(''),
  };
}

afterEach(() => {
  setOpfsRootResolverForTest(null);
  resetArchiveWorkerForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BoundedPhotoDataCache & snapshot hydration', () => {
  it('enforces LRU eviction and refreshes recency on get', () => {
    const cache = new BoundedPhotoDataCache(2);
    cache.set('p1', 'data:p1');
    cache.set('p2', 'data:p2');
    // Touch p1 so p2 becomes least-recently-used
    expect(cache.get('p1')).toBe('data:p1');
    cache.set('p3', 'data:p3');

    expect(cache.size()).toBe(2);
    expect(cache.get('p2')).toBeUndefined();
    expect(cache.get('p1')).toBe('data:p1');
    expect(cache.get('p3')).toBe('data:p3');

    cache.resize(1);
    expect(cache.size()).toBe(1);
    expect(cache.get('p3')).toBe('data:p3');
    cache.delete('p3');
    expect(cache.size()).toBe(0);

    // Byte-budget enforcement & trimTo
    const byteCache = new BoundedPhotoDataCache(10, 15);
    byteCache.set('a', '12345678'); // 8 bytes
    byteCache.set('b', '1234567'); // total 15
    expect(byteCache.size()).toBe(2);
    expect(byteCache.byteSize()).toBe(15);
    byteCache.set('c', '12345678'); // exceeds 15 -> evicts 'a' (remaining 15)
    expect(byteCache.get('a')).toBeUndefined();
    expect(byteCache.size()).toBe(2);
    byteCache.trimTo(1, 10);
    expect(byteCache.size()).toBe(1);
    expect(byteCache.byteSize()).toBe(8);
  });

  it('strips full-res dataUrls cleanly while retaining thumbnails, and hydrates selectively by species & cache', async () => {
    const fullSnap = makeTestSnapshot();
    const stripped = stripPhotoDataUrlsFromSnapshot(fullSnap);

    expect(stripped.animalPhotos).toHaveLength(2);
    expect(stripped.animalPhotos![0].dataUrl).toBe('');
    expect(stripped.animalPhotos![0].thumbnailDataUrl).toBe(
      fullSnap.animalPhotos![0].thumbnailDataUrl
    );
    expect(stripped.animalPhotos![1].dataUrl).toBe('');

    const cache = new BoundedPhotoDataCache(4);
    const fetchBatch = vi.fn(async (ids: string[]) => {
      const out: Record<string, string> = {};
      for (const id of ids) {
        const match = fullSnap.animalPhotos!.find((p) => p.id === id);
        if (match) out[id] = match.dataUrl;
      }
      return out;
    });

    // Hydrate only Rabbit photos
    const rabbitHydrated = await hydrateSnapshotWithPhotoDataUrls(
      stripped,
      fetchBatch,
      'Rabbit',
      cache
    );
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch).toHaveBeenCalledWith(['photo-rabbit-1']);
    expect(rabbitHydrated.animalPhotos![0].dataUrl).toBe(fullSnap.animalPhotos![0].dataUrl);
    expect(rabbitHydrated.animalPhotos![1].dataUrl).toBe('');

    // Cached lookup should avoid re-fetching cached photo IDs
    cache.set('photo-goat-1', fullSnap.animalPhotos![1].dataUrl);
    const allFromCache = await hydrateSnapshotWithPhotoDataUrls(
      rabbitHydrated,
      fetchBatch,
      undefined,
      cache
    );
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(allFromCache.animalPhotos![1].dataUrl).toBe(fullSnap.animalPhotos![1].dataUrl);
  });

  it('strips image payloads in buildImporterWorkerSnapshot while keeping photo metadata', () => {
    const snap = makeTestSnapshot();
    const light = buildImporterWorkerSnapshot(snap);
    expect(light.animalPhotos).toHaveLength(2);
    expect(light.animalPhotos![0].id).toBe('photo-rabbit-1');
    expect(light.animalPhotos![0].isPrimary).toBe(true);
    expect(light.animalPhotos![0].dataUrl).toBe('');
    expect(light.animalPhotos![0].thumbnailDataUrl).toBe('');
  });

  it('audits dehydrated photo metadata accurately without loading full-res blobs and supports clock-adjusted pruning', () => {
    const snap = makeTestSnapshot();
    snap.animalPhotos = [
      {
        ...snap.animalPhotos![0],
        storedBytes: OVERSIZED_PHOTO_BYTES_THRESHOLD + 32 * 1024,
        width: 2400,
        height: 1800,
      },
      {
        ...snap.animalPhotos![1],
        storedBytes: 95 * 1024,
        width: 1024,
        height: 768,
      },
    ];
    const stripped = stripPhotoDataUrlsFromSnapshot(snap);
    expect(stripped.animalPhotos!.every((p) => p.dataUrl === '')).toBe(true);

    const footprint = analyzePhotoStorageFootprintPure(stripped, 'balanced');
    expect(footprint.oversizedPhotoIds).toEqual(['photo-rabbit-1']);
    expect(footprint.fullResPrunableIds).toEqual(['photo-rabbit-1', 'photo-goat-1']);

    const cache = new BoundedPhotoDataCache(4);
    cache.set('photo-rabbit-1', snap.animalPhotos![0].dataUrl);
    cache.set('photo-goat-1', snap.animalPhotos![1].dataUrl);

    const customTs = '2026-08-15T14:30:00.000Z';
    const pruned = pruneFullResPayloadsFromSnapshotPure(snap, ['photo-rabbit-1'], customTs);
    expect(pruned.prunedCount).toBe(1);
    expect(pruned.updatedPhotos[0]?.updatedAt).toBe(customTs);
    expect(pruned.updatedPhotos[0]?.dataUrl).toBe(snap.animalPhotos![0].thumbnailDataUrl);

    for (const p of pruned.updatedPhotos) {
      cache.delete(p.id);
    }
    expect(cache.get('photo-rabbit-1')).toBeUndefined();
    expect(cache.get('photo-goat-1')).toBe(snap.animalPhotos![1].dataUrl);
  });
});

describe('offThreadWorkerClient async ZIP & external import execution', () => {
  it('builds and parses complete and photos-only .ZIP archives via fallback cleanly', async () => {
    const snap = makeTestSnapshot();
    const completeZip = await buildCompleteBackupZipOffThread(snap);
    expect(completeZip.bytes.byteLength).toBeGreaterThan(100);
    expect(completeZip.animalCount).toBe(2);
    expect(completeZip.photoCount).toBe(2);

    const parsed = await parseBackupArchiveOffThread(
      completeZip.bytes,
      'backup-test.zip',
      snap.settings
    );
    expect(parsed.kind).toBe('full_snapshot');
    if (parsed.kind === 'full_snapshot') {
      expect(parsed.snapshot.animals).toHaveLength(2);
      expect(parsed.snapshot.animalPhotos).toHaveLength(2);
      expect(parsed.photosReconstructed).toBe(2);
    }

    const photosZip = await buildPhotosOnlyZipOffThread(snap);
    expect(photosZip.photoCount).toBe(2);

    const parsedPhotosOnly = await parseBackupArchiveOffThread(
      photosZip.bytes,
      'photos-only.zip',
      snap.settings
    );
    expect(parsedPhotosOnly.kind).toBe('photos_only');
    if (parsedPhotosOnly.kind === 'photos_only') {
      expect(parsedPhotosOnly.photos).toHaveLength(2);
    }
  });

  it('parses external CSV import off-thread cleanly with dehydrated snapshot', async () => {
    const snap = stripPhotoDataUrlsFromSnapshot(makeTestSnapshot());
    const csvText = 'Name,Tattoo,Sex,Breed\nBramble,BRM9,Male,Holland Lop\n';
    const preview = await parseExternalImportOffThread(
      'universal-csv',
      [{ fileName: 'herd.csv', bytes: new TextEncoder().encode(csvText) }],
      snap,
      {
        fallbackSpeciesName: 'Rabbit',
        appendDeferredImageFilenamesToNotes: true,
      }
    );
    expect(preview.animals.some((a) => a.name === 'Bramble' && a.tattoo === 'BRM9')).toBe(true);
  });

  it('builds support bundle .ZIP archive asynchronously without blocking', async () => {
    const snap = makeTestSnapshot();
    const bundle = await buildSupportBundleZipOffThread({
      entries: [],
      summary: {
        totalEntries: 0,
        errorCount: 0,
        memoryWarningCount: 0,
        crashCount: 0,
        oldestEntryIso: null,
        newestEntryIso: null,
        config: {
          verboseEnabled: true,
          retentionDays: 7,
          supportEmail: '',
        },
        currentMemory: {
          usedHeapBytes: null,
          totalHeapBytes: null,
          heapLimitBytes: null,
          heapPercent: null,
          deviceMemoryGb: null,
        },
        sessionId: 'test-session',
        userAgent: 'vitest',
        platformInfo: 'node',
      },
      snapshot: snap,
      includeData: true,
      includePhotos: false,
    });
    expect(bundle.bytes.byteLength).toBeGreaterThan(50);
    expect(bundle.filename.endsWith('.zip')).toBe(true);
    expect(bundle.includedPhotos).toBe(false);
  });
});

describe('Phase 2 compatibility & memory fallbacks', () => {
  it('detects iPadOS 13+ MacIntel multi-touch UA in isIosBrowser cleanly', async () => {
    const { isIosBrowser } = await import('../storageProtection');
    const originalNav = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        },
        configurable: true,
      });
      expect(isIosBrowser()).toBe(true);

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 0,
        },
        configurable: true,
      });
      expect(isIosBrowser()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        configurable: true,
      });
    }
  });

  it('copyTextWithFallback uses clipboard first, falls back to execCommand, and returns unsupported safely', async () => {
    const { copyTextWithFallback } = await import('../../utils/webFileActions');
    const originalNav = globalThis.navigator;
    const originalDoc = globalThis.document;

    try {
      // 1. Primary clipboard API succeeds
      Object.defineProperty(globalThis, 'navigator', {
        value: { clipboard: { writeText: vi.fn(async () => {}) } },
        configurable: true,
      });
      expect(await copyTextWithFallback('https://example.test/?task=1')).toBe('clipboard');

      // 2. Primary clipboard rejects -> falls back to document.execCommand('copy')
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          clipboard: {
            writeText: vi.fn(async () => {
              throw new Error('Blocked in iframe');
            }),
          },
        },
        configurable: true,
      });
      const fakeTextarea = {
        value: '',
        style: {} as Record<string, string>,
        setAttribute: vi.fn(),
        focus: vi.fn(),
        select: vi.fn(),
      };
      const fakeBody = {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      };
      Object.defineProperty(globalThis, 'document', {
        value: {
          createElement: vi.fn(() => fakeTextarea),
          execCommand: vi.fn(() => true),
          body: fakeBody,
        },
        configurable: true,
      });
      expect(await copyTextWithFallback('fallback-text')).toBe('execCommand');
      expect(fakeBody.appendChild).toHaveBeenCalledTimes(1);
      expect(fakeBody.removeChild).toHaveBeenCalledTimes(1);

      // 3. Neither available -> returns 'unsupported' without throwing
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
      });
      Object.defineProperty(globalThis, 'document', {
        value: undefined,
        configurable: true,
      });
      expect(await copyTextWithFallback('no-copy')).toBe('unsupported');
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'document', {
        value: originalDoc,
        configurable: true,
      });
    }
  });

  it('bounds optimizeStagedImporterPhotos concurrency and yields progress accurately', async () => {
    const { optimizeStagedImporterPhotos } = await import('../webImageOptimizer');
    const staged = Array.from({ length: 3 }, (_, idx) => ({
      id: `p-${idx}`,
      species: 'Rabbit',
      animalId: 'a-1',
      animalName: 'Clover',
      isPrimary: idx === 0,
      sortOrder: idx,
      caption: '',
      entryPath: `photos/img-${idx}.jpg`,
      originalFileName: `img-${idx}.jpg`,
      mimeHint: 'image/jpeg',
      // Small fake payload will fail canvas decode in Node and cleanly record failedFiles
      bytes: new Uint8Array([1, 2, 3]),
    }));

    const progressCalls: number[] = [];
    const result = await optimizeStagedImporterPhotos(
      staged,
      'compact',
      (p) => progressCalls.push(p.completed),
      { concurrency: 1 }
    );

    expect(result.failedFiles).toHaveLength(3);
    expect(progressCalls).toEqual([1, 2, 3]);
  });
});

describe('Low-RAM export streaming & OPFS /tmp staging for all exports', () => {
  it('streams complete & photos-only ZIP archives incrementally with identical parsed output to synchronous builders', async () => {
    const snap = makeTestSnapshot();

    const streamedCompleteChunks: Uint8Array[] = [];
    const completeSummary = await streamCompleteBackupZipArchive(snap, (chunk) => {
      streamedCompleteChunks.push(chunk);
    });
    expect(streamedCompleteChunks.length).toBeGreaterThan(1);
    const completeLen = streamedCompleteChunks.reduce((sum, c) => sum + c.byteLength, 0);
    expect(completeSummary.totalZipBytes).toBe(completeLen);

    const streamedCompleteBytes = new Uint8Array(completeLen);
    let offset = 0;
    for (const c of streamedCompleteChunks) {
      streamedCompleteBytes.set(c, offset);
      offset += c.byteLength;
    }

    const syncComplete = buildCompleteBackupZipArchive(snap);
    expect(completeSummary.animalCount).toBe(syncComplete.animalCount);
    expect(completeSummary.photoCount).toBe(syncComplete.photoCount);
    expect(completeSummary.binderCount).toBe(syncComplete.binderCount);

    const parsedComplete = parseBackupArchiveInput(
      streamedCompleteBytes,
      'streamed-complete.zip',
      snap.settings
    );
    expect(parsedComplete.kind).toBe('full_snapshot');
    if (parsedComplete.kind === 'full_snapshot') {
      expect(parsedComplete.snapshot.animals).toHaveLength(2);
      expect(parsedComplete.snapshot.animalPhotos).toHaveLength(2);
      expect(parsedComplete.photosReconstructed).toBe(2);
    }

    const streamedPhotosChunks: Uint8Array[] = [];
    const photosSummary = await streamPhotosOnlyZipArchive(snap, (chunk) => {
      streamedPhotosChunks.push(chunk);
    });
    const photosBytes = new Uint8Array(photosSummary.totalZipBytes);
    offset = 0;
    for (const c of streamedPhotosChunks) {
      photosBytes.set(c, offset);
      offset += c.byteLength;
    }
    const syncPhotos = buildPhotosOnlyZipArchive(snap);
    expect(photosSummary.photoCount).toBe(syncPhotos.photoCount);
    const parsedPhotos = parseBackupArchiveInput(photosBytes, 'streamed-photos.zip', snap.settings);
    expect(parsedPhotos.kind).toBe('photos_only');
    if (parsedPhotos.kind === 'photos_only') {
      expect(parsedPhotos.photos).toHaveLength(2);
    }
  });

  it('streams off-thread ZIP archives directly into OPFS /tmp when OPFS is available and falls back to bytes when unavailable', async () => {
    const snap = makeTestSnapshot();
    const opfsMock = createSimpleOpfsMock();
    setOpfsRootResolverForTest(async () => opfsMock.rootHandle);

    const completeTmp = await buildCompleteBackupZipToOpfsTmpOffThread(snap);
    expect(completeTmp.opfsTempFileName).toBeTruthy();
    expect(completeTmp.bytes).toBeUndefined();
    expect(completeTmp.blob).toBeDefined();
    expect(opfsMock.dirs.get('tmp')?.has(completeTmp.opfsTempFileName!)).toBe(true);

    const parsedComplete = parseBackupArchiveInput(
      new Uint8Array(await completeTmp.blob!.arrayBuffer()),
      'opfs-complete.zip',
      snap.settings
    );
    expect(parsedComplete.kind).toBe('full_snapshot');

    const photosTmp = await buildPhotosOnlyZipToOpfsTmpOffThread(snap);
    expect(photosTmp.opfsTempFileName).toBeTruthy();
    expect(photosTmp.blob).toBeDefined();
    expect(opfsMock.dirs.get('tmp')?.has(photosTmp.opfsTempFileName!)).toBe(true);

    // Without OPFS, falls back cleanly to Uint8Array bytes
    setOpfsRootResolverForTest(null);
    const originalNav = globalThis.navigator;
    vi.stubGlobal('navigator', {});
    try {
      const fallbackZip = await buildCompleteBackupZipToOpfsTmpOffThread(snap);
      expect(fallbackZip.opfsTempFileName).toBeNull();
      expect(fallbackZip.bytes).toBeDefined();
      expect(fallbackZip.bytes!.byteLength).toBe(fallbackZip.byteSize);
    } finally {
      vi.stubGlobal('navigator', originalNav);
    }
  });

  it('stages small (<512 KB) .HTM downloads, streamed JSON chunks, and Web Share payloads through OPFS /tmp and cleans up immediately', async () => {
    vi.useFakeTimers();
    const {
      downloadTextChunks,
      downloadTextFile,
      shareBinaryFileOrDownload,
      shareTextFileOrDownload,
    } = await import('../../utils/webFileActions');

    const opfsMock = createSimpleOpfsMock();
    setOpfsRootResolverForTest(async () => opfsMock.rootHandle);

    const clickedAnchors: Array<{ download: string; href: string }> = [];
    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => {
      const u = `blob:mock-${createdUrls.length + 1}`;
      createdUrls.push(u);
      return u;
    });
    URL.revokeObjectURL = vi.fn((u: string) => {
      revokedUrls.push(u);
    });

    const fakeBody = { appendChild: vi.fn(), removeChild: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const anchor = {
          href: '',
          download: '',
          parentNode: fakeBody,
          click: () => {
            clickedAnchors.push({ download: anchor.download, href: anchor.href });
          },
        };
        return anchor;
      }),
      body: fakeBody,
    });

    try {
      // 1. Small (< 512 KB) Printable .HTM pedigree should still stage through OPFS /tmp
      await downloadTextFile('clover-pedigree.htm', '<html><body>Small 12 KB Pedigree</body></html>', 'text/html');
      expect(clickedAnchors).toHaveLength(1);
      expect(clickedAnchors[0].download).toBe('clover-pedigree.htm');
      expect(opfsMock.dirs.get('tmp')?.size).toBe(1);

      await vi.advanceTimersByTimeAsync(4500);
      expect(revokedUrls).toHaveLength(1);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);

      // 2. shareTextFileOrDownload stages through OPFS /tmp and cleans up immediately on share resolve
      const shareSpy = vi.fn(async () => {});
      vi.stubGlobal('navigator', {
        canShare: vi.fn(() => true),
        share: shareSpy,
      });

      const sharedRes = await shareTextFileOrDownload({
        filename: 'cage-card.htm',
        content: '<html><body>Cage Card</body></html>',
        mimeType: 'text/html',
        title: 'Cage Card',
      });
      expect(sharedRes).toBe('shared');
      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);

      // 3. shareBinaryFileOrDownload falling back to download hands off the staged /tmp blob without double-writing
      const writesBeforeFallback = opfsMock.getWriteCount();
      vi.stubGlobal('navigator', {
        canShare: vi.fn(() => true),
        share: vi.fn(async () => {
          throw new Error('Share sheet dismissed');
        }),
      });
      const fallbackRes = await shareBinaryFileOrDownload({
        filename: 'support-bundle.zip',
        bytes: new Uint8Array([80, 75, 3, 4]),
        mimeType: 'application/zip',
        title: 'Support Bundle',
      });
      expect(fallbackRes).toBe('downloaded');
      expect(opfsMock.getWriteCount()).toBe(writesBeforeFallback + 1);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(1);

      await vi.advanceTimersByTimeAsync(4500);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);

      // 4. downloadTextChunks streams JSON backup chunks directly into OPFS /tmp
      const snap = makeTestSnapshot();
      await downloadTextChunks(
        'streamed-backup.json',
        generateBarnBackupJsonChunks(snap),
        'application/json'
      );
      expect(clickedAnchors.some((a) => a.download === 'streamed-backup.json')).toBe(true);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(1);
      await vi.advanceTimersByTimeAsync(4500);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});

describe('Canvas memory guardrails, OffscreenCanvas probe, sequential hydration & iOS PWA shares', () => {
  it('probes OffscreenCanvas 2D context before worker usage and releases probe backing store', async () => {
    const { probeOffscreenCanvas2dSupport, releaseCanvas } = await import('../webImageOptimizer');

    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(probeOffscreenCanvas2dSupport()).toBe(false);

    const widthHistory: number[] = [];
    const heightHistory: number[] = [];
    const clearRect = vi.fn();

    class NullCtxOffscreenCanvas {
      private _w: number;
      private _h: number;
      constructor(w: number, h: number) {
        this._w = w;
        this._h = h;
      }
      get width() {
        return this._w;
      }
      set width(v: number) {
        widthHistory.push(v);
        this._w = v;
      }
      get height() {
        return this._h;
      }
      set height(v: number) {
        heightHistory.push(v);
        this._h = v;
      }
      getContext() {
        return null;
      }
    }
    vi.stubGlobal('OffscreenCanvas', NullCtxOffscreenCanvas);
    expect(probeOffscreenCanvas2dSupport()).toBe(false);
    expect(widthHistory).toEqual([1, 0]);
    expect(heightHistory).toEqual([1, 0]);

    class ThrowingCtxOffscreenCanvas {
      width = 1;
      height = 1;
      getContext() {
        throw new Error('2D unavailable in worker');
      }
    }
    vi.stubGlobal('OffscreenCanvas', ThrowingCtxOffscreenCanvas);
    expect(probeOffscreenCanvas2dSupport()).toBe(false);

    const sequence: string[] = [];
    class WorkingOffscreenCanvas {
      private _w: number;
      private _h: number;
      constructor(w: number, h: number) {
        this._w = w;
        this._h = h;
      }
      get width() {
        return this._w;
      }
      set width(v: number) {
        sequence.push(`w:${v}`);
        this._w = v;
      }
      get height() {
        return this._h;
      }
      set height(v: number) {
        sequence.push(`h:${v}`);
        this._h = v;
      }
      getContext(type: string) {
        if (type !== '2d') return null;
        return {
          clearRect: (...args: number[]) => {
            clearRect(...args);
            sequence.push('clear');
          },
        };
      }
    }
    vi.stubGlobal('OffscreenCanvas', WorkingOffscreenCanvas);
    expect(probeOffscreenCanvas2dSupport()).toBe(true);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(sequence).toEqual(['w:1', 'h:1', 'clear', 'w:0', 'h:0']);

    sequence.length = 0;
    const standaloneCanvas = new WorkingOffscreenCanvas(800, 600) as unknown as OffscreenCanvas;
    releaseCanvas(standaloneCanvas);
    expect(sequence).toEqual(['w:1', 'h:1', 'clear', 'w:0', 'h:0']);
    expect(standaloneCanvas.width).toBe(0);
    expect(standaloneCanvas.height).toBe(0);
  });

  it('caps DPR via getEffectiveCanvasDevicePixelRatio and enforces constrained area ceiling', async () => {
    const { enforceCanvasDimensions, getEffectiveCanvasDevicePixelRatio } = await import(
      '../webImageOptimizer'
    );

    vi.stubGlobal('window', { devicePixelRatio: 3 });
    expect(getEffectiveCanvasDevicePixelRatio(false)).toBe(2);
    expect(getEffectiveCanvasDevicePixelRatio(true)).toBe(1);

    vi.stubGlobal('window', { devicePixelRatio: 0 });
    expect(getEffectiveCanvasDevicePixelRatio(false)).toBe(1);

    const standardCap = enforceCanvasDimensions(5000, 5000, false);
    expect(standardCap.wasClamped).toBe(true);
    expect(standardCap.width * standardCap.height).toBeLessThanOrEqual(16_000_000);

    const constrainedCap = enforceCanvasDimensions(3000, 2000, true);
    expect(constrainedCap.wasClamped).toBe(true);
    expect(constrainedCap.width * constrainedCap.height).toBeLessThanOrEqual(3_000_000);
  });

  it('hydrates photos sequentially in bounded batches and safely revokes only blob: URLs', async () => {
    const { revokeBlobUrlIfNeeded } = await import('../photoHydration');
    const revoked: string[] = [];
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn((u: string) => {
      revoked.push(u);
    });

    try {
      revokeBlobUrlIfNeeded('data:image/webp;base64,AAAA');
      revokeBlobUrlIfNeeded('https://example.com/photo.jpg');
      revokeBlobUrlIfNeeded('');
      revokeBlobUrlIfNeeded(null);
      expect(revoked).toHaveLength(0);

      revokeBlobUrlIfNeeded('blob:https://example.test/123');
      expect(revoked).toEqual(['blob:https://example.test/123']);
    } finally {
      URL.revokeObjectURL = origRevoke;
    }

    const baseSnap = makeTestSnapshot();
    const extraPhotos: AnimalPhoto[] = Array.from({ length: 5 }, (_, idx) => ({
      ...baseSnap.animalPhotos![0],
      id: `photo-seq-${idx}`,
      dataUrl: '',
    }));
    const snap: BarnDatabaseSnapshot = {
      ...baseSnap,
      animalPhotos: extraPhotos,
    };

    let activeFetches = 0;
    let peakConcurrentFetches = 0;
    const chunkCalls: string[][] = [];

    const hydrated = await hydrateSnapshotWithPhotoDataUrls(
      snap,
      async (ids) => {
        activeFetches += 1;
        peakConcurrentFetches = Math.max(peakConcurrentFetches, activeFetches);
        chunkCalls.push(ids);
        await Promise.resolve();
        activeFetches -= 1;
        return Object.fromEntries(ids.map((id) => [id, `data:image/png;base64,${id}`]));
      },
      undefined,
      undefined,
      { batchSize: 2 }
    );

    expect(peakConcurrentFetches).toBe(1);
    expect(chunkCalls).toEqual([
      ['photo-seq-0', 'photo-seq-1'],
      ['photo-seq-2', 'photo-seq-3'],
      ['photo-seq-4'],
    ]);
    expect(hydrated.animalPhotos!.every((p) => p.dataUrl.startsWith('data:image/png;base64,'))).toBe(
      true
    );
  });

  it('uses files-only navigator.canShare/share for iOS standalone PWA, ignores AbortError cleanly, and surfaces non-abort errors', async () => {
    const {
      downloadTextFile,
      isFileShareAbortError,
      isInstalledIosPwa,
      shareTextFileOrDownload,
    } = await import('../../utils/webFileActions');

    const abortErr = new Error('User cancelled');
    abortErr.name = 'AbortError';
    expect(isFileShareAbortError(abortErr)).toBe(true);
    expect(isFileShareAbortError(new Error('Other'))).toBe(false);

    const anchorClickSpy = vi.fn();
    const revokeSpy = vi.fn();
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:ios-fallback');
    URL.revokeObjectURL = revokeSpy;

    const fakeBody = { appendChild: vi.fn(), removeChild: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        parentNode: fakeBody,
        click: anchorClickSpy,
      })),
      body: fakeBody,
    });

    try {
      const shareCalls: ShareData[] = [];
      const canShareCalls: ShareData[] = [];

      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
        canShare: vi.fn((data: ShareData) => {
          canShareCalls.push(data);
          return Boolean(data.files && data.files.length === 1);
        }),
        share: vi.fn(async (data: ShareData) => {
          shareCalls.push(data);
        }),
      });

      expect(isInstalledIosPwa()).toBe(true);

      // 1. Passes ONLY `{ files: [file] }` with no extra title/text/url keys
      const sharedOutcome = await shareTextFileOrDownload({
        filename: 'pedigree.htm',
        content: '<html><body>Test</body></html>',
        mimeType: 'text/html',
        title: 'Pedigree Certificate',
        text: 'Ignored on iOS standalone',
      });
      expect(sharedOutcome).toBe('shared');
      expect(canShareCalls).toHaveLength(1);
      expect(shareCalls).toHaveLength(1);
      expect(Object.keys(shareCalls[0])).toEqual(['files']);
      expect(shareCalls[0].title).toBeUndefined();
      expect(shareCalls[0].text).toBeUndefined();
      expect(shareCalls[0].url).toBeUndefined();
      expect(anchorClickSpy).not.toHaveBeenCalled();

      // 2. AbortError returns 'cancelled' cleanly without falling back to <a download> or throwing
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
        canShare: vi.fn(() => true),
        share: vi.fn(async () => {
          throw abortErr;
        }),
      });

      const cancelledOutcome = await shareTextFileOrDownload({
        filename: 'pedigree.htm',
        content: '<html></html>',
        mimeType: 'text/html',
        title: 'Pedigree',
      });
      expect(cancelledOutcome).toBe('cancelled');
      expect(anchorClickSpy).not.toHaveBeenCalled();

      // 3. When canShare rejects files on iOS standalone PWA, surfaces visible error instead of silent swallow or broken anchor
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
        canShare: vi.fn(() => false),
        share: vi.fn(async () => {}),
      });

      await expect(
        shareTextFileOrDownload({
          filename: 'pedigree.htm',
          content: '<html></html>',
          mimeType: 'text/html',
          title: 'Pedigree',
        })
      ).rejects.toThrow(/iOS Home Screen/i);
      expect(anchorClickSpy).not.toHaveBeenCalled();

      // 4. Desktop/non-iOS anchor download fallback revokes blob: immediately if click() fails
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0',
        platform: 'Win32',
        maxTouchPoints: 0,
      });
      anchorClickSpy.mockImplementationOnce(() => {
        throw new Error('Blocked popup');
      });
      await expect(downloadTextFile('test.txt', 'hello', 'text/plain')).rejects.toThrow(
        'Blocked popup'
      );
      expect(revokeSpy).toHaveBeenCalledWith('blob:ios-fallback');
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});

describe('Phase 3.4 feed tag & ledger receipt photo stripping and hydration', () => {
  it('strips feed batch tagPhotoDataUrl and ledger entry receiptPhotoDataUrl while retaining thumbnails and hydrating on demand', async () => {
    const thumbUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const tagFullUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const receiptFullUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const snap: BarnDatabaseSnapshot = {
      ...makeTestSnapshot(),
      feedBatches: [
        {
          id: 'fb-1',
          species: 'Rabbit',
          brand: 'Manna Pro',
          productName: 'Pro',
          lotNumber: 'LOT-99',
          millCode: 'M1',
          manufactureDateIso: '2026-01-10',
          purchaseDateIso: '2026-01-15',
          bagCount: 1,
          bagWeightValue: 50,
          bagWeightUnit: 'lbs',
          totalQuantity: 50,
          remainingQuantity: 40,
          lowStockThreshold: 10,
          supplierName: 'Co-op',
          notes: '',
          tagPhotoDataUrl: tagFullUrl,
          tagPhotoThumbnailDataUrl: thumbUrl,
          createdAt: '2026-01-15T00:00:00.000Z',
          updatedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
      ledgerEntries: [
        {
          id: 'le-1',
          species: 'Rabbit',
          dateIso: '2026-01-15',
          entryType: 'expense',
          category: 'feed',
          amountCents: 2500,
          title: 'Pellet bags',
          vendorOrParty: 'Co-op',
          receiptPhotoDataUrl: receiptFullUrl,
          receiptPhotoThumbnailDataUrl: thumbUrl,
          notes: '',
          createdAt: '2026-01-15T00:00:00.000Z',
          updatedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    };

    const stripped = stripPhotoDataUrlsFromSnapshot(snap);
    expect(stripped.feedBatches![0].tagPhotoDataUrl).toBeUndefined();
    expect(stripped.feedBatches![0].tagPhotoThumbnailDataUrl).toBe(thumbUrl);
    expect(stripped.ledgerEntries![0].receiptPhotoDataUrl).toBeUndefined();
    expect(stripped.ledgerEntries![0].receiptPhotoThumbnailDataUrl).toBe(thumbUrl);

    const cache = new BoundedPhotoDataCache(8);
    const fetchAnimals = vi.fn(async () => ({}));
    const fetchFeedTags = vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, tagFullUrl]))
    );
    const fetchReceipts = vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, receiptFullUrl]))
    );

    const hydrated = await hydrateSnapshotWithPhotoDataUrls(
      stripped,
      fetchAnimals,
      'Rabbit',
      cache,
      {
        fetchFeedTagBatch: fetchFeedTags,
        fetchLedgerReceiptBatch: fetchReceipts,
      }
    );

    expect(fetchFeedTags).toHaveBeenCalledWith(['fb-1']);
    expect(fetchReceipts).toHaveBeenCalledWith(['le-1']);
    expect(hydrated.feedBatches![0].tagPhotoDataUrl).toBe(tagFullUrl);
    expect(hydrated.ledgerEntries![0].receiptPhotoDataUrl).toBe(receiptFullUrl);

    // Second pass reuses cache without re-fetching
    const rehydrated = await hydrateSnapshotWithPhotoDataUrls(
      stripped,
      fetchAnimals,
      'Rabbit',
      cache,
      {
        fetchFeedTagBatch: fetchFeedTags,
        fetchLedgerReceiptBatch: fetchReceipts,
      }
    );
    expect(fetchFeedTags).toHaveBeenCalledTimes(1);
    expect(fetchReceipts).toHaveBeenCalledTimes(1);
    expect(rehydrated.feedBatches![0].tagPhotoDataUrl).toBe(tagFullUrl);
    expect(rehydrated.ledgerEntries![0].receiptPhotoDataUrl).toBe(receiptFullUrl);
  });
});



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


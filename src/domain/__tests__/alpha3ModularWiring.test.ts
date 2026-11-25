/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Alpha 3 Modular Architecture & End-to-End Wiring Tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPlatformBridge,
  DEFAULT_IOS_STORAGE_REPLY_GLOBAL,
  type NativeStorageBridgeOperation,
  type NativeStorageBridgeResult,
} from '@engine/bridge';
import {
  escapeSafeHtml,
  fnv1a64Hex,
  isSafeObjectKey,
  sanitizeCsvFormulaCell,
  sha256HexPure,
  slugifySegment,
} from '@engine/primitives';
import {
  createResilientStorageAdapter,
  exportPortableStorageBundle,
  MemoryStorageAdapter,
  NativeBridgeStorageAdapter,
  restorePortableStorageBundle,
  SqliteWasmStorageAdapter,
} from '@engine/storage';
import { exportRecordsToCsv } from '@features/csv-exporter';
import {
  type CsvSchemaConfig,
  parseAndValidateCsv,
  runCsvImport,
} from '@features/csv-importer';
import { buildGenericIcsCalendar } from '@features/ics-calendar';
import { extractStructuredFieldsFromOcr } from '@features/ocr-parser';
import {
  buildBarnTasksIcsFeed,
  createAnimalCsvSchemaConfig,
  createAnimalProfileRepository,
  deserializeAnimalProfiles,
  downloadPedigreeDocumentHtml,
  exportAnimalCsvFromStorage,
  exportPedigreePortableVault,
  extractPedigreeOcrSummary,
  importAnimalCsvToStorage,
  PEDIGREE_APP_CONFIG,
  printPedigreeDocument,
  restorePedigreePortableVault,
  serializeAnimalProfiles,
  validateAnimalProfile,
} from '@app';
import { PEDIGREE_APP_CONFIG as LIGHT_APP_CONFIG } from '../../app/pedigreeAppConfig';

const ROOT_DIR = process.cwd();

function collectTsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function getFeatureDirectories(): string[] {
  const featuresRoot = path.join(ROOT_DIR, 'src/features');
  return fs
    .readdirSync(featuresRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

describe('Alpha 3 Modular Boundary & Integration Verification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('enforces one-way layer imports, zero cross-feature imports, and zero domain terms across @engine primitives/storage/bridge and all @features/*', () => {
    const forbiddenDomainTerms =
      /\b(pedigree|livestock|animal|rabbit|goat|sheep|cattle|herd|litter|tattoo|eartag|ear_tag|sire|dam|buck|doe|barn)\b/i;

    const featureDirs = getFeatureDirectories();
    expect(featureDirs).toEqual(
      expect.arrayContaining([
        'csv-importer',
        'csv-exporter',
        'backup-vault',
        'document-export',
        'ics-calendar',
        'ocr-parser',
      ])
    );

    const contentAgnosticFiles = [
      path.join(ROOT_DIR, 'src/engine/binaryEncoding.ts'),
      ...collectTsFiles(path.join(ROOT_DIR, 'src/engine/primitives')),
      ...collectTsFiles(path.join(ROOT_DIR, 'src/engine/storage')),
      ...collectTsFiles(path.join(ROOT_DIR, 'src/engine/bridge')),
      ...featureDirs.flatMap((dir) =>
        collectTsFiles(path.join(ROOT_DIR, 'src/features', dir))
      ),
    ];

    expect(contentAgnosticFiles.length).toBeGreaterThanOrEqual(20);

    for (const filePath of contentAgnosticFiles) {
      const text = fs
        .readFileSync(filePath, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(text, `Domain term found in ${filePath}`).not.toMatch(forbiddenDomainTerms);
    }

    const coreFiles = collectTsFiles(path.join(ROOT_DIR, 'src/domain')).filter(
      (f) => !f.includes('__tests__')
    );
    for (const filePath of coreFiles) {
      const text = fs.readFileSync(filePath, 'utf8');
      expect(text, `Forbidden @features/@app import in ${filePath}`).not.toMatch(
        /from\s+['"](?:@features|@app|\.\.\/(?:features|app))/
      );
    }

    const pureCoreFiles = [
      path.join(ROOT_DIR, 'src/engine/binaryEncoding.ts'),
      ...collectTsFiles(path.join(ROOT_DIR, 'src/engine/primitives')),
    ];
    for (const filePath of pureCoreFiles) {
      const stripped = fs
        .readFileSync(filePath, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(stripped, `DOM/Node dependency found in pure primitive ${filePath}`).not.toMatch(
        /from\s+['"]node:|\b(?:window|document)\b/
      );
    }

    for (const featureDir of featureDirs) {
      const siblingPattern = new RegExp(
        `from\\s+['"](?:@features/(?!${featureDir}(?:['"/]))|\\.{2}/(?!featureModule\\.interface))`
      );
      const featureFiles = collectTsFiles(path.join(ROOT_DIR, 'src/features', featureDir));
      for (const filePath of featureFiles) {
        const text = fs.readFileSync(filePath, 'utf8');
        expect(text, `Forbidden @app import in ${filePath}`).not.toMatch(
          /from\s+['"](?:@app|\.\.\/\.\.\/app)/
        );
        expect(text, `Cross-feature import detected in ${filePath}`).not.toMatch(siblingPattern);
      }
    }
  });

  it('verifies @engine/primitives pure helpers and android-wrapper Gradle/XML parameterization', () => {
    expect(isSafeObjectKey('__proto__')).toBe(false);
    expect(isSafeObjectKey('safe:key_1')).toBe(true);
    expect(sanitizeCsvFormulaCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeSafeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(slugifySegment('Rabbit / New Zealand!')).toBe('rabbit-new-zealand');
    expect(sha256HexPure('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(fnv1a64Hex(new Uint8Array([1, 2, 3])).length).toBe(16);

    const gradleBuild = fs.readFileSync(
      path.join(ROOT_DIR, 'android-wrapper/app/build.gradle.kts'),
      'utf8'
    );
    expect(gradleBuild).toContain('minSdk = 26');
    expect(gradleBuild).toContain('pedigree.wrapper.appName');
    expect(gradleBuild).toContain('pedigree.wrapper.debugPrefsName');
    expect(gradleBuild).toContain('pedigree.wrapper.diagnosticsClipLabel');
    expect(gradleBuild).toContain('pedigree.wrapper.defaultExportFilename');
    expect(gradleBuild).toContain('resValue("string", "shortcut_target_package"');

    const settingsGradle = fs.readFileSync(
      path.join(ROOT_DIR, 'android-wrapper/settings.gradle.kts'),
      'utf8'
    );
    expect(settingsGradle).toContain('pedigree.wrapper.rootProjectName');

    const shortcutsXml = fs.readFileSync(
      path.join(ROOT_DIR, 'android-wrapper/app/src/main/res/xml/shortcuts.xml'),
      'utf8'
    );
    expect(shortcutsXml).toContain('@string/shortcut_target_package');
    expect(shortcutsXml).toContain('@string/shortcut_action_open_diagnostics');
  });

  it('supports PlatformBridge safe fallbacks, print/external URL, and back-handler LIFO dispatch', async () => {
    const bridge = createPlatformBridge();
    const caps = await bridge.detectCapabilities();
    expect(caps.shell).toBe('unknown');

    const order: string[] = [];
    const unsub1 = bridge.registerBackHandler(() => {
      order.push('first');
      return false;
    });
    const unsub2 = bridge.registerBackHandler(() => {
      order.push('second');
      return true;
    });

    expect(await bridge.dispatchBackPress()).toBe(true);
    expect(order).toEqual(['second']);
    unsub2();
    expect(await bridge.dispatchBackPress()).toBe(false);
    expect(order).toEqual(['second', 'first']);
    unsub1();

    const exportRes = await bridge.exportBinary({
      filename: 'test.bin',
      mimeType: 'application/octet-stream',
      mode: 'save',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(exportRes.ok).toBe(false);
    expect(exportRes.handledBy).toBe('error');

    expect(await bridge.openExternalUrl('javascript:alert(1)')).toBe(false);
    const storageFallback = await bridge.invokeStorageBridge({ action: 'list' });
    expect(storageFallback.ok).toBe(false);
    bridge.destroy();
  });

  it('completes request-ID-correlated iOS WKWebView storage bridge round-trips, timeouts, and strict anti-eviction routing', async () => {
    vi.useFakeTimers();
    const hostStore = new Map<string, string>();

    const postMessageMock = vi.fn((message: unknown) => {
      const msg = message as {
        type: string;
        requestId: string;
        replyGlobal: string;
        payload: NativeStorageBridgeOperation;
      };
      expect(msg.type).toBe('NATIVE_STORAGE_OP');
      expect(msg.replyGlobal).toBe(DEFAULT_IOS_STORAGE_REPLY_GLOBAL);

      const op = msg.payload;
      if (op.key === 'timeout-key') {
        return; // Simulate silent hang so timeout path triggers
      }

      const globalObj = globalThis as Record<string, unknown>;
      const replyFn = globalObj[msg.replyGlobal] as (payload: unknown) => void;

      queueMicrotask(() => {
        if (op.action === 'write' && op.key && typeof op.data === 'string') {
          hostStore.set(op.key, op.data);
          replyFn({ requestId: msg.requestId, ok: true });
        } else if (op.action === 'read' && op.key) {
          replyFn({
            requestId: msg.requestId,
            ok: true,
            data: hostStore.get(op.key) ?? null,
          });
        } else if (op.action === 'list') {
          replyFn({ requestId: msg.requestId, ok: true, data: Array.from(hostStore.keys()) });
        } else {
          replyFn({ requestId: msg.requestId, ok: true });
        }
      });
    });

    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    vi.stubGlobal('document', {});
    vi.stubGlobal('webkit', {
      messageHandlers: {
        nativeStorage: {
          postMessage: postMessageMock,
        },
      },
    });

    const iosBridge = createPlatformBridge({ iosStorageTimeoutMs: 250 });
    const adapter = await createResilientStorageAdapter({
      bridge: iosBridge,
      namespace: 'ios_vault',
      allowMemoryFallback: false,
    });
    expect(adapter.capabilities.driver).toBe('native-bridge');
    expect(adapter.capabilities.isPersistent).toBe(true);

    await adapter.setItem('record:1', 'ios-sqlite-persisted');
    expect(await adapter.getItem('record:1')).toBe('ios-sqlite-persisted');

    const timedOutPromise = iosBridge.invokeStorageBridge({ action: 'read', key: 'timeout-key' });
    await vi.advanceTimersByTimeAsync(260);
    const timedOut = await timedOutPromise;
    expect(timedOut.ok).toBe(false);
    expect(timedOut.error).toMatch(/timed out/i);

    iosBridge.destroy();

    // Even if WebKit exposes evictable IndexedDB, ios-wkwebview without native bridge must refuse IDB fallback
    vi.stubGlobal('webkit', undefined);
    vi.stubGlobal('indexedDB', { open: vi.fn() });
    const brokenIosBridge = createPlatformBridge();
    await expect(
      createResilientStorageAdapter({ bridge: brokenIosBridge, allowMemoryFallback: false })
    ).rejects.toThrow(/requires a working native SQLite storage bridge/i);
    brokenIosBridge.destroy();
  });

  it('persists, exports, and restores SQLite WASM and portable bundles with integrity checks', async () => {
    const backing = new MemoryStorageAdapter();
    const sqlite = new SqliteWasmStorageAdapter({ backingAdapter: backing });
    expect(await sqlite.isSupported()).toBe(true);
    await sqlite.initialize();

    await sqlite.setItem('alpha:text', 'hello-sqlite');
    await sqlite.setItem('alpha:bin', new Uint8Array([10, 20, 30, 40]));
    expect(await sqlite.getItem('alpha:text')).toBe('hello-sqlite');
    expect(await sqlite.getItem('alpha:bin')).toEqual(new Uint8Array([10, 20, 30, 40]));
    expect(await sqlite.keys({ prefix: 'alpha:' })).toEqual(['alpha:bin', 'alpha:text']);

    const rawBytes = await sqlite.exportRawSqliteBytes();
    expect(rawBytes).not.toBeNull();
    expect(rawBytes!.byteLength).toBeGreaterThan(100);

    const bundle = await exportPortableStorageBundle(sqlite);
    expect(bundle.entryCount).toBe(2);

    const target = new MemoryStorageAdapter();
    await target.initialize();
    const restored = await restorePortableStorageBundle(target, JSON.stringify(bundle));
    expect(restored.restoredCount).toBe(2);
    expect(await target.getItem('alpha:text')).toBe('hello-sqlite');
    expect(await target.getItem('alpha:bin')).toEqual(new Uint8Array([10, 20, 30, 40]));

    const tampered = { ...bundle, checksumHex: '0000000000000000' };
    await expect(restorePortableStorageBundle(target, tampered)).rejects.toThrow(/checksum/i);
    await sqlite.close();
  });

  it('routes NativeBridgeStorageAdapter cleanly with explicit handler', async () => {
    const hostMap = new Map<string, string>();
    const bridge = createPlatformBridge({
      storageBridgeHandler: async (
        op: NativeStorageBridgeOperation
      ): Promise<NativeStorageBridgeResult> => {
        if (op.action === 'write' && op.key && typeof op.data === 'string') {
          hostMap.set(op.key, op.data);
          return { ok: true };
        }
        if (op.action === 'read' && op.key) {
          return { ok: true, data: hostMap.get(op.key) ?? null };
        }
        if (op.action === 'delete' && op.key) {
          hostMap.delete(op.key);
          return { ok: true };
        }
        if (op.action === 'list') {
          return { ok: true, data: Array.from(hostMap.keys()) };
        }
        return { ok: false, error: 'Unsupported op' };
      },
    });

    const adapter = new NativeBridgeStorageAdapter(bridge, 'ns');
    expect(await adapter.isSupported()).toBe(true);
    await adapter.setItem('item-1', 'native-value');
    expect(await adapter.getItem('item-1')).toBe('native-value');
    expect(await adapter.keys()).toEqual(['item-1']);

    const resilient = await createResilientStorageAdapter({ bridge, namespace: 'ns2' });
    expect(resilient.capabilities.driver).toBe('native-bridge');
  });

  it('runs schema-agnostic @features/* modules (csv-importer, csv-exporter, ics-calendar, ocr-parser)', async () => {
    interface InventoryRow {
      sku: string;
      qty: number;
      active: boolean;
      restockedOn: string;
    }

    const schema: CsvSchemaConfig<InventoryRow, 'sku' | 'qty' | 'active' | 'restockedOn'> = {
      schemaId: 'inventory-v1',
      fields: [
        { key: 'sku', label: 'SKU', aliases: ['code', 'item_sku'], required: true },
        { key: 'qty', label: 'Quantity', aliases: ['count'], type: 'integer', required: true },
        { key: 'active', label: 'Active', aliases: ['enabled'], type: 'boolean', defaultValue: true },
        { key: 'restockedOn', label: 'Restock Date', aliases: ['date'], type: 'date' },
      ],
      mapRecord: (v) => ({
        sku: String(v.sku || ''),
        qty: Number(v.qty || 0),
        active: Boolean(v.active),
        restockedOn: String(v.restockedOn || ''),
      }),
    };

    const csv = [
      'item_sku,count,enabled,date',
      'SKU-100,12,yes,2026-10-05',
      'SKU-200,bad_int,no,2026-10-06',
      'SKU-300,5,false,10/12/2026',
    ].join('\n');

    const dry = parseAndValidateCsv(csv, schema, { dryRun: true });
    expect(dry.validRecords).toHaveLength(2);
    expect(dry.skippedRowCount).toBe(1);
    expect(dry.issues[0].rowIndex).toBe(2);

    const savedBatches: InventoryRow[][] = [];
    const res = await runCsvImport(csv, schema, async (records) => {
      savedBatches.push(records);
      return { savedCount: records.length };
    });

    expect(res.ok).toBe(true);
    expect(res.savedCount).toBe(2);
    expect(savedBatches[0][1].restockedOn).toBe('2026-10-12');
    expect(savedBatches[0][1].active).toBe(false);

    const csvOut = exportRecordsToCsv(
      [{ code: '=HYPERLINK("bad")', count: 4 }],
      {
        schemaId: 'items',
        columns: [
          { key: 'code', header: 'Code', format: (r) => r.code },
          { key: 'count', header: 'Count', format: (r) => String(r.count) },
        ],
      },
      { filePrefix: 'inventory', dateSlug: '2026-11-24' }
    );
    expect(csvOut.filename).toBe('inventory-export-2026-11-24.csv');
    expect(csvOut.csvText.startsWith('\uFEFF')).toBe(true);
    expect(csvOut.csvText).toContain("'=HYPERLINK");

    const icsOut = buildGenericIcsCalendar([
      {
        id: 'evt-1',
        title: 'Calibration Check',
        dateIso: '2026-12-01',
        alarmMinutesList: [1440, 60],
      },
    ]);
    expect(icsOut.eventCount).toBe(1);
    expect(icsOut.icsText).toContain('BEGIN:VCALENDAR');
    expect(icsOut.icsText).toContain('TRIGGER:-P1D');

    const ocrOut = extractStructuredFieldsFromOcr(
      '',
      [{ key: 'serial', patterns: [/Serial:\s*([A-Z0-9-]+)/i] }],
      [
        { text: 'Serial:', bbox: { x0: 10, y0: 20, x1: 60, y1: 35 } },
        { text: 'ZX-900', bbox: { x0: 66, y0: 21, x1: 120, y1: 36 } },
      ]
    );
    expect(ocrOut.extractedFields.serial).toBe('ZX-900');
  });

  it('wires @app schemas, CSV export/import, ZIP vault backup/restore, document print, calendar ICS, and pedigree OCR end-to-end', async () => {
    expect(PEDIGREE_APP_CONFIG.metadata.appVersion).toBe('0.1.0-alpha.3');
    expect(LIGHT_APP_CONFIG).toEqual(PEDIGREE_APP_CONFIG);
    expect(PEDIGREE_APP_CONFIG.features.map((f) => f.featureId)).toEqual(
      expect.arrayContaining([
        'csv-importer',
        'csv-exporter',
        'backup-vault',
        'document-export',
        'ics-calendar',
        'ocr-parser',
      ])
    );

    expect(validateAnimalProfile({ name: '', tattoo: '' }).ok).toBe(false);
    expect(validateAnimalProfile({ name: 'Clover', species: 'Rabbit', sex: 'Female' }).ok).toBe(
      true
    );

    const serialized = serializeAnimalProfiles([
      validateAnimalProfile({ name: 'Bramble', tattoo: 'BR1', species: 'Rabbit', sex: 'Male' })
        .record,
    ]);
    const roundTripped = deserializeAnimalProfiles(serialized);
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0].name).toBe('Bramble');

    const storage = new MemoryStorageAdapter();
    await storage.initialize();

    const csv = [
      'Animal Name,Ear Tattoo,Sex,DOB,Breed,Weight,Weight Unit,Genotype',
      'Maple,MP-01,Doe,2025-04-12,Holland Lop,3.5,lbs,aa B_ C_ Dd ee',
      ',,Buck,2025-05-01,Holland Lop,3.2,lbs,aa bb C_ D_ ee',
    ].join('\n');

    const importRes = await importAnimalCsvToStorage(csv, storage, {
      fallbackSpecies: 'Rabbit',
    });

    expect(importRes.ok).toBe(true);
    expect(importRes.savedCount).toBe(1);
    expect(importRes.skippedRowCount).toBe(1);

    const repo = createAnimalProfileRepository(storage);
    const profiles = await repo.loadProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Maple');
    expect(profiles[0].tattoo).toBe('MP-01');
    expect(profiles[0].sex).toBe('Female');
    expect(profiles[0].weightGrams).toBe(1588);
    expect(profiles[0].genotype.length).toBeGreaterThan(0);

    const csvExported = await exportAnimalCsvFromStorage(storage, {
      species: 'Rabbit',
      weightUnit: 'lbs',
      dateSlug: '2026-11-24',
    });
    expect(csvExported.rowCount).toBe(1);
    expect(csvExported.filename).toBe('pedigree-rabbit-export-2026-11-24.csv');
    expect(csvExported.csvText).toContain('Maple');

    // Vault JSON & ZIP round-trip + tampered ZIP/JSON rejection
    const zipVault = await exportPedigreePortableVault(storage, { compressZip: true });
    expect(zipVault.compressed).toBe(true);
    expect(zipVault.bytes[0]).toBe(0x50);
    expect(zipVault.bytes[1]).toBe(0x4b);

    const restoreTarget = new MemoryStorageAdapter();
    await restoreTarget.initialize();
    const restoredVault = await restorePedigreePortableVault(restoreTarget, zipVault.bytes);
    expect(restoredVault.restoredCount).toBe(1);
    const reloaded = await createAnimalProfileRepository(restoreTarget).loadProfiles();
    expect(reloaded[0].name).toBe('Maple');

    const tamperedJson = zipVault.jsonText.replace(
      zipVault.envelope.checksumSha256,
      'f'.repeat(64)
    );
    await expect(restorePedigreePortableVault(restoreTarget, tamperedJson)).rejects.toThrow(
      /SHA-256 verification failed/i
    );

    // Document print & HTML download dispatch
    const printCalls: unknown[] = [];
    const downloadCalls: unknown[] = [];
    const docBridge = createPlatformBridge({
      printHandler: async (opts) => {
        printCalls.push(opts);
        return true;
      },
      binaryExportHandler: async (opts) => {
        downloadCalls.push(opts);
        return { ok: true, handledBy: 'native-desktop' };
      },
    });
    expect(
      await printPedigreeDocument(docBridge, {
        title: 'Maple <Pedigree>',
        orientation: 'landscape',
        bodyHtml: '<section>Generations</section>',
      })
    ).toBe(true);
    expect(printCalls).toHaveLength(1);
    expect(
      (
        await downloadPedigreeDocumentHtml(
          docBridge,
          { title: 'Maple Certificate', bodyHtml: '<p>Certified</p>' },
          'maple.html'
        )
      ).ok
    ).toBe(true);
    expect(downloadCalls).toHaveLength(1);

    // Calendar ICS generation for BarnTask[]
    const ics = buildBarnTasksIcsFeed([
      {
        id: 't1',
        species: 'Rabbit',
        category: 'Nestbox',
        title: 'Add Nest Box for Maple',
        linkedAnimalId: 'a1',
        linkedAnimalName: 'Maple',
        linkedBreedingId: '',
        dueDateIso: '2026-12-10',
        completed: false,
        priority: 'High',
        createdAt: '2026-11-24T00:00:00Z',
        updatedAt: '2026-11-24T00:00:00Z',
      },
      {
        id: 't2',
        species: 'Rabbit',
        category: 'Care',
        title: 'Done task',
        linkedAnimalId: '',
        linkedAnimalName: '',
        linkedBreedingId: '',
        dueDateIso: '2026-12-09',
        completed: true,
        priority: 'Low',
        createdAt: '2026-11-24T00:00:00Z',
        updatedAt: '2026-11-24T00:00:00Z',
      },
    ]);
    expect(ics.eventCount).toBe(1);
    expect(ics.icsText).toContain('Add Nest Box for Maple');
    expect(ics.icsText).not.toContain('Done task');

    // Pedigree OCR extraction
    const ocr = extractPedigreeOcrSummary(
      'Name: Clover\nEar Tag: CL-99\nBreed: Holland Lop\nReg No: ARBA-442\nWeight: 3.4 lbs'
    );
    expect(ocr.extractedFields.name).toBe('Clover');
    expect(ocr.extractedFields.tattoo).toBe('CL-99');
    expect(ocr.extractedFields.breed).toBe('Holland Lop');
    expect(ocr.extractedFields.registrationNumber).toBe('ARBA-442');

    const schema = createAnimalCsvSchemaConfig({ fallbackSpecies: 'Goat' });
    expect(schema.schemaId).toBe('pedigree-animal-profile-v1');
  });

  it('verifies SHA-256 tamper detection on PortableStorageBundle and desktop onBackPressed wiring', async () => {
    const mem = new MemoryStorageAdapter();
    await mem.initialize();
    await mem.setItem('k1', 'v1');
    const bundle = await exportPortableStorageBundle(mem);
    expect(bundle.sha256Hex).toMatch(/^[0-9a-f]{64}$/);

    const target = new MemoryStorageAdapter();
    await target.initialize();
    const tamperedSha = { ...bundle, sha256Hex: 'f'.repeat(64) };
    await expect(restorePortableStorageBundle(target, tamperedSha)).rejects.toThrow(/SHA-256/i);

    let capturedBackCb: (() => void) | null = null;
    let unsubscribed = false;
    const g = globalThis as unknown as {
      electronAPI?: { onBackPressed?: (cb: () => void) => () => void };
    };
    const prevElectron = g.electronAPI;
    g.electronAPI = {
      onBackPressed: (cb) => {
        capturedBackCb = cb;
        return () => {
          unsubscribed = true;
        };
      },
    };
    try {
      const bridge = createPlatformBridge();
      let handledCount = 0;
      bridge.registerBackHandler(() => {
        handledCount += 1;
        return true;
      }, 10);
      expect(capturedBackCb).not.toBeNull();
      capturedBackCb!();
      await Promise.resolve();
      expect(handledCount).toBe(1);
      bridge.destroy();
      expect(unsubscribed).toBe(true);
    } finally {
      if (prevElectron === undefined) {
        delete g.electronAPI;
      } else {
        g.electronAPI = prevElectron;
      }
    }
  });
});



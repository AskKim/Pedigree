/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Unit & Contract Tests for Decoupled Storage, Bridge, and Feature Interfaces
 * (`src/domain/__tests__/decoupledContracts.test.ts`).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopBridgeDelegates,
  createPlatformBridge,
  detectDesktopShellType,
  type DesktopHostLike,
  type NativeStorageBridgeOperation,
  type NativeStorageBridgeResult,
} from '@engine/bridge';
import {
  isGenericEncryptedEnvelope,
  isSafeObjectKey,
  isSvgImageInput,
  sanitizeSafeRasterImageDataUrl,
  wrapGenericEncryptedZip,
} from '@engine/primitives';
import {
  MemoryStorageAdapter,
  NativeBridgeStorageAdapter,
  OpfsStorageAdapter,
  SqliteWasmStorageAdapter,
} from '@engine/storage';
import { createBackupVaultFeatureModule } from '@features/backup-vault';
import { createCsvExporterFeatureModule } from '@features/csv-exporter';
import { createCsvImporterFeatureModule } from '@features/csv-importer';
import { createDocumentExportFeatureModule } from '@features/document-export';
import { createIcsCalendarFeatureModule } from '@features/ics-calendar';
import { createOcrParserFeatureModule } from '@features/ocr-parser';

describe('Decoupled Platform Bridge & Desktop Shell Contracts', () => {
  it('detects desktop shells and delegates calls to Electron API', async () => {
    const electronCalls: Record<string, unknown[]> = {
      export: [],
      print: [],
      storage: [],
      open: [],
    };

    const mockHost: DesktopHostLike = {
      electronAPI: {
        async exportBinary(payload) {
          electronCalls.export.push(payload);
          return { ok: true, handledBy: 'native-desktop' };
        },
        async printDocument(options) {
          electronCalls.print.push(options);
          return true;
        },
        async invokeStorageBridge(op) {
          electronCalls.storage.push(op);
          return { ok: true, data: 'electron-ok' };
        },
        openExternal(url) {
          electronCalls.open.push(url);
          return true;
        },
      },
    };

    expect(detectDesktopShellType(mockHost)).toBe('desktop-electron');
    const delegates = createDesktopBridgeDelegates(mockHost);
    expect(delegates).not.toBeNull();
    expect(delegates?.shell).toBe('desktop-electron');
    expect(delegates?.hasBinaryExport).toBe(true);
    expect(delegates?.hasPrintDocument).toBe(true);
    expect(delegates?.hasStorageBridge).toBe(true);

    const exportRes = await delegates!.exportBinary!({
      filename: 'sample.txt',
      mimeType: 'text/plain',
      mode: 'save',
      bytes: new Uint8Array([65, 66, 67]),
    });
    expect(exportRes.ok).toBe(true);
    expect(exportRes.handledBy).toBe('native-desktop');
    expect(electronCalls.export.length).toBe(1);

    const printOk = await delegates!.printDocument!({
      title: 'Doc',
      htmlContent: '<p>Content</p>',
      orientation: 'portrait',
    });
    expect(printOk).toBe(true);
    expect(electronCalls.print.length).toBe(1);

    const storageRes = await delegates!.invokeStorageBridge!({
      action: 'read',
      key: 'k1',
    });
    expect(storageRes.ok).toBe(true);
    expect(electronCalls.storage.length).toBe(1);

    const openOk = await delegates!.openExternalUrl!('https://example.org');
    expect(openOk).toBe(true);
    expect(electronCalls.open).toEqual(['https://example.org']);
  });

  it('detects desktop shells and delegates calls to Tauri container', async () => {
    const tauriInvocations: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const mockTauriHost: DesktopHostLike = {
      __TAURI__: {
        invoke: async <T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
          tauriInvocations.push({ cmd, args });
          if (cmd === 'bridge_export_binary') return { ok: true } as T;
          if (cmd === 'bridge_print_document') return true as T;
          if (cmd === 'bridge_storage_op') return { ok: true, data: 'tauri-store-res' } as T;
          if (cmd === 'bridge_open_external') return true as T;
          return undefined as T;
        },
      },
    };

    expect(detectDesktopShellType(mockTauriHost)).toBe('desktop-tauri');
    const delegates = createDesktopBridgeDelegates(mockTauriHost);
    expect(delegates).not.toBeNull();
    expect(delegates?.shell).toBe('desktop-tauri');

    const exportRes = await delegates!.exportBinary!({
      filename: 'data.bin',
      mimeType: 'application/octet-stream',
      mode: 'save',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(exportRes.ok).toBe(true);
    expect(tauriInvocations[0].cmd).toBe('bridge_export_binary');

    const printRes = await delegates!.printDocument!({
      htmlContent: '<section>Data</section>',
    });
    expect(printRes).toBe(true);
    expect(tauriInvocations[1].cmd).toBe('bridge_print_document');

    const storageRes = await delegates!.invokeStorageBridge!({
      action: 'write',
      key: 'cfg',
      data: 'val',
    });
    expect(storageRes.ok).toBe(true);
    expect(tauriInvocations[2].cmd).toBe('bridge_storage_op');

    const openRes = await delegates!.openExternalUrl!('https://tauri.app');
    expect(openRes).toBe(true);
    expect(tauriInvocations[3].cmd).toBe('bridge_open_external');
  });

  it('returns null desktop delegates when running in standard browser host', () => {
    expect(detectDesktopShellType(undefined)).toBeNull();
    expect(createDesktopBridgeDelegates(undefined)).toBeNull();
    expect(detectDesktopShellType({})).toBeNull();
    expect(createDesktopBridgeDelegates({})).toBeNull();
  });
});

describe('Decoupled Feature Module Lifecycle Contracts', () => {
  it('instantiates and cycles all 6 decoupled feature modules', async () => {
    // 1. Backup Vault
    const vaultModule = createBackupVaultFeatureModule();
    expect(vaultModule.metadata.id).toBe('backup-vault');
    expect(vaultModule.getStateSnapshot?.().ready).toBe(false);
    await vaultModule.initialize({ config: { appFormatTag: 'custom-tag' } });
    expect(vaultModule.getStateSnapshot?.().ready).toBe(true);
    expect(vaultModule.getStateSnapshot?.().appFormatTag).toBe('custom-tag');
    await vaultModule.dispose?.();
    expect(vaultModule.getStateSnapshot?.().ready).toBe(false);

    // 2. CSV Exporter
    const csvExportModule = createCsvExporterFeatureModule();
    expect(csvExportModule.metadata.id).toBe('csv-exporter');
    await csvExportModule.initialize({ config: { schemaId: 'records-v1' } });
    expect(csvExportModule.getStateSnapshot?.().ready).toBe(true);
    expect(csvExportModule.getStateSnapshot?.().lastSchemaId).toBe('records-v1');
    await csvExportModule.dispose?.();
    expect(csvExportModule.getStateSnapshot?.().ready).toBe(false);

    // 3. CSV Importer
    const csvImportModule = createCsvImporterFeatureModule();
    expect(csvImportModule.metadata.id).toBe('csv-importer');
    await csvImportModule.initialize({ config: { schemaId: 'imports-v1' } });
    expect(csvImportModule.getStateSnapshot?.().ready).toBe(true);
    expect(csvImportModule.getStateSnapshot?.().lastSchemaId).toBe('imports-v1');
    await csvImportModule.dispose?.();
    expect(csvImportModule.getStateSnapshot?.().ready).toBe(false);

    // 4. Document Export
    const docModule = createDocumentExportFeatureModule();
    expect(docModule.metadata.id).toBe('document-export');
    await docModule.initialize({ config: { defaultOrientation: 'landscape' } });
    expect(docModule.getStateSnapshot?.().ready).toBe(true);
    expect(docModule.getStateSnapshot?.().defaultOrientation).toBe('landscape');
    await docModule.dispose?.();
    expect(docModule.getStateSnapshot?.().ready).toBe(false);

    // 5. ICS Calendar
    const icsModule = createIcsCalendarFeatureModule();
    expect(icsModule.metadata.id).toBe('ics-calendar');
    await icsModule.initialize({ config: { calendarName: 'Production Feed' } });
    expect(icsModule.getStateSnapshot?.().ready).toBe(true);
    expect(icsModule.getStateSnapshot?.().calendarName).toBe('Production Feed');
    await icsModule.dispose?.();
    expect(icsModule.getStateSnapshot?.().ready).toBe(false);

    // 6. OCR Parser
    const ocrModule = createOcrParserFeatureModule();
    expect(ocrModule.metadata.id).toBe('ocr-parser');
    await ocrModule.initialize({ config: { lineMergeTolerancePx: 18 } });
    expect(ocrModule.getStateSnapshot?.().ready).toBe(true);
    expect(ocrModule.getStateSnapshot?.().lineMergeTolerancePx).toBe(18);
    await ocrModule.dispose?.();
    expect(ocrModule.getStateSnapshot?.().ready).toBe(false);
  });
});

describe('Decoupled Storage Engine Transaction & Bridge Operations', () => {
  it('validates MemoryStorageAdapter atomic transaction rollback', async () => {
    const memory = new MemoryStorageAdapter();
    await memory.initialize();
    await memory.setItem('fixed-key', 'original-val');

    const tx = await memory.beginTransaction();
    await tx.put('fixed-key', 'staged-val');
    await tx.put('temp-key', 'temp-val');
    await tx.rollback();

    expect(await memory.getItem('fixed-key')).toBe('original-val');
    expect(await memory.hasItem('temp-key')).toBe(false);

    const txCommit = await memory.beginTransaction();
    await txCommit.put('fixed-key', 'committed-val');
    await txCommit.delete('temp-key');
    await txCommit.commit();

    expect(await memory.getItem('fixed-key')).toBe('committed-val');
  });

  it('validates SqliteWasmStorageAdapter transaction rollback and commit', async () => {
    const backing = new MemoryStorageAdapter();
    const sqlite = new SqliteWasmStorageAdapter({ backingAdapter: backing });
    await sqlite.initialize();

    await sqlite.setItem('row-1', 'initial-1');

    const tx = await sqlite.beginTransaction();
    await tx.put('row-1', 'mutated-1');
    await tx.put('row-2', 'mutated-2');
    await tx.rollback();

    expect(await sqlite.getItem('row-1')).toBe('initial-1');
    expect(await sqlite.hasItem('row-2')).toBe(false);

    const tx2 = await sqlite.beginTransaction();
    await tx2.put('row-1', 'saved-1');
    await tx2.put('row-2', 'saved-2');
    await tx2.commit();

    expect(await sqlite.getItem('row-1')).toBe('saved-1');
    expect(await sqlite.getItem('row-2')).toBe('saved-2');
    await sqlite.close();
  });

  it('validates NativeBridgeStorageAdapter removeItem, clear, and quota calculation', async () => {
    const memoryBackend = new Map<string, string>();
    const bridge = createPlatformBridge({
      storageBridgeHandler: async (
        op: NativeStorageBridgeOperation
      ): Promise<NativeStorageBridgeResult> => {
        if (op.action === 'write' && op.key && typeof op.data === 'string') {
          memoryBackend.set(op.key, op.data);
          return { ok: true };
        }
        if (op.action === 'read' && op.key) {
          return { ok: true, data: memoryBackend.get(op.key) ?? null };
        }
        if (op.action === 'delete' && op.key) {
          memoryBackend.delete(op.key);
          return { ok: true };
        }
        if (op.action === 'list') {
          return { ok: true, data: Array.from(memoryBackend.keys()) };
        }
        return { ok: false, error: 'Unknown op' };
      },
    });

    const adapter = new NativeBridgeStorageAdapter(bridge, 'test_ns');
    await adapter.initialize();
    await adapter.setItem('key_a', 'alpha-content');
    await adapter.setItem('key_b', 'beta-content');

    expect(await adapter.hasItem('key_a')).toBe(true);
    expect(await adapter.keys()).toEqual(['key_a', 'key_b']);

    const quota = await adapter.getQuotaInfo();
    expect(quota.bytesUsed).toBeGreaterThan(0);

    await adapter.removeItem('key_a');
    expect(await adapter.hasItem('key_a')).toBe(false);
    expect(await adapter.keys()).toEqual(['key_b']);

    await adapter.clear();
    expect(await adapter.keys()).toEqual([]);
  });

  it('aborts failed writes and purges /tmp before retrying on QuotaExceededError in OpfsStorageAdapter', async () => {
    const files = new Map<string, Uint8Array>();
    let attempts = 0;
    const abortSpy = vi.fn(async () => {
      throw new Error('Abort failure must not mask QuotaExceededError');
    });
    const removeTmpSpy = vi.fn(async () => {});

    const nsDir = {
      async getDirectoryHandle() {
        return nsDir;
      },
      async getFileHandle(name: string) {
        return {
          async getFile() {
            const bytes = files.get(name) ?? new Uint8Array(0);
            return new Blob([bytes.slice().buffer]) as unknown as File;
          },
          async createWritable() {
            attempts += 1;
            const currentAttempt = attempts;
            let staged = new Uint8Array(0);
            return {
              async write(data: BufferSource | string) {
                if (currentAttempt === 1) {
                  const err = new Error('Quota full');
                  err.name = 'QuotaExceededError';
                  throw err;
                }
                staged =
                  typeof data === 'string'
                    ? new TextEncoder().encode(data)
                    : data instanceof ArrayBuffer
                      ? new Uint8Array(data.slice(0))
                      : new Uint8Array(
                          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
                        );
              },
              async abort() {
                await abortSpy();
              },
              async close() {
                files.set(name, staged);
              },
            };
          },
        };
      },
      async removeEntry() {},
    };

    const opfsRoot = {
      async getDirectoryHandle() {
        return nsDir;
      },
      async getFileHandle() {
        throw new Error('unused');
      },
      async removeEntry(name: string) {
        if (name === 'tmp') {
          await removeTmpSpy();
        }
      },
    };

    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => opfsRoot,
      },
    });

    try {
      const adapter = new OpfsStorageAdapter({ namespace: 'quota_test' });
      await adapter.initialize();
      await adapter.setItem('record-1', 'hello-opfs');

      expect(attempts).toBe(2);
      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(removeTmpSpy).toHaveBeenCalledTimes(1);
      expect(await adapter.getItem('record-1')).toBe('hello-opfs');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Decoupled Pure Primitives Hygiene', () => {
  it('validates raster vs SVG image detection and encrypted ZIP packaging', () => {
    expect(isSvgImageInput('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true);
    expect(isSvgImageInput('image/svg+xml')).toBe(true);
    expect(isSvgImageInput('image/png')).toBe(false);

    expect(sanitizeSafeRasterImageDataUrl('data:image/svg+xml;base64,abc')).toBe('');
    expect(sanitizeSafeRasterImageDataUrl('javascript:alert(1)')).toBe('');
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect(sanitizeSafeRasterImageDataUrl(validPng)).toBe(validPng);

    const validEnvelope = {
      format: 'app-vault-v1',
      cipher: 'AES-256-GCM' as const,
      kdf: 'PBKDF2-SHA256' as const,
      iterations: 100_000,
      saltBase64: 'c2FsdA==',
      ivBase64: 'aXZ2YWx1ZQ==',
      payloadKind: 'backup',
      createdAtIso: new Date().toISOString(),
      ciphertextBase64: 'Y2lwaGVy',
    };
    expect(isGenericEncryptedEnvelope(validEnvelope)).toBe(true);
    expect(isGenericEncryptedEnvelope({ format: 'bad' })).toBe(false);

    const zipBytes = wrapGenericEncryptedZip({
      envelope: validEnvelope,
      payloadEntryName: 'ENCRYPTED.json',
      readmeTitle: 'Unit Test Vault',
    });
    expect(zipBytes.byteLength).toBeGreaterThan(50);
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);
  });
});

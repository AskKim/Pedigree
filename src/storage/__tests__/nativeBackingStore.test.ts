/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Verifies that `WebSqliteAdapter` + `createPedigreeDomainStorageAdapter` persist and
 * reload snapshots through `NativeBridgeStorageAdapter` on `ios-wkwebview` even when
 * browser `indexedDB` is completely unavailable (preventing silent write drops).
 */

import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { IPlatformBridge, NativeStorageBridgeOperation, PlatformCapabilities } from '@engine/bridge';

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
  default: path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
}));

import { createPedigreeDomainStorageAdapter } from '@app/pedigreeAppWiring';

function createMockIosNativeBridge() {
  const nativeStore = new Map<string, unknown>();
  const iosCaps: PlatformCapabilities = {
    shell: 'ios-wkwebview',
    hasNativeBridge: true,
    hasPersistentStorage: true,
    requiresIosStorageBridge: true,
    supportsOpfs: false,
    supportsIndexedDb: false,
    supportsWebSqlite: true,
    supportsWebWorkers: false,
    canPrintDirect: true,
    canShareBinary: true,
    canAccessFileSystem: false,
    hasHardwareBackNavigation: false,
    hasNfc: false,
  };

  const bridge: IPlatformBridge = {
    shellType: 'ios-wkwebview',
    async detectCapabilities() {
      return iosCaps;
    },
    getCapabilities() {
      return iosCaps;
    },
    async exportBinary() {
      return { ok: true, handledBy: 'native-ios' };
    },
    async printDocument() {
      return true;
    },
    registerBackHandler() {
      return () => {};
    },
    async invokeStorageBridge(op: NativeStorageBridgeOperation) {
      if (op.action === 'write' && op.key) {
        nativeStore.set(op.key, op.data);
        return { ok: true, requestId: op.requestId };
      }
      if (op.action === 'read' && op.key) {
        return {
          ok: true,
          requestId: op.requestId,
          data: nativeStore.has(op.key) ? nativeStore.get(op.key) : null,
        };
      }
      if (op.action === 'delete' && op.key) {
        nativeStore.delete(op.key);
        return { ok: true, requestId: op.requestId };
      }
      if (op.action === 'list') {
        const prefix = typeof op.options?.prefix === 'string' ? op.options.prefix : '';
        const keys = Array.from(nativeStore.keys()).filter((k) => k.startsWith(prefix));
        return { ok: true, requestId: op.requestId, data: keys };
      }
      return { ok: false, error: 'Unsupported op' };
    },
    logDiagnostic() {},
  };

  return { bridge, nativeStore };
}

describe('WebSqliteAdapter + NativeBridgeStorageAdapter (iOS WKWebView without IndexedDB)', () => {
  it('persists writes to native bridge and reloads them across adapter instances without IndexedDB', async () => {
    const { bridge, nativeStore } = createMockIosNativeBridge();

    const firstAdapter = createPedigreeDomainStorageAdapter({
      bridge,
      namespace: 'ios_e2e_test',
    });
    expect(firstAdapter.engineName).toContain('native-bridge(ios-wkwebview)');

    const initial = await firstAdapter.initialize({ allowSeedFresh: true });
    expect(initial.animals.length).toBeGreaterThan(0);

    const updatedSettings = {
      ...initial.settings,
      barnName: 'iOS Native Vault Barn',
      breederName: 'Bridge Verified',
    };
    await firstAdapter.saveSettings(updatedSettings);

    // Ensure bytes were actually persisted into the native bridge store (not dropped into ephemeral mode)
    expect(nativeStore.size).toBeGreaterThan(0);

    // Re-initialize a brand-new adapter instance backed by the same native bridge store
    const secondAdapter = createPedigreeDomainStorageAdapter({
      bridge,
      namespace: 'ios_e2e_test',
    });
    const reloaded = await secondAdapter.initialize();
    expect(reloaded.settings.barnName).toBe('iOS Native Vault Barn');
    expect(reloaded.settings.breederName).toBe('Bridge Verified');
  });
});

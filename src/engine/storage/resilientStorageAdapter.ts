/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Resilient Storage Orchestrator & Portable Bundle Export/Restore (`@engine/storage/resilientStorageAdapter.ts`).
 */

import { base64ToBytesPure, bytesToBase64Pure, utf8StringToBytes } from '../binaryEncoding';
import { createPlatformBridge } from '../bridge/platformBridge';
import type { IPlatformBridge } from '../bridge/platformBridge.interface';
import { fnv1a64Hex, isSafeObjectKey, sha256HexPure } from '../primitives';
import {
  IndexedDbStorageAdapter,
  MemoryStorageAdapter,
  OpfsStorageAdapter,
} from './browserStorageAdapters';
import { NativeBridgeStorageAdapter } from './nativeBridgeStorageAdapter';
import { SqliteWasmStorageAdapter } from './sqliteWasmStorageAdapter';
import type { IStorageAdapter } from './storageAdapter.interface';

export interface StorageResolutionOptions {
  namespace?: string;
  bridge?: IPlatformBridge;
  preferSqliteWasm?: boolean;
  allowMemoryFallback?: boolean;
}

export interface PortableStorageEntry {
  key: string;
  encoding: 'utf8' | 'base64';
  value: string;
}

export interface PortableStorageBundle {
  format: 'core-storage-bundle';
  schemaVersion: 1;
  exportedAtIso: string;
  driver: string;
  entryCount: number;
  checksumHex: string;
  /** Cryptographic SHA-256 digest of the canonical entries payload (paired with FNV-1a `checksumHex`). */
  sha256Hex?: string;
  entries: PortableStorageEntry[];
}

function canonicalEntriesBytes(entries: PortableStorageEntry[]): Uint8Array {
  const canonical = entries
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((e) => `${e.key}:${e.encoding}:${e.value}`)
    .join('\n');
  return utf8StringToBytes(canonical);
}

function computeEntriesChecksum(entries: PortableStorageEntry[]): string {
  return fnv1a64Hex(canonicalEntriesBytes(entries));
}

function computeEntriesSha256(entries: PortableStorageEntry[]): string {
  return sha256HexPure(canonicalEntriesBytes(entries));
}

export async function createResilientStorageAdapter(
  options: StorageResolutionOptions = {}
): Promise<IStorageAdapter> {
  const namespace = options.namespace || 'app_core';
  const bridge = options.bridge ?? createPlatformBridge();
  const caps = await bridge.detectCapabilities();

  // iOS WKWebView MUST route persistence through native host storage to prevent 7-day WebKit eviction.
  if (caps.requiresIosStorageBridge) {
    if (typeof bridge.invokeStorageBridge === 'function') {
      const nativeAdapter = new NativeBridgeStorageAdapter(bridge, namespace);
      try {
        if (await nativeAdapter.isSupported()) {
          await nativeAdapter.initialize();
          return nativeAdapter;
        }
      } catch (err) {
        bridge.logDiagnostic(
          'error',
          'IOS_STORAGE_BRIDGE_INIT_FAILED',
          err instanceof Error ? err.message : 'Failed to initialize iOS native storage bridge'
        );
      }
    } else {
      bridge.logDiagnostic(
        'error',
        'IOS_STORAGE_BRIDGE_MISSING',
        'iOS WKWebView requires native SQLite storage bridge to avoid 7-day WebKit eviction'
      );
    }

    if (options.allowMemoryFallback === false) {
      throw new Error(
        'iOS WKWebView requires a working native SQLite storage bridge; refusing evictable browser storage fallback'
      );
    }
    const memory = new MemoryStorageAdapter();
    await memory.initialize();
    return memory;
  }

  const candidates: IStorageAdapter[] = [];

  if (caps.supportsOpfs) {
    const opfs = new OpfsStorageAdapter({ namespace });
    if (options.preferSqliteWasm && caps.supportsWebSqlite) {
      candidates.push(
        new SqliteWasmStorageAdapter({
          backingAdapter: opfs,
          backingKey: `${namespace}.sqlite`,
        })
      );
    }
    candidates.push(opfs);
  }

  if (caps.supportsIndexedDb) {
    const idb = new IndexedDbStorageAdapter({ dbName: `${namespace}_db` });
    if (options.preferSqliteWasm && caps.supportsWebSqlite) {
      candidates.push(
        new SqliteWasmStorageAdapter({
          backingAdapter: idb,
          backingKey: `${namespace}.sqlite`,
        })
      );
    }
    candidates.push(idb);
  }

  if (caps.hasNativeBridge && typeof bridge.invokeStorageBridge === 'function') {
    candidates.push(new NativeBridgeStorageAdapter(bridge, namespace));
  }

  for (const adapter of candidates) {
    try {
      if (await adapter.isSupported()) {
        await adapter.initialize();
        return adapter;
      }
    } catch (err) {
      bridge.logDiagnostic(
        'warn',
        'STORAGE_ADAPTER_FALLBACK',
        `Falling back from ${adapter.name}: ${err instanceof Error ? err.message : 'init failed'}`
      );
    }
  }

  if (options.allowMemoryFallback === false) {
    throw new Error('No persistent storage adapter is available in the current environment');
  }

  const memory = new MemoryStorageAdapter();
  await memory.initialize();
  return memory;
}

export async function exportPortableStorageBundle(
  adapter: IStorageAdapter,
  prefix?: string
): Promise<PortableStorageBundle> {
  const keyList = await adapter.keys(prefix ? { prefix } : undefined);
  const entries: PortableStorageEntry[] = [];

  for (const key of keyList) {
    if (!isSafeObjectKey(key)) continue;
    const raw = await adapter.getItem(key);
    if (raw === null) continue;
    if (typeof raw === 'string') {
      entries.push({ key, encoding: 'utf8', value: raw });
    } else {
      entries.push({ key, encoding: 'base64', value: bytesToBase64Pure(raw) });
    }
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));
  return {
    format: 'core-storage-bundle',
    schemaVersion: 1,
    exportedAtIso: new Date().toISOString(),
    driver: adapter.capabilities.driver,
    entryCount: entries.length,
    checksumHex: computeEntriesChecksum(entries),
    sha256Hex: computeEntriesSha256(entries),
    entries,
  };
}

export async function restorePortableStorageBundle(
  adapter: IStorageAdapter,
  bundleInput: PortableStorageBundle | string,
  options: { clearExisting?: boolean } = {}
): Promise<{ restoredCount: number }> {
  const parsed =
    typeof bundleInput === 'string'
      ? (JSON.parse(bundleInput) as PortableStorageBundle)
      : bundleInput;

  if (
    !parsed ||
    parsed.format !== 'core-storage-bundle' ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.entries)
  ) {
    throw new Error('Invalid portable storage bundle format');
  }

  const expectedChecksum = computeEntriesChecksum(parsed.entries);
  if (parsed.checksumHex !== expectedChecksum) {
    throw new Error('Portable storage bundle checksum verification failed');
  }
  if (typeof parsed.sha256Hex === 'string' && parsed.sha256Hex.length > 0) {
    const expectedSha256 = computeEntriesSha256(parsed.entries);
    if (parsed.sha256Hex.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new Error('Portable storage bundle SHA-256 verification failed');
    }
  }

  if (options.clearExisting) {
    await adapter.clear();
  }

  let restoredCount = 0;
  for (const entry of parsed.entries) {
    if (
      !entry ||
      typeof entry.key !== 'string' ||
      !isSafeObjectKey(entry.key) ||
      typeof entry.value !== 'string'
    ) {
      continue;
    }
    const decoded =
      entry.encoding === 'base64' ? base64ToBytesPure(entry.value) : entry.value;
    await adapter.setItem(entry.key, decoded);
    restoredCount += 1;
  }

  if (adapter.flush) {
    await adapter.flush();
  }

  return { restoredCount };
}

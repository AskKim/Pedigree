/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Browser Storage Adapters (`@engine/storage/browserStorageAdapters.ts`).
 * Implements Memory, IndexedDB, and OPFS adapters with zero domain coupling.
 */

import { bytesToUtf8String, utf8StringToBytes } from '../binaryEncoding';
import type {
  IStorageAdapter,
  StorageBatchOperation,
  StorageCapabilities,
  StorageFilterOptions,
  StorageQuotaInfo,
  StorageTransaction,
} from './storageAdapter.interface';

function filterAndSliceKeys(allKeys: string[], filter?: StorageFilterOptions): string[] {
  let result = allKeys.slice();
  if (filter?.prefix) {
    const prefix = filter.prefix;
    result = result.filter((k) => k.indexOf(prefix) === 0);
  }
  result.sort();
  if (filter?.reverse) {
    result.reverse();
  }
  const offset = filter?.offset && filter.offset > 0 ? filter.offset : 0;
  const limit = filter?.limit && filter.limit > 0 ? filter.limit : undefined;
  return limit !== undefined ? result.slice(offset, offset + limit) : result.slice(offset);
}

function estimateValueBytes(value: Uint8Array | string): number {
  return typeof value === 'string' ? utf8StringToBytes(value).byteLength : value.byteLength;
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = String((err as { name?: string }).name || '');
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

export class MemoryStorageAdapter implements IStorageAdapter {
  public readonly name = 'memory-storage';
  public readonly capabilities: StorageCapabilities = {
    driver: 'memory',
    isPersistent: false,
    supportsBinary: true,
    supportsTransactions: true,
    supportsQuerying: false,
    supportsStreaming: false,
  };

  private readonly store = new Map<string, Uint8Array | string>();

  public async isSupported(): Promise<boolean> {
    return true;
  }

  public async initialize(): Promise<void> {
    // Ready immediately
  }

  public async getItem(key: string): Promise<Uint8Array | string | null> {
    const val = this.store.get(key);
    if (val === undefined) return null;
    return val instanceof Uint8Array ? new Uint8Array(val) : val;
  }

  public async setItem(key: string, value: Uint8Array | string): Promise<void> {
    this.store.set(key, value instanceof Uint8Array ? new Uint8Array(value) : value);
  }

  public async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }

  public async keys(filter?: StorageFilterOptions): Promise<string[]> {
    return filterAndSliceKeys(Array.from(this.store.keys()), filter);
  }

  public async hasItem(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  public async getQuotaInfo(): Promise<StorageQuotaInfo> {
    let bytesUsed = 0;
    this.store.forEach((value, key) => {
      bytesUsed += key.length * 2 + estimateValueBytes(value);
    });
    return { bytesUsed };
  }

  public async batch(operations: StorageBatchOperation[]): Promise<void> {
    const rollbackOps: Array<() => void> = [];
    try {
      for (const op of operations) {
        const prevExists = this.store.has(op.key);
        const prevVal = this.store.get(op.key);
        rollbackOps.push(() => {
          if (prevExists && prevVal !== undefined) {
            this.store.set(op.key, prevVal);
          } else {
            this.store.delete(op.key);
          }
        });
        if (op.type === 'delete') {
          this.store.delete(op.key);
        } else if (op.value !== undefined) {
          await this.setItem(op.key, op.value);
        }
      }
    } catch (err) {
      for (let i = rollbackOps.length - 1; i >= 0; i -= 1) {
        rollbackOps[i]();
      }
      throw err;
    }
  }

  public async beginTransaction(): Promise<StorageTransaction> {
    const staged: StorageBatchOperation[] = [];
    let settled = false;
    return {
      put: async (key, value) => {
        if (settled) throw new Error('Transaction already settled');
        staged.push({ type: 'put', key, value });
      },
      delete: async (key) => {
        if (settled) throw new Error('Transaction already settled');
        staged.push({ type: 'delete', key });
      },
      commit: async () => {
        if (settled) throw new Error('Transaction already settled');
        settled = true;
        await this.batch(staged);
      },
      rollback: async () => {
        settled = true;
        staged.length = 0;
      },
    };
  }
}

export interface IndexedDbStorageOptions {
  dbName?: string;
  storeName?: string;
  version?: number;
  /** Optional hook invoked before resetting an IndexedDB database that hit VersionError. */
  onVersionError?: (dbName: string, err: unknown) => Promise<void> | void;
  /** When true, deletes and recreates the database cleanly after invoking `onVersionError`. */
  resetOnVersionError?: boolean;
  /** Optional cleanup hook invoked before retrying a batch write on QuotaExceededError. */
  onQuotaExceeded?: () => Promise<void> | void;
}

function getSafeIdbFactory(): IDBFactory | null {
  try {
    const g = globalThis as unknown as { indexedDB?: IDBFactory };
    return g.indexedDB && typeof g.indexedDB.open === 'function' ? g.indexedDB : null;
  } catch {
    return null;
  }
}

async function queryBrowserQuotaEstimate(): Promise<StorageQuotaInfo> {
  try {
    const g = globalThis as unknown as { navigator?: { storage?: StorageManager } };
    const estimateFn = g.navigator?.storage?.estimate;
    if (typeof estimateFn === 'function') {
      const est = await estimateFn.call(g.navigator?.storage);
      const bytesUsed = typeof est.usage === 'number' ? est.usage : 0;
      const quotaBytes = typeof est.quota === 'number' ? est.quota : undefined;
      const bytesAvailable =
        quotaBytes !== undefined ? Math.max(0, quotaBytes - bytesUsed) : undefined;
      const percentageUsed =
        quotaBytes && quotaBytes > 0 ? Math.min(100, (bytesUsed / quotaBytes) * 100) : undefined;
      return { bytesUsed, bytesAvailable, quotaBytes, percentageUsed };
    }
  } catch {
    // Ignore restricted navigator.storage access
  }
  return { bytesUsed: 0 };
}

function isVersionErr(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return String((err as { name?: string }).name || '') === 'VersionError';
}

export class IndexedDbStorageAdapter implements IStorageAdapter {
  public readonly name: string;
  public readonly capabilities: StorageCapabilities = {
    driver: 'indexeddb',
    isPersistent: true,
    supportsBinary: true,
    supportsTransactions: true,
    supportsQuerying: false,
    supportsStreaming: false,
  };

  private readonly dbName: string;
  private readonly storeName: string;
  private readonly version: number;
  private readonly onVersionError?: (dbName: string, err: unknown) => Promise<void> | void;
  private readonly resetOnVersionError: boolean;
  private readonly onQuotaExceeded?: () => Promise<void> | void;
  private db: IDBDatabase | null = null;

  constructor(options: IndexedDbStorageOptions = {}) {
    this.dbName = options.dbName || 'app_core_kv_db';
    this.storeName = options.storeName || 'kv_entries';
    this.version = options.version || 1;
    this.onVersionError = options.onVersionError;
    this.resetOnVersionError = Boolean(options.resetOnVersionError);
    this.onQuotaExceeded = options.onQuotaExceeded;
    this.name = `indexeddb:${this.dbName}`;
  }

  public async isSupported(): Promise<boolean> {
    return getSafeIdbFactory() !== null;
  }

  public async initialize(): Promise<void> {
    if (this.db) return;
    try {
      this.db = await this.openDatabase();
    } catch (err) {
      if (isVersionErr(err)) {
        if (this.onVersionError) {
          await this.onVersionError(this.dbName, err);
        }
        if (this.resetOnVersionError) {
          await this.deleteDatabaseSafe();
          this.db = await this.openDatabase();
          return;
        }
      }
      throw err;
    }
  }

  private async deleteDatabaseSafe(): Promise<void> {
    const idb = getSafeIdbFactory();
    if (!idb || typeof idb.deleteDatabase !== 'function') return;
    await new Promise<void>((resolve) => {
      try {
        const req = idb.deleteDatabase(this.dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async openDatabase(): Promise<IDBDatabase> {
    const idb = getSafeIdbFactory();
    if (!idb) {
      throw new Error('IndexedDB is unavailable in this environment');
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = idb.open(this.dbName, this.version);
      } catch (err) {
        reject(err);
        return;
      }

      request.onupgradeneeded = () => {
        try {
          const database = request.result;
          if (!database.objectStoreNames.contains(this.storeName)) {
            database.createObjectStore(this.storeName);
          }
        } catch (err) {
          reject(err);
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          if (this.db === database) {
            this.db = null;
          }
        };
        resolve(database);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB database'));
      };
    });
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error('IndexedDB failed to initialize');
    }
    return this.db;
  }

  public async getItem(key: string): Promise<Uint8Array | string | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result;
        if (res === undefined || res === null) {
          resolve(null);
        } else if (res instanceof ArrayBuffer) {
          resolve(new Uint8Array(res));
        } else if (res instanceof Uint8Array) {
          resolve(new Uint8Array(res));
        } else {
          resolve(String(res));
        }
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
  }

  public async setItem(key: string, value: Uint8Array | string): Promise<void> {
    await this.batch([{ type: 'put', key, value }]);
  }

  public async removeItem(key: string): Promise<void> {
    await this.batch([{ type: 'delete', key }]);
  }

  public async clear(): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.clear();
      req.onerror = () => reject(req.error || new Error('IndexedDB clear failed'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB clear transaction failed'));
    });
  }

  public async keys(filter?: StorageFilterOptions): Promise<string[]> {
    const db = await this.ensureDb();
    const allKeys = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result || []).map((k) => String(k)));
      req.onerror = () => reject(req.error || new Error('IndexedDB keys query failed'));
    });
    return filterAndSliceKeys(allKeys, filter);
  }

  public async hasItem(key: string): Promise<boolean> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.count(key);
      req.onsuccess = () => resolve(Number(req.result) > 0);
      req.onerror = () => reject(req.error || new Error('IndexedDB count failed'));
    });
  }

  public async getQuotaInfo(): Promise<StorageQuotaInfo> {
    return queryBrowserQuotaEstimate();
  }

  public async batch(operations: StorageBatchOperation[]): Promise<void> {
    if (operations.length === 0) return;
    const executeOnce = async (): Promise<void> => {
      const db = await this.ensureDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        for (const op of operations) {
          if (op.type === 'delete') {
            store.delete(op.key);
          } else if (op.value !== undefined) {
            store.put(op.value instanceof Uint8Array ? new Uint8Array(op.value) : op.value, op.key);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB batch transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB batch transaction aborted'));
      });
    };

    try {
      await executeOnce();
    } catch (err) {
      if (isQuotaError(err) && this.onQuotaExceeded) {
        await this.onQuotaExceeded();
        await executeOnce();
        return;
      }
      throw err;
    }
  }

  public async beginTransaction(): Promise<StorageTransaction> {
    const staged: StorageBatchOperation[] = [];
    let settled = false;
    return {
      put: async (key, value) => {
        if (settled) throw new Error('Transaction already settled');
        staged.push({ type: 'put', key, value });
      },
      delete: async (key) => {
        if (settled) throw new Error('Transaction already settled');
        staged.push({ type: 'delete', key });
      },
      commit: async () => {
        if (settled) throw new Error('Transaction already settled');
        settled = true;
        await this.batch(staged);
      },
      rollback: async () => {
        settled = true;
        staged.length = 0;
      },
    };
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

interface OpfsWritableLike {
  write: (data: BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
}

interface OpfsFileHandleLike {
  getFile: () => Promise<File>;
  createWritable: () => Promise<OpfsWritableLike>;
}

interface OpfsDirectoryHandleLike {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsDirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsFileHandleLike>;
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  entries?: () => AsyncIterableIterator<[string, unknown]>;
}

export interface OpfsStorageOptions {
  namespace?: string;
}

const KEY_FILE_PREFIX = 'kv_';
const TEXT_MARKER = 0x54; // 'T'
const BINARY_MARKER = 0x42; // 'B'

function encodeKeyToFilename(key: string): string {
  const bytes = utf8StringToBytes(key);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `${KEY_FILE_PREFIX}${hex}.bin`;
}

function decodeFilenameToKey(filename: string): string | null {
  if (!filename.startsWith(KEY_FILE_PREFIX) || !filename.endsWith('.bin')) {
    return null;
  }
  const hex = filename.slice(KEY_FILE_PREFIX.length, -4);
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytesToUtf8String(out);
}

export class OpfsStorageAdapter implements IStorageAdapter {
  public readonly name: string;
  public readonly capabilities: StorageCapabilities = {
    driver: 'opfs',
    isPersistent: true,
    supportsBinary: true,
    supportsTransactions: false,
    supportsQuerying: false,
    supportsStreaming: true,
  };

  private readonly namespace: string;
  private rootDir: OpfsDirectoryHandleLike | null = null;

  constructor(options: OpfsStorageOptions = {}) {
    this.namespace = (options.namespace || 'core_kv').replace(/[^a-zA-Z0-9_-]/g, '_');
    this.name = `opfs:${this.namespace}`;
  }

  public async isSupported(): Promise<boolean> {
    try {
      const g = globalThis as unknown as { navigator?: { storage?: { getDirectory?: () => Promise<unknown> } } };
      return Boolean(g.navigator?.storage && typeof g.navigator.storage.getDirectory === 'function');
    } catch {
      return false;
    }
  }

  public async initialize(): Promise<void> {
    if (this.rootDir) return;
    const g = globalThis as unknown as {
      navigator?: { storage?: { getDirectory?: () => Promise<OpfsDirectoryHandleLike> } };
    };
    const getDirectory = g.navigator?.storage?.getDirectory;
    if (typeof getDirectory !== 'function') {
      throw new Error('OPFS is not supported in this runtime');
    }
    const opfsRoot = await getDirectory.call(g.navigator?.storage);
    this.rootDir = await opfsRoot.getDirectoryHandle(this.namespace, { create: true });
  }

  private async ensureDir(): Promise<OpfsDirectoryHandleLike> {
    if (!this.rootDir) {
      await this.initialize();
    }
    if (!this.rootDir) {
      throw new Error('OPFS root directory unavailable');
    }
    return this.rootDir;
  }

  private async purgeTempDirectory(): Promise<void> {
    try {
      const g = globalThis as unknown as {
        navigator?: { storage?: { getDirectory?: () => Promise<OpfsDirectoryHandleLike> } };
      };
      const opfsRoot = await g.navigator?.storage?.getDirectory?.();
      if (opfsRoot) {
        await opfsRoot.removeEntry('tmp', { recursive: true });
      }
    } catch {
      // Ignore missing tmp directory
    }
  }

  public async getItem(key: string): Promise<Uint8Array | string | null> {
    const dir = await this.ensureDir();
    try {
      const handle = await dir.getFileHandle(encodeKeyToFilename(key), { create: false });
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      const raw = new Uint8Array(buffer);
      if (raw.byteLength === 0) return null;
      const marker = raw[0];
      const payload = raw.subarray(1);
      if (marker === TEXT_MARKER) {
        return bytesToUtf8String(payload);
      }
      return new Uint8Array(payload);
    } catch {
      return null;
    }
  }

  public async setItem(key: string, value: Uint8Array | string): Promise<void> {
    const dir = await this.ensureDir();
    const isText = typeof value === 'string';
    const body = isText ? utf8StringToBytes(value) : value;
    const framed = new Uint8Array(1 + body.byteLength);
    framed[0] = isText ? TEXT_MARKER : BINARY_MARKER;
    framed.set(body, 1);

    const writeOnce = async () => {
      const handle = await dir.getFileHandle(encodeKeyToFilename(key), { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(framed);
      } finally {
        await writable.close();
      }
    };

    try {
      await writeOnce();
    } catch (err) {
      if (isQuotaError(err)) {
        await this.purgeTempDirectory();
        await writeOnce();
        return;
      }
      throw err;
    }
  }

  public async removeItem(key: string): Promise<void> {
    const dir = await this.ensureDir();
    try {
      await dir.removeEntry(encodeKeyToFilename(key));
    } catch {
      // Ignore missing file
    }
  }

  public async clear(): Promise<void> {
    const dir = await this.ensureDir();
    if (typeof dir.entries !== 'function') return;
    const names: string[] = [];
    for await (const [entryName] of dir.entries()) {
      if (entryName.startsWith(KEY_FILE_PREFIX)) {
        names.push(entryName);
      }
    }
    for (const name of names) {
      try {
        await dir.removeEntry(name);
      } catch {
        // Ignore concurrent delete
      }
    }
  }

  public async keys(filter?: StorageFilterOptions): Promise<string[]> {
    const dir = await this.ensureDir();
    const found: string[] = [];
    if (typeof dir.entries === 'function') {
      for await (const [entryName] of dir.entries()) {
        const decoded = decodeFilenameToKey(entryName);
        if (decoded !== null) {
          found.push(decoded);
        }
      }
    }
    return filterAndSliceKeys(found, filter);
  }

  public async hasItem(key: string): Promise<boolean> {
    const dir = await this.ensureDir();
    try {
      await dir.getFileHandle(encodeKeyToFilename(key), { create: false });
      return true;
    } catch {
      return false;
    }
  }

  public async getQuotaInfo(): Promise<StorageQuotaInfo> {
    return queryBrowserQuotaEstimate();
  }

  public async close(): Promise<void> {
    this.rootDir = null;
  }
}

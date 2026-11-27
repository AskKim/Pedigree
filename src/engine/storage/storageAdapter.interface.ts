/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Storage Adapter Interface (`@engine/storage/storageAdapter.interface.ts`).
 *
 * Architectural Invariant:
 * Pure content-agnostic TypeScript contract with zero domain terms.
 * Defines swappable persistent and transient storage engines across Web,
 * Android WebView, and native desktop/Apple containers.
 */

export type StorageDriverType =
  | 'sqlite-wasm'
  | 'opfs'
  | 'indexeddb'
  | 'native-bridge'
  | 'memory';

export interface StorageQuotaInfo {
  /** Approximate bytes consumed by this storage adapter or origin */
  bytesUsed: number;
  /** Estimated remaining available bytes, or undefined if unknown */
  bytesAvailable?: number;
  /** Estimated total quota allocation in bytes, or undefined if unknown */
  quotaBytes?: number;
  /** Percentage of quota used (0 - 100), or undefined if unknown */
  percentageUsed?: number;
}

export interface StorageCapabilities {
  /** Underlying driver technology */
  driver: StorageDriverType;
  /** Whether data survives browser session or app restart */
  isPersistent: boolean;
  /** Whether the adapter natively supports Uint8Array or binary blobs without base64 overhead */
  supportsBinary: boolean;
  /** Whether transactional batch writes (atomic rollback) are supported */
  supportsTransactions: boolean;
  /** Whether structured or index-based querying is supported */
  supportsQuerying: boolean;
  /** Whether file or blob streaming is available */
  supportsStreaming: boolean;
}

export interface StorageBatchOperation {
  type: 'put' | 'delete';
  key: string;
  value?: Uint8Array | string;
}

export interface StorageTransaction {
  put(key: string, value: Uint8Array | string): Promise<void>;
  delete(key: string): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface StorageFilterOptions {
  prefix?: string;
  limit?: number;
  offset?: number;
  reverse?: boolean;
}

/**
 * Universal Content-Agnostic Storage Adapter Contract.
 */
export interface IStorageAdapter {
  /** Human-readable identifier for diagnostics and logging */
  readonly name: string;

  /** Capability flags for feature gating and performance routing */
  readonly capabilities: StorageCapabilities;

  /** Checks whether the runtime environment supports this storage engine */
  isSupported(): Promise<boolean>;

  /** Initializes database connection, tables, or file handles */
  initialize(): Promise<void>;

  /** Retrieves a value by key, returning binary or text representation, or null if missing */
  getItem(key: string): Promise<Uint8Array | string | null>;

  /** Persists a binary or text value by key */
  setItem(key: string, value: Uint8Array | string): Promise<void>;

  /** Removes a single entry by key */
  removeItem(key: string): Promise<void>;

  /** Clears all entries managed by this adapter */
  clear(): Promise<void>;

  /** Lists all keys, optionally filtered by key prefix or pagination */
  keys(filter?: StorageFilterOptions): Promise<string[]>;

  /** Checks whether a specific key exists */
  hasItem(key: string): Promise<boolean>;

  /** Reports approximate storage consumption and remaining quota */
  getQuotaInfo(): Promise<StorageQuotaInfo>;

  /** Executes an atomic batch of put/delete operations */
  batch?(operations: StorageBatchOperation[]): Promise<void>;

  /** Begins an explicit atomic transaction if supported by the driver */
  beginTransaction?(): Promise<StorageTransaction>;

  /** Flushes any buffered or in-memory write-ahead logs to durable storage */
  flush?(): Promise<void>;

  /** Gracefully tears down connections and releases file/driver locks */
  close?(): Promise<void>;
}

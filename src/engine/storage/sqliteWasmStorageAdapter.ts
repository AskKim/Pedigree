/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic SQLite WASM Storage Adapter (`@engine/storage/sqliteWasmStorageAdapter.ts`).
 * Wraps `sql.js` over a backing `IStorageAdapter` (IndexedDB, OPFS, Native Bridge, or Memory)
 * and supports raw `.sqlite` binary export and validated restore.
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { bytesToUtf8String, utf8StringToBytes } from '../binaryEncoding';
import type {
  IStorageAdapter,
  StorageBatchOperation,
  StorageCapabilities,
  StorageFilterOptions,
  StorageQuotaInfo,
  StorageTransaction,
} from './storageAdapter.interface';
import { MemoryStorageAdapter } from './browserStorageAdapters';

const SQLITE_HEADER_MAGIC = 'SQLite format 3\0';
const DEFAULT_BLOB_KEY = 'core_store.sqlite';

export interface SqliteWasmStorageOptions {
  /** Backing adapter storing the serialized SQLite binary image */
  backingAdapter?: IStorageAdapter;
  /** Storage key used inside the backing adapter */
  backingKey?: string;
  /** Optional custom `sql.js` loader for tests or offline bundle URLs */
  loadSqlJs?: () => Promise<SqlJsStatic>;
  /** Optional resolved URL to `sql-wasm.wasm` for offline/sub-route PWA loading */
  wasmUrl?: string;
}

export function isValidSqliteBinary(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 100) return false;
  for (let i = 0; i < SQLITE_HEADER_MAGIC.length; i += 1) {
    if (bytes[i] !== SQLITE_HEADER_MAGIC.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

export class SqliteWasmStorageAdapter implements IStorageAdapter {
  public readonly name: string;
  public readonly capabilities: StorageCapabilities = {
    driver: 'sqlite-wasm',
    isPersistent: true,
    supportsBinary: true,
    supportsTransactions: true,
    supportsQuerying: true,
    supportsStreaming: false,
  };

  private readonly backingAdapter: IStorageAdapter;
  private readonly backingKey: string;
  private readonly loadSqlJs?: () => Promise<SqlJsStatic>;
  private readonly wasmUrl?: string;
  private sqlStatic: SqlJsStatic | null = null;
  private db: Database | null = null;

  constructor(options: SqliteWasmStorageOptions = {}) {
    this.backingAdapter = options.backingAdapter ?? new MemoryStorageAdapter();
    this.backingKey = options.backingKey || DEFAULT_BLOB_KEY;
    this.loadSqlJs = options.loadSqlJs;
    this.wasmUrl = options.wasmUrl;
    this.name = `sqlite-wasm(${this.backingAdapter.name})`;
  }

  public async isSupported(): Promise<boolean> {
    try {
      const wasmOk =
        typeof WebAssembly === 'object' &&
        WebAssembly !== null &&
        typeof WebAssembly.instantiate === 'function';
      if (!wasmOk) return false;
      return await this.backingAdapter.isSupported();
    } catch {
      return false;
    }
  }

  public async initialize(): Promise<void> {
    if (this.db) return;
    await this.backingAdapter.initialize();
    this.sqlStatic = this.loadSqlJs
      ? await this.loadSqlJs()
      : await initSqlJs(this.wasmUrl ? { locateFile: () => this.wasmUrl! } : undefined);

    const persisted = await this.backingAdapter.getItem(this.backingKey);
    if (persisted instanceof Uint8Array && isValidSqliteBinary(persisted)) {
      this.db = new this.sqlStatic.Database(persisted);
    } else {
      this.db = new this.sqlStatic.Database();
    }
    this.ensureSchema(this.db);
  }

  private ensureSchema(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        text_value TEXT,
        blob_value BLOB,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private async ensureDb(): Promise<Database> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error('SQLite WASM database failed to initialize');
    }
    return this.db;
  }

  private async persistDatabase(db: Database): Promise<void> {
    const exported = db.export();
    await this.backingAdapter.setItem(this.backingKey, exported);
  }

  public async getItem(key: string): Promise<Uint8Array | string | null> {
    const db = await this.ensureDb();
    const stmt = db.prepare('SELECT kind, text_value, blob_value FROM kv_store WHERE key = ? LIMIT 1');
    try {
      stmt.bind([key]);
      if (!stmt.step()) {
        return null;
      }
      const row = stmt.getAsObject() as {
        kind?: unknown;
        text_value?: unknown;
        blob_value?: unknown;
      };
      if (row.kind === 'binary') {
        if (row.blob_value instanceof Uint8Array) {
          return new Uint8Array(row.blob_value);
        }
        return null;
      }
      if (typeof row.text_value === 'string') {
        return row.text_value;
      }
      if (row.blob_value instanceof Uint8Array) {
        return bytesToUtf8String(row.blob_value);
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  public async setItem(key: string, value: Uint8Array | string): Promise<void> {
    await this.batch([{ type: 'put', key, value }]);
  }

  public async removeItem(key: string): Promise<void> {
    await this.batch([{ type: 'delete', key }]);
  }

  public async clear(): Promise<void> {
    const db = await this.ensureDb();
    db.run('DELETE FROM kv_store');
    await this.persistDatabase(db);
  }

  public async keys(filter?: StorageFilterOptions): Promise<string[]> {
    const db = await this.ensureDb();
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter?.prefix) {
      clauses.push('key LIKE ?');
      params.push(`${filter.prefix.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')} ESCAPE '\\'` : '';
    const orderSql = filter?.reverse ? 'ORDER BY key DESC' : 'ORDER BY key ASC';
    let limitSql = '';
    if (filter?.limit && filter.limit > 0) {
      limitSql = 'LIMIT ?';
      params.push(filter.limit);
      if (filter.offset && filter.offset > 0) {
        limitSql += ' OFFSET ?';
        params.push(filter.offset);
      }
    } else if (filter?.offset && filter.offset > 0) {
      limitSql = 'LIMIT -1 OFFSET ?';
      params.push(filter.offset);
    }

    const stmt = db.prepare(`SELECT key FROM kv_store ${whereSql} ${orderSql} ${limitSql}`);
    const out: string[] = [];
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      while (stmt.step()) {
        const row = stmt.get();
        if (row[0] !== undefined && row[0] !== null) {
          out.push(String(row[0]));
        }
      }
      return out;
    } finally {
      stmt.free();
    }
  }

  public async hasItem(key: string): Promise<boolean> {
    const db = await this.ensureDb();
    const stmt = db.prepare('SELECT 1 FROM kv_store WHERE key = ? LIMIT 1');
    try {
      stmt.bind([key]);
      return stmt.step();
    } finally {
      stmt.free();
    }
  }

  public async getQuotaInfo(): Promise<StorageQuotaInfo> {
    const backingQuota = await this.backingAdapter.getQuotaInfo();
    const raw = await this.exportRawSqliteBytes();
    const dbBytes = raw ? raw.byteLength : 0;
    return {
      ...backingQuota,
      bytesUsed: Math.max(backingQuota.bytesUsed, dbBytes),
    };
  }

  public async batch(operations: StorageBatchOperation[]): Promise<void> {
    if (operations.length === 0) return;
    const db = await this.ensureDb();
    const nowIso = new Date().toISOString();
    db.run('BEGIN TRANSACTION');
    try {
      const upsertStmt = db.prepare(`
        INSERT INTO kv_store (key, kind, text_value, blob_value, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          kind = excluded.kind,
          text_value = excluded.text_value,
          blob_value = excluded.blob_value,
          updated_at = excluded.updated_at
      `);
      const deleteStmt = db.prepare('DELETE FROM kv_store WHERE key = ?');
      try {
        for (const op of operations) {
          if (op.type === 'delete') {
            deleteStmt.run([op.key]);
          } else if (op.value !== undefined) {
            if (typeof op.value === 'string') {
              upsertStmt.run([op.key, 'text', op.value, null, nowIso]);
            } else {
              upsertStmt.run([op.key, 'binary', null, new Uint8Array(op.value), nowIso]);
            }
          }
        }
      } finally {
        upsertStmt.free();
        deleteStmt.free();
      }
      db.run('COMMIT');
    } catch (err) {
      try {
        db.run('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    }
    await this.persistDatabase(db);
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

  public async flush(): Promise<void> {
    if (this.db) {
      await this.persistDatabase(this.db);
    }
    if (this.backingAdapter.flush) {
      await this.backingAdapter.flush();
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.persistDatabase(this.db);
      this.db.close();
      this.db = null;
    }
    if (this.backingAdapter.close) {
      await this.backingAdapter.close();
    }
  }

  public async exportRawSqliteBytes(): Promise<Uint8Array | null> {
    const db = await this.ensureDb();
    return db.export();
  }

  public async importRawSqliteBytes(bytes: Uint8Array): Promise<void> {
    if (!isValidSqliteBinary(bytes)) {
      throw new Error('Invalid SQLite 3 binary file header');
    }
    if (!this.sqlStatic) {
      this.sqlStatic = this.loadSqlJs ? await this.loadSqlJs() : await initSqlJs();
    }
    const nextDb = new this.sqlStatic.Database(bytes);
    this.ensureSchema(nextDb);
    if (this.db) {
      this.db.close();
    }
    this.db = nextDb;
    await this.persistDatabase(nextDb);
  }

  public async getEntryCount(): Promise<number> {
    const db = await this.ensureDb();
    const res = db.exec('SELECT COUNT(*) FROM kv_store');
    if (!res.length || !res[0].values.length) return 0;
    return Number(res[0].values[0][0]) || 0;
  }

  public async estimatePayloadBytes(): Promise<number> {
    const db = await this.ensureDb();
    const stmt = db.prepare('SELECT text_value, blob_value FROM kv_store');
    let total = 0;
    try {
      while (stmt.step()) {
        const row = stmt.get();
        if (typeof row[0] === 'string') {
          total += utf8StringToBytes(row[0]).byteLength;
        } else if (row[1] instanceof Uint8Array) {
          total += row[1].byteLength;
        }
      }
      return total;
    } finally {
      stmt.free();
    }
  }
}

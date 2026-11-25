/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline-First Persistence Store for Captured Suggestion Ideas
 * (`src/storage/capturedIdeasStore.ts`).
 *
 * Storage Strategy & Invariants:
 * - Primary store: Dedicated IndexedDB database (`community_pedigree_ideas_v1`) with short,
 *   atomic `readonly` / `readwrite` transactions and `try/catch` VersionError protection.
 * - Secondary fallback / mirror: OPFS `/ideas/captured-ideas.json` (when supported) with
 *   deterministic `try/finally` `.close()` on writable streams, plus `localStorage` fallback.
 * - Quota defense: Catches `QuotaExceededError` on writes, purges OPFS `/tmp`, and retries once.
 * - Bounded growth: Enforces `MAX_CAPTURED_IDEAS_COUNT` (`500` entries).
 */

import { generateUuid, nowIsoUtc } from '../domain/models';
import {
  CapturedIdeaEntry,
  isValidCapturedIdeaEntry,
  MAX_CAPTURED_IDEAS_COUNT,
  sanitizeIdeaInput,
} from '../domain/suggestionsBacklog';
import { logDiagnosticEvent } from './crashLogger';
import { isOpfsSupported, purgeOpfsTmp } from './opfsStorage';
import {
  getOpfsRoot,
  writeFileToOpfsDir,
} from './opfsTempStream';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
} from './storageProbes';
import { isQuotaExceededError } from './storageProtection';
import type { IStorageAdapter } from '@engine/storage';
import { readBlobAsText } from '../utils/es2018Shims';

const IDEAS_IDB_NAME = 'community_pedigree_ideas_v1';
const IDEAS_IDB_VERSION = 1;
const IDEAS_STORE_NAME = 'captured_ideas';
const IDEAS_LOCAL_STORAGE_KEY = 'pedigree.capturedIdeas.v1';
const IDEAS_OPFS_DIR = 'ideas';
const IDEAS_OPFS_FILE = 'captured-ideas.json';

let activeCapturedIdeasBackingStore: IStorageAdapter | null = null;

/**
 * Configures an optional content-agnostic `IStorageAdapter` backing store (such as
 * `NativeBridgeStorageAdapter` on iOS `WKWebView`) so user-authored captured ideas
 * survive 7-day WebKit ITP eviction.
 */
export function configureCapturedIdeasBackingStore(adapter: IStorageAdapter | null): void {
  activeCapturedIdeasBackingStore = adapter;
}

function sortIdeasNewestFirst(ideas: readonly CapturedIdeaEntry[]): CapturedIdeaEntry[] {
  return [...ideas].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

function parseIdeaList(raw: unknown): CapturedIdeaEntry[] {
  if (!Array.isArray(raw)) return [];
  const valid: CapturedIdeaEntry[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!isValidCapturedIdeaEntry(item)) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    valid.push({
      id: item.id,
      text: item.text,
      createdAtIso: item.createdAtIso,
    });
  }
  return sortIdeasNewestFirst(valid).slice(0, MAX_CAPTURED_IDEAS_COUNT);
}

function readLocalFallback(): CapturedIdeaEntry[] {
  const ls = getSafeLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(IDEAS_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return parseIdeaList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLocalFallback(ideas: readonly CapturedIdeaEntry[]): boolean {
  const ls = getSafeLocalStorage();
  if (!ls) return false;
  try {
    ls.setItem(IDEAS_LOCAL_STORAGE_KEY, JSON.stringify(ideas));
    return true;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw err;
    }
    return false;
  }
}

async function openIdeasIndexedDb(): Promise<IDBDatabase | null> {
  const idb = getSafeIndexedDb();
  if (!idb) return null;
  try {
    return await new Promise<IDBDatabase | null>((resolve) => {
      let settled = false;
      const finish = (db: IDBDatabase | null) => {
        if (!settled) {
          settled = true;
          resolve(db);
        }
      };
      try {
        const req = idb.open(IDEAS_IDB_NAME, IDEAS_IDB_VERSION);
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDEAS_STORE_NAME)) {
              db.createObjectStore(IDEAS_STORE_NAME, { keyPath: 'id' });
            }
          } catch {
            // Handled cleanly by onerror/fallback
          }
        };
        req.onsuccess = () => finish(req.result);
        req.onerror = () => finish(null);
        req.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    });
  } catch {
    return null;
  }
}

async function readAllFromIdb(): Promise<CapturedIdeaEntry[] | null> {
  const db = await openIdeasIndexedDb();
  if (!db) return null;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readonly');
      const untrackTx = trackActiveIdbTransaction(tx);
      const store = tx.objectStore(IDEAS_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        untrackTx();
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => {
        untrackTx();
        reject(req.error || new Error('IndexedDB read failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB read aborted.'));
      };
    });
    return parseIdeaList(rows);
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: 'Failed reading captured ideas from IndexedDB; falling back to local cache',
      error: err,
    });
    return null;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function putEntryInIdb(entry: CapturedIdeaEntry): Promise<boolean> {
  const db = await openIdeasIndexedDb();
  if (!db) return false;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB write failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB write aborted.'));
      };
      tx.objectStore(IDEAS_STORE_NAME).put(entry);
    });
    return true;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function deleteEntryInIdb(id: string): Promise<boolean> {
  const db = await openIdeasIndexedDb();
  if (!db) return false;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB delete failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB delete aborted.'));
      };
      tx.objectStore(IDEAS_STORE_NAME).delete(id);
    });
    return true;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function clearAllInIdb(): Promise<boolean> {
  const db = await openIdeasIndexedDb();
  if (!db) return false;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB clear failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB clear aborted.'));
      };
      tx.objectStore(IDEAS_STORE_NAME).clear();
    });
    return true;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function writeIdeasToOpfs(ideas: readonly CapturedIdeaEntry[]): Promise<boolean> {
  if (!isOpfsSupported()) return false;
  const root = await getOpfsRoot();
  if (!root) return false;

  const ideasDir = await root.getDirectoryHandle(IDEAS_OPFS_DIR, { create: true });
  await writeFileToOpfsDir(ideasDir, IDEAS_OPFS_FILE, JSON.stringify(ideas, null, 2));
  return true;
}

async function readIdeasFromOpfs(): Promise<CapturedIdeaEntry[] | null> {
  if (!isOpfsSupported()) return null;
  const root = await getOpfsRoot();
  if (!root) return null;

  try {
    const ideasDir = await root.getDirectoryHandle(IDEAS_OPFS_DIR, { create: false });
    const fileHandle = await ideasDir.getFileHandle(IDEAS_OPFS_FILE, { create: false });
    const file = await fileHandle.getFile();
    const text = await readBlobAsText(file);
    if (!text.trim()) return [];
    return parseIdeaList(JSON.parse(text));
  } catch {
    return null;
  }
}

async function withQuotaRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      throw err;
    }
    try {
      await purgeOpfsTmp();
    } catch {
      // Best-effort purge before retry
    }
    return task();
  }
}

/**
 * Loads all captured ideas from offline storage (IndexedDB primary, OPFS/localStorage fallback).
 */
export async function loadCapturedIdeas(): Promise<CapturedIdeaEntry[]> {
  if (activeCapturedIdeasBackingStore) {
    try {
      const raw = await activeCapturedIdeasBackingStore.getItem(IDEAS_LOCAL_STORAGE_KEY);
      if (typeof raw === 'string' && raw.trim()) {
        return parseIdeaList(JSON.parse(raw));
      }
    } catch {
      // Fall through to browser stores if native backing store read fails
    }
  }

  const idbIdeas = await readAllFromIdb();
  if (idbIdeas !== null && idbIdeas.length > 0) {
    return idbIdeas;
  }

  const opfsIdeas = await readIdeasFromOpfs();
  if (opfsIdeas !== null && opfsIdeas.length > 0) {
    return opfsIdeas;
  }

  const localIdeas = readLocalFallback();
  if (localIdeas.length > 0) {
    return localIdeas;
  }

  return idbIdeas ?? opfsIdeas ?? [];
}

/**
 * Sanitizes raw user idea text, creates a timestamped entry, and persists it offline.
 */
export async function saveCapturedIdea(rawText: string): Promise<{
  entry: CapturedIdeaEntry;
  ideas: CapturedIdeaEntry[];
  truncated: boolean;
}> {
  const sanitized = sanitizeIdeaInput(rawText);
  if (!sanitized.ok) {
    throw new Error(sanitized.error);
  }

  const existing = await loadCapturedIdeas();
  if (existing.length >= MAX_CAPTURED_IDEAS_COUNT) {
    throw new Error(
      `Captured ideas limit (${MAX_CAPTURED_IDEAS_COUNT}) reached. Copy or export your pending ideas and clear older entries first.`
    );
  }

  const entry: CapturedIdeaEntry = {
    id: generateUuid(),
    text: sanitized.sanitizedText,
    createdAtIso: nowIsoUtc(),
  };

  const nextIdeas = sortIdeasNewestFirst([entry, ...existing]).slice(0, MAX_CAPTURED_IDEAS_COUNT);

  await withQuotaRetry(async () => {
    let persistedAnywhere = false;
    let lastQuotaError: unknown = null;

    if (activeCapturedIdeasBackingStore) {
      try {
        await activeCapturedIdeasBackingStore.setItem(
          IDEAS_LOCAL_STORAGE_KEY,
          JSON.stringify(nextIdeas)
        );
        persistedAnywhere = true;
      } catch (err) {
        if (isQuotaExceededError(err)) lastQuotaError = err;
      }
    }

    try {
      if (await putEntryInIdb(entry)) {
        persistedAnywhere = true;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) lastQuotaError = err;
    }

    try {
      if (await writeIdeasToOpfs(nextIdeas)) {
        persistedAnywhere = true;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) lastQuotaError = err;
    }

    try {
      if (writeLocalFallback(nextIdeas)) {
        persistedAnywhere = true;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) lastQuotaError = err;
    }

    if (!persistedAnywhere) {
      if (lastQuotaError) {
        throw lastQuotaError;
      }
      throw new Error('Could not persist captured idea to offline browser storage.');
    }
  });

  return {
    entry,
    ideas: nextIdeas,
    truncated: sanitized.truncated,
  };
}

/**
 * Removes a single captured idea by ID across offline stores.
 */
export async function deleteCapturedIdea(id: string): Promise<CapturedIdeaEntry[]> {
  const existing = await loadCapturedIdeas();
  const nextIdeas = existing.filter((item) => item.id !== id);

  if (activeCapturedIdeasBackingStore) {
    try {
      await activeCapturedIdeasBackingStore.setItem(
        IDEAS_LOCAL_STORAGE_KEY,
        JSON.stringify(nextIdeas)
      );
    } catch {
      // Non-fatal fallback
    }
  }
  try {
    await deleteEntryInIdb(id);
  } catch {
    // Non-fatal fallback
  }
  try {
    await writeIdeasToOpfs(nextIdeas);
  } catch {
    // Non-fatal fallback
  }
  try {
    writeLocalFallback(nextIdeas);
  } catch {
    // Non-fatal fallback
  }

  return nextIdeas;
}

/**
 * Clears all pending captured ideas after the user has exported or copied them.
 */
export async function clearCapturedIdeas(): Promise<CapturedIdeaEntry[]> {
  if (activeCapturedIdeasBackingStore) {
    try {
      await activeCapturedIdeasBackingStore.setItem(IDEAS_LOCAL_STORAGE_KEY, '[]');
    } catch {
      // Non-fatal fallback
    }
  }
  try {
    await clearAllInIdb();
  } catch {
    // Non-fatal fallback
  }
  try {
    await writeIdeasToOpfs([]);
  } catch {
    // Non-fatal fallback
  }
  try {
    writeLocalFallback([]);
  } catch {
    // Non-fatal fallback
  }
  return [];
}

/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Zero-Cloud Local & Peer-to-Peer Sync Channels (`src/storage/localSyncChannels.ts`).
 *
 * Implements:
 * - Persistent unique `device_id` and monotonic `logical_counter`
 * - IndexedDB `sync_outbox` (append-only operations) and `sync_conflicts` review log
 * - Option A (SyncThing): Export `delta_<device_id>.json` and import/merge peer `delta_*.json` files
 * - Option B (Browser File System Access API): Pick a local sync folder (`showDirectoryPicker`) to
 *   automatically read peer delta files and write local `delta_<device_id>.json`
 * - Option C (Native Web Share API): `navigator.share()` with direct download fallback
 */

import { generateUuid, nowIsoUtc } from '../core/models';
import {
  DeltaExportFile,
  SyncConflictEntry,
  SyncOperation,
} from '../core/syncOutbox';
import { downloadTextFile } from '../utils/webFileActions';

const SYNC_IDB_NAME = 'community_pedigree_sync_v1';
const STORE_OUTBOX = 'sync_outbox';
const STORE_CONFLICTS = 'sync_conflicts';
const DEVICE_ID_LS_KEY = 'pedigree_device_id_v1';
const LOGICAL_COUNTER_LS_KEY = 'pedigree_logical_counter_v1';

export function getOrCreateLocalDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_LS_KEY);
    if (existing && existing.trim()) return existing.trim();
    const shortId = `dev-${generateUuid().slice(0, 8)}`;
    localStorage.setItem(DEVICE_ID_LS_KEY, shortId);
    return shortId;
  } catch {
    return `dev-${generateUuid().slice(0, 8)}`;
  }
}

export function allocateNextLogicalCounter(): number {
  try {
    const curr = Number(localStorage.getItem(LOGICAL_COUNTER_LS_KEY) || '0') || 0;
    const next = curr + 1;
    localStorage.setItem(LOGICAL_COUNTER_LS_KEY, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

function openSyncIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: 'op_id' });
      }
      if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
        db.createObjectStore(STORE_CONFLICTS, { keyPath: 'conflict_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function appendSyncOperationsToIdb(ops: SyncOperation[]): Promise<void> {
  if (ops.length === 0 || typeof indexedDB === 'undefined') return;
  try {
    const db = await openSyncIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      for (const op of ops) store.put(op);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Non-blocking safeguard
  }
}

export async function loadAllSyncOperationsFromIdb(): Promise<SyncOperation[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openSyncIdb();
    return await new Promise<SyncOperation[]>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, 'readonly');
      const req = tx.objectStore(STORE_OUTBOX).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as SyncOperation[]) || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

export async function replaceSyncOperationsInIdb(ops: SyncOperation[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openSyncIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      store.clear();
      for (const op of ops) store.put(op);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore
  }
}

export async function appendSyncConflictsToIdb(conflicts: SyncConflictEntry[]): Promise<void> {
  if (conflicts.length === 0 || typeof indexedDB === 'undefined') return;
  try {
    const db = await openSyncIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
      const store = tx.objectStore(STORE_CONFLICTS);
      for (const c of conflicts) store.put(c);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore
  }
}

export async function loadAllSyncConflictsFromIdb(): Promise<SyncConflictEntry[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openSyncIdb();
    return await new Promise<SyncConflictEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_CONFLICTS, 'readonly');
      const req = tx.objectStore(STORE_CONFLICTS).getAll();
      req.onsuccess = () => {
        db.close();
        resolve(
          ((req.result as SyncConflictEntry[]) || []).sort((a, b) =>
            b.detected_at.localeCompare(a.detected_at)
          )
        );
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

export async function saveSyncConflictInIdb(conflict: SyncConflictEntry): Promise<void> {
  await appendSyncConflictsToIdb([conflict]);
}

export async function clearAllSyncStateInIdb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openSyncIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_OUTBOX, STORE_CONFLICTS], 'readwrite');
      tx.objectStore(STORE_OUTBOX).clear();
      tx.objectStore(STORE_CONFLICTS).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore
  }
}

export function buildDeltaFilePayload(
  deviceId: string,
  operations: SyncOperation[]
): DeltaExportFile {
  return {
    format: 'community-pedigree-delta-v1',
    device_id: deviceId,
    exported_at: nowIsoUtc(),
    operations: operations.filter((op) => op.device_id === deviceId),
  };
}

export function parseDeltaFileJson(text: string): SyncOperation[] {
  const parsed = JSON.parse(text);
  if (parsed && Array.isArray(parsed.operations)) {
    return parsed.operations as SyncOperation[];
  }
  if (Array.isArray(parsed)) {
    return parsed as SyncOperation[];
  }
  throw new Error('Selected file is not a valid Community Pedigree delta log.');
}

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
      'function'
  );
}

/**
 * Option B: Syncs local `delta_<device_id>.json` and master backup directly with a user-chosen
 * local folder (e.g., SyncThing folder on Android or Desktop Chrome/Edge) while reading all peer `delta_*.json`.
 */
export async function syncWithPickedDirectory(params: {
  deviceId: string;
  localOperations: SyncOperation[];
  masterBackupJson: string;
}): Promise<{
  folderName: string;
  peerFilesRead: number;
  incomingOps: SyncOperation[];
}> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<any>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    throw new Error('Folder Sync API is not supported in this browser. Use Web Share or manual delta export instead.');
  }

  const dirHandle = await picker({ mode: 'readwrite' });
  const incomingOps: SyncOperation[] = [];
  let peerFilesRead = 0;

  for await (const [name, handle] of dirHandle.entries()) {
    if (
      handle.kind === 'file' &&
      /^delta_.*\.json$/i.test(name) &&
      name !== `delta_${params.deviceId}.json`
    ) {
      try {
        const file = await handle.getFile();
        const text = await file.text();
        const ops = parseDeltaFileJson(text);
        incomingOps.push(...ops);
        peerFilesRead++;
      } catch {
        // Ignore corrupt/partial sync temp files safely
      }
    }
  }

  // Write this device's own immutable delta file
  const deltaFilename = `delta_${params.deviceId}.json`;
  const deltaPayload = JSON.stringify(
    buildDeltaFilePayload(params.deviceId, params.localOperations),
    null,
    2
  );
  const deltaHandle = await dirHandle.getFileHandle(deltaFilename, { create: true });
  const deltaWritable = await deltaHandle.createWritable();
  await deltaWritable.write(deltaPayload);
  await deltaWritable.close();

  // Also refresh local master JSON in the sync folder for full snapshot redundancy
  const masterHandle = await dirHandle.getFileHandle('pedigree_master_backup.json', {
    create: true,
  });
  const masterWritable = await masterHandle.createWritable();
  await masterWritable.write(params.masterBackupJson);
  await masterWritable.close();

  return {
    folderName: String(dirHandle.name || 'Sync Folder'),
    peerFilesRead,
    incomingOps,
  };
}

/**
 * Option C: Shares a generated file via native Web Share API (`navigator.share`) when available,
 * gracefully falling back to direct browser download on desktop/unsupported browsers.
 */
export async function shareOrDownloadFile(params: {
  filename: string;
  content: string;
  mimeType: string;
  title: string;
}): Promise<'shared' | 'downloaded'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([params.content], params.filename, {
        type: params.mimeType,
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: params.title,
          files: [file],
        });
        return 'shared';
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return 'shared';
      }
      // Fall back to direct file download
    }
  }
  downloadTextFile(params.filename, params.content, params.mimeType);
  return 'downloaded';
}

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

import {
  tryParseEncryptedEnvelopeJson,
} from '../core/encryptedExport';
import {
  isValidSyncOperation,
  MAX_DELTA_BATCH_FILES,
  MAX_DELTA_JSON_BYTES,
  MAX_DELTA_OPERATIONS,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { generateUuid, nowIsoUtc } from '../core/models';
import {
  DeltaExportFile,
  SyncConflictEntry,
  SyncOperation,
} from '../core/syncOutbox';
import { downloadTextFile } from '../utils/webFileActions';
import {
  BackgroundPausedError,
  isDocumentHidden,
} from './backgroundFreezeCoordinator';
import { logDiagnosticEvent } from './crashLogger';
import {
  decryptTextWithPassphrase,
  encryptTextWithPassphrase,
} from './passphraseCrypto';
import { getAdjustedNowIsoUtc } from './storageProtection';

const SYNC_IDB_NAME = 'community_pedigree_sync_v1';
const SYNC_IDB_VERSION = 3;
const STORE_OUTBOX = 'sync_outbox';
const STORE_CONFLICTS = 'sync_conflicts';
const STORE_HANDLES = 'sync_handles';
const STORE_CHECKPOINTS = 'sync_checkpoints';
const BACKUP_SINK_HANDLE_KEY = 'backup_sink_folder';
const BACKUP_SINK_ARCHIVE_SUBDIR = 'pedigree-vault-archive';
const BACKUP_SINK_META_LS_KEY = 'pedigree.backupSinkMeta.v1';
const DEVICE_ID_LS_KEY = 'pedigree_device_id_v1';
const LOGICAL_COUNTER_LS_KEY = 'pedigree_logical_counter_v1';
const SYNC_IDB_TIMEOUT_MS = 7000;

export interface SyncCheckpointRecord {
  taskId: string;
  folderName: string;
  phase: 'scanning_peers' | 'writing_delta' | 'writing_master';
  peerFilesRead: number;
  incomingOpsQueued: number;
  updatedAtIso: string;
}

export interface BackupSinkStatus {
  supported: boolean;
  configured: boolean;
  folderName: string | null;
  configuredAtIso: string | null;
  permissionState: 'granted' | 'prompt' | 'denied' | 'unsupported';
  lastPushAtIso: string | null;
  lastPushFileName: string | null;
  lastPushError: string | null;
}

interface StoredSinkMeta {
  folderName: string;
  configuredAtIso: string;
  lastPushAtIso?: string | null;
  lastPushFileName?: string | null;
  lastPushError?: string | null;
}

interface StoredHandleRecord {
  key: string;
  handle: any;
  folderName: string;
  configuredAtIso: string;
}

let testSinkHandleOverride: any | null = null;
export function setBackupSinkHandleForTest(handle: any | null): void {
  testSinkHandleOverride = handle;
}

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
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Sync outbox IndexedDB open timed out after ${SYNC_IDB_TIMEOUT_MS}ms — bypassing sync channel I/O`,
      });
      reject(new Error('Sync IndexedDB open timeout'));
    }, SYNC_IDB_TIMEOUT_MS);

    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err ?? 'Sync IndexedDB error')));
    };

    try {
      const req = indexedDB.open(SYNC_IDB_NAME, SYNC_IDB_VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
            db.createObjectStore(STORE_OUTBOX, { keyPath: 'op_id' });
          }
          if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
            db.createObjectStore(STORE_CONFLICTS, { keyPath: 'conflict_id' });
          }
          if (!db.objectStoreNames.contains(STORE_HANDLES)) {
            db.createObjectStore(STORE_HANDLES, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
            db.createObjectStore(STORE_CHECKPOINTS, { keyPath: 'taskId' });
          }
        } catch (upgradeErr) {
          void import('./opfsStorage')
            .then((m) =>
              m.dumpIndexedDbDatabaseToOpfs(
                SYNC_IDB_NAME,
                'Sync outbox IndexedDB schema upgrade failed'
              )
            )
            .catch(() => {});
          finishReject(upgradeErr);
        }
      };
      req.onblocked = () => {
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: 'Corrective action: Sync outbox IndexedDB upgrade blocked by another tab — skipping sync write',
        });
      };
      req.onsuccess = () => {
        if (settled) {
          try {
            req.result.close();
          } catch {
            // Ignore
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        const err = req.error;
        if (err && (err.name === 'VersionError' || /version/i.test(String(err.message || '')))) {
          void import('./opfsStorage')
            .then((m) =>
              m.dumpIndexedDbDatabaseToOpfs(SYNC_IDB_NAME, 'Sync outbox IndexedDB VersionError')
            )
            .catch(() => {});
        }
        finishReject(err);
      };
    } catch (err) {
      finishReject(err);
    }
  });
}

async function withSyncIdb<T>(
  run: (db: IDBDatabase) => Promise<T>
): Promise<T> {
  const db = await openSyncIdb();
  let closed = false;
  const safeClose = () => {
    if (closed) return;
    closed = true;
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  };
  try {
    return await run(db);
  } finally {
    safeClose();
  }
}

export async function saveSyncCheckpointToIdb(
  checkpoint: SyncCheckpointRecord
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_CHECKPOINTS, 'readwrite');
          tx.objectStore(STORE_CHECKPOINTS).put(checkpoint);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Sync checkpoint aborted'));
        })
    );
  } catch {
    // Non-blocking safeguard
  }
}

export async function loadSyncCheckpointFromIdb(
  taskId: string
): Promise<SyncCheckpointRecord | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<SyncCheckpointRecord | null>((resolve) => {
          const tx = db.transaction(STORE_CHECKPOINTS, 'readonly');
          const req = tx.objectStore(STORE_CHECKPOINTS).get(taskId);
          req.onsuccess = () => resolve((req.result as SyncCheckpointRecord) || null);
          req.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        })
    );
  } catch {
    return null;
  }
}

export async function clearSyncCheckpointFromIdb(taskId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_CHECKPOINTS, 'readwrite');
          tx.objectStore(STORE_CHECKPOINTS).delete(taskId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        })
    );
  } catch {
    // Ignore
  }
}

export async function appendSyncOperationsToIdb(ops: SyncOperation[]): Promise<void> {
  if (ops.length === 0 || typeof indexedDB === 'undefined') return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_OUTBOX, 'readwrite');
          const store = tx.objectStore(STORE_OUTBOX);
          for (const op of ops) store.put(op);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Sync outbox write aborted'));
        })
    );
  } catch {
    // Non-blocking safeguard
  }
}

export async function loadAllSyncOperationsFromIdb(): Promise<SyncOperation[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<SyncOperation[]>((resolve, reject) => {
          const tx = db.transaction(STORE_OUTBOX, 'readonly');
          const req = tx.objectStore(STORE_OUTBOX).getAll();
          req.onsuccess = () => resolve((req.result as SyncOperation[]) || []);
          req.onerror = () => reject(req.error);
          tx.onabort = () => reject(tx.error || new Error('Sync outbox read aborted'));
        })
    );
  } catch {
    return [];
  }
}

export async function replaceSyncOperationsInIdb(ops: SyncOperation[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_OUTBOX, 'readwrite');
          const store = tx.objectStore(STORE_OUTBOX);
          store.clear();
          for (const op of ops) store.put(op);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Sync outbox replace aborted'));
        })
    );
  } catch {
    // Ignore
  }
}

export async function appendSyncConflictsToIdb(conflicts: SyncConflictEntry[]): Promise<void> {
  if (conflicts.length === 0 || typeof indexedDB === 'undefined') return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
          const store = tx.objectStore(STORE_CONFLICTS);
          for (const c of conflicts) store.put(c);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Sync conflicts write aborted'));
        })
    );
  } catch {
    // Ignore
  }
}

export async function loadAllSyncConflictsFromIdb(): Promise<SyncConflictEntry[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<SyncConflictEntry[]>((resolve, reject) => {
          const tx = db.transaction(STORE_CONFLICTS, 'readonly');
          const req = tx.objectStore(STORE_CONFLICTS).getAll();
          req.onsuccess = () =>
            resolve(
              ((req.result as SyncConflictEntry[]) || []).sort((a, b) =>
                b.detected_at.localeCompare(a.detected_at)
              )
            );
          req.onerror = () => reject(req.error);
          tx.onabort = () => reject(tx.error || new Error('Sync conflicts read aborted'));
        })
    );
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
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_OUTBOX, STORE_CONFLICTS, STORE_CHECKPOINTS], 'readwrite');
          tx.objectStore(STORE_OUTBOX).clear();
          tx.objectStore(STORE_CONFLICTS).clear();
          if (db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
            tx.objectStore(STORE_CHECKPOINTS).clear();
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Sync state clear aborted'));
        })
    );
  } catch {
    // Ignore
  }
}

export class EncryptedSyncPassphraseError extends Error {
  readonly code: 'PASSPHRASE_REQUIRED' | 'PASSPHRASE_INCORRECT';

  constructor(code: 'PASSPHRASE_REQUIRED' | 'PASSPHRASE_INCORRECT', message: string) {
    super(message);
    this.name = 'EncryptedSyncPassphraseError';
    this.code = code;
  }
}

export function buildDeltaFilePayload(
  deviceId: string,
  operations: SyncOperation[]
): DeltaExportFile {
  return {
    format: 'community-pedigree-delta-v1',
    device_id: deviceId,
    exported_at: getAdjustedNowIsoUtc(),
    operations: operations.filter((op) => op.device_id === deviceId),
  };
}

export function parseDeltaFileJson(text: string): SyncOperation[] {
  const sizeCheck = validateUploadFileSize('delta.json', text.length, MAX_DELTA_JSON_BYTES, 'a sync delta file');
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }
  const encryptedEnv = tryParseEncryptedEnvelopeJson(text);
  if (encryptedEnv) {
    throw new EncryptedSyncPassphraseError(
      'PASSPHRASE_REQUIRED',
      'This delta sync file is passphrase-encrypted. Enter the sync passphrase to unlock it.'
    );
  }
  const parsed = JSON.parse(text);
  const rawOps =
    parsed && Array.isArray(parsed.operations)
      ? parsed.operations
      : Array.isArray(parsed)
      ? parsed
      : null;
  if (!rawOps) {
    throw new Error('Selected file is not a valid Community Pedigree delta log.');
  }
  if (rawOps.length > MAX_DELTA_OPERATIONS) {
    throw new Error(
      `Delta log contains ${rawOps.length.toLocaleString()} operations, exceeding the ${MAX_DELTA_OPERATIONS.toLocaleString()} operation safety limit.`
    );
  }
  return rawOps.filter((op: unknown): op is SyncOperation => isValidSyncOperation(op));
}

export async function parseDeltaFileTextAsync(
  text: string,
  passphrase?: string
): Promise<{ operations: SyncOperation[]; wasEncrypted: boolean }> {
  const sizeCheck = validateUploadFileSize('delta.json', text.length, MAX_DELTA_JSON_BYTES, 'a sync delta file');
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }
  const encryptedEnv = tryParseEncryptedEnvelopeJson(text);
  if (!encryptedEnv) {
    return { operations: parseDeltaFileJson(text), wasEncrypted: false };
  }
  const cleanPass = passphrase?.trim() || passphrase || '';
  if (!cleanPass) {
    throw new EncryptedSyncPassphraseError(
      'PASSPHRASE_REQUIRED',
      'This delta sync file is passphrase-encrypted. Enter the sync passphrase above and try again.'
    );
  }
  let decryptedText: string;
  try {
    decryptedText = await decryptTextWithPassphrase(encryptedEnv, cleanPass);
  } catch (err) {
    throw new EncryptedSyncPassphraseError(
      'PASSPHRASE_INCORRECT',
      err instanceof Error
        ? err.message
        : 'Incorrect passphrase for encrypted delta sync file.'
    );
  }
  return { operations: parseDeltaFileJson(decryptedText), wasEncrypted: true };
}

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
      'function'
  );
}

function readLocalSinkMeta(): StoredSinkMeta | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(BACKUP_SINK_META_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSinkMeta>;
    if (!parsed || typeof parsed.folderName !== 'string') return null;
    return {
      folderName: parsed.folderName,
      configuredAtIso: String(parsed.configuredAtIso || nowIsoUtc()),
      lastPushAtIso: typeof parsed.lastPushAtIso === 'string' ? parsed.lastPushAtIso : null,
      lastPushFileName: typeof parsed.lastPushFileName === 'string' ? parsed.lastPushFileName : null,
      lastPushError: typeof parsed.lastPushError === 'string' ? parsed.lastPushError : null,
    };
  } catch {
    return null;
  }
}

function writeLocalSinkMeta(meta: StoredSinkMeta | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!meta) {
      localStorage.removeItem(BACKUP_SINK_META_LS_KEY);
    } else {
      localStorage.setItem(BACKUP_SINK_META_LS_KEY, JSON.stringify(meta));
    }
  } catch {
    // Non-fatal
  }
}

async function saveBackupSinkHandleToIdb(handle: any, folderName: string): Promise<void> {
  const configuredAtIso = nowIsoUtc();
  writeLocalSinkMeta({
    ...(readLocalSinkMeta() || {}),
    folderName,
    configuredAtIso,
    lastPushError: null,
  });
  if (typeof indexedDB === 'undefined') return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_HANDLES, 'readwrite');
          const rec: StoredHandleRecord = {
            key: BACKUP_SINK_HANDLE_KEY,
            handle,
            folderName,
            configuredAtIso,
          };
          tx.objectStore(STORE_HANDLES).put(rec);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Sync handle write aborted'));
        })
    );
  } catch {
    // Non-fatal
  }
}

async function loadBackupSinkHandleRecord(): Promise<StoredHandleRecord | null> {
  if (testSinkHandleOverride) {
    return {
      key: BACKUP_SINK_HANDLE_KEY,
      handle: testSinkHandleOverride,
      folderName: String(testSinkHandleOverride.name || 'Test Sync Folder'),
      configuredAtIso: nowIsoUtc(),
    };
  }
  if (typeof indexedDB === 'undefined') return null;
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<StoredHandleRecord | null>((resolve) => {
          const tx = db.transaction(STORE_HANDLES, 'readonly');
          const req = tx.objectStore(STORE_HANDLES).get(BACKUP_SINK_HANDLE_KEY);
          req.onsuccess = () => {
            const res = req.result as StoredHandleRecord | undefined;
            resolve(res?.handle ? res : null);
          };
          req.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        })
    );
  } catch {
    return null;
  }
}

async function queryHandleReadWritePermission(
  handle: any
): Promise<'granted' | 'prompt' | 'denied'> {
  if (!handle) return 'denied';
  if (typeof handle.queryPermission === 'function') {
    try {
      const res = await handle.queryPermission({ mode: 'readwrite' });
      if (res === 'granted' || res === 'prompt' || res === 'denied') return res;
    } catch {
      return 'prompt';
    }
  }
  return 'granted';
}

export async function getPersistedBackupSinkStatus(): Promise<BackupSinkStatus> {
  const meta = readLocalSinkMeta();
  const supported = supportsDirectoryPicker() || Boolean(testSinkHandleOverride);
  if (!supported) {
    return {
      supported: false,
      configured: Boolean(meta),
      folderName: meta?.folderName ?? null,
      configuredAtIso: meta?.configuredAtIso ?? null,
      permissionState: 'unsupported',
      lastPushAtIso: meta?.lastPushAtIso ?? null,
      lastPushFileName: meta?.lastPushFileName ?? null,
      lastPushError: meta?.lastPushError ?? null,
    };
  }

  const record = await loadBackupSinkHandleRecord();
  if (!record?.handle) {
    return {
      supported: true,
      configured: false,
      folderName: null,
      configuredAtIso: null,
      permissionState: 'prompt',
      lastPushAtIso: meta?.lastPushAtIso ?? null,
      lastPushFileName: meta?.lastPushFileName ?? null,
      lastPushError: meta?.lastPushError ?? null,
    };
  }

  const permissionState = await queryHandleReadWritePermission(record.handle);
  return {
    supported: true,
    configured: true,
    folderName: meta?.folderName || record.folderName || String(record.handle.name || 'Sync Folder'),
    configuredAtIso: meta?.configuredAtIso || record.configuredAtIso,
    permissionState,
    lastPushAtIso: meta?.lastPushAtIso ?? null,
    lastPushFileName: meta?.lastPushFileName ?? null,
    lastPushError: meta?.lastPushError ?? null,
  };
}

export async function configureBackupSinkFolder(): Promise<BackupSinkStatus> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<any>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      'Persisted folder sync is not supported in this browser. Use Chrome/Edge/Android Chromium or export manual backups regularly.'
    );
  }
  const handle = await picker({ id: 'community-pedigree-backup-sink', mode: 'readwrite' });
  if (typeof handle.requestPermission === 'function') {
    const state = await handle.requestPermission({ mode: 'readwrite' });
    if (state !== 'granted') {
      throw new Error('Read/write folder permission was not granted.');
    }
  }
  await saveBackupSinkHandleToIdb(handle, String(handle.name || 'Backup Sink Folder'));
  return getPersistedBackupSinkStatus();
}

export async function reauthorizeBackupSinkFolder(): Promise<BackupSinkStatus> {
  const record = await loadBackupSinkHandleRecord();
  if (!record?.handle) {
    return configureBackupSinkFolder();
  }
  if (typeof record.handle.requestPermission === 'function') {
    await record.handle.requestPermission({ mode: 'readwrite' });
  }
  return getPersistedBackupSinkStatus();
}

export async function disconnectBackupSinkFolder(): Promise<BackupSinkStatus> {
  writeLocalSinkMeta(null);
  if (typeof indexedDB !== 'undefined') {
    try {
      await withSyncIdb(
        (db) =>
          new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_HANDLES, 'readwrite');
            tx.objectStore(STORE_HANDLES).delete(BACKUP_SINK_HANDLE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
          })
      );
    } catch {
      // Ignore
    }
  }
  return getPersistedBackupSinkStatus();
}

/**
 * Silently pushes an expiring or archival backup file to the user's connected local/synced folder sink
 * (`<SyncFolder>/pedigree-vault-archive/<fileName>`) BEFORE local OPFS retention deletes it.
 * Never triggers interactive permission prompts in the background.
 */
export async function pushBackupPayloadToSinkFolder(
  fileName: string,
  data: Uint8Array | Blob | string
): Promise<{
  ok: boolean;
  skippedReason?: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed';
  error?: string;
}> {
  const supported = supportsDirectoryPicker() || Boolean(testSinkHandleOverride);
  if (!supported) {
    return { ok: false, skippedReason: 'unsupported' };
  }
  const record = await loadBackupSinkHandleRecord();
  if (!record?.handle) {
    return { ok: false, skippedReason: 'not_configured' };
  }
  const perm = await queryHandleReadWritePermission(record.handle);
  if (perm !== 'granted') {
    const prev = readLocalSinkMeta();
    if (prev) {
      writeLocalSinkMeta({
        ...prev,
        lastPushError: 'Folder permission needs re-authorization before background offload.',
      });
    }
    return { ok: false, skippedReason: 'permission_required' };
  }

  try {
    const archiveDir =
      typeof record.handle.getDirectoryHandle === 'function'
        ? await record.handle.getDirectoryHandle(BACKUP_SINK_ARCHIVE_SUBDIR, { create: true })
        : record.handle;
    const fh = await archiveDir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
    const prev = readLocalSinkMeta();
    writeLocalSinkMeta({
      folderName: prev?.folderName || record.folderName || 'Backup Sink Folder',
      configuredAtIso: prev?.configuredAtIso || record.configuredAtIso,
      lastPushAtIso: nowIsoUtc(),
      lastPushFileName: fileName,
      lastPushError: null,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Folder write failed';
    const prev = readLocalSinkMeta();
    if (prev) {
      writeLocalSinkMeta({
        ...prev,
        lastPushError: msg,
      });
    }
    return { ok: false, skippedReason: 'write_failed', error: msg };
  }
}

async function checkpointDirectorySyncPause(params: {
  folderName: string;
  phase: SyncCheckpointRecord['phase'];
  peerFilesRead: number;
  incomingOps: SyncOperation[];
}): Promise<never> {
  if (params.incomingOps.length > 0) {
    await appendSyncOperationsToIdb(params.incomingOps);
  }
  await saveSyncCheckpointToIdb({
    taskId: 'directory_sync',
    folderName: params.folderName,
    phase: params.phase,
    peerFilesRead: params.peerFilesRead,
    incomingOpsQueued: params.incomingOps.length,
    updatedAtIso: nowIsoUtc(),
  });
  logDiagnosticEvent({
    level: 'info',
    category: 'lifecycle',
    message: `Folder sync (${params.folderName}) paused on background hide at phase "${params.phase}" (${params.incomingOps.length} incoming ops checkpointed)`,
  });
  throw new BackgroundPausedError('Folder Sync', {
    checkpointSummary: `${params.incomingOps.length} peer delta operation(s) saved safely before background pause.`,
  });
}

async function runDirectorySyncWithHandle(params: {
  dirHandle: any;
  deviceId: string;
  localOperations: SyncOperation[];
  masterBackupJson: string;
  passphrase?: string;
  visibilityDoc?: { visibilityState?: string };
}): Promise<{
  folderName: string;
  peerFilesRead: number;
  incomingOps: SyncOperation[];
  encryptedPeersSkipped: number;
  wroteEncrypted: boolean;
}> {
  const folderName = String(params.dirHandle?.name || 'Sync Folder');
  const incomingOps: SyncOperation[] = [];
  let peerFilesRead = 0;
  let encryptedPeersSkipped = 0;
  const activePassphrase = params.passphrase?.trim() ? params.passphrase : undefined;

  for await (const [name, handle] of params.dirHandle.entries()) {
    if (isDocumentHidden(params.visibilityDoc)) {
      await checkpointDirectorySyncPause({
        folderName,
        phase: 'scanning_peers',
        peerFilesRead,
        incomingOps,
      });
    }
    if (peerFilesRead >= MAX_DELTA_BATCH_FILES) break;
    if (
      handle.kind === 'file' &&
      /^delta_.*\.json$/i.test(name) &&
      name !== `delta_${params.deviceId}.json`
    ) {
      try {
        const file = await handle.getFile();
        const check = validateUploadFileSize(
          file.name,
          file.size,
          MAX_DELTA_JSON_BYTES,
          'a sync delta file'
        );
        if (!check.ok) continue;
        const text = await file.text();
        const parsed = await parseDeltaFileTextAsync(text, activePassphrase);
        incomingOps.push(...parsed.operations);
        peerFilesRead++;
      } catch (err) {
        if (err instanceof EncryptedSyncPassphraseError) {
          encryptedPeersSkipped++;
        }
        // Ignore corrupt/partial sync temp files safely
      }
    }
  }

  if (isDocumentHidden(params.visibilityDoc)) {
    await checkpointDirectorySyncPause({
      folderName,
      phase: 'writing_delta',
      peerFilesRead,
      incomingOps,
    });
  }

  // Write this device's own immutable delta file (optionally encrypted)
  const deltaFilename = `delta_${params.deviceId}.json`;
  const plainDeltaJson = JSON.stringify(
    buildDeltaFilePayload(params.deviceId, params.localOperations),
    null,
    2
  );
  const deltaPayload = activePassphrase
    ? JSON.stringify(
        await encryptTextWithPassphrase(plainDeltaJson, activePassphrase, {
          payloadKind: 'delta_log',
          originalFileName: deltaFilename,
        }),
        null,
        2
      )
    : plainDeltaJson;
  const deltaHandle = await params.dirHandle.getFileHandle(deltaFilename, { create: true });
  const deltaWritable = await deltaHandle.createWritable();
  try {
    await deltaWritable.write(deltaPayload);
  } finally {
    await deltaWritable.close();
  }

  if (isDocumentHidden(params.visibilityDoc)) {
    await checkpointDirectorySyncPause({
      folderName,
      phase: 'writing_master',
      peerFilesRead,
      incomingOps,
    });
  }

  // Also refresh local master JSON in the sync folder for full snapshot redundancy (optionally encrypted)
  const masterPayload = activePassphrase
    ? JSON.stringify(
        await encryptTextWithPassphrase(params.masterBackupJson, activePassphrase, {
          payloadKind: 'json_backup',
          originalFileName: 'pedigree_master_backup.json',
        }),
        null,
        2
      )
    : params.masterBackupJson;
  const masterHandle = await params.dirHandle.getFileHandle('pedigree_master_backup.json', {
    create: true,
  });
  const masterWritable = await masterHandle.createWritable();
  try {
    await masterWritable.write(masterPayload);
  } finally {
    await masterWritable.close();
  }

  await clearSyncCheckpointFromIdb('directory_sync');

  return {
    folderName,
    peerFilesRead,
    incomingOps,
    encryptedPeersSkipped,
    wroteEncrypted: Boolean(activePassphrase),
  };
}

/**
 * Resumes an interrupted folder sync automatically when the browser returns to `'visible'`
 * without requiring an extra user tap as long as folder read/write permission remains `'granted'`.
 */
export async function resumePersistedDirectorySyncIfGranted(params: {
  deviceId: string;
  localOperations: SyncOperation[];
  masterBackupJson: string;
  passphrase?: string;
  visibilityDoc?: { visibilityState?: string };
}): Promise<
  | {
      resumed: true;
      folderName: string;
      peerFilesRead: number;
      incomingOps: SyncOperation[];
      encryptedPeersSkipped: number;
      wroteEncrypted: boolean;
    }
  | {
      resumed: false;
      reason: 'no_handle' | 'permission_required';
      folderName?: string;
    }
> {
  const record = await loadBackupSinkHandleRecord();
  if (!record?.handle) {
    return { resumed: false, reason: 'no_handle' };
  }
  const perm = await queryHandleReadWritePermission(record.handle);
  if (perm !== 'granted') {
    return {
      resumed: false,
      reason: 'permission_required',
      folderName: record.folderName,
    };
  }
  const res = await runDirectorySyncWithHandle({
    dirHandle: record.handle,
    deviceId: params.deviceId,
    localOperations: params.localOperations,
    masterBackupJson: params.masterBackupJson,
    passphrase: params.passphrase,
    visibilityDoc: params.visibilityDoc,
  });
  return { resumed: true, ...res };
}

/**
 * Option B: Syncs local `delta_<device_id>.json` and master backup directly with a user-chosen
 * local folder (e.g., SyncThing folder on Android or Desktop Chrome/Edge) while reading all peer `delta_*.json`.
 * Also persists the folder handle as the pre-prune Backup Sink Folder and checkpoints cleanly on background freeze.
 */
export async function syncWithPickedDirectory(params: {
  deviceId: string;
  localOperations: SyncOperation[];
  masterBackupJson: string;
  passphrase?: string;
  dirHandleOverride?: any;
  visibilityDoc?: { visibilityState?: string };
}): Promise<{
  folderName: string;
  peerFilesRead: number;
  incomingOps: SyncOperation[];
  encryptedPeersSkipped: number;
  wroteEncrypted: boolean;
}> {
  let dirHandle = params.dirHandleOverride;
  if (!dirHandle) {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<any>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      throw new Error(
        'Folder Sync API is not supported in this browser. Use Web Share or manual delta export instead.'
      );
    }
    dirHandle = await picker({ id: 'community-pedigree-backup-sink', mode: 'readwrite' });
  }
  await saveBackupSinkHandleToIdb(dirHandle, String(dirHandle.name || 'Sync Folder'));
  return runDirectorySyncWithHandle({
    dirHandle,
    deviceId: params.deviceId,
    localOperations: params.localOperations,
    masterBackupJson: params.masterBackupJson,
    passphrase: params.passphrase,
    visibilityDoc: params.visibilityDoc,
  });
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
  await downloadTextFile(params.filename, params.content, params.mimeType);
  return 'downloaded';
}

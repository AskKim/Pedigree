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
} from '../domain/encryptedExport';
import {
  isValidSyncOperation,
  MAX_DELTA_BATCH_FILES,
  MAX_DELTA_JSON_BYTES,
  MAX_DELTA_OPERATIONS,
  validateUploadFileSize,
} from '../domain/inputSanitization';
import { generateUuid } from '../domain/models';
import {
  DeltaExportFile,
  SyncConflictEntry,
  SyncOperation,
} from '../domain/syncOutbox';
import { type FileShareOutcome, shareTextFileOrDownload } from '../utils/webFileActions';
import { readBlobAsText } from '../utils/es2018Shims';
import {
  BackgroundPausedError,
  isDocumentHidden,
  registerFreezeLifecycleListener,
} from './backgroundFreezeCoordinator';
import { logDiagnosticEvent } from './crashLogger';
import { safeAwaitOpfsClose, safeAwaitOpfsFlush } from './opfsTempStream';
import {
  decryptTextWithPassphrase,
  encryptTextWithPassphrase,
} from './passphraseCrypto';
import {
  getSafeBroadcastChannelCtor,
  getSafeIndexedDb,
  getSafeLocalStorage,
  getSafeWebLocks,
  registerPendingWebLockAbort,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
  trackBroadcastChannel,
  triggerIndexedDbOpfsDump,
} from './storageProbes';
import { getAdjustedNowIsoUtc } from './storageProtection';

const SYNC_IDB_NAME = 'community_pedigree_sync_v1';
const SYNC_IDB_VERSION = 3;
const STORE_OUTBOX = 'sync_outbox';
const STORE_CONFLICTS = 'sync_conflicts';
const STORE_HANDLES = 'sync_handles';
const STORE_CHECKPOINTS = 'sync_checkpoints';
const BACKUP_SYNC_HANDLE_KEY = 'backup_sync_folder';
const LEGACY_BACKUP_SINK_HANDLE_KEY = 'backup_sink_folder';
const BACKUP_SYNC_ARCHIVE_SUBDIR = 'pedigree-vault-archive';
const BACKUP_SYNC_META_LS_KEY = 'pedigree.backupSyncMeta.v1';
const LEGACY_BACKUP_SINK_META_LS_KEY = 'pedigree.backupSinkMeta.v1';
const DEVICE_ID_LS_KEY = 'pedigree_device_id_v1';
const LOGICAL_COUNTER_LS_KEY = 'pedigree_logical_counter_v1';
const SYNC_IDB_TIMEOUT_MS = 7000;
const DEFAULT_WEB_LOCK_TIMEOUT_MS = 5000;
const SYNC_OUTBOX_LOCK_NAME = 'community_pedigree_sync_outbox_v1';
const LOGICAL_COUNTER_LOCK_NAME = 'community_pedigree_logical_counter_v1';
export const TAB_SYNC_CHANNEL_NAME = 'community_pedigree_tab_sync_v1';
export const DB_WRITE_EPOCH_LS_KEY = 'pedigree.dbWriteEpoch.v1';

const CURRENT_TAB_ID = `tab-${generateUuid()}`;
const inTabLockQueues = new Map<string, Promise<void>>();

export function getCurrentTabId(): string {
  return CURRENT_TAB_ID;
}

/**
 * Serializes critical storage/outbox mutations both within the current tab (FIFO queue)
 * and across parallel browser tabs via `navigator.locks` when supported, with a bounded
 * acquisition timeout, `AbortController` release on `pagehide`/`hidden`, and safe in-tab FIFO
 * fallback when Web Locks are blocked (Safari Lockdown Mode / Private Browsing) or unsupported.
 * Never nest calls with the same `lockName`.
 */
export function withCrossTabLock<T>(
  lockName: string,
  task: () => Promise<T>,
  options?: { timeoutMs?: number }
): Promise<T> {
  const prev = inTabLockQueues.get(lockName) ?? Promise.resolve();
  const lockTimeoutMs = Math.max(10, options?.timeoutMs ?? DEFAULT_WEB_LOCK_TIMEOUT_MS);

  const executeWithWebLock = async (): Promise<T> => {
    const locks = getSafeWebLocks();
    if (!locks) {
      return task();
    }

    let callbackEntered = false;
    let timedOutFallback = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;

    const cleanupTimers = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (graceTimer !== null) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
    };

    const runWithRequest = async (useSignal: boolean): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finishResolve = (val: T) => {
          if (settled) return;
          settled = true;
          cleanupTimers();
          untrackPending();
          resolve(val);
        };
        const finishReject = (err: unknown) => {
          if (settled) return;
          settled = true;
          cleanupTimers();
          untrackPending();
          reject(err);
        };

        const triggerFallback = () => {
          if (settled || callbackEntered) return;
          timedOutFallback = true;
          if (controller && !controller.signal.aborted) {
            try {
              controller.abort();
            } catch {
              // Ignore abort failure
            }
          }
          task().then(finishResolve, finishReject);
        };

        const untrackPending = registerPendingWebLockAbort(() => {
          if (callbackEntered || settled) return;
          if (controller && !controller.signal.aborted) {
            try {
              controller.abort();
            } catch {
              // Ignore abort failure
            }
          }
          graceTimer = setTimeout(triggerFallback, 25);
        });

        timer = setTimeout(triggerFallback, lockTimeoutMs);

        const reqOpts: { mode?: 'exclusive' | 'shared'; signal?: AbortSignal } =
          useSignal && controller
            ? { mode: 'exclusive', signal: controller.signal }
            : { mode: 'exclusive' };

        try {
          const reqPromise = locks.request(lockName, reqOpts, async () => {
            if (timedOutFallback || settled) {
              return undefined as unknown as T;
            }
            callbackEntered = true;
            cleanupTimers();
            untrackPending();
            return await task();
          });

          Promise.resolve(reqPromise).then(
            (val) => {
              if (!timedOutFallback) {
                finishResolve(val);
              }
            },
            (err) => {
              if (timedOutFallback || settled) return;
              if (callbackEntered) {
                finishReject(err);
                return;
              }
              if (useSignal && controller && err instanceof TypeError) {
                cleanupTimers();
                untrackPending();
                runWithRequest(false).then(finishResolve, finishReject);
                return;
              }
              timedOutFallback = true;
              task().then(finishResolve, finishReject);
            }
          );
        } catch (syncErr) {
          if (callbackEntered || timedOutFallback) {
            finishReject(syncErr);
            return;
          }
          if (useSignal && controller && syncErr instanceof TypeError) {
            cleanupTimers();
            untrackPending();
            runWithRequest(false).then(finishResolve, finishReject);
            return;
          }
          timedOutFallback = true;
          task().then(finishResolve, finishReject);
        }
      });
    };

    return runWithRequest(Boolean(controller));
  };

  const run = prev.catch(() => undefined).then(executeWithWebLock);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  inTabLockQueues.set(lockName, settled);
  return run.finally(() => {
    if (inTabLockQueues.get(lockName) === settled) {
      inTabLockQueues.delete(lockName);
    }
  });
}

export interface CrossTabDbCommitEvent {
  epoch: number;
  writerTabId: string;
  committedAtIso: string;
  reason?: string;
}

let sharedTabSyncChannel: BroadcastChannel | null = null;
let untrackSharedTabSyncChannel: (() => void) | null = null;

function getSharedTabSyncChannel(): BroadcastChannel | null {
  const Ctor = getSafeBroadcastChannelCtor();
  if (!Ctor) return null;
  if (!sharedTabSyncChannel) {
    try {
      const ch = new Ctor(TAB_SYNC_CHANNEL_NAME);
      sharedTabSyncChannel = ch;
      untrackSharedTabSyncChannel = trackBroadcastChannel(ch, () => {
        if (sharedTabSyncChannel === ch) {
          sharedTabSyncChannel = null;
          untrackSharedTabSyncChannel = null;
        }
      });
    } catch {
      return null;
    }
  }
  return sharedTabSyncChannel;
}

export function publishCrossTabDbCommit(params: {
  epoch: number;
  writerTabId?: string;
  reason?: string;
}): CrossTabDbCommitEvent {
  const payload: CrossTabDbCommitEvent = {
    epoch: params.epoch,
    writerTabId: params.writerTabId || CURRENT_TAB_ID,
    committedAtIso: getAdjustedNowIsoUtc(),
    reason: params.reason,
  };
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      ls.setItem(DB_WRITE_EPOCH_LS_KEY, JSON.stringify(payload));
    } catch {
      // Non-fatal
    }
  }
  const ch = getSharedTabSyncChannel();
  if (ch) {
    try {
      ch.postMessage(payload);
    } catch {
      // Non-fatal (channel closed/restricted)
      untrackSharedTabSyncChannel?.();
      untrackSharedTabSyncChannel = null;
      sharedTabSyncChannel = null;
    }
  }
  return payload;
}

export function subscribeCrossTabDbCommits(
  onRemoteCommit: (event: CrossTabDbCommitEvent) => void,
  options?: { selfTabId?: string }
): () => void {
  const selfId = options?.selfTabId || CURRENT_TAB_ID;
  let lastDeliveredEpoch = 0;
  let disposed = false;

  const handleCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const candidate = raw as Partial<CrossTabDbCommitEvent>;
    const epoch = Number(candidate.epoch);
    const writerTabId = typeof candidate.writerTabId === 'string' ? candidate.writerTabId : '';
    if (!Number.isFinite(epoch) || epoch <= 0 || !writerTabId || writerTabId === selfId) {
      return;
    }
    if (epoch <= lastDeliveredEpoch) return;
    lastDeliveredEpoch = epoch;
    onRemoteCommit({
      epoch,
      writerTabId,
      committedAtIso: String(candidate.committedAtIso || ''),
      reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
    });
  };

  let bc: BroadcastChannel | null = null;
  let untrackBc: (() => void) | null = null;
  const onBcMessage = (ev: MessageEvent) => {
    handleCandidate(ev.data);
  };

  const openBcChannel = () => {
    if (disposed || bc) return;
    const Ctor = getSafeBroadcastChannelCtor();
    if (!Ctor) return;
    try {
      const channel = new Ctor(TAB_SYNC_CHANNEL_NAME);
      channel.addEventListener('message', onBcMessage);
      bc = channel;
      untrackBc = trackBroadcastChannel(channel, () => {
        try {
          channel.removeEventListener('message', onBcMessage);
        } catch {
          // Ignore
        }
        if (bc === channel) {
          bc = null;
          untrackBc = null;
        }
      });
    } catch {
      bc = null;
    }
  };

  openBcChannel();

  const unregisterLifecycle = registerFreezeLifecycleListener({
    id: `tab-sync-sub-${generateUuid()}`,
    onVisible: () => {
      openBcChannel();
    },
  });

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== DB_WRITE_EPOCH_LS_KEY || !ev.newValue) return;
    try {
      handleCandidate(JSON.parse(ev.newValue));
    } catch {
      // Ignore malformed storage payload
    }
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    disposed = true;
    unregisterLifecycle();
    untrackBc?.();
    untrackBc = null;
    if (bc) {
      try {
        bc.removeEventListener('message', onBcMessage);
        bc.close();
      } catch {
        // Ignore
      }
      bc = null;
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export interface SyncCheckpointRecord {
  taskId: string;
  folderName: string;
  phase: 'scanning_peers' | 'writing_delta' | 'writing_master';
  peerFilesRead: number;
  incomingOpsQueued: number;
  updatedAtIso: string;
}

export interface BackupSyncStatus {
  supported: boolean;
  configured: boolean;
  folderName: string | null;
  configuredAtIso: string | null;
  permissionState: 'granted' | 'prompt' | 'denied' | 'unsupported';
  lastPushAtIso: string | null;
  lastPushFileName: string | null;
  lastPushError: string | null;
}

interface StoredSyncMeta {
  folderName: string;
  configuredAtIso: string;
  lastPushAtIso?: string | null;
  lastPushFileName?: string | null;
  lastPushError?: string | null;
}

export interface SyncWritableFileStreamLike {
  write(data: string | Uint8Array | Blob | ArrayBuffer): Promise<void>;
  flush?(): void | Promise<void>;
  close(): void | Promise<void>;
}

export interface SyncFileHandleLike {
  kind?: 'file' | 'directory';
  name?: string;
  getFile?(): Promise<Blob | File>;
  createWritable?(): Promise<SyncWritableFileStreamLike>;
}

export interface SyncDirectoryHandleLike {
  kind?: 'directory';
  name?: string;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>;
  entries?(): AsyncIterable<[string, SyncFileHandleLike]>;
  getDirectoryHandle?(
    name: string,
    opts?: { create?: boolean }
  ): Promise<SyncDirectoryHandleLike>;
  getFileHandle?(
    name: string,
    opts?: { create?: boolean }
  ): Promise<{
    createWritable?(): Promise<SyncWritableFileStreamLike>;
  }>;
}

export interface StoredHandleRecord {
  key: string;
  handle: SyncDirectoryHandleLike;
  folderName: string;
  configuredAtIso: string;
}

let testSyncHandleOverride: SyncDirectoryHandleLike | null = null;
export function setBackupSyncHandleForTest(handle: SyncDirectoryHandleLike | null): void {
  testSyncHandleOverride = handle;
}

export function getOrCreateLocalDeviceId(): string {
  const ls = getSafeLocalStorage();
  if (!ls) return `dev-${generateUuid().slice(0, 8)}`;
  try {
    const existing = ls.getItem(DEVICE_ID_LS_KEY);
    if (existing && existing.trim()) return existing.trim();
    const shortId = `dev-${generateUuid().slice(0, 8)}`;
    ls.setItem(DEVICE_ID_LS_KEY, shortId);
    return shortId;
  } catch {
    return `dev-${generateUuid().slice(0, 8)}`;
  }
}

export function allocateNextLogicalCounter(): number {
  const ls = getSafeLocalStorage();
  if (!ls) return Date.now();
  try {
    const curr = Number(ls.getItem(LOGICAL_COUNTER_LS_KEY) || '0') || 0;
    const next = curr + 1;
    ls.setItem(LOGICAL_COUNTER_LS_KEY, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

export async function allocateNextLogicalCounterLocked(): Promise<number> {
  return withCrossTabLock(LOGICAL_COUNTER_LOCK_NAME, async () => allocateNextLogicalCounter());
}

function openSyncIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getSafeIndexedDb();
    if (!idb) {
      reject(new Error('Sync IndexedDB is unavailable in this browser context.'));
      return;
    }
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
      const req = idb.open(SYNC_IDB_NAME, SYNC_IDB_VERSION);
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
          triggerIndexedDbOpfsDump(
            SYNC_IDB_NAME,
            'Sync outbox IndexedDB schema upgrade failed'
          );
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
          triggerIndexedDbOpfsDump(SYNC_IDB_NAME, 'Sync outbox IndexedDB VersionError');
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
  const untrackDb = trackActiveIdbConnection(db);
  let closed = false;
  const safeClose = () => {
    if (closed) return;
    closed = true;
    untrackDb();
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
  if (!getSafeIndexedDb()) return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_CHECKPOINTS, 'readwrite');
          const untrackTx = trackActiveIdbTransaction(tx);
          tx.objectStore(STORE_CHECKPOINTS).put(checkpoint);
          tx.oncomplete = () => {
            untrackTx();
            resolve();
          };
          tx.onerror = () => {
            untrackTx();
            reject(tx.error);
          };
          tx.onabort = () => {
            untrackTx();
            reject(tx.error || new Error('Sync checkpoint aborted'));
          };
        })
    );
  } catch {
    // Non-blocking safeguard
  }
}

export async function loadSyncCheckpointFromIdb(
  taskId: string
): Promise<SyncCheckpointRecord | null> {
  if (!getSafeIndexedDb()) return null;
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<SyncCheckpointRecord | null>((resolve) => {
          const tx = db.transaction(STORE_CHECKPOINTS, 'readonly');
          const untrackTx = trackActiveIdbTransaction(tx);
          const req = tx.objectStore(STORE_CHECKPOINTS).get(taskId);
          req.onsuccess = () => {
            untrackTx();
            resolve((req.result as SyncCheckpointRecord) || null);
          };
          req.onerror = () => {
            untrackTx();
            resolve(null);
          };
          tx.onabort = () => {
            untrackTx();
            resolve(null);
          };
        })
    );
  } catch {
    return null;
  }
}

export async function clearSyncCheckpointFromIdb(taskId: string): Promise<void> {
  if (!getSafeIndexedDb()) return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_CHECKPOINTS, 'readwrite');
          const untrackTx = trackActiveIdbTransaction(tx);
          tx.objectStore(STORE_CHECKPOINTS).delete(taskId);
          tx.oncomplete = () => {
            untrackTx();
            resolve();
          };
          tx.onerror = () => {
            untrackTx();
            resolve();
          };
          tx.onabort = () => {
            untrackTx();
            resolve();
          };
        })
    );
  } catch {
    // Ignore
  }
}

export async function appendSyncOperationsToIdb(
  ops: SyncOperation[]
): Promise<SyncOperation[]> {
  if (ops.length === 0 || !getSafeIndexedDb()) return ops;
  return withCrossTabLock(SYNC_OUTBOX_LOCK_NAME, async () => {
    try {
      return await withSyncIdb(
        (db) =>
          new Promise<SyncOperation[]>((resolve, reject) => {
            const tx = db.transaction(STORE_OUTBOX, 'readwrite');
            const untrackTx = trackActiveIdbTransaction(tx);
            const store = tx.objectStore(STORE_OUTBOX);
            let writtenOps: SyncOperation[] = ops;

            if (typeof store.getAll === 'function') {
              const existingReq = store.getAll();

              existingReq.onsuccess = () => {
                const existing = (existingReq.result as SyncOperation[]) || [];
                const usedByDevice = new Map<string, Set<number>>();
                const maxByDevice = new Map<string, number>();

                for (const ex of existing) {
                  if (!ex || typeof ex.device_id !== 'string') continue;
                  let used = usedByDevice.get(ex.device_id);
                  if (!used) {
                    used = new Set<number>();
                    usedByDevice.set(ex.device_id, used);
                  }
                  if (typeof ex.logical_counter === 'number' && Number.isFinite(ex.logical_counter)) {
                    used.add(ex.logical_counter);
                    const prevMax = maxByDevice.get(ex.device_id) || 0;
                    if (ex.logical_counter > prevMax) {
                      maxByDevice.set(ex.device_id, ex.logical_counter);
                    }
                  }
                }

                const ls = getSafeLocalStorage();
                writtenOps = ops.map((op) => {
                  let used = usedByDevice.get(op.device_id);
                  if (!used) {
                    used = new Set<number>();
                    usedByDevice.set(op.device_id, used);
                  }
                  let counter = op.logical_counter;
                  const currentMax = maxByDevice.get(op.device_id) || 0;
                  if (used.has(counter)) {
                    let lsMax = 0;
                    try {
                      lsMax = ls ? Number(ls.getItem(LOGICAL_COUNTER_LS_KEY) || '0') || 0 : 0;
                    } catch {
                      lsMax = 0;
                    }
                    counter = Math.max(currentMax, lsMax) + 1;
                    try {
                      ls?.setItem(LOGICAL_COUNTER_LS_KEY, String(counter));
                    } catch {
                      // Non-fatal
                    }
                  }
                  used.add(counter);
                  if (counter > currentMax) {
                    maxByDevice.set(op.device_id, counter);
                  }
                  const normalizedOp = counter === op.logical_counter ? op : { ...op, logical_counter: counter };
                  store.put(normalizedOp);
                  return normalizedOp;
                });
              };

              existingReq.onerror = () => {
                for (const op of ops) store.put(op);
              };
            } else {
              for (const op of ops) store.put(op);
            }
            tx.oncomplete = () => {
              untrackTx();
              resolve(writtenOps);
            };
            tx.onerror = () => {
              untrackTx();
              reject(tx.error);
            };
            tx.onabort = () => {
              untrackTx();
              reject(tx.error || new Error('Sync outbox write aborted'));
            };
          })
      );
    } catch {
      return ops;
    }
  });
}

export async function loadAllSyncOperationsFromIdb(): Promise<SyncOperation[]> {
  if (!getSafeIndexedDb()) return [];
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<SyncOperation[]>((resolve, reject) => {
          const tx = db.transaction(STORE_OUTBOX, 'readonly');
          const untrackTx = trackActiveIdbTransaction(tx);
          const req = tx.objectStore(STORE_OUTBOX).getAll();
          req.onsuccess = () => {
            untrackTx();
            resolve((req.result as SyncOperation[]) || []);
          };
          req.onerror = () => {
            untrackTx();
            reject(req.error);
          };
          tx.onabort = () => {
            untrackTx();
            reject(tx.error || new Error('Sync outbox read aborted'));
          };
        })
    );
  } catch {
    return [];
  }
}

export async function replaceSyncOperationsInIdb(ops: SyncOperation[]): Promise<void> {
  if (!getSafeIndexedDb()) return;
  await withCrossTabLock(SYNC_OUTBOX_LOCK_NAME, async () => {
    try {
      await withSyncIdb(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_OUTBOX, 'readwrite');
            const untrackTx = trackActiveIdbTransaction(tx);
            const store = tx.objectStore(STORE_OUTBOX);
            store.clear();
            for (const op of ops) store.put(op);
            tx.oncomplete = () => {
              untrackTx();
              resolve();
            };
            tx.onerror = () => {
              untrackTx();
              reject(tx.error);
            };
            tx.onabort = () => {
              untrackTx();
              reject(tx.error || new Error('Sync outbox replace aborted'));
            };
          })
      );
    } catch {
      // Ignore
    }
  });
}

export async function appendSyncConflictsToIdb(conflicts: SyncConflictEntry[]): Promise<void> {
  if (conflicts.length === 0 || !getSafeIndexedDb()) return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
          const untrackTx = trackActiveIdbTransaction(tx);
          const store = tx.objectStore(STORE_CONFLICTS);
          for (const c of conflicts) store.put(c);
          tx.oncomplete = () => {
            untrackTx();
            resolve();
          };
          tx.onerror = () => {
            untrackTx();
            reject(tx.error);
          };
          tx.onabort = () => {
            untrackTx();
            reject(tx.error || new Error('Sync conflicts write aborted'));
          };
        })
    );
  } catch {
    // Ignore
  }
}

export async function loadAllSyncConflictsFromIdb(): Promise<SyncConflictEntry[]> {
  if (!getSafeIndexedDb()) return [];
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<SyncConflictEntry[]>((resolve, reject) => {
          const tx = db.transaction(STORE_CONFLICTS, 'readonly');
          const untrackTx = trackActiveIdbTransaction(tx);
          const req = tx.objectStore(STORE_CONFLICTS).getAll();
          req.onsuccess = () => {
            untrackTx();
            resolve(
              ((req.result as SyncConflictEntry[]) || []).sort((a, b) =>
                b.detected_at.localeCompare(a.detected_at)
              )
            );
          };
          req.onerror = () => {
            untrackTx();
            reject(req.error);
          };
          tx.onabort = () => {
            untrackTx();
            reject(tx.error || new Error('Sync conflicts read aborted'));
          };
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
  if (!getSafeIndexedDb()) return;
  await withCrossTabLock(SYNC_OUTBOX_LOCK_NAME, async () => {
    try {
      await withSyncIdb(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction([STORE_OUTBOX, STORE_CONFLICTS, STORE_CHECKPOINTS], 'readwrite');
            const untrackTx = trackActiveIdbTransaction(tx);
            tx.objectStore(STORE_OUTBOX).clear();
            tx.objectStore(STORE_CONFLICTS).clear();
            if (db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
              tx.objectStore(STORE_CHECKPOINTS).clear();
            }
            tx.oncomplete = () => {
              untrackTx();
              resolve();
            };
            tx.onerror = () => {
              untrackTx();
              reject(tx.error);
            };
            tx.onabort = () => {
              untrackTx();
              reject(tx.error || new Error('Sync state clear aborted'));
            };
          })
      );
    } catch {
      // Ignore
    }
  });
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
    throw new Error('Selected file is not a valid Pedigree delta log.');
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

function readLocalSyncMeta(): StoredSyncMeta | null {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return null;
    let raw = ls.getItem(BACKUP_SYNC_META_LS_KEY);
    if (!raw) {
      const legacyRaw = ls.getItem(LEGACY_BACKUP_SINK_META_LS_KEY);
      if (legacyRaw) {
        raw = legacyRaw;
        try {
          ls.setItem(BACKUP_SYNC_META_LS_KEY, legacyRaw);
          ls.removeItem(LEGACY_BACKUP_SINK_META_LS_KEY);
        } catch {
          // Ignore migration write failure
        }
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSyncMeta>;
    if (!parsed || typeof parsed.folderName !== 'string') return null;
    return {
      folderName: parsed.folderName,
      configuredAtIso: String(parsed.configuredAtIso || getAdjustedNowIsoUtc()),
      lastPushAtIso: typeof parsed.lastPushAtIso === 'string' ? parsed.lastPushAtIso : null,
      lastPushFileName: typeof parsed.lastPushFileName === 'string' ? parsed.lastPushFileName : null,
      lastPushError: typeof parsed.lastPushError === 'string' ? parsed.lastPushError : null,
    };
  } catch {
    return null;
  }
}

function writeLocalSyncMeta(meta: StoredSyncMeta | null): void {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return;
    if (!meta) {
      ls.removeItem(BACKUP_SYNC_META_LS_KEY);
      ls.removeItem(LEGACY_BACKUP_SINK_META_LS_KEY);
    } else {
      ls.setItem(BACKUP_SYNC_META_LS_KEY, JSON.stringify(meta));
      ls.removeItem(LEGACY_BACKUP_SINK_META_LS_KEY);
    }
  } catch {
    // Non-fatal
  }
}

async function saveBackupSyncHandleToIdb(
  handle: SyncDirectoryHandleLike,
  folderName: string
): Promise<void> {
  const configuredAtIso = getAdjustedNowIsoUtc();
  writeLocalSyncMeta({
    ...(readLocalSyncMeta() || {}),
    folderName,
    configuredAtIso,
    lastPushError: null,
  });
  if (!getSafeIndexedDb()) return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_HANDLES, 'readwrite');
          const untrackTx = trackActiveIdbTransaction(tx);
          const store = tx.objectStore(STORE_HANDLES);
          const rec: StoredHandleRecord = {
            key: BACKUP_SYNC_HANDLE_KEY,
            handle,
            folderName,
            configuredAtIso,
          };
          store.put(rec);
          store.delete(LEGACY_BACKUP_SINK_HANDLE_KEY);
          tx.oncomplete = () => {
            untrackTx();
            resolve();
          };
          tx.onerror = () => {
            untrackTx();
            reject(tx.error);
          };
          tx.onabort = () => {
            untrackTx();
            reject(tx.error || new Error('Sync handle write aborted'));
          };
        })
    );
  } catch {
    // Non-fatal
  }
}

async function loadBackupSyncHandleRecord(): Promise<StoredHandleRecord | null> {
  if (testSyncHandleOverride) {
    return {
      key: BACKUP_SYNC_HANDLE_KEY,
      handle: testSyncHandleOverride,
      folderName: String(testSyncHandleOverride.name || 'Test Sync Folder'),
      configuredAtIso: getAdjustedNowIsoUtc(),
    };
  }
  if (!getSafeIndexedDb()) return null;
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<StoredHandleRecord | null>((resolve) => {
          const tx = db.transaction(STORE_HANDLES, 'readonly');
          const untrackTx = trackActiveIdbTransaction(tx);
          const store = tx.objectStore(STORE_HANDLES);
          const req = store.get(BACKUP_SYNC_HANDLE_KEY);
          req.onsuccess = () => {
            const res = req.result as StoredHandleRecord | undefined;
            if (res?.handle) {
              untrackTx();
              resolve(res);
              return;
            }
            // Backwards-compatible lookup for legacy `backup_sink_folder` records
            const legacyReq = store.get(LEGACY_BACKUP_SINK_HANDLE_KEY);
            legacyReq.onsuccess = () => {
              const legacyRes = legacyReq.result as StoredHandleRecord | undefined;
              untrackTx();
              resolve(legacyRes?.handle ? legacyRes : null);
            };
            legacyReq.onerror = () => {
              untrackTx();
              resolve(null);
            };
          };
          req.onerror = () => {
            untrackTx();
            resolve(null);
          };
          tx.onabort = () => {
            untrackTx();
            resolve(null);
          };
        })
    );
  } catch {
    return null;
  }
}

async function queryHandleReadWritePermission(
  handle: SyncDirectoryHandleLike | null | undefined
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

export async function queryDirectoryHandleReadPermission(
  handle: SyncDirectoryHandleLike | null | undefined
): Promise<'granted' | 'prompt' | 'denied'> {
  if (!handle) return 'denied';
  if (typeof handle.queryPermission === 'function') {
    try {
      const res = await handle.queryPermission({ mode: 'read' });
      if (res === 'granted' || res === 'prompt' || res === 'denied') return res;
    } catch {
      return 'prompt';
    }
  }
  return 'granted';
}

export async function saveNamedDirectoryHandleToIdb(
  key: string,
  handle: SyncDirectoryHandleLike,
  folderName: string
): Promise<void> {
  if (!getSafeIndexedDb()) return;
  const configuredAtIso = getAdjustedNowIsoUtc();
  await withSyncIdb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_HANDLES, 'readwrite');
        const untrackTx = trackActiveIdbTransaction(tx);
        const rec: StoredHandleRecord = {
          key,
          handle,
          folderName,
          configuredAtIso,
        };
        tx.objectStore(STORE_HANDLES).put(rec);
        tx.oncomplete = () => {
          untrackTx();
          resolve();
        };
        tx.onerror = () => {
          untrackTx();
          reject(tx.error);
        };
        tx.onabort = () => {
          untrackTx();
          reject(tx.error || new Error('Directory handle write aborted'));
        };
      })
  );
}

export async function loadNamedDirectoryHandleFromIdb(
  key: string
): Promise<StoredHandleRecord | null> {
  if (!getSafeIndexedDb()) return null;
  try {
    return await withSyncIdb(
      (db) =>
        new Promise<StoredHandleRecord | null>((resolve) => {
          const tx = db.transaction(STORE_HANDLES, 'readonly');
          const untrackTx = trackActiveIdbTransaction(tx);
          const req = tx.objectStore(STORE_HANDLES).get(key);
          req.onsuccess = () => {
            untrackTx();
            const res = req.result as StoredHandleRecord | undefined;
            resolve(res?.handle ? res : null);
          };
          req.onerror = () => {
            untrackTx();
            resolve(null);
          };
          tx.onabort = () => {
            untrackTx();
            resolve(null);
          };
        })
    );
  } catch {
    return null;
  }
}

export async function deleteNamedDirectoryHandleFromIdb(key: string): Promise<void> {
  if (!getSafeIndexedDb()) return;
  try {
    await withSyncIdb(
      (db) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_HANDLES, 'readwrite');
          const untrackTx = trackActiveIdbTransaction(tx);
          tx.objectStore(STORE_HANDLES).delete(key);
          tx.oncomplete = () => {
            untrackTx();
            resolve();
          };
          tx.onerror = () => {
            untrackTx();
            resolve();
          };
          tx.onabort = () => {
            untrackTx();
            resolve();
          };
        })
    );
  } catch {
    // Ignore
  }
}

export async function getPersistedBackupSyncStatus(): Promise<BackupSyncStatus> {
  const meta = readLocalSyncMeta();
  const supported = supportsDirectoryPicker() || Boolean(testSyncHandleOverride);
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

  const record = await loadBackupSyncHandleRecord();
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

export async function configureBackupSyncFolder(): Promise<BackupSyncStatus> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts?: {
        id?: string;
        mode?: 'read' | 'readwrite';
      }) => Promise<SyncDirectoryHandleLike>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      'Persisted folder sync is not supported in this browser. Use Chrome/Edge/Android Chromium or export manual backups regularly.'
    );
  }
  const handle = await picker({ id: 'community-pedigree-backup-sync', mode: 'readwrite' });
  if (typeof handle.requestPermission === 'function') {
    const state = await handle.requestPermission({ mode: 'readwrite' });
    if (state !== 'granted') {
      throw new Error('Read/write folder permission was not granted.');
    }
  }
  await saveBackupSyncHandleToIdb(handle, String(handle.name || 'Backup Sync Folder'));
  return getPersistedBackupSyncStatus();
}

export async function reauthorizeBackupSyncFolder(): Promise<BackupSyncStatus> {
  const record = await loadBackupSyncHandleRecord();
  if (!record?.handle) {
    return configureBackupSyncFolder();
  }
  if (typeof record.handle.requestPermission === 'function') {
    await record.handle.requestPermission({ mode: 'readwrite' });
  }
  return getPersistedBackupSyncStatus();
}

export async function disconnectBackupSyncFolder(): Promise<BackupSyncStatus> {
  writeLocalSyncMeta(null);
  if (getSafeIndexedDb()) {
    try {
      await withSyncIdb(
        (db) =>
          new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_HANDLES, 'readwrite');
            const untrackTx = trackActiveIdbTransaction(tx);
            const store = tx.objectStore(STORE_HANDLES);
            store.delete(BACKUP_SYNC_HANDLE_KEY);
            store.delete(LEGACY_BACKUP_SINK_HANDLE_KEY);
            tx.oncomplete = () => {
              untrackTx();
              resolve();
            };
            tx.onerror = () => {
              untrackTx();
              resolve();
            };
            tx.onabort = () => {
              untrackTx();
              resolve();
            };
          })
      );
    } catch {
      // Ignore
    }
  }
  return getPersistedBackupSyncStatus();
}

/**
 * Silently pushes an expiring or archival backup file to the user's connected local/synced folder
 * (`<SyncFolder>/pedigree-vault-archive/<fileName>`) BEFORE local OPFS retention deletes it.
 * Never triggers interactive permission prompts in the background.
 */
export async function pushBackupPayloadToSyncFolder(
  fileName: string,
  data: Uint8Array | Blob | string
): Promise<{
  ok: boolean;
  skippedReason?: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed';
  error?: string;
}> {
  const supported = supportsDirectoryPicker() || Boolean(testSyncHandleOverride);
  if (!supported) {
    return { ok: false, skippedReason: 'unsupported' };
  }
  const record = await loadBackupSyncHandleRecord();
  if (!record?.handle) {
    return { ok: false, skippedReason: 'not_configured' };
  }
  const perm = await queryHandleReadWritePermission(record.handle);
  if (perm !== 'granted') {
    const prev = readLocalSyncMeta();
    if (prev) {
      writeLocalSyncMeta({
        ...prev,
        lastPushError: 'Folder permission needs re-authorization before background offload.',
      });
    }
    return { ok: false, skippedReason: 'permission_required' };
  }

  try {
    const archiveDir =
      typeof record.handle.getDirectoryHandle === 'function'
        ? await record.handle.getDirectoryHandle(BACKUP_SYNC_ARCHIVE_SUBDIR, { create: true })
        : record.handle;
    if (typeof archiveDir.getFileHandle !== 'function') {
      throw new Error('Archive sync directory handle does not support creating files.');
    }
    const fh = await archiveDir.getFileHandle(fileName, { create: true });
    if (typeof fh.createWritable !== 'function') {
      throw new Error('Archive sync file handle does not support createWritable().');
    }
    const writable = await fh.createWritable();
    try {
      await writable.write(data);
      await safeAwaitOpfsFlush(writable);
    } finally {
      await safeAwaitOpfsClose(writable);
    }
    const prev = readLocalSyncMeta();
    writeLocalSyncMeta({
      folderName: prev?.folderName || record.folderName || 'Backup Sync Folder',
      configuredAtIso: prev?.configuredAtIso || record.configuredAtIso,
      lastPushAtIso: getAdjustedNowIsoUtc(),
      lastPushFileName: fileName,
      lastPushError: null,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Folder write failed';
    const prev = readLocalSyncMeta();
    if (prev) {
      writeLocalSyncMeta({
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
    updatedAtIso: getAdjustedNowIsoUtc(),
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
  dirHandle: SyncDirectoryHandleLike;
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

  if (typeof params.dirHandle.entries === 'function') {
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
        if (typeof handle.getFile !== 'function') continue;
        const file = await handle.getFile();
        const fileNameLabel = 'name' in file && typeof file.name === 'string' ? file.name : name;
        const check = validateUploadFileSize(
          fileNameLabel,
          file.size,
          MAX_DELTA_JSON_BYTES,
          'a sync delta file'
        );
        if (!check.ok) continue;
        const text = await readBlobAsText(file);
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
  if (typeof params.dirHandle.getFileHandle !== 'function') {
    throw new Error('Selected sync folder handle does not support writing files.');
  }
  const deltaHandle = await params.dirHandle.getFileHandle(deltaFilename, { create: true });
  if (typeof deltaHandle.createWritable !== 'function') {
    throw new Error('Selected sync folder delta handle does not support createWritable().');
  }
  const deltaWritable = await deltaHandle.createWritable();
  try {
    await deltaWritable.write(deltaPayload);
    await safeAwaitOpfsFlush(deltaWritable);
  } finally {
    await safeAwaitOpfsClose(deltaWritable);
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
  if (typeof masterHandle.createWritable !== 'function') {
    throw new Error('Selected sync folder master handle does not support createWritable().');
  }
  const masterWritable = await masterHandle.createWritable();
  try {
    await masterWritable.write(masterPayload);
    await safeAwaitOpfsFlush(masterWritable);
  } finally {
    await safeAwaitOpfsClose(masterWritable);
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
  const record = await loadBackupSyncHandleRecord();
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
 * Also persists the folder handle as the pre-prune Backup Sync Folder and checkpoints cleanly on background freeze.
 */
export async function syncWithPickedDirectory(params: {
  deviceId: string;
  localOperations: SyncOperation[];
  masterBackupJson: string;
  passphrase?: string;
  dirHandleOverride?: SyncDirectoryHandleLike;
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
        showDirectoryPicker?: (opts?: {
          id?: string;
          mode?: 'read' | 'readwrite';
        }) => Promise<SyncDirectoryHandleLike>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      throw new Error(
        'Folder Sync API is not supported in this browser. Use Web Share or manual delta export instead.'
      );
    }
    dirHandle = await picker({ id: 'community-pedigree-backup-sync', mode: 'readwrite' });
  }
  await saveBackupSyncHandleToIdb(dirHandle, String(dirHandle.name || 'Sync Folder'));
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
}): Promise<FileShareOutcome> {
  return shareTextFileOrDownload(params);
}

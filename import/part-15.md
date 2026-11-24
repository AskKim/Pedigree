# Codebase Export: AskKim/Pedigree (Part 15 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 16 (`src/storage/localSyncChannels.ts` -> `src/storage/__tests__/capturedIdeasStore.test.ts`)
- **Index:** [index.md](./index.md)

---
## `src/storage/localSyncChannels.ts`

```typescript
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
import { generateUuid } from '../core/models';
import {
  DeltaExportFile,
  SyncConflictEntry,
  SyncOperation,
} from '../core/syncOutbox';
import { FileShareOutcome, shareTextFileOrDownload } from '../utils/webFileActions';
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

interface StoredHandleRecord {
  key: string;
  handle: any;
  folderName: string;
  configuredAtIso: string;
}

let testSyncHandleOverride: any | null = null;
export function setBackupSyncHandleForTest(handle: any | null): void {
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

async function saveBackupSyncHandleToIdb(handle: any, folderName: string): Promise<void> {
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
      showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<any>;
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
    const fh = await archiveDir.getFileHandle(fileName, { create: true });
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
```

## `src/storage/offThreadWorkerClient.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client Bridge for Off-Thread `.ZIP` Archive Compression/Extraction & Large Imports.
 *
 * Uses `archiveAndImport.worker.ts` in capable browsers so multi-megabyte `.ZIP`
 * builds and external pedigree parses never block the UI thread on mobile devices,
 * while gracefully falling back to yielded async main-thread execution in Node/Vitest
 * or restricted environments where `Worker` is unavailable.
 */

import type { PreRestoreArchiveInspection } from '../core/archiveInspector';
import type {
  BackupArchiveBuildResult,
  ParsedBackupArchive,
  StreamingZipArchiveSummary,
} from '../core/backupArchive';
import type {
  ImporterRunOptions,
  PlatformImportPreview,
  RawArchiveInput,
} from '../core/importers/importerTypes';
import {
  type BarnDatabaseSnapshot,
  type BarnSettings,
  getCoreClockSkewMs,
} from '../core/models';
import type {
  SupportBundleBuildParams,
  SupportBundleBuildResult,
} from '../core/supportBundle';
import type { SpeciesBackupReason } from '../core/syncAndExports';
import type {
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
  OpfsTempZipBuildResult,
} from './archiveAndImport.worker';
import { logDiagnosticEvent } from './crashLogger';
import {
  isOpfsSupported,
  markTempOpfsFileActive,
  writeTempOpfsFileStreamed,
} from './opfsTempStream';

export type { OpfsTempZipBuildResult };

const WORKER_TIMEOUT_MS = 90_000;
const WORKER_IDLE_TERMINATE_MS = 60_000;
const MAX_TRANSIENT_WORKER_FAILURES = 3;

interface PendingWorkerJob {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let activeWorker: Worker | null = null;
let workerDisabled = false;
let consecutiveWorkerFailures = 0;
let idleTerminateTimer: ReturnType<typeof setTimeout> | null = null;
let jobCounter = 0;
const pendingJobs = new Map<string, PendingWorkerJob>();

function clearIdleTerminateTimer(): void {
  if (idleTerminateTimer !== null) {
    clearTimeout(idleTerminateTimer);
    idleTerminateTimer = null;
  }
}

function scheduleIdleTerminateIfEmpty(): void {
  clearIdleTerminateTimer();
  if (!activeWorker || pendingJobs.size > 0) return;
  idleTerminateTimer = setTimeout(() => {
    idleTerminateTimer = null;
    if (activeWorker && pendingJobs.size === 0) {
      try {
        activeWorker.terminate();
      } catch {
        // Ignore
      }
      activeWorker = null;
    }
  }, WORKER_IDLE_TERMINATE_MS);
}

function rejectAndResetWorker(reason: string): void {
  clearIdleTerminateTimer();
  if (activeWorker) {
    try {
      activeWorker.terminate();
    } catch {
      // Ignore termination error
    }
    activeWorker = null;
  }
  const err = new Error(reason);
  for (const job of pendingJobs.values()) {
    clearTimeout(job.timer);
    job.reject(err);
  }
  pendingJobs.clear();
}

function getOrCreateWorker(): Worker | null {
  if (workerDisabled || typeof Worker === 'undefined') {
    return null;
  }
  clearIdleTerminateTimer();
  if (activeWorker) {
    return activeWorker;
  }
  try {
    const worker = new Worker(new URL('./archiveAndImport.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ArchiveWorkerResponse>) => {
      const msg = event.data;
      if (!msg || !msg.id) return;
      const pending = pendingJobs.get(msg.id);
      if (!pending) return;
      pendingJobs.delete(msg.id);
      clearTimeout(pending.timer);
      consecutiveWorkerFailures = 0;
      if (msg.ok) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error || 'Archive worker failed.'));
      }
      scheduleIdleTerminateIfEmpty();
    };
    worker.onerror = (ev) => {
      const message = ev?.message || 'Web Worker runtime failure';
      consecutiveWorkerFailures++;
      if (consecutiveWorkerFailures >= MAX_TRANSIENT_WORKER_FAILURES) {
        workerDisabled = true;
      }
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message: `Corrective action: Archive worker errored (${message}) — resetting worker pool${
          workerDisabled ? ' (switched to main-thread async fallback)' : ''
        }`,
      });
      rejectAndResetWorker(message);
    };
    activeWorker = worker;
    return worker;
  } catch (err) {
    workerDisabled = true;
    logDiagnosticEvent({
      level: 'warn',
      category: 'runtime',
      message:
        'Corrective action: Web Worker unavailable in this browser context — using async main-thread archive processing',
      error: err,
    });
    return null;
  }
}

async function yieldToUiFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function runInWorker<TResult>(
  buildPayload: (id: string) => ArchiveWorkerRequest
): Promise<TResult> | null {
  const worker = getOrCreateWorker();
  if (!worker) return null;

  const id = `job-${++jobCounter}-${Date.now().toString(36)}`;
  const payload: ArchiveWorkerRequest = {
    ...buildPayload(id),
    clockSkewMs: getCoreClockSkewMs(),
  };

  return new Promise<TResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingJobs.delete(id);
      rejectAndResetWorker(
        'Archive operation timed out in background worker. Try a smaller batch or ZIP.'
      );
    }, WORKER_TIMEOUT_MS);

    pendingJobs.set(id, { resolve, reject, timer });
    try {
      worker.postMessage(payload);
    } catch (postErr) {
      pendingJobs.delete(id);
      clearTimeout(timer);
      scheduleIdleTerminateIfEmpty();
      reject(postErr instanceof Error ? postErr : new Error(String(postErr)));
    }
  });
}

/**
 * Strips heavy base64 image payloads from `existingSnapshot.animalPhotos` before sending
 * metadata to the external importer worker so `postMessage` structured cloning stays instant.
 */
export function buildImporterWorkerSnapshot(
  snapshot: BarnDatabaseSnapshot
): BarnDatabaseSnapshot {
  const photos = snapshot.animalPhotos ?? [];
  if (photos.length === 0) return snapshot;
  return {
    ...snapshot,
    animalPhotos: photos.map((p) => ({
      ...p,
      thumbnailDataUrl: '',
      dataUrl: '',
    })),
  };
}

async function runStreamedZipMainThreadFallback(
  prefix: string,
  streamFn: (onChunk: (chunk: Uint8Array) => Promise<void>) => Promise<StreamingZipArchiveSummary>
): Promise<OpfsTempZipBuildResult> {
  await yieldToUiFrame();
  if (isOpfsSupported()) {
    const staged = await writeTempOpfsFileStreamed(
      prefix,
      'zip',
      async (writeChunk) => streamFn((chunk) => writeChunk(chunk)),
      { keepActiveAfterWrite: true }
    );
    if (staged) {
      return {
        opfsTempFileName: staged.fileName,
        blob: staged.blob,
        byteSize: staged.byteSize,
        photoCount: staged.meta.photoCount,
        animalCount: staged.meta.animalCount,
        binderCount: staged.meta.binderCount,
        totalImageBinaryBytes: staged.meta.totalImageBinaryBytes,
      };
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const meta = await streamFn(async (chunk) => {
    chunks.push(chunk);
    total += chunk.byteLength;
  });
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    opfsTempFileName: null,
    bytes,
    byteSize: bytes.byteLength,
    photoCount: meta.photoCount,
    animalCount: meta.animalCount,
    binderCount: meta.binderCount,
    totalImageBinaryBytes: meta.totalImageBinaryBytes,
  };
}

export async function buildCompleteBackupZipToOpfsTmpOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): Promise<OpfsTempZipBuildResult> {
  const workerPromise = runInWorker<OpfsTempZipBuildResult>((id) => ({
    id,
    kind: 'buildCompleteBackupZipToOpfsTmp',
    snapshot,
    filterSpecies,
    extraMeta,
  }));
  if (workerPromise) {
    const res = await workerPromise;
    if (res.opfsTempFileName) {
      markTempOpfsFileActive(res.opfsTempFileName);
    }
    return res;
  }
  const { streamCompleteBackupZipArchive } = await import('../core/backupArchive');
  return runStreamedZipMainThreadFallback('archive', (onChunk) =>
    streamCompleteBackupZipArchive(snapshot, onChunk, filterSpecies, extraMeta)
  );
}

export async function buildPhotosOnlyZipToOpfsTmpOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): Promise<OpfsTempZipBuildResult> {
  const workerPromise = runInWorker<OpfsTempZipBuildResult>((id) => ({
    id,
    kind: 'buildPhotosOnlyZipToOpfsTmp',
    snapshot,
    filterSpecies,
  }));
  if (workerPromise) {
    const res = await workerPromise;
    if (res.opfsTempFileName) {
      markTempOpfsFileActive(res.opfsTempFileName);
    }
    return res;
  }
  const { streamPhotosOnlyZipArchive } = await import('../core/backupArchive');
  return runStreamedZipMainThreadFallback('photos-archive', (onChunk) =>
    streamPhotosOnlyZipArchive(snapshot, onChunk, filterSpecies)
  );
}

export async function buildCompleteBackupZipOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): Promise<BackupArchiveBuildResult> {
  const workerPromise = runInWorker<BackupArchiveBuildResult>((id) => ({
    id,
    kind: 'buildCompleteBackupZip',
    snapshot,
    filterSpecies,
    extraMeta,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { buildCompleteBackupZipArchive } = await import('../core/backupArchive');
  return buildCompleteBackupZipArchive(snapshot, filterSpecies, extraMeta);
}

export async function buildPhotosOnlyZipOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): Promise<BackupArchiveBuildResult> {
  const workerPromise = runInWorker<BackupArchiveBuildResult>((id) => ({
    id,
    kind: 'buildPhotosOnlyZip',
    snapshot,
    filterSpecies,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { buildPhotosOnlyZipArchive } = await import('../core/backupArchive');
  return buildPhotosOnlyZipArchive(snapshot, filterSpecies);
}

export async function parseBackupArchiveOffThread(
  bytes: Uint8Array,
  fileName: string,
  fallbackSettings: BarnSettings
): Promise<ParsedBackupArchive> {
  const workerPromise = runInWorker<ParsedBackupArchive>((id) => ({
    id,
    kind: 'parseBackupArchive',
    bytes,
    fileName,
    fallbackSettings,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { parseBackupArchiveInput } = await import('../core/backupArchive');
  return parseBackupArchiveInput(bytes, fileName, fallbackSettings);
}

export async function parseExternalImportOffThread(
  platformId: string,
  inputs: RawArchiveInput[],
  existingSnapshot: BarnDatabaseSnapshot,
  options: ImporterRunOptions
): Promise<PlatformImportPreview> {
  const lightSnapshot = buildImporterWorkerSnapshot(existingSnapshot);
  const workerPromise = runInWorker<PlatformImportPreview>((id) => ({
    id,
    kind: 'parseExternalImport',
    platformId,
    inputs,
    existingSnapshot: lightSnapshot,
    options,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { getPlatformImporterById } = await import('../core/importers/registry');
  const importer = getPlatformImporterById(platformId);
  return importer.parse(inputs, lightSnapshot, options);
}

export async function buildSupportBundleZipOffThread(
  params: SupportBundleBuildParams
): Promise<SupportBundleBuildResult> {
  const workerPromise = runInWorker<SupportBundleBuildResult>((id) => ({
    id,
    kind: 'buildSupportBundleZip',
    params,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { buildSupportBundleZipArchive } = await import('../core/supportBundle');
  return buildSupportBundleZipArchive(params);
}

export async function inspectBackupArchiveOffThread(
  bytes: Uint8Array,
  fileName: string,
  currentSnapshot: BarnDatabaseSnapshot,
  encrypted = false
): Promise<{
  parsed: ParsedBackupArchive;
  inspection: PreRestoreArchiveInspection;
}> {
  const lightCurrent = buildImporterWorkerSnapshot(currentSnapshot);
  const workerPromise = runInWorker<{
    parsed: ParsedBackupArchive;
    inspection: PreRestoreArchiveInspection;
  }>((id) => ({
    id,
    kind: 'inspectBackupArchive',
    bytes,
    fileName,
    currentSnapshot: lightCurrent,
    encrypted,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const [{ parseBackupArchiveInput }, { inspectParsedArchiveBeforeRestorePure }] =
    await Promise.all([
      import('../core/backupArchive'),
      import('../core/archiveInspector'),
    ]);
  const parsed = parseBackupArchiveInput(
    bytes,
    fileName,
    lightCurrent.settings
  );
  const inspection = inspectParsedArchiveBeforeRestorePure(parsed, lightCurrent, {
    fileName,
    encrypted,
  });
  return { parsed, inspection };
}

export function isArchiveWorkerDisabled(): boolean {
  return workerDisabled || typeof Worker === 'undefined';
}

export function resetArchiveWorkerForTests(): void {
  workerDisabled = false;
  rejectAndResetWorker('Archive worker reset.');
}
```

## `src/storage/opfsStorage.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Hybrid Origin Private File System (OPFS) Browser Adapter (`src/storage/opfsStorage.ts`).
 *
 * Implements:
 * - Strict feature detection (`isOpfsSupported()`) & isolated `/tmp`, `/backups`, `/archives` namespaces
 * - Deterministic `.close()` in `try / finally` for every writable handle
 * - Automatic `QuotaExceededError` recovery by purging `/tmp` and retrying once
 * - Boot-time orphan `/tmp` sweep
 * - Unified OPFS Backup Vault (`/backups`) with retention caps (6 monthly, 3 pre-upgrade, recovery dumps)
 * - Archived Herds Cohort Storage (`/archives`) with `.archive.zip` bundles & manifest index
 * - Prior-use eviction sentinel & wiped-storage detection
 * - Idle background Export Canary (`requestIdleCallback` caller, `visibilityState`-guarded)
 * - Raw IndexedDB / SQLite migration failure dump to OPFS `/backups/recovery-pre-reset-*.json`
 */

import { hasNonTestingBarnData } from '../core/backupStatus';
import {
  APP_SCHEMA_BUILD_TAG,
  ArchivedHerdIndexEntry,
  buildEmptyFallbackSettings,
  buildExportCanaryProbe,
  CURRENT_BACKUP_SCHEMA_VERSION,
  deserializeVaultBackupPayload,
  extractArchiveIndexMetadataOnly,
  extractVaultJsonTextFromPayload,
  isZipMagicBytes,
  MigratedBackupResult,
  serializeCompressedVaultBackupZip,
  serializeVaultBackupEnvelope,
  sha256HexPure,
  unpackArchivedAnimalBundle,
  UnpackedArchivedHerdBundle,
  VaultBackupKind,
  VaultBackupMetadata,
  verifyExportCanaryRoundTrip,
} from '../core/backupVault';
import { getTierStoragePolicy, TierStoragePolicy } from '../core/deviceCapability';
import { BarnDatabaseSnapshot, BarnSettings, generateUuid, nowIsoUtc } from '../core/models';
import { isSampleTestingId } from '../core/sampleData';
import { logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import { pushBackupPayloadToSyncFolder } from './localSyncChannels';
import {
  getOpfsSubdir,
  isOpfsSupported,
  listDirEntries,
  markTempOpfsFileActive,
  OpfsCloseableHandle,
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsNamespace,
  OpfsSyncAccessHandle,
  OpfsWritableStream,
  probeOpfsRuntime,
  purgeOpfsTmp,
  readOpfsFileBytes,
  readOpfsFileText,
  readTempOpfsFileAsBlob,
  registerOpfsDiagnosticLogger,
  releaseActiveOpfsHandles,
  removeOpfsEntrySafe,
  removeTempOpfsFile,
  resetOpfsProbesForTests,
  safeAwaitOpfsClose,
  safeAwaitOpfsFlush,
  safeAwaitOpfsGetSize,
  safeAwaitOpfsTruncate,
  setOpfsRootResolverForTest,
  StreamedOpfsTempFileResult,
  sweepOrphanedOpfsTmpOnBoot,
  unmarkTempOpfsFileActive,
  writeFileToOpfsDir,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
} from './opfsTempStream';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
} from './storageProbes';
import { isQuotaExceededError } from './storageProtection';

registerOpfsDiagnosticLogger((ev) => {
  logDiagnosticEvent(ev);
});

export {
  getOpfsSubdir,
  isOpfsSupported,
  markTempOpfsFileActive,
  probeOpfsRuntime,
  purgeOpfsTmp,
  readTempOpfsFileAsBlob,
  releaseActiveOpfsHandles,
  removeTempOpfsFile,
  resetOpfsProbesForTests,
  safeAwaitOpfsClose,
  safeAwaitOpfsFlush,
  safeAwaitOpfsGetSize,
  safeAwaitOpfsTruncate,
  setOpfsRootResolverForTest,
  sweepOrphanedOpfsTmpOnBoot,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
};
export type {
  OpfsCloseableHandle,
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsNamespace,
  OpfsSyncAccessHandle,
  OpfsWritableStream,
  StreamedOpfsTempFileResult,
};

export interface PriorUseSentinel {
  barnName: string;
  animalCount: number;
  nonTestingCount: number;
  lastSeenIso: string;
}

export interface WipedStorageRecoveryContext {
  detected: boolean;
  reason: 'sentinel' | 'opfs_backups' | 'opfs_archives' | 'none';
  sentinel: PriorUseSentinel | null;
  latestOpfsBackup: VaultBackupMetadata | null;
  opfsBackupsCount: number;
  opfsArchivesCount: number;
}

export const MAX_MONTHLY_OPFS_BACKUPS = 6;
export const MAX_PRE_UPGRADE_OPFS_BACKUPS = 3;
export const MAX_PRE_RESET_OPFS_BACKUPS = 8;
export const MAX_MANUAL_OPFS_BACKUPS = 12;
export const MAX_RECOVERY_DUMP_OPFS_BACKUPS = 4;
export const MONTHLY_BACKUP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const EXPORT_CANARY_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const CANARY_FAILURE_COOLDOWN_MS = 60 * 60 * 1000;

const PRIOR_USE_SENTINEL_KEY = 'pedigree.priorUseSentinel.v1';
const CANARY_LAST_RUN_KEY = 'pedigree.opfsCanaryLastRunMs.v1';
const CANARY_LAST_FAIL_KEY = 'pedigree.opfsCanaryLastFailMs.v1';
const OPFS_PRUNE_WARNING_KEY = 'pedigree.opfsPruneWarning.v1';
const VAULT_INDEX_FILE = 'vault-index.json';
const ARCHIVES_INDEX_FILE = 'archives-index.json';
const CANARY_PROBE_FILE = 'canary-probe.json';

export interface OpfsPruneSyncWarning {
  count: number;
  lastFileName: string;
  kind: VaultBackupKind;
  reason: 'not_configured' | 'permission_required' | 'write_failed' | 'unsupported';
  retained?: boolean;
  timestampIso: string;
  message: string;
}

export function readOpfsPruneSyncWarning(): OpfsPruneSyncWarning | null {
  const ls = getSafeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(OPFS_PRUNE_WARNING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OpfsPruneSyncWarning>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.lastFileName !== 'string') {
      return null;
    }
    const reason =
      parsed.reason === 'permission_required' ||
      parsed.reason === 'write_failed' ||
      parsed.reason === 'unsupported'
        ? parsed.reason
        : 'not_configured';
    return {
      count: Number(parsed.count) || 1,
      lastFileName: parsed.lastFileName,
      kind: (parsed.kind as VaultBackupKind) || 'manual',
      reason,
      retained:
        typeof parsed.retained === 'boolean'
          ? parsed.retained
          : reason === 'permission_required' || reason === 'write_failed',
      timestampIso: String(parsed.timestampIso || ''),
      message: String(parsed.message || ''),
    };
  } catch {
    return null;
  }
}

export function clearOpfsPruneSyncWarning(): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(OPFS_PRUNE_WARNING_KEY);
  } catch {
    // Ignore
  }
}

function recordOpfsPruneSyncWarning(
  newCount: number,
  lastItem: VaultBackupMetadata,
  reason: OpfsPruneSyncWarning['reason'],
  options?: { retained?: boolean }
): void {
  if (newCount <= 0) return;
  const retained =
    options?.retained ?? (reason === 'permission_required' || reason === 'write_failed');
  const existing = readOpfsPruneSyncWarning();
  const totalCount =
    existing && existing.reason === reason ? (existing.count || 0) + newCount : newCount;
  const reasonNote =
    reason === 'permission_required'
      ? 'Connected Backup Sync folder needs re-authorization'
      : reason === 'write_failed'
      ? 'Backup Sync folder write failed'
      : reason === 'unsupported'
      ? 'This browser cannot persist folder sync handles automatically'
      : 'No Backup Sync folder is connected';
  const next: OpfsPruneSyncWarning = {
    count: totalCount,
    lastFileName: lastItem.fileName,
    kind: lastItem.kind,
    reason,
    retained,
    timestampIso: nowIsoUtc(),
    message: retained
      ? `${totalCount} expiring local backup(s) could not offload (${reasonNote}) and were retained locally until sync succeeds. Re-authorize your Backup Sync folder or export a manual backup.`
      : `${totalCount} aging local backup(s) rolled off storage without an off-device sync copy (${reasonNote}). Connect a sync folder or download a manual backup.`,
  };
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      ls.setItem(OPFS_PRUNE_WARNING_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal
    }
  }
  logDiagnosticEvent({
    level: 'warn',
    category: 'storage',
    message: retained
      ? `Retained ${newCount} expiring OPFS backup(s) locally after Backup Sync offload failed (${reason}): ${lastItem.fileName}`
      : `Pruned ${newCount} expiring OPFS backup(s) without sync offload (${reason}): ${lastItem.fileName}`,
  });
}

const opfsNamespaceQueues = new Map<OpfsNamespace, Promise<void>>();

function withOpfsNamespaceLock<T>(
  namespace: OpfsNamespace,
  task: () => Promise<T>
): Promise<T> {
  const prev = opfsNamespaceQueues.get(namespace) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(task);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  opfsNamespaceQueues.set(namespace, settled);
  return run.finally(() => {
    if (opfsNamespaceQueues.get(namespace) === settled) {
      opfsNamespaceQueues.delete(namespace);
    }
  });
}

function measureUtf8ByteLength(text: string): number {
  if (typeof Blob !== 'undefined') {
    return new Blob([text]).size;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).byteLength;
  }
  return text.length;
}

function compactStamp(iso: string): string {
  return iso.replace(/[-:T.Z]/g, '').slice(0, 15);
}

// ---------------------------------------------------------------------------
// 2. OPFS Backup Vault (`/backups`) + Retention Pruning
// ---------------------------------------------------------------------------

function buildVaultFileName(
  kind: VaultBackupKind,
  createdAtIso: string,
  compressed = false
): string {
  const stamp = compactStamp(createdAtIso);
  const shortId = generateUuid().slice(0, 6);
  const ext = compressed ? '.vault.zip' : '.json';
  if (kind === 'monthly') {
    const ym = createdAtIso.slice(0, 7);
    return `monthly-${ym}-${stamp}-${shortId}${ext}`;
  }
  if (kind === 'pre_upgrade') {
    return `pre-upgrade-${stamp}-${shortId}${ext}`;
  }
  if (kind === 'pre_reset') {
    return `pre-reset-${stamp}-${shortId}${ext}`;
  }
  if (kind === 'recovery_dump') {
    return `recovery-pre-reset-${stamp}-${shortId}${ext}`;
  }
  return `manual-vault-${stamp}-${shortId}${ext}`;
}

function resolveEffectiveStoragePolicy(
  override?: Partial<TierStoragePolicy>
): TierStoragePolicy {
  const base = getTierStoragePolicy(detectCurrentDeviceCapability().tier);
  return override ? { ...base, ...override } : base;
}

async function readVaultIndex(backupsDir: OpfsDirectoryHandle): Promise<VaultBackupMetadata[]> {
  const indexText = await readOpfsFileText(backupsDir, VAULT_INDEX_FILE);
  if (indexText) {
    try {
      const parsed = JSON.parse(indexText);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is VaultBackupMetadata =>
            Boolean(item && typeof item === 'object' && typeof item.key === 'string' && typeof item.fileName === 'string')
        );
      }
    } catch {
      // Rebuild below if corrupted
    }
  }

  // Self-heal vault index by scanning `/backups/*.json` and `/backups/*.vault.zip` files safely
  const rebuilt: VaultBackupMetadata[] = [];
  const entries = await listDirEntries(backupsDir);
  for (const entry of entries) {
    if (
      entry.handle.kind === 'directory' ||
      entry.name === VAULT_INDEX_FILE ||
      (!entry.name.endsWith('.json') && !entry.name.endsWith('.zip'))
    ) {
      continue;
    }
    try {
      const bytes = await readOpfsFileBytes(backupsDir, entry.name);
      if (!bytes || bytes.byteLength === 0) continue;
      const isCompressed = entry.name.endsWith('.zip') || isZipMagicBytes(bytes);
      const text = extractVaultJsonTextFromPayload(bytes, entry.name);
      const parsed = JSON.parse(text) as Record<string, any>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const snap = parsed.snapshot && typeof parsed.snapshot === 'object' ? parsed.snapshot : parsed;
      const animalCount = Array.isArray(snap?.animals) ? snap.animals.length : 0;
      const photoCount = Array.isArray(snap?.animalPhotos) ? snap.animalPhotos.length : 0;
      const speciesCount = Array.isArray(snap?.speciesProfiles) ? snap.speciesProfiles.length : 0;
      const kind: VaultBackupKind =
        parsed.vaultKind === 'monthly' ||
        parsed.vaultKind === 'pre_upgrade' ||
        parsed.vaultKind === 'manual' ||
        parsed.vaultKind === 'pre_reset' ||
        parsed.vaultKind === 'recovery_dump'
          ? parsed.vaultKind
          : entry.name.startsWith('recovery-')
          ? 'recovery_dump'
          : entry.name.startsWith('monthly-')
          ? 'monthly'
          : entry.name.startsWith('pre-upgrade-')
          ? 'pre_upgrade'
          : entry.name.startsWith('pre-reset-')
          ? 'pre_reset'
          : 'manual';

      rebuilt.push({
        key: entry.name,
        fileName: entry.name,
        kind,
        schemaVersion: Number(parsed._schemaVersion) || CURRENT_BACKUP_SCHEMA_VERSION,
        createdAtIso: String(parsed.createdAtIso || parsed.exportedAtIsoUtc || nowIsoUtc()),
        createdByAppVersion: String(parsed.createdByAppVersion || APP_SCHEMA_BUILD_TAG),
        barnName: String(snap?.settings?.barnName || 'My Barn'),
        animalCount,
        photoCount,
        speciesCount,
        byteSize: bytes.byteLength,
        checksumSha256: String(parsed.checksumSha256 || sha256HexPure(text)),
        source: 'opfs',
        note: typeof parsed.note === 'string' ? parsed.note : undefined,
        compressed: isCompressed,
      });
    } catch {
      // Skip malformed entry safely
    }
  }
  rebuilt.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  if (rebuilt.length > 0) {
    try {
      await writeFileToOpfsDir(backupsDir, VAULT_INDEX_FILE, JSON.stringify(rebuilt, null, 2));
    } catch {
      // Non-fatal
    }
  }
  return rebuilt;
}

async function writeVaultIndex(
  backupsDir: OpfsDirectoryHandle,
  items: VaultBackupMetadata[]
): Promise<void> {
  const sorted = [...items].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  await writeFileToOpfsDir(backupsDir, VAULT_INDEX_FILE, JSON.stringify(sorted, null, 2));
}

export type PrePruneOffloadHandler = (
  item: VaultBackupMetadata,
  bytes: Uint8Array | null
) => Promise<{
  ok: boolean;
  skippedReason?: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed';
}>;

async function enforceVaultRetention(
  backupsDir: OpfsDirectoryHandle,
  items: VaultBackupMetadata[],
  policy: TierStoragePolicy = resolveEffectiveStoragePolicy(),
  beforePrune?: PrePruneOffloadHandler
): Promise<VaultBackupMetadata[]> {
  const byKindCap: Record<VaultBackupKind, number> = {
    monthly: policy.monthlyCap,
    pre_upgrade: policy.preUpgradeCap,
    pre_reset: policy.preResetCap,
    manual: policy.manualCap,
    recovery_dump: policy.recoveryDumpCap,
  };

  const keepSet = new Set<string>();
  const deleteItems: VaultBackupMetadata[] = [];

  const grouped = new Map<VaultBackupKind, VaultBackupMetadata[]>();
  for (const item of items) {
    const arr = grouped.get(item.kind) || [];
    arr.push(item);
    grouped.set(item.kind, arr);
  }

  for (const [kind, list] of grouped.entries()) {
    list.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    const cap = byKindCap[kind];
    list.forEach((item, idx) => {
      if (idx < cap) {
        keepSet.add(item.key);
      } else {
        deleteItems.push(item);
      }
    });
  }

  if (deleteItems.length > 0) {
    let prunedUnbackedCount = 0;
    let lastPrunedItem: VaultBackupMetadata | null = null;
    let lastPrunedReason: OpfsPruneSyncWarning['reason'] = 'not_configured';

    let retainedCount = 0;
    let lastRetainedItem: VaultBackupMetadata | null = null;
    let lastRetainedReason: OpfsPruneSyncWarning['reason'] = 'permission_required';

    for (const item of deleteItems) {
      const payloadBytes = await readOpfsFileBytes(backupsDir, item.fileName);
      const offloadResult = beforePrune
        ? await beforePrune(item, payloadBytes)
        : payloadBytes
        ? await pushBackupPayloadToSyncFolder(item.fileName, payloadBytes)
        : { ok: false, skippedReason: 'write_failed' as const };

      if (!offloadResult.ok) {
        const reason = offloadResult.skippedReason || 'not_configured';
        if (
          payloadBytes &&
          (reason === 'permission_required' || reason === 'write_failed')
        ) {
          // Retain expiring local OPFS backup when a configured sync folder fails temporarily
          keepSet.add(item.key);
          retainedCount++;
          lastRetainedItem = item;
          lastRetainedReason = reason;
          continue;
        }
        prunedUnbackedCount++;
        lastPrunedItem = item;
        lastPrunedReason = reason;
      } else {
        logDiagnosticEvent({
          level: 'info',
          category: 'storage',
          message: `Synced expiring OPFS backup "${item.fileName}" to Backup Sync Folder before local prune`,
        });
      }

      await removeOpfsEntrySafe(backupsDir, item.fileName);
    }

    if (retainedCount > 0 && lastRetainedItem) {
      recordOpfsPruneSyncWarning(retainedCount, lastRetainedItem, lastRetainedReason, {
        retained: true,
      });
    } else if (prunedUnbackedCount > 0 && lastPrunedItem) {
      recordOpfsPruneSyncWarning(prunedUnbackedCount, lastPrunedItem, lastPrunedReason, {
        retained: false,
      });
    }
  }

  return items
    .filter((i) => keepSet.has(i.key))
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

export async function flushOpfsBackupsToSyncFolder(options?: {
  policyOverride?: Partial<TierStoragePolicy>;
}): Promise<{
  pushed: number;
  failed: number;
  skippedReason?: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed';
}> {
  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', false);
    if (!backupsDir) return { pushed: 0, failed: 0 };
    const items = await readVaultIndex(backupsDir);
    let pushed = 0;
    let failed = 0;
    let lastReason: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed' | undefined;
    const pushedKeys = new Set<string>();

    for (const item of items) {
      const bytes = await readOpfsFileBytes(backupsDir, item.fileName);
      if (!bytes) continue;
      const res = await pushBackupPayloadToSyncFolder(item.fileName, bytes);
      if (res.ok) {
        pushed++;
        pushedKeys.add(item.key);
      } else {
        failed++;
        lastReason = res.skippedReason;
        if (
          res.skippedReason === 'unsupported' ||
          res.skippedReason === 'not_configured' ||
          res.skippedReason === 'permission_required'
        ) {
          break;
        }
      }
    }
    if (pushed > 0 && failed === 0) {
      clearOpfsPruneSyncWarning();
      const policy = resolveEffectiveStoragePolicy(options?.policyOverride);
      const nextList = await enforceVaultRetention(
        backupsDir,
        items,
        policy,
        async (item) =>
          pushedKeys.has(item.key)
            ? { ok: true }
            : { ok: false, skippedReason: 'write_failed' }
      );
      if (nextList.length !== items.length) {
        await writeVaultIndex(backupsDir, nextList);
      }
    }
    return { pushed, failed, skippedReason: lastReason };
  });
}

export async function saveOpfsVaultBackup(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    note?: string;
    appVersion?: string;
    policyOverride?: Partial<TierStoragePolicy>;
    beforePrune?: PrePruneOffloadHandler;
  }
): Promise<VaultBackupMetadata | null> {
  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', true);
    if (!backupsDir) return null;

    const policy = resolveEffectiveStoragePolicy(options.policyOverride);
    const createdAtIso = nowIsoUtc();
    const compressed = policy.compressVaultBackups;
    const fileName = buildVaultFileName(options.kind, createdAtIso, compressed);

    let envelopeCreatedBy = options.appVersion || APP_SCHEMA_BUILD_TAG;
    let schemaVersion = CURRENT_BACKUP_SCHEMA_VERSION;
    let checksumSha256 = '';
    let envelopeNote: string | undefined;
    let byteSize = 0;

    if (compressed) {
      const { envelope, zipBytes } = serializeCompressedVaultBackupZip(snapshot, {
        kind: options.kind,
        createdAtIso,
        createdByAppVersion: envelopeCreatedBy,
        note: options.note,
      });
      await writeFileToOpfsDir(backupsDir, fileName, zipBytes);
      envelopeCreatedBy = envelope.createdByAppVersion;
      schemaVersion = envelope._schemaVersion;
      checksumSha256 = envelope.checksumSha256;
      envelopeNote = envelope.note;
      byteSize = zipBytes.byteLength;
    } else {
      const { envelope, jsonText } = serializeVaultBackupEnvelope(snapshot, {
        kind: options.kind,
        createdAtIso,
        createdByAppVersion: envelopeCreatedBy,
        note: options.note,
      });
      await writeFileToOpfsDir(backupsDir, fileName, jsonText);
      envelopeCreatedBy = envelope.createdByAppVersion;
      schemaVersion = envelope._schemaVersion;
      checksumSha256 = envelope.checksumSha256;
      envelopeNote = envelope.note;
      byteSize = measureUtf8ByteLength(jsonText);
    }

    const meta: VaultBackupMetadata = {
      key: fileName,
      fileName,
      kind: options.kind,
      schemaVersion,
      createdAtIso,
      createdByAppVersion: envelopeCreatedBy,
      barnName: snapshot.settings.barnName || 'My Barn',
      animalCount: snapshot.animals.length,
      photoCount: (snapshot.animalPhotos ?? []).length,
      speciesCount: snapshot.speciesProfiles.length,
      byteSize,
      checksumSha256,
      source: 'opfs',
      note: envelopeNote,
      compressed,
    };

    const existing = await readVaultIndex(backupsDir);
    const nextList = await enforceVaultRetention(
      backupsDir,
      [meta, ...existing.filter((i) => i.key !== meta.key)],
      policy,
      options.beforePrune
    );
    await writeVaultIndex(backupsDir, nextList);
    return meta;
  });
}

export async function listOpfsVaultBackups(): Promise<VaultBackupMetadata[]> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return [];
  try {
    const items = await readVaultIndex(backupsDir);
    return items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: 'Could not list OPFS /backups vault entries safely',
      error: err,
    });
    return [];
  }
}

export async function loadOpfsVaultBackup(
  key: string,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): Promise<{ meta: VaultBackupMetadata | null; migrated: MigratedBackupResult } | null> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return null;

  const items = await readVaultIndex(backupsDir);
  const meta = items.find((i) => i.key === key || i.fileName === key) || null;
  const targetFile = meta?.fileName || key;

  const bytes = await readOpfsFileBytes(backupsDir, targetFile);
  if (!bytes || bytes.byteLength === 0) return null;

  try {
    const migrated = deserializeVaultBackupPayload(bytes, fallbackSettings, targetFile);
    return { meta, migrated };
  } catch (err) {
    logDiagnosticEvent({
      level: 'error',
      category: 'storage',
      message: `OPFS vault backup "${targetFile}" failed structural validation or migration`,
      error: err,
    });
    throw err;
  }
}

export async function readOpfsVaultBackupRawJson(key: string): Promise<string | null> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return null;
  const items = await readVaultIndex(backupsDir);
  const meta = items.find((i) => i.key === key || i.fileName === key);
  const fileName = meta?.fileName || key;
  const bytes = await readOpfsFileBytes(backupsDir, fileName);
  if (!bytes || bytes.byteLength === 0) return null;
  return extractVaultJsonTextFromPayload(bytes, fileName);
}

export async function readOpfsVaultBackupBlob(
  key: string
): Promise<{ fileName: string; blob: Blob } | null> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return null;
  const items = await readVaultIndex(backupsDir);
  const meta = items.find((i) => i.key === key || i.fileName === key);
  const fileName = meta?.fileName || key;
  try {
    const fh = await backupsDir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    return { fileName, blob: file };
  } catch {
    return null;
  }
}

export async function deleteOpfsVaultBackup(key: string): Promise<boolean> {
  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', false);
    if (!backupsDir) return false;
    const items = await readVaultIndex(backupsDir);
    const target = items.find((i) => i.key === key || i.fileName === key);
    const removed = await removeOpfsEntrySafe(backupsDir, target?.fileName || key);
    const remaining = items.filter((i) => i.key !== key && i.fileName !== key);
    await writeVaultIndex(backupsDir, remaining);
    return removed;
  });
}

export async function shouldCreateMonthlyOpfsBackup(nowMs: number = Date.now()): Promise<boolean> {
  if (!isOpfsSupported()) return false;
  const items = await listOpfsVaultBackups();
  const monthly = items.filter((i) => i.kind === 'monthly');
  if (monthly.length === 0) return true;
  monthly.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  const newestMs = Date.parse(monthly[0].createdAtIso);
  if (Number.isNaN(newestMs)) return true;
  return nowMs - newestMs >= MONTHLY_BACKUP_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// 3. OPFS Archived Herds (`/archives`)
// ---------------------------------------------------------------------------

async function readArchivesIndex(
  archivesDir: OpfsDirectoryHandle
): Promise<ArchivedHerdIndexEntry[]> {
  const text = await readOpfsFileText(archivesDir, ARCHIVES_INDEX_FILE);
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is ArchivedHerdIndexEntry =>
            Boolean(item && typeof item === 'object' && typeof item.archiveKey === 'string')
        );
      }
    } catch {
      // Rebuild below if index JSON corrupted
    }
  }

  const rebuilt: ArchivedHerdIndexEntry[] = [];
  const entries = await listDirEntries(archivesDir);
  for (const entry of entries) {
    if (
      entry.handle.kind === 'directory' ||
      entry.name === ARCHIVES_INDEX_FILE ||
      !entry.name.endsWith('.archive.zip')
    ) {
      continue;
    }
    try {
      const bytes = await readOpfsFileBytes(archivesDir, entry.name);
      if (!bytes) continue;
      const meta = extractArchiveIndexMetadataOnly(bytes, entry.name);
      rebuilt.push(meta);
    } catch {
      // Skip malformed entry safely
    }
  }
  rebuilt.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  if (rebuilt.length > 0) {
    try {
      await writeFileToOpfsDir(archivesDir, ARCHIVES_INDEX_FILE, JSON.stringify(rebuilt, null, 2));
    } catch {
      // Ignore index write failure
    }
  }
  return rebuilt;
}

async function writeArchivesIndex(
  archivesDir: OpfsDirectoryHandle,
  items: ArchivedHerdIndexEntry[]
): Promise<void> {
  const sorted = [...items].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  await writeFileToOpfsDir(archivesDir, ARCHIVES_INDEX_FILE, JSON.stringify(sorted, null, 2));
}

export async function saveOpfsHerdArchive(
  indexEntry: ArchivedHerdIndexEntry,
  zipBytes: Uint8Array
): Promise<ArchivedHerdIndexEntry | null> {
  return withOpfsNamespaceLock('archives', async () => {
    const archivesDir = await getOpfsSubdir('archives', true);
    if (!archivesDir) return null;

    await writeFileToOpfsDir(archivesDir, indexEntry.fileName, zipBytes);
    const existing = await readArchivesIndex(archivesDir);
    const next = [indexEntry, ...existing.filter((e) => e.archiveKey !== indexEntry.archiveKey)];
    await writeArchivesIndex(archivesDir, next);
    return indexEntry;
  });
}

export async function listOpfsHerdArchives(): Promise<ArchivedHerdIndexEntry[]> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return [];
  try {
    const items = await readArchivesIndex(archivesDir);
    return items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: 'Could not list OPFS /archives entries safely',
      error: err,
    });
    return [];
  }
}

export async function loadOpfsHerdArchive(
  archiveKey: string,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): Promise<{
  indexEntry: ArchivedHerdIndexEntry | null;
  unpacked: UnpackedArchivedHerdBundle;
  zipBytes: Uint8Array;
} | null> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return null;

  const items = await readArchivesIndex(archivesDir);
  const entry = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey) || null;
  const targetFile = entry?.fileName || `${archiveKey}.archive.zip`;

  const bytes = await readOpfsFileBytes(archivesDir, targetFile);
  if (!bytes) return null;

  const unpacked = unpackArchivedAnimalBundle(bytes, fallbackSettings);
  return { indexEntry: entry, unpacked, zipBytes: bytes };
}

export async function readOpfsHerdArchiveRawBytes(archiveKey: string): Promise<{
  fileName: string;
  bytes: Uint8Array;
} | null> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return null;
  const items = await readArchivesIndex(archivesDir);
  const entry = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey);
  const fileName = entry?.fileName || `${archiveKey}.archive.zip`;
  const bytes = await readOpfsFileBytes(archivesDir, fileName);
  if (!bytes) return null;
  return { fileName, bytes };
}

export async function readOpfsHerdArchiveBlob(archiveKey: string): Promise<{
  fileName: string;
  blob: Blob;
} | null> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return null;
  const items = await readArchivesIndex(archivesDir);
  const entry = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey);
  const fileName = entry?.fileName || `${archiveKey}.archive.zip`;
  try {
    const fh = await archivesDir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    return { fileName, blob: file };
  } catch {
    return null;
  }
}

export async function deleteOpfsHerdArchive(archiveKey: string): Promise<boolean> {
  return withOpfsNamespaceLock('archives', async () => {
    const archivesDir = await getOpfsSubdir('archives', false);
    if (!archivesDir) return false;
    const items = await readArchivesIndex(archivesDir);
    const target = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey);
    const removed = await removeOpfsEntrySafe(
      archivesDir,
      target?.fileName || `${archiveKey}.archive.zip`
    );
    const next = items.filter((i) => i.archiveKey !== archiveKey && i.fileName !== archiveKey);
    await writeArchivesIndex(archivesDir, next);
    return removed;
  });
}

// ---------------------------------------------------------------------------
// 4. Prior-Use Eviction Sentinel & Wiped Browser Storage Detection
// ---------------------------------------------------------------------------

export function readPriorUseSentinel(): PriorUseSentinel | null {
  const ls = getSafeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PRIOR_USE_SENTINEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PriorUseSentinel>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      barnName: String(parsed.barnName || 'My Barn'),
      animalCount: Number(parsed.animalCount) || 0,
      nonTestingCount: Number(parsed.nonTestingCount) || 0,
      lastSeenIso: String(parsed.lastSeenIso || ''),
    };
  } catch {
    return null;
  }
}

export function markPriorUseSentinelFromSnapshot(snapshot: BarnDatabaseSnapshot): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  const nonTestingCount = snapshot.animals.filter((a) => !isSampleTestingId(a.id)).length;
  const hasReal = hasNonTestingBarnData(snapshot) || Boolean(snapshot.settings.barnNameOnboarded);
  if (!hasReal && !readPriorUseSentinel()) {
    return;
  }
  try {
    const next: PriorUseSentinel = {
      barnName: snapshot.settings.barnName || 'My Barn',
      animalCount: snapshot.animals.length,
      nonTestingCount,
      lastSeenIso: nowIsoUtc(),
    };
    ls.setItem(PRIOR_USE_SENTINEL_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage quota failures
  }
}

export function clearPriorUseSentinel(): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(PRIOR_USE_SENTINEL_KEY);
  } catch {
    // Ignore
  }
}

export async function detectReturningUserWipedStorage(): Promise<WipedStorageRecoveryContext> {
  const sentinel = readPriorUseSentinel();
  const [backups, archives] = await Promise.all([
    listOpfsVaultBackups().catch(() => [] as VaultBackupMetadata[]),
    listOpfsHerdArchives().catch(() => [] as ArchivedHerdIndexEntry[]),
  ]);

  const latestOpfsBackup = backups.length > 0 ? backups[0] : null;
  if (backups.length > 0) {
    return {
      detected: true,
      reason: 'opfs_backups',
      sentinel,
      latestOpfsBackup,
      opfsBackupsCount: backups.length,
      opfsArchivesCount: archives.length,
    };
  }
  if (archives.length > 0) {
    return {
      detected: true,
      reason: 'opfs_archives',
      sentinel,
      latestOpfsBackup: null,
      opfsBackupsCount: 0,
      opfsArchivesCount: archives.length,
    };
  }
  if (sentinel && (sentinel.nonTestingCount > 0 || sentinel.animalCount > 0)) {
    return {
      detected: true,
      reason: 'sentinel',
      sentinel,
      latestOpfsBackup: null,
      opfsBackupsCount: 0,
      opfsArchivesCount: 0,
    };
  }
  return {
    detected: false,
    reason: 'none',
    sentinel: null,
    latestOpfsBackup: null,
    opfsBackupsCount: 0,
    opfsArchivesCount: 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Idle Background Export Canary (`/tmp/canary-probe.json`)
// ---------------------------------------------------------------------------

export function shouldRunExportCanary(nowMs: number = Date.now()): boolean {
  if (!isOpfsSupported()) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  const ls = getSafeLocalStorage();
  if (!ls) return true;
  try {
    const failRaw = ls.getItem(CANARY_LAST_FAIL_KEY);
    if (failRaw) {
      const failMs = Number(failRaw);
      if (Number.isFinite(failMs) && failMs > 0 && nowMs - failMs < CANARY_FAILURE_COOLDOWN_MS) {
        return false;
      }
    }
    const raw = ls.getItem(CANARY_LAST_RUN_KEY);
    if (!raw) return true;
    const prevMs = Number(raw);
    if (!Number.isFinite(prevMs) || prevMs <= 0) return true;
    return nowMs - prevMs >= EXPORT_CANARY_INTERVAL_MS;
  } catch {
    return true;
  }
}

function recordCanaryFailureTimestamp(): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(CANARY_LAST_FAIL_KEY, String(Date.now()));
  } catch {
    // Non-fatal
  }
}

export async function runOpfsExportCanary(
  snapshot: BarnDatabaseSnapshot
): Promise<{ ok: boolean; skipped?: boolean; skippedHeavyZip?: boolean; reason?: string }> {
  if (!isOpfsSupported()) {
    return { ok: true, skipped: true };
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return { ok: true, skipped: true };
  }

  const policy = resolveEffectiveStoragePolicy();
  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) {
    return { ok: true, skipped: true };
  }

  // Keep canary strictly to a lightweight metadata JSON probe (never compress heavy ZIP payloads
  // during background canary checks when policy.skipHeavyCanaryZip is active on Tier 1).
  const probe = buildExportCanaryProbe(snapshot);
  const serialized = JSON.stringify(probe);
  markTempOpfsFileActive(CANARY_PROBE_FILE);
  try {
    await writeFileToOpfsDir(tmpDir, CANARY_PROBE_FILE, serialized);
    const readBack = await readOpfsFileText(tmpDir, CANARY_PROBE_FILE);
    if (!readBack) {
      recordCanaryFailureTimestamp();
      return {
        ok: false,
        skippedHeavyZip: policy.skipHeavyCanaryZip,
        reason: 'OPFS canary probe could not be read back after writing.',
      };
    }
    const verified = verifyExportCanaryRoundTrip(probe, readBack);
    if (!verified.ok) {
      recordCanaryFailureTimestamp();
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Export canary verification failed: ${verified.reason || 'unknown mismatch'}`,
      });
      return { ok: false, skippedHeavyZip: policy.skipHeavyCanaryZip, reason: verified.reason };
    }

    const ls = getSafeLocalStorage();
    if (ls) {
      try {
        ls.setItem(CANARY_LAST_RUN_KEY, String(Date.now()));
        ls.removeItem(CANARY_LAST_FAIL_KEY);
      } catch {
        // Non-fatal
      }
    }
    return { ok: true, skippedHeavyZip: policy.skipHeavyCanaryZip };
  } catch (err) {
    recordCanaryFailureTimestamp();
    const reason = err instanceof Error ? err.message : 'OPFS canary probe write error';
    logDiagnosticEvent({
      level: 'warn',
      category: isQuotaExceededError(err) ? 'memory' : 'storage',
      message: `Export canary failed: ${reason}`,
      error: err,
    });
    return { ok: false, reason };
  } finally {
    unmarkTempOpfsFileActive(CANARY_PROBE_FILE);
    await removeOpfsEntrySafe(tmpDir, CANARY_PROBE_FILE);
  }
}

// ---------------------------------------------------------------------------
// 6. IndexedDB `VersionError` / Migration Failure Rescue Dump
// ---------------------------------------------------------------------------

const MAX_RAW_DUMP_BINARY_BYTES = 16 * 1024 * 1024;

function uint8ToBase64Compact(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

function sanitizeDumpBinaryField(val: unknown): unknown {
  if (val instanceof ArrayBuffer) {
    const view = new Uint8Array(val);
    return view.byteLength > MAX_RAW_DUMP_BINARY_BYTES
      ? { __binaryType: 'ArrayBuffer', byteLength: view.byteLength, omitted: true }
      : { __binaryType: 'ArrayBuffer', byteLength: view.byteLength, base64: uint8ToBase64Compact(view) };
  }
  if (ArrayBuffer.isView(val)) {
    const view = new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    const ctorName = val.constructor?.name || 'TypedArray';
    return view.byteLength > MAX_RAW_DUMP_BINARY_BYTES
      ? { __binaryType: ctorName, byteLength: view.byteLength, omitted: true }
      : { __binaryType: ctorName, byteLength: view.byteLength, base64: uint8ToBase64Compact(view) };
  }
  return val;
}

function sanitizeRawStoresForDump(
  stores: Record<string, unknown[]> | undefined
): Record<string, unknown[]> {
  if (!stores) return {};
  const cleaned: Record<string, unknown[]> = {};
  for (const [storeName, rows] of Object.entries(stores)) {
    if (!Array.isArray(rows)) continue;
    cleaned[storeName] = rows.map((row) => {
      if (row instanceof ArrayBuffer || ArrayBuffer.isView(row)) {
        return sanitizeDumpBinaryField(row);
      }
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        const nextRow: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
          nextRow[k] = sanitizeDumpBinaryField(v);
        }
        return nextRow;
      }
      return row;
    });
  }
  return cleaned;
}

/**
 * Dumps salvaged snapshot or raw IndexedDB object stores to OPFS `/backups/recovery-pre-reset-*.json`
 * when a schema migration or IndexedDB `VersionError` aborts before attempting any reset.
 */
export async function dumpRawRecordsToOpfsRecoveryBackup(params: {
  sourceDbName: string;
  reason: string;
  stores?: Record<string, unknown[]>;
  salvagedSnapshot?: BarnDatabaseSnapshot | null;
}): Promise<VaultBackupMetadata | null> {
  if (params.salvagedSnapshot) {
    try {
      return await saveOpfsVaultBackup(params.salvagedSnapshot, {
        kind: 'recovery_dump',
        note: `Auto-dumped before reset (${params.sourceDbName}): ${params.reason}`,
      });
    } catch {
      // Fall through to raw dump below
    }
  }

  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', true);
    if (!backupsDir) return null;

    const createdAtIso = nowIsoUtc();
    const stamp = compactStamp(createdAtIso);
    const fileName = `recovery-pre-reset-${stamp}-${generateUuid().slice(0, 6)}.json`;
    const payload = {
      format: 'community-pedigree-raw-recovery-dump',
      _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      vaultKind: 'recovery_dump' as VaultBackupKind,
      sourceDbName: params.sourceDbName,
      reason: params.reason,
      createdAtIso,
      createdByAppVersion: APP_SCHEMA_BUILD_TAG,
      stores: sanitizeRawStoresForDump(params.stores),
    };
    const jsonText = JSON.stringify(payload);

    try {
      await writeFileToOpfsDir(backupsDir, fileName, jsonText);
      const meta: VaultBackupMetadata = {
        key: fileName,
        fileName,
        kind: 'recovery_dump',
        schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
        createdAtIso,
        createdByAppVersion: APP_SCHEMA_BUILD_TAG,
        barnName: 'Raw Store Dump',
        animalCount: 0,
        photoCount: 0,
        speciesCount: 0,
        byteSize: measureUtf8ByteLength(jsonText),
        checksumSha256: sha256HexPure(jsonText),
        source: 'opfs',
        note: `Raw IndexedDB dump (${params.sourceDbName}): ${params.reason}`,
        compressed: false,
      };
      const existing = await readVaultIndex(backupsDir);
      const nextList = await enforceVaultRetention(backupsDir, [
        meta,
        ...existing.filter((i) => i.key !== meta.key),
      ]);
      await writeVaultIndex(backupsDir, nextList);
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Saved raw IndexedDB recovery dump "${fileName}" to OPFS /backups before reset (${params.reason})`,
      });
      return meta;
    } catch (err) {
      logDiagnosticEvent({
        level: 'error',
        category: 'storage',
        message: `Failed writing OPFS recovery dump for "${params.sourceDbName}"`,
        error: err,
      });
      return null;
    }
  });
}

/**
 * Attempts a version-less `indexedDB.open(dbName)` (opening at whatever disk version exists)
 * to extract surviving object store contents into OPFS `/backups/recovery-pre-reset-*.json`
 * when a `VersionError` or `onupgradeneeded` failure happens.
 */
export async function dumpIndexedDbDatabaseToOpfs(
  dbName: string,
  reason: string
): Promise<VaultBackupMetadata | null> {
  const idb = getSafeIndexedDb();
  if (!idb) return null;

  let rescuedDb: IDBDatabase | null = null;
  let untrackDb: (() => void) | null = null;
  try {
    rescuedDb = await new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Rescue IndexedDB open timed out'));
      }, 4000);
      try {
        const req = idb.open(dbName);
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
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(req.error || new Error('Rescue IndexedDB open failed'));
        };
      } catch (openErr) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(openErr);
        }
      }
    });
    untrackDb = trackActiveIdbConnection(rescuedDb);

    const storeNames = Array.from(rescuedDb.objectStoreNames);
    const dumpedStores: Record<string, unknown[]> = {};
    let salvagedSnapshot: BarnDatabaseSnapshot | null = null;

    if (storeNames.length > 0) {
      await new Promise<void>((resolve) => {
        try {
          const tx = rescuedDb!.transaction(storeNames, 'readonly');
          const untrackTx = trackActiveIdbTransaction(tx);
          let pending = storeNames.length;
          for (const storeName of storeNames) {
            const store = tx.objectStore(storeName);
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              const rows = Array.isArray(getAllReq.result) ? getAllReq.result : [];
              dumpedStores[storeName] = rows;
              for (const row of rows) {
                if (
                  row &&
                  typeof row === 'object' &&
                  Array.isArray((row as BarnDatabaseSnapshot).animals) &&
                  Array.isArray((row as BarnDatabaseSnapshot).speciesProfiles)
                ) {
                  salvagedSnapshot = row as BarnDatabaseSnapshot;
                } else if (
                  row &&
                  typeof row === 'object' &&
                  (row as { snapshot?: BarnDatabaseSnapshot }).snapshot &&
                  Array.isArray((row as { snapshot: BarnDatabaseSnapshot }).snapshot.animals)
                ) {
                  salvagedSnapshot = (row as { snapshot: BarnDatabaseSnapshot }).snapshot;
                }
              }
              pending--;
              if (pending === 0) {
                untrackTx();
                resolve();
              }
            };
            getAllReq.onerror = () => {
              pending--;
              if (pending === 0) {
                untrackTx();
                resolve();
              }
            };
          }
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
        } catch {
          resolve();
        }
      });
    }

    return await dumpRawRecordsToOpfsRecoveryBackup({
      sourceDbName: dbName,
      reason,
      stores: dumpedStores,
      salvagedSnapshot,
    });
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: `Could not salvage object stores from "${dbName}" before reset`,
      error: err,
    });
    return null;
  } finally {
    untrackDb?.();
    if (rescuedDb) {
      try {
        rescuedDb.close();
      } catch {
        // Ignore
      }
    }
  }
}

export function isVersionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  return e.name === 'VersionError' || /version/i.test(String(e.message || ''));
}
```

## `src/storage/opfsTempStream.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Worker-Safe OPFS `/tmp` Scratchpad & Incremental Chunk Streamer (`src/storage/opfsTempStream.ts`).
 *
 * Intentionally free of React, DOM, `localSyncChannels`, and `offThreadWorkerClient` imports
 * so Dedicated Web Workers (`archiveAndImport.worker.ts`) can stream large `.ZIP` chunks
 * straight to OPFS `/tmp` without pulling UI dependencies into the worker bundle.
 */

import { generateUuid } from '../core/models';
import { readBlobAsArrayBuffer, readBlobAsText } from '../utils/es2018Shims';
import { getSafeStorageManager } from './storageProbes';

export type OpfsNamespace = 'tmp' | 'backups' | 'archives';

export interface OpfsWritableStream {
  write(data: string | Uint8Array | ArrayBuffer | Blob): Promise<void>;
  close(): void | Promise<void>;
  flush?: () => void | Promise<void>;
  truncate?: (size: number) => void | Promise<void>;
}

export interface OpfsSyncAccessHandle {
  write(buffer: ArrayBuffer | ArrayBufferView, options?: { at?: number }): number;
  flush(): void | Promise<void>;
  getSize(): number | Promise<number>;
  truncate(newSize: number): void | Promise<void>;
  close(): void | Promise<void>;
}

export type OpfsCloseableHandle = OpfsWritableStream | OpfsSyncAccessHandle;

export interface OpfsFileHandle {
  kind?: 'file';
  name: string;
  getFile(): Promise<File | Blob>;
  createWritable?: () => Promise<OpfsWritableStream>;
  createSyncAccessHandle?: () => Promise<OpfsSyncAccessHandle>;
}

export interface OpfsDirectoryHandle {
  kind?: 'directory';
  name?: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries?: () => AsyncIterable<[string, OpfsFileHandle | OpfsDirectoryHandle]>;
  values?: () => AsyncIterable<OpfsFileHandle | OpfsDirectoryHandle>;
}

export interface StreamedOpfsTempFileResult<T = void> {
  fileName: string;
  byteSize: number;
  blob: Blob;
  meta: T;
}

export type OpfsDiagnosticLogger = (event: {
  level: 'info' | 'warn' | 'error';
  category: 'storage' | 'memory';
  message: string;
  error?: unknown;
}) => void;

const TEMP_WRITE_CHUNK_BYTES = 256 * 1024;
const TEMP_TEXT_SLICE_CHARS = 128 * 1024;

const activeTempFiles = new Set<string>();
const activeOpfsHandles = new Set<OpfsCloseableHandle>();
const closedOpfsHandles = new WeakSet<object>();
let blockedStorageManagers = new WeakSet<object>();
let testRootResolver: (() => Promise<OpfsDirectoryHandle | null>) | null = null;
let diagnosticLogger: OpfsDiagnosticLogger | null = null;

export function registerOpfsDiagnosticLogger(logger: OpfsDiagnosticLogger | null): void {
  diagnosticLogger = logger;
}

function emitOpfsLog(event: {
  level: 'info' | 'warn' | 'error';
  category: 'storage' | 'memory';
  message: string;
  error?: unknown;
}): void {
  diagnosticLogger?.(event);
}

export function isOpfsQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    (typeof e.message === 'string' && /quota/i.test(e.message))
  );
}

/**
 * Safely awaits `handle.close()` across both modern synchronous returns (`void`)
 * and legacy Promise returns (Safari 15.2–16.3), preventing double-close errors.
 */
export async function safeAwaitOpfsClose(handle: OpfsCloseableHandle | null | undefined): Promise<void> {
  if (!handle) return;
  activeOpfsHandles.delete(handle);
  if (typeof handle === 'object' && closedOpfsHandles.has(handle)) {
    return;
  }
  if (typeof handle === 'object') {
    closedOpfsHandles.add(handle);
  }
  if (typeof handle.close === 'function') {
    await Promise.resolve(handle.close());
  }
}

/**
 * Safely awaits `handle.flush()` across synchronous (`void`) and legacy Promise returns.
 */
export async function safeAwaitOpfsFlush(
  handle: { flush?: () => void | Promise<void> } | null | undefined
): Promise<void> {
  if (!handle || typeof handle.flush !== 'function') return;
  await Promise.resolve(handle.flush());
}

/**
 * Safely awaits `handle.getSize()` across synchronous (`number`) and legacy Promise returns (Safari 15.2–16.3).
 */
export async function safeAwaitOpfsGetSize(
  handle: { getSize?: () => number | Promise<number> } | null | undefined
): Promise<number> {
  if (!handle || typeof handle.getSize !== 'function') return 0;
  const size = await Promise.resolve(handle.getSize());
  return Number.isFinite(Number(size)) ? Number(size) : 0;
}

/**
 * Safely awaits `handle.truncate(newSize)` across synchronous (`void`) and legacy Promise returns (Safari 15.2–16.3).
 */
export async function safeAwaitOpfsTruncate(
  handle: { truncate?: (newSize: number) => void | Promise<void> } | null | undefined,
  newSize: number
): Promise<void> {
  if (!handle || typeof handle.truncate !== 'function') return;
  await Promise.resolve(handle.truncate(newSize));
}

export function trackActiveOpfsHandle<T extends OpfsCloseableHandle>(handle: T): () => void {
  activeOpfsHandles.add(handle);
  return () => {
    activeOpfsHandles.delete(handle);
  };
}

/**
 * Closes any currently tracked open OPFS writable or sync handles cleanly on `pagehide`
 * or `visibilitychange` (`hidden`) to protect bfcache and avoid stale locks.
 */
export async function releaseActiveOpfsHandles(): Promise<number> {
  const handles = Array.from(activeOpfsHandles);
  let released = 0;
  for (const handle of handles) {
    try {
      await safeAwaitOpfsClose(handle);
      released++;
    } catch {
      // Ignore release failures on already-closed or invalidated handles
    }
  }
  return released;
}

export function getActiveOpfsHandleCountForTests(): number {
  return activeOpfsHandles.size;
}

export function markTempOpfsFileActive(fileName: string): void {
  if (fileName) activeTempFiles.add(fileName);
}

export function unmarkTempOpfsFileActive(fileName: string): void {
  if (fileName) activeTempFiles.delete(fileName);
}

export function isTempOpfsFileActive(fileName: string): boolean {
  return Boolean(fileName && activeTempFiles.has(fileName));
}

export function resetOpfsProbesForTests(): void {
  blockedStorageManagers = new WeakSet<object>();
  activeOpfsHandles.clear();
  activeTempFiles.clear();
}

/**
 * Allows deterministic unit tests to inject an in-memory OPFS root handle mock.
 * Pass `null` to restore native browser `navigator.storage.getDirectory()`.
 */
export function setOpfsRootResolverForTest(
  resolver: (() => Promise<OpfsDirectoryHandle | null>) | null
): void {
  testRootResolver = resolver;
  if (!resolver) {
    activeTempFiles.clear();
    activeOpfsHandles.clear();
  }
}

export function isOpfsSupported(): boolean {
  if (testRootResolver) return true;
  const storage = getSafeStorageManager();
  if (!storage) return false;
  if (blockedStorageManagers.has(storage)) return false;
  try {
    return typeof storage.getDirectory === 'function';
  } catch {
    return false;
  }
}

export async function probeOpfsRuntime(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  if (testRootResolver) {
    try {
      const root = await testRootResolver();
      return { supported: Boolean(root) };
    } catch (err) {
      return { supported: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
  const storage = getSafeStorageManager();
  if (!storage || typeof storage.getDirectory !== 'function') {
    return { supported: false, reason: 'navigator.storage.getDirectory is unavailable' };
  }
  try {
    const root = (await storage.getDirectory()) as OpfsDirectoryHandle | null;
    if (!root) {
      blockedStorageManagers.add(storage);
      return { supported: false, reason: 'OPFS root directory returned null' };
    }
    return { supported: true };
  } catch (err) {
    blockedStorageManagers.add(storage);
    return { supported: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function getOpfsRoot(): Promise<OpfsDirectoryHandle | null> {
  if (testRootResolver) {
    try {
      return await testRootResolver();
    } catch (err) {
      emitOpfsLog({
        level: 'warn',
        category: 'storage',
        message: 'OPFS root resolver rejected — using fallback storage',
        error: err,
      });
      return null;
    }
  }
  const storage = getSafeStorageManager();
  if (!storage) return null;
  if (blockedStorageManagers.has(storage)) return null;
  let getDirFn: (() => Promise<unknown>) | undefined;
  try {
    getDirFn = typeof storage.getDirectory === 'function' ? storage.getDirectory : undefined;
  } catch {
    blockedStorageManagers.add(storage);
    return null;
  }
  if (!getDirFn) {
    return null;
  }
  try {
    return (await getDirFn.call(storage)) as unknown as OpfsDirectoryHandle;
  } catch (err) {
    blockedStorageManagers.add(storage);
    emitOpfsLog({
      level: 'warn',
      category: 'storage',
      message: 'Could not open Origin Private File System root directory — using fallback storage',
      error: err,
    });
    return null;
  }
}

export async function getOpfsSubdir(
  namespace: OpfsNamespace,
  create = true
): Promise<OpfsDirectoryHandle | null> {
  const root = await getOpfsRoot();
  if (!root) return null;
  try {
    return await root.getDirectoryHandle(namespace, { create });
  } catch {
    return null;
  }
}

export async function listDirEntries(
  dir: OpfsDirectoryHandle
): Promise<Array<{ name: string; handle: OpfsFileHandle | OpfsDirectoryHandle }>> {
  const results: Array<{ name: string; handle: OpfsFileHandle | OpfsDirectoryHandle }> = [];
  if (typeof dir.entries === 'function') {
    for await (const [name, handle] of dir.entries()) {
      results.push({ name, handle });
    }
    return results;
  }
  if (typeof dir.values === 'function') {
    for await (const handle of dir.values()) {
      if (handle && typeof handle.name === 'string') {
        results.push({ name: handle.name, handle });
      }
    }
  }
  return results;
}

export async function readOpfsFileText(
  dir: OpfsDirectoryHandle,
  fileName: string
): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    return await readBlobAsText(file);
  } catch {
    return null;
  }
}

export async function readOpfsFileBytes(
  dir: OpfsDirectoryHandle,
  fileName: string
): Promise<Uint8Array | null> {
  try {
    const fh = await dir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    const buf = await readBlobAsArrayBuffer(file);
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function removeOpfsEntrySafe(dir: OpfsDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.removeEntry(name);
    return true;
  } catch {
    return false;
  }
}

function sliceUtf16Safe(
  text: string,
  start: number,
  maxChars: number
): { slice: string; nextOffset: number } {
  let end = Math.min(text.length, start + maxChars);
  if (end < text.length && end > start) {
    const lastCode = text.charCodeAt(end - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      end = Math.min(text.length, end + 1);
    }
  }
  return { slice: text.slice(start, end), nextOffset: end };
}

async function writeChunkedDataToWritable(
  writable: OpfsWritableStream,
  data: string | Uint8Array | Blob
): Promise<void> {
  if (typeof data === 'string') {
    if (data.length <= TEMP_TEXT_SLICE_CHARS) {
      await writable.write(data);
      return;
    }
    let offset = 0;
    while (offset < data.length) {
      const { slice, nextOffset } = sliceUtf16Safe(data, offset, TEMP_TEXT_SLICE_CHARS);
      if (slice.length > 0) {
        await writable.write(slice);
      }
      offset = nextOffset;
    }
    return;
  }

  if (data instanceof Uint8Array) {
    if (data.byteLength <= TEMP_WRITE_CHUNK_BYTES) {
      await writable.write(data);
      return;
    }
    for (let offset = 0; offset < data.byteLength; offset += TEMP_WRITE_CHUNK_BYTES) {
      const slice = data.subarray(offset, Math.min(data.byteLength, offset + TEMP_WRITE_CHUNK_BYTES));
      await writable.write(slice);
    }
    return;
  }

  await writable.write(data);
}

async function chunkDataToUint8Arrays(data: string | Uint8Array | Blob): Promise<Uint8Array[]> {
  if (typeof data === 'string') {
    if (data.length === 0) return [];
    const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
    const chunks: Uint8Array[] = [];
    let offset = 0;
    while (offset < data.length) {
      const { slice, nextOffset } = sliceUtf16Safe(data, offset, TEMP_TEXT_SLICE_CHARS);
      if (slice.length > 0) {
        if (encoder) {
          chunks.push(encoder.encode(slice));
        } else {
          const buf = await readBlobAsArrayBuffer(new Blob([slice]));
          chunks.push(new Uint8Array(buf));
        }
      }
      offset = nextOffset;
    }
    return chunks;
  }

  if (data instanceof Uint8Array) {
    if (data.byteLength <= TEMP_WRITE_CHUNK_BYTES) return [data];
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < data.byteLength; offset += TEMP_WRITE_CHUNK_BYTES) {
      chunks.push(
        data.subarray(offset, Math.min(data.byteLength, offset + TEMP_WRITE_CHUNK_BYTES))
      );
    }
    return chunks;
  }

  const buf = await readBlobAsArrayBuffer(data);
  const bytes = new Uint8Array(buf);
  return chunkDataToUint8Arrays(bytes);
}

async function openOpfsHandleSink(fh: OpfsFileHandle): Promise<{
  handle: OpfsCloseableHandle;
  writeChunk: (chunk: string | Uint8Array | Blob) => Promise<void>;
  flushAndSize: () => Promise<number | null>;
}> {
  if (typeof fh.createWritable === 'function') {
    const writable = await fh.createWritable();
    trackActiveOpfsHandle(writable);
    return {
      handle: writable,
      writeChunk: (chunk) => writeChunkedDataToWritable(writable, chunk),
      flushAndSize: async () => {
        await safeAwaitOpfsFlush(writable);
        return null;
      },
    };
  }

  if (typeof fh.createSyncAccessHandle === 'function') {
    // Standard Worker OPFS access (no Chromium-only { mode: 'readwrite-unsafe' })
    const syncHandle = await fh.createSyncAccessHandle();
    trackActiveOpfsHandle(syncHandle);
    await safeAwaitOpfsTruncate(syncHandle, 0);
    let cursor = 0;
    return {
      handle: syncHandle,
      writeChunk: async (chunk) => {
        const byteSlices = await chunkDataToUint8Arrays(chunk);
        for (const slice of byteSlices) {
          if (slice.byteLength === 0) continue;
          const written = syncHandle.write(slice, { at: cursor });
          cursor += Number(written) > 0 ? Number(written) : slice.byteLength;
        }
      },
      flushAndSize: async () => {
        await safeAwaitOpfsFlush(syncHandle);
        return safeAwaitOpfsGetSize(syncHandle);
      },
    };
  }

  throw new Error('OPFS file handle supports neither createWritable nor createSyncAccessHandle.');
}

/**
 * Writes payload to a file inside `dir`, guaranteeing handle flush + close inside `try / finally`
 * across both `FileSystemWritableFileStream` and Safari 15.2–16.3 worker `FileSystemSyncAccessHandle`.
 * If `QuotaExceededError` occurs, purges `/tmp` and retries the write once cleanly.
 */
export async function writeFileToOpfsDir(
  dir: OpfsDirectoryHandle,
  fileName: string,
  data: string | Uint8Array | Blob
): Promise<void> {
  const runWrite = async () => {
    const fh = await dir.getFileHandle(fileName, { create: true });
    const sink = await openOpfsHandleSink(fh);
    let bodySucceeded = false;
    try {
      await sink.writeChunk(data);
      await sink.flushAndSize();
      bodySucceeded = true;
    } finally {
      if (bodySucceeded) {
        await safeAwaitOpfsClose(sink.handle);
      } else {
        try {
          await safeAwaitOpfsClose(sink.handle);
        } catch {
          // Preserve primary write error so QuotaExceededError recovery runs cleanly
        }
      }
    }
  };

  try {
    await runWrite();
  } catch (err) {
    if (isOpfsQuotaError(err)) {
      const purged = await purgeOpfsTmp();
      emitOpfsLog({
        level: 'warn',
        category: 'memory',
        message: `Corrective action: QuotaExceededError during OPFS write "${fileName}" — purged ${purged.filesRemoved} /tmp file(s) and retrying once`,
        error: err,
      });
      await runWrite();
      return;
    }
    throw err;
  }
}

export async function purgeOpfsTmp(options: { includeActive?: boolean } = {}): Promise<{
  filesRemoved: number;
  bytesFreed: number;
}> {
  const includeActive = Boolean(options.includeActive);
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return { filesRemoved: 0, bytesFreed: 0 };

  let filesRemoved = 0;
  let bytesFreed = 0;
  try {
    const entries = await listDirEntries(tmpDir);
    for (const item of entries) {
      if (item.handle.kind === 'directory') continue;
      if (!includeActive && activeTempFiles.has(item.name)) continue;
      try {
        const file = await (item.handle as OpfsFileHandle).getFile();
        bytesFreed += Number(file.size) || 0;
      } catch {
        // Ignore size inspect failure
      }
      if (await removeOpfsEntrySafe(tmpDir, item.name)) {
        filesRemoved++;
      }
    }
  } catch {
    // Non-fatal purge failure
  }
  return { filesRemoved, bytesFreed };
}

export async function sweepOrphanedOpfsTmpOnBoot(): Promise<{
  filesRemoved: number;
  bytesFreed: number;
}> {
  const res = await purgeOpfsTmp({ includeActive: false });
  if (res.filesRemoved > 0) {
    emitOpfsLog({
      level: 'info',
      category: 'storage',
      message: `Corrective action: Boot orphan sweep removed ${res.filesRemoved} stale /tmp OPFS file(s) (${res.bytesFreed} bytes reclaimed)`,
    });
  }
  return res;
}

function buildTempOpfsFileName(prefix: string, extension: string): string {
  const cleanPrefix = (prefix || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 32);
  const cleanExt = (extension || 'tmp').replace(/[^a-z0-9]/gi, '') || 'tmp';
  return `${cleanPrefix}-${Date.now().toString(36)}-${generateUuid().slice(0, 8)}.${cleanExt}`;
}

/**
 * Streams incremental chunks directly into an OPFS `/tmp` file handle without materializing
 * full-export string or `Uint8Array` buffers in JS heap beforehand. Guarantees `safeAwaitOpfsClose()`
 * inside `try/finally`, cleans up partial files on abort, and recovers from `QuotaExceededError` once.
 */
export async function writeTempOpfsFileStreamed<T = void>(
  prefix: string,
  extension: string,
  produceChunks: (
    writeChunk: (chunk: string | Uint8Array | Blob) => Promise<void>
  ) => Promise<T>,
  options?: { keepActiveAfterWrite?: boolean }
): Promise<StreamedOpfsTempFileResult<T> | null> {
  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) return null;

  const fileName = buildTempOpfsFileName(prefix, extension);
  markTempOpfsFileActive(fileName);
  let writeSucceeded = false;

  const runAttempt = async (): Promise<StreamedOpfsTempFileResult<T>> => {
    const fh = await tmpDir.getFileHandle(fileName, { create: true });
    const sink = await openOpfsHandleSink(fh);
    let bodySucceeded = false;
    let meta: T;
    let flushedSize: number | null = null;
    try {
      meta = await produceChunks(async (chunk) => {
        if (typeof chunk === 'string' && chunk.length === 0) return;
        if (chunk instanceof Uint8Array && chunk.byteLength === 0) return;
        await sink.writeChunk(chunk);
      });
      flushedSize = await sink.flushAndSize();
      bodySucceeded = true;
    } finally {
      if (bodySucceeded) {
        await safeAwaitOpfsClose(sink.handle);
      } else {
        try {
          await safeAwaitOpfsClose(sink.handle);
        } catch {
          // Preserve primary write error so QuotaExceededError recovery triggers cleanly
        }
      }
    }
    const file = await fh.getFile();
    return {
      fileName,
      byteSize: Number(file.size) || flushedSize || 0,
      blob: file,
      meta,
    };
  };

  try {
    let result: StreamedOpfsTempFileResult<T>;
    try {
      result = await runAttempt();
    } catch (err) {
      if (isOpfsQuotaError(err)) {
        await removeOpfsEntrySafe(tmpDir, fileName);
        const purged = await purgeOpfsTmp({ includeActive: false });
        emitOpfsLog({
          level: 'warn',
          category: 'memory',
          message: `Corrective action: QuotaExceededError during streamed OPFS export "${fileName}" — purged ${purged.filesRemoved} /tmp file(s) and retrying once`,
          error: err,
        });
        result = await runAttempt();
      } else {
        throw err;
      }
    }
    writeSucceeded = true;
    return result;
  } finally {
    if (!writeSucceeded) {
      unmarkTempOpfsFileActive(fileName);
      await removeOpfsEntrySafe(tmpDir, fileName);
    } else if (!options?.keepActiveAfterWrite) {
      unmarkTempOpfsFileActive(fileName);
    }
  }
}

export async function writeTempOpfsFile(
  prefix: string,
  data: string | Uint8Array | Blob,
  extension = 'tmp',
  options?: { keepActiveAfterWrite?: boolean }
): Promise<{ fileName: string } | null> {
  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) return null;
  const fileName = buildTempOpfsFileName(prefix, extension);
  markTempOpfsFileActive(fileName);
  let writeSucceeded = false;
  try {
    await writeFileToOpfsDir(tmpDir, fileName, data);
    writeSucceeded = true;
    return { fileName };
  } finally {
    if (!writeSucceeded || !options?.keepActiveAfterWrite) {
      unmarkTempOpfsFileActive(fileName);
    }
  }
}

export async function readTempOpfsFileAsBlob(fileName: string): Promise<Blob | null> {
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return null;
  try {
    const fh = await tmpDir.getFileHandle(fileName, { create: false });
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function removeTempOpfsFile(fileName: string): Promise<void> {
  unmarkTempOpfsFileActive(fileName);
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return;
  await removeOpfsEntrySafe(tmpDir, fileName);
}
```

## `src/storage/p2pLanChannel.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Serverless LAN / Peer-to-Peer WebRTC DataChannel & Folder Sync Bridge (`src/storage/p2pLanChannel.ts`).
 *
 * Enables two devices on the same local Wi-Fi / LAN (with ZERO cloud servers or signaling relays)
 * to pair via single-line `CP-LAN1:...` SDP offer/answer codes and exchange `SyncOperation[]`
 * outbox logs directly over an ordered `RTCDataChannel`.
 */

import { nowIsoUtc } from '../core/models';
import {
  decodeP2pSignalToken,
  encodeP2pSignalToken,
  P2pWireMessage,
  parseP2pWireOrDeltaPayload,
} from '../core/p2pSyncProtocol';
import { SyncOperation } from '../core/syncOutbox';
import {
  resumePersistedDirectorySyncIfGranted,
  syncWithPickedDirectory,
} from './localSyncChannels';

export type LanP2pSessionState =
  | 'idle'
  | 'creating_offer'
  | 'awaiting_answer'
  | 'creating_answer'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error';

export interface LanP2pSessionController {
  getState: () => LanP2pSessionState;
  createOfferToken: () => Promise<string>;
  acceptOfferAndCreateAnswerToken: (offerToken: string) => Promise<string>;
  completeHandshakeWithAnswer: (answerToken: string) => Promise<void>;
  sendWireMessage: (message: P2pWireMessage) => void;
  close: () => void;
}

const DATA_CHANNEL_LABEL = 'community-pedigree-sync';
const ICE_GATHER_TIMEOUT_MS = 2200;
const CHUNK_SIZE_CHARS = 16384;

interface ChunkFrame {
  kind: 'cp-lan-chunk-v1';
  transferId: string;
  index: number;
  total: number;
  data: string;
}

export function supportsLanWebRtcP2p(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

function waitForIceGathering(pc: RTCPeerConnection, signalClosed: () => boolean): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      pc.removeEventListener('icecandidate', onCandidate);
      resolve();
    };

    const onStateChange = () => {
      if (signalClosed() || pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (signalClosed() || ev.candidate === null) {
        finish();
      }
    };

    pc.addEventListener('icegatheringstatechange', onStateChange);
    pc.addEventListener('icecandidate', onCandidate);
    timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
  });
}

/**
 * Creates a clean, self-contained serverless WebRTC DataChannel session controller.
 * Configured with `iceServers: []` so all ICE candidates stay strictly on the local LAN/device.
 */
export function createLanP2pSession(options: {
  deviceId: string;
  onDeltaOperations: (ops: SyncOperation[], senderDeviceId: string) => void;
  onAckReceived?: (ack: Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }>) => void;
  onStateChange?: (state: LanP2pSessionState, detail?: string) => void;
  onError?: (message: string) => void;
}): LanP2pSessionController {
  let state: LanP2pSessionState = 'idle';
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let closed = false;
  const incomingChunkMap = new Map<string, { parts: string[]; received: number; total: number }>();

  const setState = (next: LanP2pSessionState, detail?: string) => {
    if (closed && next !== 'closed') return;
    state = next;
    options.onStateChange?.(next, detail);
  };

  const fail = (msg: string) => {
    setState('error', msg);
    options.onError?.(msg);
  };

  const handleCompleteTextPayload = (rawText: string) => {
    try {
      const parsed = parseP2pWireOrDeltaPayload(rawText);
      if (parsed.messageKind === 'ack' && parsed.ack) {
        options.onAckReceived?.(parsed.ack);
        return;
      }
      options.onDeltaOperations(parsed.operations, parsed.senderDeviceId);
    } catch (err) {
      options.onError?.(err instanceof Error ? err.message : 'Invalid incoming LAN sync message.');
    }
  };

  const attachDataChannel = (channel: RTCDataChannel) => {
    dc = channel;
    channel.onopen = () => {
      setState('connected', `Peer link open (${channel.label})`);
    };
    channel.onclose = () => {
      if (!closed) {
        setState('closed', 'Peer disconnected');
      }
    };
    channel.onerror = () => {
      if (!closed) {
        fail('WebRTC DataChannel transport error.');
      }
    };
    channel.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      const text = ev.data;
      if (text.includes('"cp-lan-chunk-v1"')) {
        try {
          const frame = JSON.parse(text) as Partial<ChunkFrame>;
          if (
            frame.kind === 'cp-lan-chunk-v1' &&
            typeof frame.transferId === 'string' &&
            typeof frame.index === 'number' &&
            typeof frame.total === 'number' &&
            typeof frame.data === 'string' &&
            frame.total > 0 &&
            frame.total <= 2048 &&
            frame.index >= 0 &&
            frame.index < frame.total
          ) {
            let bucket = incomingChunkMap.get(frame.transferId);
            if (!bucket) {
              bucket = {
                parts: new Array<string>(frame.total),
                received: 0,
                total: frame.total,
              };
              incomingChunkMap.set(frame.transferId, bucket);
            }
            if (bucket.parts[frame.index] === undefined) {
              bucket.parts[frame.index] = frame.data;
              bucket.received += 1;
            }
            if (bucket.received === bucket.total) {
              incomingChunkMap.delete(frame.transferId);
              handleCompleteTextPayload(bucket.parts.join(''));
            }
            return;
          }
        } catch {
          // Fall through to normal parser
        }
      }
      handleCompleteTextPayload(text);
    };
  };

  const ensurePeerConnection = () => {
    if (!supportsLanWebRtcP2p()) {
      throw new Error('WebRTC DataChannel is not supported in this browser. Use LAN Folder Sync or Delta JSON instead.');
    }
    if (pc) {
      try {
        pc.close();
      } catch {
        // Ignore cleanup error
      }
    }
    closed = false;
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.onconnectionstatechange = () => {
      if (!pc || closed) return;
      if (pc.connectionState === 'connected') {
        if (dc?.readyState === 'open') {
          setState('connected');
        }
      } else if (pc.connectionState === 'failed') {
        fail('LAN peer connection failed. Verify both devices are on the same Wi-Fi/LAN.');
      } else if (pc.connectionState === 'closed') {
        setState('closed');
      }
    };
    pc.ondatachannel = (ev) => {
      attachDataChannel(ev.channel);
    };
    return pc;
  };

  return {
    getState: () => state,

    createOfferToken: async () => {
      const conn = ensurePeerConnection();
      setState('creating_offer');
      const channel = conn.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
      attachDataChannel(channel);

      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      await waitForIceGathering(conn, () => closed);

      const localSdp = conn.localDescription?.sdp || offer.sdp || '';
      if (!localSdp) {
        throw new Error('Failed to generate local WebRTC offer SDP.');
      }
      setState('awaiting_answer');
      return encodeP2pSignalToken({
        v: 1,
        type: 'offer',
        deviceId: options.deviceId,
        sdp: localSdp,
        createdAtIso: nowIsoUtc(),
      });
    },

    acceptOfferAndCreateAnswerToken: async (offerToken: string) => {
      const env = decodeP2pSignalToken(offerToken);
      if (env.type !== 'offer') {
        throw new Error('Expected a peer Offer code (`CP-LAN1:...`) from the initiating device.');
      }
      const conn = ensurePeerConnection();
      setState('creating_answer');
      await conn.setRemoteDescription({ type: 'offer', sdp: env.sdp });
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      await waitForIceGathering(conn, () => closed);

      const localSdp = conn.localDescription?.sdp || answer.sdp || '';
      if (!localSdp) {
        throw new Error('Failed to generate local WebRTC answer SDP.');
      }
      setState('connecting', `Connecting to ${env.deviceId}...`);
      return encodeP2pSignalToken({
        v: 1,
        type: 'answer',
        deviceId: options.deviceId,
        sdp: localSdp,
        createdAtIso: nowIsoUtc(),
      });
    },

    completeHandshakeWithAnswer: async (answerToken: string) => {
      if (!pc) {
        throw new Error('Create a LAN Offer code first before applying a peer Answer code.');
      }
      const env = decodeP2pSignalToken(answerToken);
      if (env.type !== 'answer') {
        throw new Error('Expected a peer Answer code (`CP-LAN1:...`) from the joining device.');
      }
      setState('connecting', `Connecting to ${env.deviceId}...`);
      await pc.setRemoteDescription({ type: 'answer', sdp: env.sdp });
    },

    sendWireMessage: (message: P2pWireMessage) => {
      if (!dc || dc.readyState !== 'open') {
        throw new Error('LAN DataChannel is not open yet. Complete pairing first.');
      }
      const serialized = JSON.stringify(message);
      if (serialized.length <= CHUNK_SIZE_CHARS) {
        dc.send(serialized);
        return;
      }
      const total = Math.ceil(serialized.length / CHUNK_SIZE_CHARS);
      const transferId = `${options.deviceId}-${Date.now().toString(36)}`;
      for (let i = 0; i < total; i++) {
        const chunk: ChunkFrame = {
          kind: 'cp-lan-chunk-v1',
          transferId,
          index: i,
          total,
          data: serialized.slice(i * CHUNK_SIZE_CHARS, (i + 1) * CHUNK_SIZE_CHARS),
        };
        dc.send(JSON.stringify(chunk));
      }
    },

    close: () => {
      closed = true;
      incomingChunkMap.clear();
      if (dc) {
        try {
          dc.onopen = null;
          dc.onclose = null;
          dc.onerror = null;
          dc.onmessage = null;
          dc.close();
        } catch {
          // Ignore close error
        }
        dc = null;
      }
      if (pc) {
        try {
          pc.onconnectionstatechange = null;
          pc.ondatachannel = null;
          pc.close();
        } catch {
          // Ignore close error
        }
        pc = null;
      }
      state = 'closed';
      options.onStateChange?.('closed');
    },
  };
}

/**
 * Reconciles delta outbox files using a persisted or freshly picked LAN / SyncThing folder.
 */
export async function reconcileWithPickedSyncFolder(params: {
  deviceId: string;
  localOperations: SyncOperation[];
  masterBackupJson: string;
  passphrase?: string;
}): Promise<{
  folderName: string;
  peerFilesRead: number;
  incomingOps: SyncOperation[];
  encryptedPeersSkipped: number;
  wroteEncrypted: boolean;
}> {
  const resumed = await resumePersistedDirectorySyncIfGranted({
    deviceId: params.deviceId,
    localOperations: params.localOperations,
    masterBackupJson: params.masterBackupJson,
    passphrase: params.passphrase,
  });
  if (resumed.resumed) {
    return {
      folderName: resumed.folderName,
      peerFilesRead: resumed.peerFilesRead,
      incomingOps: resumed.incomingOps,
      encryptedPeersSkipped: resumed.encryptedPeersSkipped,
      wroteEncrypted: resumed.wroteEncrypted,
    };
  }
  return syncWithPickedDirectory({
    deviceId: params.deviceId,
    localOperations: params.localOperations,
    masterBackupJson: params.masterBackupJson,
    passphrase: params.passphrase,
  });
}
```

## `src/storage/passphraseCrypto.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Web Crypto Passphrase Encryption & Decryption (PBKDF2-SHA256 + AES-256-GCM)
 * (`src/storage/passphraseCrypto.ts`).
 *
 * Strictly zero key persistence: passphrases stay in memory only for the current
 * export/sync/restore action and never enter SQLite, IndexedDB, or localStorage.
 */

import { strFromU8, strToU8 } from 'fflate';
import {
  base64ToBytesPure,
  bytesToBase64Pure,
} from '../core/backupArchive';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  ENCRYPTED_ENVELOPE_FORMAT,
  EncryptedPayloadEnvelope,
  EncryptedPayloadKind,
} from '../core/encryptedExport';
import { nowIsoUtc } from '../core/models';

export function supportsPassphraseCrypto(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    Boolean(globalThis.crypto?.subtle) &&
    typeof globalThis.crypto?.getRandomValues === 'function'
  );
}

function getSubtleCrypto(): SubtleCrypto {
  if (!supportsPassphraseCrypto()) {
    throw new Error(
      'Passphrase encryption (Web Crypto AES-GCM) is unavailable in this browser context.'
    );
  }
  return globalThis.crypto.subtle;
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: 'encrypt' | 'decrypt'
): Promise<CryptoKey> {
  const cleanPass = passphrase;
  if (!cleanPass || cleanPass.length < 4) {
    throw new Error('Enter a passphrase of at least 4 characters.');
  }
  const subtle = getSubtleCrypto();
  const baseKey = await subtle.importKey(
    'raw',
    toExactArrayBuffer(strToU8(cleanPass)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toExactArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function encryptBytesWithPassphrase(
  bytes: Uint8Array,
  passphrase: string,
  options: {
    payloadKind: EncryptedPayloadKind;
    originalFileName?: string;
    iterations?: number;
  }
): Promise<EncryptedPayloadEnvelope> {
  const subtle = getSubtleCrypto();
  const iterations = Math.max(
    10_000,
    Math.round(options.iterations ?? DEFAULT_PBKDF2_ITERATIONS)
  );
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(passphrase, salt, iterations, 'encrypt');

  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: toExactArrayBuffer(iv) },
    key,
    toExactArrayBuffer(bytes)
  );

  return {
    format: ENCRYPTED_ENVELOPE_FORMAT,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    saltBase64: bytesToBase64Pure(salt),
    ivBase64: bytesToBase64Pure(iv),
    payloadKind: options.payloadKind,
    originalFileName: options.originalFileName,
    createdAtIso: nowIsoUtc(),
    ciphertextBase64: bytesToBase64Pure(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptBytesWithPassphrase(
  envelope: EncryptedPayloadEnvelope,
  passphrase: string
): Promise<Uint8Array> {
  if (!passphrase) {
    throw new Error('Passphrase required to unlock encrypted Community Pedigree file.');
  }
  const subtle = getSubtleCrypto();
  const salt = base64ToBytesPure(envelope.saltBase64);
  const iv = base64ToBytesPure(envelope.ivBase64);
  const ciphertext = base64ToBytesPure(envelope.ciphertextBase64);

  if (salt.byteLength < 8 || iv.byteLength !== 12 || ciphertext.byteLength === 0) {
    throw new Error('Encrypted payload header is damaged or incomplete.');
  }

  const key = await deriveAesGcmKey(
    passphrase,
    salt,
    envelope.iterations,
    'decrypt'
  );

  try {
    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: toExactArrayBuffer(iv) },
      key,
      toExactArrayBuffer(ciphertext)
    );
    return new Uint8Array(plainBuffer);
  } catch {
    throw new Error(
      'Incorrect passphrase or corrupted encrypted archive. Verify the passphrase and try again.'
    );
  }
}

export async function encryptTextWithPassphrase(
  text: string,
  passphrase: string,
  options: {
    payloadKind: EncryptedPayloadKind;
    originalFileName?: string;
    iterations?: number;
  }
): Promise<EncryptedPayloadEnvelope> {
  return encryptBytesWithPassphrase(strToU8(text), passphrase, options);
}

export async function decryptTextWithPassphrase(
  envelope: EncryptedPayloadEnvelope,
  passphrase: string
): Promise<string> {
  const plainBytes = await decryptBytesWithPassphrase(envelope, passphrase);
  return strFromU8(plainBytes);
}
```

## `src/storage/pedigreeOcrScanner.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline Paper Pedigree OCR & Scanned PDF Processing Pipeline
 * (`src/storage/pedigreeOcrScanner.ts`).
 *
 * Strategy:
 * 1. Accepts snapped photos (JPG/PNG/WebP/HEIC/etc.) or PDF files (digital/vector
 *    exports OR image-only scanned PDFs).
 * 2. Validates file size and blocks SVG/XML payloads before decoding.
 * 3. For PDFs: extracts searchable vector text operators (`BT...ET` + word coordinates)
 *    or embedded scanned JPEG pages completely offline via `extractPedigreePdfPages`.
 * 4. For images & raster PDF pages: decodes with EXIF orientation, renders a
 *    contrast-boosted grayscale `<canvas>`, tries native `TextDetector` first, then
 *    lazy-loads `tesseract.js` in a bounded worker (`{ text: true, blocks: true }`)
 *    with strict `try/finally` worker & bitmap cleanup.
 * 5. Produces editable 15-slot 3-generation drafts via `parsePedigreeOcrResult` and
 *    fails softly offline (`status: 'offline_manual'`) so breeders can always view
 *    the scan preview and enter/correct pedigree fields manually.
 */

import {
  createEmptyPedigreeOcrSlots,
  OcrWordBox,
  parsePedigreeOcrResult,
  PedigreeOcrParseResult,
} from '../core/importers/pedigreeOcrParser';
import {
  extractPedigreePdfPages,
  MAX_PDF_SCAN_BYTES,
} from '../core/importers/pdfScanExtractor';
import {
  isSvgImageInput,
  MAX_PHOTO_UPLOAD_BYTES,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { WeightUnit } from '../core/models';
import { readBlobAsArrayBuffer } from '../utils/es2018Shims';
import { enforceCanvasDimensions, releaseCanvas } from './webImageOptimizer';

export type PedigreeScanStatus =
  | 'detected'
  | 'partial'
  | 'no_text_found'
  | 'offline_manual'
  | 'pdf_unsupported'
  | 'invalid_file';

export type PedigreeScanEngine =
  | 'pdf-vector-text'
  | 'native-text-detector'
  | 'tesseract-js'
  | 'none';

export interface ScannedPedigreePageResult {
  pageIndex: number;
  sourceLabel: string;
  engine: PedigreeScanEngine;
  confidence: number;
  rawText: string;
  imageWidth: number;
  imageHeight: number;
  parseResult: PedigreeOcrParseResult;
  previewBlob: Blob | null;
  attachablePhoto?: {
    fileName: string;
    mimeHint: string;
    bytes: Uint8Array;
  };
}

export interface PedigreeScanSessionResult {
  status: PedigreeScanStatus;
  sourceFileName: string;
  isPdf: boolean;
  pages: ScannedPedigreePageResult[];
  recommendedPageIndex: number;
  warnings: string[];
  errorMessage?: string;
}

interface NativeBoundingBox {
  x?: number;
  y?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

interface NativeDetectedTextBlock {
  rawValue?: string;
  boundingBox?: NativeBoundingBox;
}

interface NativeTextDetectorInstance {
  detect(image: ImageBitmapSource): Promise<NativeDetectedTextBlock[]>;
}

interface NativeTextDetectorConstructor {
  new (): NativeTextDetectorInstance;
}

interface WindowWithTextDetector extends Window {
  TextDetector?: NativeTextDetectorConstructor;
}

const OCR_MAX_DIMENSION_STANDARD_PX = 2400;
const OCR_MAX_DIMENSION_CONSTRAINED_PX = 1800;
const OCR_WORKER_TIMEOUT_MS = 25_000;

function hasPdfMagicHeader(prefixBytes: Uint8Array): boolean {
  const limit = Math.min(prefixBytes.length, 64);
  let head = '';
  for (let i = 0; i < limit; i++) {
    head += String.fromCharCode(prefixBytes[i]);
  }
  return head.includes('%PDF-');
}

async function decodeBlobToCanvasSource(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    const releaseImageObjectUrl = () => {
      img.onload = null;
      img.onerror = null;
      try {
        img.src = '';
      } catch {
        // Ignore readonly src teardown
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
        cleanup: releaseImageObjectUrl,
      });
    };
    img.onerror = () => {
      releaseImageObjectUrl();
      reject(new Error('Could not decode pedigree scan image in this browser.'));
    };
    img.src = objectUrl;
  });
}

function buildPreprocessedOcrCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxDimensionPx: number
): HTMLCanvasElement {
  const longest = Math.max(srcWidth, srcHeight, 1);
  const scale = longest > maxDimensionPx ? maxDimensionPx / longest : 1;
  const safeDims = enforceCanvasDimensions(
    Math.max(1, Math.round(srcWidth * scale)),
    Math.max(1, Math.round(srcHeight * scale))
  );
  const targetWidth = safeDims.width;
  const targetHeight = safeDims.height;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    releaseCanvas(canvas);
    throw new Error('2D Canvas context is unavailable for pedigree OCR.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  // Convert to high-contrast grayscale to sharpen faded paper/inkjet pedigree typography
  try {
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;
    const contrast = 1.32;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const stretched = Math.max(0, Math.min(255, (lum - 128) * contrast + 128));
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Non-fatal if canvas pixel access is blocked
  }

  return canvas;
}

async function tryNativeTextDetectorBoxes(canvas: HTMLCanvasElement): Promise<{
  rawText: string;
  words: OcrWordBox[];
}> {
  if (typeof window === 'undefined') {
    return { rawText: '', words: [] };
  }
  const win = window as WindowWithTextDetector;
  const DetectorCtor = win.TextDetector;
  if (typeof DetectorCtor !== 'function') {
    return { rawText: '', words: [] };
  }

  try {
    const detector = new DetectorCtor();
    const blocks = await detector.detect(canvas);
    const words: OcrWordBox[] = [];
    const lines: string[] = [];

    for (const block of blocks) {
      const text = typeof block.rawValue === 'string' ? block.rawValue.trim() : '';
      if (!text) continue;
      lines.push(text);

      const box = block.boundingBox;
      const x0 = Number(box?.x ?? box?.left ?? 0) || 0;
      const y0 = Number(box?.y ?? box?.top ?? 0) || 0;
      const bw = Math.max(8, Number(box?.width ?? 60) || 60);
      const bh = Math.max(8, Number(box?.height ?? 14) || 14);

      const subLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const lineStepY = bh / Math.max(1, subLines.length);

      subLines.forEach((lineText, lineIdx) => {
        const tokens = lineText.trim().split(/\s+/).filter(Boolean);
        const totalChars = Math.max(1, tokens.reduce((acc, t) => acc + t.length, 0) + tokens.length - 1);
        let charOffset = 0;
        const lineY0 = y0 + lineIdx * lineStepY;
        const lineY1 = lineY0 + lineStepY;

        for (const tok of tokens) {
          const wx0 = x0 + (charOffset / totalChars) * bw;
          const wx1 = x0 + ((charOffset + tok.length) / totalChars) * bw;
          words.push({
            text: tok,
            x0: wx0,
            y0: lineY0,
            x1: Math.max(wx0 + 4, wx1),
            y1: lineY1,
            confidence: 86,
          });
          charOffset += tok.length + 1;
        }
      });
    }

    return {
      rawText: lines.join('\n'),
      words,
    };
  } catch {
    return { rawText: '', words: [] };
  }
}

async function runTesseractBoxesWithTimeout(
  canvas: HTMLCanvasElement,
  onProgress?: (stageLabel: string, progressPct?: number) => void
): Promise<{ rawText: string; words: OcrWordBox[]; confidence: number }> {
  const { createWorker } = await import('tesseract.js');
  const workerHolder: { instance: Awaited<ReturnType<typeof createWorker>> | null } = {
    instance: null,
  };
  let timer: ReturnType<typeof setTimeout> | null = null;

  const workPromise = (async () => {
    onProgress?.('Starting local OCR engine...', 22);
    const createdWorker = await createWorker('eng', 1, {
      logger: (msg) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          onProgress?.('Scanning pedigree layout & ancestors...', Math.round(32 + msg.progress * 58));
        }
      },
    });
    workerHolder.instance = createdWorker;

    const res = await createdWorker.recognize(canvas, undefined, {
      text: true,
      blocks: true,
    });

    const words: OcrWordBox[] = [];
    const blocks = res.data?.blocks ?? [];
    for (const blk of blocks) {
      for (const para of blk.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const w of line.words ?? []) {
            const clean = w.text.trim();
            if (!clean) continue;
            words.push({
              text: clean,
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
              confidence: Math.round(w.confidence || 0),
            });
          }
        }
      }
    }

    return {
      rawText: typeof res.data?.text === 'string' ? res.data.text : '',
      words,
      confidence:
        typeof res.data?.confidence === 'number' && Number.isFinite(res.data.confidence)
          ? Math.max(0, Math.min(100, Math.round(res.data.confidence)))
          : 0,
    };
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Pedigree OCR timed out after 25s. Review or type slots manually.'));
    }, OCR_WORKER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (workerHolder.instance) {
      try {
        await workerHolder.instance.terminate();
      } catch {
        // Ignore worker termination cleanup error
      }
    }
  }
}

async function scanRasterBlobForPedigree(params: {
  blob: Blob;
  rawBytes: Uint8Array;
  fileName: string;
  mimeHint: string;
  pageIndex: number;
  sourceLabel: string;
  fallbackSpecies: string;
  preferredUnit: WeightUnit;
  maxDimensionPx: number;
  onProgress?: (stageLabel: string, progressPct?: number) => void;
}): Promise<{
  pageResult: ScannedPedigreePageResult;
  offlineErrored: boolean;
  offlineReason?: string;
}> {
  const decoded = await decodeBlobToCanvasSource(params.blob);
  let canvas: HTMLCanvasElement | null = null;
  let engine: PedigreeScanEngine = 'none';
  let rawText = '';
  let words: OcrWordBox[] = [];
  let confidence = 0;
  let offlineErrored = false;
  let offlineReason: string | undefined;

  try {
    canvas = buildPreprocessedOcrCanvas(
      decoded.source,
      decoded.width,
      decoded.height,
      params.maxDimensionPx
    );
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const nativeRes = await tryNativeTextDetectorBoxes(canvas);
    const nativeParsedPreview = nativeRes.rawText.trim().length >= 30
      ? parsePedigreeOcrResult(
          {
            pageIndex: params.pageIndex,
            sourceFileName: params.fileName,
            rawText: nativeRes.rawText,
            imageWidth: canvasWidth,
            imageHeight: canvasHeight,
            words: nativeRes.words,
            confidence: 86,
            engine: 'native-text-detector',
          },
          { fallbackSpecies: params.fallbackSpecies, preferredUnit: params.preferredUnit }
        )
      : null;

    if (nativeParsedPreview && nativeParsedPreview.populatedSlotCount >= 3) {
      rawText = nativeRes.rawText;
      words = nativeRes.words;
      confidence = 86;
      engine = 'native-text-detector';
    } else {
      try {
        const tessRes = await runTesseractBoxesWithTimeout(canvas, params.onProgress);
        rawText = tessRes.rawText;
        words = tessRes.words;
        confidence = tessRes.confidence;
        engine = 'tesseract-js';

        if (!rawText.trim() && nativeRes.rawText.trim()) {
          rawText = nativeRes.rawText;
          words = nativeRes.words;
          confidence = 72;
          engine = 'native-text-detector';
        }
      } catch (err) {
        if (nativeRes.rawText.trim()) {
          rawText = nativeRes.rawText;
          words = nativeRes.words;
          confidence = 68;
          engine = 'native-text-detector';
        } else {
          offlineErrored = true;
          const msg = err instanceof Error ? err.message : 'OCR unavailable';
          offlineReason = msg;
        }
      }
    }

    const parseResult = parsePedigreeOcrResult(
      {
        pageIndex: params.pageIndex,
        sourceFileName: params.fileName,
        rawText,
        imageWidth: canvasWidth,
        imageHeight: canvasHeight,
        words,
        confidence,
        engine,
      },
      {
        fallbackSpecies: params.fallbackSpecies,
        preferredUnit: params.preferredUnit,
      }
    );

    return {
      pageResult: {
        pageIndex: params.pageIndex,
        sourceLabel: params.sourceLabel,
        engine,
        confidence,
        rawText: parseResult.sanitizedRawText,
        imageWidth: canvasWidth,
        imageHeight: canvasHeight,
        parseResult,
        previewBlob: params.blob,
        attachablePhoto: {
          fileName: params.fileName,
          mimeHint: params.mimeHint,
          bytes: params.rawBytes,
        },
      },
      offlineErrored,
      offlineReason,
    };
  } finally {
    releaseCanvas(canvas);
    canvas = null;
    decoded.cleanup();
  }
}

/**
 * Scans a paper pedigree photo (camera / JPG / PNG / WebP) or PDF (vector or scanned JPEG pages)
 * completely offline and returns editable 15-slot 3-generation drafts ready for review.
 */
export async function scanPedigreeDocumentFile(
  file: File,
  options?: {
    fallbackSpecies?: string;
    preferredUnit?: WeightUnit;
    constrainedDevice?: boolean;
    onProgress?: (stageLabel: string, progressPct?: number) => void;
  }
): Promise<PedigreeScanSessionResult> {
  const safeName = sanitizeSingleLineText(file.name || 'pedigree-scan', 160) || 'pedigree-scan';
  const fallbackSpecies = options?.fallbackSpecies || 'Rabbit';
  const preferredUnit = options?.preferredUnit ?? 'lbs_oz';
  const maxDim = options?.constrainedDevice
    ? OCR_MAX_DIMENSION_CONSTRAINED_PX
    : OCR_MAX_DIMENSION_STANDARD_PX;

  const isPdfName = safeName.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const sizeCheck = validateUploadFileSize(
    safeName,
    file.size,
    isPdfName ? MAX_PDF_SCAN_BYTES : MAX_PHOTO_UPLOAD_BYTES,
    isPdfName ? 'a pedigree PDF scan' : 'a pedigree photo'
  );
  if (!sizeCheck.ok) {
    return {
      status: 'invalid_file',
      sourceFileName: safeName,
      isPdf: isPdfName,
      pages: [],
      recommendedPageIndex: 0,
      warnings: [],
      errorMessage: sizeCheck.error,
    };
  }

  options?.onProgress?.('Reading pedigree document...', 8);
  const rawBuffer = await readBlobAsArrayBuffer(file);
  const rawBytes = new Uint8Array(rawBuffer);

  if (isSvgImageInput(file.type, safeName, rawBytes.subarray(0, 512))) {
    return {
      status: 'invalid_file',
      sourceFileName: safeName,
      isPdf: false,
      pages: [],
      recommendedPageIndex: 0,
      warnings: [],
      errorMessage:
        'SVG vector files are blocked for security. Upload a JPG, PNG, WebP photo, or PDF document.',
    };
  }

  const looksPdf = isPdfName || hasPdfMagicHeader(rawBytes);

  if (looksPdf) {
    options?.onProgress?.('Inspecting PDF pages offline...', 18);
    const pdfRes = extractPedigreePdfPages(rawBytes);

    if (!pdfRes.ok || pdfRes.pages.length === 0) {
      return {
        status: 'pdf_unsupported',
        sourceFileName: safeName,
        isPdf: true,
        pages: [
          {
            pageIndex: 0,
            sourceLabel: 'Manual 3-Generation Entry',
            engine: 'none',
            confidence: 0,
            rawText: '',
            imageWidth: 0,
            imageHeight: 0,
            parseResult: {
              slots: createEmptyPedigreeOcrSlots(''),
              detectedSpecies: fallbackSpecies,
              detectedBreed: '',
              sanitizedRawText: '',
              layoutMode: 'manual_empty',
              populatedSlotCount: 0,
              warnings: pdfRes.warnings,
            },
            previewBlob: null,
          },
        ],
        recommendedPageIndex: 0,
        warnings: pdfRes.warnings,
        errorMessage:
          pdfRes.errorMessage ||
          'Could not extract text or scanned images from this PDF. Take a photo or screenshot as JPG/PNG instead.',
      };
    }

    const scannedPages: ScannedPedigreePageResult[] = [];
    const warnings = [...pdfRes.warnings];
    let anyOfflineError = false;
    let firstOfflineReason: string | undefined;

    for (let i = 0; i < pdfRes.pages.length; i++) {
      const page = pdfRes.pages[i];
      if (page.kind === 'vector_text') {
        const words: OcrWordBox[] = (page.words ?? []).map((w) => ({
          text: w.text,
          x0: w.x0,
          y0: w.y0,
          x1: w.x1,
          y1: w.y1,
          confidence: 98,
        }));
        const parsed = parsePedigreeOcrResult(
          {
            pageIndex: page.pageIndex,
            sourceFileName: safeName,
            rawText: page.rawText || '',
            imageWidth: page.width,
            imageHeight: page.height,
            words,
            confidence: 98,
            engine: 'pdf-vector-text',
          },
          { fallbackSpecies, preferredUnit }
        );
        scannedPages.push({
          pageIndex: page.pageIndex,
          sourceLabel: `PDF Page ${page.pageIndex + 1} (Searchable Text)`,
          engine: 'pdf-vector-text',
          confidence: 98,
          rawText: parsed.sanitizedRawText,
          imageWidth: page.width,
          imageHeight: page.height,
          parseResult: parsed,
          previewBlob: null,
        });
      } else if (page.jpegBytes && page.jpegBytes.byteLength > 0) {
        options?.onProgress?.(
          `Running local OCR on PDF page ${i + 1} of ${pdfRes.pages.length}...`,
          Math.round(20 + (i / Math.max(1, pdfRes.pages.length)) * 70)
        );
        const pageJpegCopy = new Uint8Array(page.jpegBytes);
        const jpegBlob = new Blob([pageJpegCopy], { type: 'image/jpeg' });
        const scanned = await scanRasterBlobForPedigree({
          blob: jpegBlob,
          rawBytes: pageJpegCopy,
          fileName: `${safeName.replace(/\.pdf$/i, '')}-page-${page.pageIndex + 1}.jpg`,
          mimeHint: 'image/jpeg',
          pageIndex: page.pageIndex,
          sourceLabel: `PDF Page ${page.pageIndex + 1} (Scanned Image)`,
          fallbackSpecies,
          preferredUnit,
          maxDimensionPx: maxDim,
          onProgress: options?.onProgress,
        });
        scannedPages.push(scanned.pageResult);
        if (scanned.offlineErrored) {
          anyOfflineError = true;
          firstOfflineReason = firstOfflineReason || scanned.offlineReason;
        }
      }
    }

    let bestIdx = 0;
    let bestCount = -1;
    scannedPages.forEach((p, idx) => {
      if (p.parseResult.populatedSlotCount > bestCount) {
        bestCount = p.parseResult.populatedSlotCount;
        bestIdx = idx;
      }
    });

    if (anyOfflineError && bestCount <= 0) {
      warnings.push(
        `Offline OCR language pack uncached (${firstOfflineReason || 'unavailable'}). Scanned page image is shown so you can enter pedigree slots manually.`
      );
    }

    options?.onProgress?.('Done', 100);
    const bestPop = scannedPages[bestIdx]?.parseResult.populatedSlotCount ?? 0;
    const status: PedigreeScanStatus =
      bestPop >= 3
        ? 'detected'
        : bestPop > 0
          ? 'partial'
          : anyOfflineError
            ? 'offline_manual'
            : 'no_text_found';

    return {
      status,
      sourceFileName: safeName,
      isPdf: true,
      pages: scannedPages,
      recommendedPageIndex: bestIdx,
      warnings,
    };
  }

  // Standard raster photo (camera / JPG / PNG / WebP / HEIC)
  options?.onProgress?.('Decoding full-resolution pedigree photo...', 14);
  const mimeHint = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const scanned = await scanRasterBlobForPedigree({
    blob: file,
    rawBytes,
    fileName: safeName,
    mimeHint,
    pageIndex: 0,
    sourceLabel: 'Scanned Pedigree Photo',
    fallbackSpecies,
    preferredUnit,
    maxDimensionPx: maxDim,
    onProgress: options?.onProgress,
  });

  const warnings = [...scanned.pageResult.parseResult.warnings];
  const pop = scanned.pageResult.parseResult.populatedSlotCount;
  let status: PedigreeScanStatus = 'no_text_found';
  if (pop >= 3) {
    status = 'detected';
  } else if (pop > 0) {
    status = 'partial';
  } else if (scanned.offlineErrored) {
    status = 'offline_manual';
    const isOffline =
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      /fetch|network|failed|load|import|traineddata|timeout/i.test(scanned.offlineReason || '');
    warnings.unshift(
      isOffline
        ? 'Offline or OCR language pack uncached — photo preview is ready below so you can type or verify pedigree slots manually.'
        : `Local OCR could not initialize (${scanned.offlineReason || 'unavailable'}). Photo preview is ready for manual slot entry.`
    );
  }

  options?.onProgress?.('Done', 100);
  return {
    status,
    sourceFileName: safeName,
    isPdf: false,
    pages: [scanned.pageResult],
    recommendedPageIndex: 0,
    warnings,
  };
}
```

## `src/storage/photoHydration.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Bounded LRU Full-Resolution Photo Cache & On-Demand Snapshot Hydration Helpers.
 *
 * Keeps only lightweight `thumbnailDataUrl` previews inside the long-lived React
 * snapshot state while fetching full-resolution base64 `dataUrl` payloads from SQLite
 * on demand for galleries, lightboxes, formal pedigree prints, binders, and backups.
 */

import { AnimalPhoto, BarnDatabaseSnapshot, isSameSpecies } from '../core/models';

export class BoundedPhotoDataCache {
  private maxEntries: number;
  private maxBytes: number;
  private totalBytes = 0;
  private entries = new Map<string, string>();

  constructor(maxEntries = 16, maxBytes = Number.POSITIVE_INFINITY) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.maxBytes =
      Number.isFinite(maxBytes) && maxBytes > 0
        ? Math.floor(maxBytes)
        : Number.POSITIVE_INFINITY;
  }

  private evictToLimits(): void {
    while (
      this.entries.size > this.maxEntries ||
      (this.entries.size > 0 && this.totalBytes > this.maxBytes)
    ) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.totalBytes = Math.max(0, this.totalBytes - oldest[1].length);
    }
  }

  get(photoId: string): string | undefined {
    const hit = this.entries.get(photoId);
    if (hit === undefined) return undefined;
    // Refresh LRU recency
    this.entries.delete(photoId);
    this.entries.set(photoId, hit);
    return hit;
  }

  set(photoId: string, dataUrl: string): void {
    if (!photoId || !dataUrl) return;
    const prev = this.entries.get(photoId);
    if (prev !== undefined) {
      this.totalBytes = Math.max(0, this.totalBytes - prev.length);
      this.entries.delete(photoId);
    }
    this.entries.set(photoId, dataUrl);
    this.totalBytes += dataUrl.length;
    this.evictToLimits();
  }

  delete(photoId: string): void {
    const prev = this.entries.get(photoId);
    if (prev !== undefined) {
      this.totalBytes = Math.max(0, this.totalBytes - prev.length);
      this.entries.delete(photoId);
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  resize(nextMaxEntries: number, nextMaxBytes?: number): void {
    this.maxEntries = Math.max(1, Math.floor(nextMaxEntries));
    if (nextMaxBytes !== undefined) {
      this.maxBytes =
        Number.isFinite(nextMaxBytes) && nextMaxBytes > 0
          ? Math.floor(nextMaxBytes)
          : Number.POSITIVE_INFINITY;
    }
    this.evictToLimits();
  }

  trimTo(maxEntries: number, maxBytes?: number): void {
    const prevEntries = this.maxEntries;
    const prevBytes = this.maxBytes;
    this.maxEntries = Math.max(0, Math.floor(maxEntries));
    if (maxBytes !== undefined) {
      this.maxBytes = Number.isFinite(maxBytes) && maxBytes >= 0 ? Math.floor(maxBytes) : prevBytes;
    }
    this.evictToLimits();
    this.maxEntries = prevEntries;
    this.maxBytes = prevBytes;
  }

  size(): number {
    return this.entries.size;
  }

  byteSize(): number {
    return this.totalBytes;
  }
}

export function stripPhotoDataUrlsFromSnapshot(
  snapshot: BarnDatabaseSnapshot
): BarnDatabaseSnapshot {
  const photos = snapshot.animalPhotos ?? [];
  if (photos.length === 0 || photos.every((p) => !p.dataUrl)) {
    return snapshot;
  }
  return {
    ...snapshot,
    animalPhotos: photos.map((p) => ({
      ...p,
      thumbnailDataUrl: p.thumbnailDataUrl || p.dataUrl || '',
      dataUrl: '',
    })),
  };
}

export const DEFAULT_PHOTO_HYDRATION_BATCH_SIZE = 12;
export const CONSTRAINED_PHOTO_HYDRATION_BATCH_SIZE = 4;

/**
 * Safely revokes a `blob:` object URL when it is no longer needed. Ignores `data:`/`https:` strings.
 */
export function revokeBlobUrlIfNeeded(url: string | null | undefined): void {
  if (!url || !url.startsWith('blob:')) return;
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore already-revoked or invalid object URL errors
    }
  }
}

export async function hydrateSnapshotWithPhotoDataUrls(
  snapshot: BarnDatabaseSnapshot,
  fetchBatch: (photoIds: string[]) => Promise<Record<string, string>>,
  filterSpecies?: string,
  cache?: BoundedPhotoDataCache,
  options?: { batchSize?: number; isConstrained?: boolean }
): Promise<BarnDatabaseSnapshot> {
  const photos = snapshot.animalPhotos ?? [];
  if (photos.length === 0) return snapshot;

  const missingIds: string[] = [];
  const cachedById = new Map<string, string>();
  const speciesAnimalIds = filterSpecies
    ? new Set(
        snapshot.animals
          .filter((a) => isSameSpecies(a.species, filterSpecies))
          .map((a) => a.id)
      )
    : null;

  for (const photo of photos) {
    if (filterSpecies) {
      const belongs =
        isSameSpecies(photo.species, filterSpecies) || Boolean(speciesAnimalIds?.has(photo.animalId));
      if (!belongs) continue;
    }
    if (photo.dataUrl) continue;
    const fromCache = cache?.get(photo.id);
    if (fromCache) {
      cachedById.set(photo.id, fromCache);
    } else {
      missingIds.push(photo.id);
    }
  }

  if (missingIds.length === 0 && cachedById.size === 0) {
    return snapshot;
  }

  const defaultBatch = options?.isConstrained
    ? CONSTRAINED_PHOTO_HYDRATION_BATCH_SIZE
    : DEFAULT_PHOTO_HYDRATION_BATCH_SIZE;
  const batchSize = Math.max(1, Math.floor(options?.batchSize ?? defaultBatch));

  // Fetch sequentially in bounded chunks to avoid concurrent full-res bitmap/buffer spikes
  const fetched: Record<string, string> = {};
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const chunk = missingIds.slice(i, i + batchSize);
    const chunkResult = await fetchBatch(chunk);
    for (const id of chunk) {
      const val = chunkResult[id];
      if (val) {
        fetched[id] = val;
      }
    }
  }

  const nextPhotos: AnimalPhoto[] = photos.map((p) => {
    if (p.dataUrl) return p;
    const resolved = fetched[p.id] || cachedById.get(p.id);
    if (!resolved) return p;
    return {
      ...p,
      dataUrl: resolved,
      thumbnailDataUrl: p.thumbnailDataUrl || resolved,
    };
  });

  return {
    ...snapshot,
    animalPhotos: nextPhotos,
  };
}
```

## `src/storage/pwaUpdateManager.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Manual Service Worker Update Governor (`auto` / `notify` / `pinned`),
 * Uncached `version.json` / `status.json` Upgrade Gate & controllerchange Single-Reload Handshake.
 *
 * Replaces blind `autoUpdate` reloads so cached PWA updates never swap chunks under
 * an open editing modal, never install revoked releases, and respect pinned hold policies.
 */

import { useEffect, useState } from 'react';
import { CURRENT_BACKUP_SCHEMA_VERSION } from '../core/backupVault';
import {
  CURRENT_APP_VERSION,
  evaluateUpgradeGate,
  parseStatusManifestJson,
  parseVersionManifestJson,
  StatusManifest,
  UpgradeGateDecision,
  VersionManifest,
} from '../core/upgradeGate';
import { markCleanSessionExit } from './crashLogger';
import {
  getAdjustedNowIsoUtc,
  getEffectiveOnlineStatus,
  recordServerDateHeaderSkew,
} from './storageProtection';
import { getSafeLocalStorage } from './storageProbes';

export type PwaUpdatePolicy = 'auto' | 'notify' | 'pinned';

const PWA_UPDATE_POLICY_KEY = 'pedigree_pwa_update_policy_v1';

export interface PwaUpdateState {
  updateAvailable: boolean;
  offlineReady: boolean;
  applying: boolean;
  dismissed: boolean;
  policy: PwaUpdatePolicy;
  checking: boolean;
  lastCheckedAtIso: string | null;
  remoteVersion: VersionManifest | null;
  remoteStatus: StatusManifest | null;
  gateDecision: UpgradeGateDecision | null;
  preUpgradeBackupVerified: boolean;
}

type RegisterSwFn = (options?: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}) => (reloadPage?: boolean) => Promise<void>;

function readPersistedUpdatePolicy(): PwaUpdatePolicy {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return 'auto';
    const raw = ls.getItem(PWA_UPDATE_POLICY_KEY);
    if (raw === 'auto' || raw === 'notify' || raw === 'pinned') {
      return raw;
    }
  } catch {
    // Ignore restricted storage access
  }
  return 'auto';
}

const listeners = new Set<() => void>();

let currentState: PwaUpdateState = {
  updateAvailable: false,
  offlineReady: false,
  applying: false,
  dismissed: false,
  policy: readPersistedUpdatePolicy(),
  checking: false,
  lastCheckedAtIso: null,
  remoteVersion: null,
  remoteStatus: null,
  gateDecision: null,
  preUpgradeBackupVerified: false,
};

let triggerSwUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
let waitingRegistration: ServiceWorkerRegistration | null = null;
let controllerChangeAttached = false;
let refreshing = false;
let initialized = false;
let teardownLifecycleListeners: (() => void) | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<PwaUpdateState>): void {
  currentState = { ...currentState, ...patch };
  notify();
}

export function getPwaUpdateState(): PwaUpdateState {
  return currentState;
}

export function getPwaUpdatePolicy(): PwaUpdatePolicy {
  return currentState.policy;
}

export function setPwaUpdatePolicy(policy: PwaUpdatePolicy): void {
  try {
    const ls = getSafeLocalStorage();
    if (ls) {
      ls.setItem(PWA_UPDATE_POLICY_KEY, policy);
    }
  } catch {
    // Ignore storage restriction
  }
  setState({
    policy,
    dismissed: policy === 'pinned' ? currentState.dismissed : false,
  });
}

export function markPreUpgradeBackupVerified(verified: boolean): void {
  const nextDecision =
    currentState.remoteVersion || currentState.remoteStatus
      ? evaluateUpgradeGate({
          currentAppVersion: CURRENT_APP_VERSION,
          currentSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
          remoteVersion: currentState.remoteVersion,
          remoteStatus: currentState.remoteStatus,
          backupVerifiedForTarget: verified,
        })
      : currentState.gateDecision;

  setState({
    preUpgradeBackupVerified: verified,
    gateDecision: nextDecision,
  });
}

export function resetPwaUpdateManagerForTests(): void {
  if (teardownLifecycleListeners) {
    teardownLifecycleListeners();
    teardownLifecycleListeners = null;
  }
  try {
    const ls = getSafeLocalStorage();
    if (ls) {
      ls.removeItem(PWA_UPDATE_POLICY_KEY);
    }
  } catch {
    // Ignore
  }
  currentState = {
    updateAvailable: false,
    offlineReady: false,
    applying: false,
    dismissed: false,
    policy: 'auto',
    checking: false,
    lastCheckedAtIso: null,
    remoteVersion: null,
    remoteStatus: null,
    gateDecision: null,
    preUpgradeBackupVerified: false,
  };
  triggerSwUpdate = null;
  waitingRegistration = null;
  controllerChangeAttached = false;
  refreshing = false;
  initialized = false;
  listeners.clear();
}

export function attachControllerChangeReloadGuard(
  swContainer: { addEventListener: (event: 'controllerchange', fn: () => void) => void } | undefined =
    typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  reloadFn: () => void = () => {
    if (typeof window !== 'undefined' && window.location) {
      markCleanSessionExit();
      window.location.reload();
    }
  }
): void {
  if (!swContainer || controllerChangeAttached) return;
  controllerChangeAttached = true;
  swContainer.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    reloadFn();
  });
}

async function fetchJsonNoStore(
  url: string,
  fetchFn: typeof fetch
): Promise<unknown | null> {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetchFn(`${url}${sep}_ts=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const dateHdr = res.headers?.get?.('date');
    if (dateHdr) {
      recordServerDateHeaderSkew(dateHdr);
    }
    if (!res.ok) return null;
    const contentType = res.headers?.get?.('content-type') || '';
    if (contentType && !/json|text\/plain/i.test(contentType)) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchUpgradeGateDecision(options?: {
  fetchImpl?: typeof fetch;
  currentAppVersion?: string;
  currentSchemaVersion?: number;
}): Promise<UpgradeGateDecision | null> {
  const fetchFn =
    options?.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!fetchFn) return null;

  const [rawVersion, rawStatus] = await Promise.all([
    fetchJsonNoStore('./version.json', fetchFn),
    fetchJsonNoStore('./status.json', fetchFn),
  ]);

  const remoteVersion = parseVersionManifestJson(rawVersion);
  const remoteStatus = parseStatusManifestJson(rawStatus);

  if (!remoteVersion && !remoteStatus) {
    return currentState.gateDecision;
  }

  const decision = evaluateUpgradeGate({
    currentAppVersion: options?.currentAppVersion ?? CURRENT_APP_VERSION,
    currentSchemaVersion: options?.currentSchemaVersion ?? CURRENT_BACKUP_SCHEMA_VERSION,
    remoteVersion,
    remoteStatus,
    backupVerifiedForTarget: currentState.preUpgradeBackupVerified,
  });

  setState({
    remoteVersion: remoteVersion ?? currentState.remoteVersion,
    remoteStatus: remoteStatus ?? currentState.remoteStatus,
    gateDecision: decision,
    lastCheckedAtIso: getAdjustedNowIsoUtc(),
  });

  return decision;
}

export async function checkForPwaUpdateNow(options?: {
  force?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<'checked' | 'pinned' | 'offline' | 'blocked' | 'unavailable'> {
  if (currentState.policy === 'pinned' && !options?.force) {
    return 'pinned';
  }
  if (!getEffectiveOnlineStatus()) {
    return 'offline';
  }

  setState({ checking: true });
  try {
    const decision = await fetchUpgradeGateDecision({ fetchImpl: options?.fetchImpl });
    if (decision && (decision.status === 'blocked_revoked' || decision.status === 'blocked_paused')) {
      return 'blocked';
    }
    if (waitingRegistration && typeof waitingRegistration.update === 'function') {
      await waitingRegistration.update();
      return 'checked';
    }
    return decision ? 'checked' : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    setState({ checking: false, lastCheckedAtIso: getAdjustedNowIsoUtc() });
  }
}

export function initPwaUpdater(registerSWImpl: RegisterSwFn): void {
  if (initialized) return;
  initialized = true;

  attachControllerChangeReloadGuard();

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (currentState.policy !== 'auto') return;
      if (!getEffectiveOnlineStatus()) return;
      void checkForPwaUpdateNow();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    teardownLifecycleListeners = () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }

  try {
    triggerSwUpdate = registerSWImpl({
      immediate: true,
      onNeedRefresh() {
        setState({ updateAvailable: true, dismissed: false });
      },
      onOfflineReady() {
        setState({ offlineReady: true });
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        waitingRegistration = registration;
        if (registration.waiting) {
          setState({ updateAvailable: true, dismissed: false });
        }
        registration.addEventListener?.('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker?.controller) {
              setState({ updateAvailable: true, dismissed: false });
            }
          });
        });

        if (currentState.policy === 'auto' && getEffectiveOnlineStatus()) {
          void checkForPwaUpdateNow();
        }
      },
    });
  } catch {
    // Non-fatal in restricted/private environments without Service Worker support
  }
}

export function dismissPwaUpdateBanner(): void {
  setState({ dismissed: true });
}

export function hasBlockingModalOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('[role="dialog"]'));
}

export async function applyPwaUpdateNow(options?: {
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (currentState.applying) return false;
  if (currentState.policy === 'pinned') return false;
  setState({ applying: true });

  try {
    const preflightDecision = getEffectiveOnlineStatus() || options?.fetchImpl
      ? await fetchUpgradeGateDecision({ fetchImpl: options?.fetchImpl })
      : currentState.gateDecision;

    if (preflightDecision && !preflightDecision.canProceedWithDirectSwSwap) {
      setState({ applying: false, gateDecision: preflightDecision });
      return false;
    }

    if (triggerSwUpdate) {
      await triggerSwUpdate(true);
      return true;
    }
    if (waitingRegistration?.waiting) {
      waitingRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    }
    setState({ applying: false });
    return false;
  } catch {
    setState({ applying: false });
    return false;
  }
}

export function usePwaUpdateStatus(): {
  state: PwaUpdateState;
  applyUpdate: () => Promise<boolean>;
  dismissUpdate: () => void;
  setPolicy: (policy: PwaUpdatePolicy) => void;
  checkNow: (force?: boolean) => Promise<'checked' | 'pinned' | 'offline' | 'blocked' | 'unavailable'>;
  markBackupVerified: (verified: boolean) => void;
} {
  const [state, setLocalState] = useState<PwaUpdateState>(currentState);

  useEffect(() => {
    const sync = () => setLocalState(currentState);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return {
    state,
    applyUpdate: () => applyPwaUpdateNow(),
    dismissUpdate: dismissPwaUpdateBanner,
    setPolicy: setPwaUpdatePolicy,
    checkNow: (force?: boolean) => checkForPwaUpdateNow({ force }),
    markBackupVerified: markPreUpgradeBackupVerified,
  };
}
```

## `src/storage/storageAdapter.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pluggable Cross-Platform Storage Adapter Interface.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * All UI screens and hooks communicate exclusively with `StorageAdapter`.
 * - On Web / PWA: Implemented by `WebSqliteAdapter` (`sql.js` WASM SQLite persisted in IndexedDB).
 * - On Android / iOS (Expo): Swap in `ExpoSqliteAdapter` (`expo-sqlite`) using the exact same SQL schema.
 */

import {
  Animal,
  AnimalPhoto,
  AnimalReservation,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ClientContact,
  FeedAllocation,
  FeedBatch,
  LedgerEntry,
  ProcessingLog,
  ShowEvent,
  SpeciesProfile,
  WaitlistEntry,
  WoolHarvest,
  YouthProjectBook,
} from '../core/models';
import type { WipedStorageRecoveryContext } from './opfsStorage';

export interface SnapshotLoadOptions {
  /**
   * When true, omits heavy full-resolution `dataUrl` image payloads from the returned
   * snapshot (retaining `thumbnailDataUrl` previews and `storedBytes`) so list/grid views
   * stay lightweight in JS memory. Full-resolution images are loaded on demand.
   */
  lightweightPhotos?: boolean;
  /**
   * When true, allows initializing/seeding starter sample data even if returning-user
   * evidence (prior-use sentinel or OPFS backups) exists.
   */
  allowSeedFresh?: boolean;
}

export interface StorageAdapter {
  /** Human-readable description of the active local storage engine (e.g., `"SQLite WASM + IndexedDB"`). */
  readonly engineName: string;

  /** Returns true when IndexedDB is blocked (e.g. Lockdown/Private mode) and storage is session-ephemeral. */
  isEphemeralMode?(): boolean;

  /** Initializes tables and seeds starter multi-species sample data on first launch if empty. */
  initialize(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Reads the complete current database snapshot from local storage. */
  loadSnapshot(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Loads the full-resolution base64 `dataUrl` for a single photo on demand. */
  loadAnimalPhotoDataUrl?(photoId: string): Promise<string | null>;

  /** Loads full-resolution `dataUrl` strings for specific photo IDs (or all photos if omitted). */
  loadAnimalPhotoDataUrlsBatch?(photoIds?: string[]): Promise<Record<string, string>>;

  /** Queries a bounded BFS pedigree neighborhood (up to `maxDepth` ancestor generations) directly from SQLite. */
  queryPedigreeNeighborhood?(rootIds: string[], maxDepth: number): Promise<Animal[]>;

  /** Checks which animal IDs have at least one recorded sire/dam or offloaded archive in SQLite. */
  queryPedigreeBranchAncestorsExist?(animalIds: string[]): Promise<Record<string, boolean>>;

  /** Replaces the entire local database with a new snapshot (used for Backup Import / Merge / Seed). */
  replaceSnapshot(snapshot: BarnDatabaseSnapshot): Promise<void>;

  /** Persists global BarnSettings. */
  saveSettings(settings: BarnSettings): Promise<void>;

  /** Upserts or deletes a SpeciesProfile (or batch-updates card sort order). */
  saveSpeciesProfile(profile: SpeciesProfile): Promise<void>;
  saveSpeciesProfilesBatch(profiles: SpeciesProfile[]): Promise<void>;
  deleteSpeciesProfile(id: string): Promise<void>;

  /** Upserts or deletes Animal records (single or batch; deleting cascades photos & care logs). */
  saveAnimal(animal: Animal): Promise<void>;
  saveAnimalsBatch(animals: Animal[]): Promise<void>;
  deleteAnimal(id: string): Promise<void>;
  deleteAnimalsBatch(ids: string[]): Promise<void>;

  /** Upserts or deletes optimized AnimalPhoto records (single or batch). */
  saveAnimalPhoto(photo: AnimalPhoto): Promise<void>;
  saveAnimalPhotosBatch(photos: AnimalPhoto[]): Promise<void>;
  deleteAnimalPhoto(id: string): Promise<void>;

  /** Upserts or deletes a CageLocation record. */
  saveCage(cage: CageLocation): Promise<void>;
  deleteCage(id: string): Promise<void>;

  /** Upserts or deletes a BreedingRecord. */
  saveBreeding(breeding: BreedingRecord): Promise<void>;
  deleteBreeding(id: string): Promise<void>;

  /** Upserts or deletes BarnTask records (single or batch for Master Task List cascading). */
  saveTask(task: BarnTask): Promise<void>;
  saveTasksBatch(tasks: BarnTask[]): Promise<void>;
  deleteTask(id: string): Promise<void>;
  deleteTasksBatch(ids: string[]): Promise<void>;

  /** Upserts or deletes CareLog entries (single or transactional batch). */
  saveCareLog(log: CareLog): Promise<void>;
  saveCareLogsBatch?(logs: CareLog[]): Promise<void>;
  deleteCareLog(id: string): Promise<void>;

  /** Upserts or deletes a ShowEvent. */
  saveShow(show: ShowEvent): Promise<void>;
  deleteShow(id: string): Promise<void>;

  /** Upserts or deletes FeedBatch inventory lots and FeedAllocation usage entries. */
  saveFeedBatch(batch: FeedBatch): Promise<void>;
  saveFeedBatchesBatch(batches: FeedBatch[]): Promise<void>;
  deleteFeedBatch(id: string): Promise<void>;
  saveFeedAllocation(allocation: FeedAllocation): Promise<void>;
  deleteFeedAllocation(id: string): Promise<void>;

  /** Upserts or deletes Economic LedgerEntry records (single or batch). */
  saveLedgerEntry(entry: LedgerEntry): Promise<void>;
  saveLedgerEntriesBatch(entries: LedgerEntry[]): Promise<void>;
  deleteLedgerEntry(id: string): Promise<void>;

  /** Upserts or deletes Meat & Pelt ProcessingLog records (single or batch). */
  saveProcessingLog(log: ProcessingLog): Promise<void>;
  saveProcessingLogsBatch(logs: ProcessingLog[]): Promise<void>;
  deleteProcessingLog(id: string): Promise<void>;

  /** Upserts or deletes 4-H / FFA YouthProjectBook records (single or batch). */
  saveYouthProjectBook(project: YouthProjectBook): Promise<void>;
  saveYouthProjectBooksBatch(projects: YouthProjectBook[]): Promise<void>;
  deleteYouthProjectBook(id: string): Promise<void>;

  /** Upserts or deletes ClientContact CRM records (single or batch). */
  saveClientContact(client: ClientContact): Promise<void>;
  saveClientContactsBatch(clients: ClientContact[]): Promise<void>;
  deleteClientContact(id: string): Promise<void>;

  /** Upserts or deletes buyer WaitlistEntry records (single or batch). */
  saveWaitlistEntry(entry: WaitlistEntry): Promise<void>;
  saveWaitlistEntriesBatch(entries: WaitlistEntry[]): Promise<void>;
  deleteWaitlistEntry(id: string): Promise<void>;

  /** Upserts or deletes AnimalReservation records (single or batch). */
  saveAnimalReservation(reservation: AnimalReservation): Promise<void>;
  saveAnimalReservationsBatch(reservations: AnimalReservation[]): Promise<void>;
  deleteAnimalReservation(id: string): Promise<void>;

  /** Upserts or deletes WoolHarvest fiber & IAGARB records (single or batch). */
  saveWoolHarvest(harvest: WoolHarvest): Promise<void>;
  saveWoolHarvestsBatch(harvests: WoolHarvest[]): Promise<void>;
  deleteWoolHarvest(id: string): Promise<void>;

  /** Exports the raw unencrypted `.sqlite` binary database file (when running SQLite engine). */
  exportRawSqliteBytes(): Promise<Uint8Array | null>;

  /** Inspects a `.sqlite` binary database without modifying or closing the active local database. */
  inspectRawSqliteBytes?(bytes: Uint8Array, options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Imports a raw unencrypted `.sqlite` binary database file and persists it locally. */
  importRawSqliteBytes(bytes: Uint8Array, options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Closes and cleanly re-opens the local database connection without losing saved records. */
  resetConnection?(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Purges and rebuilds a corrupted primary IndexedDB/SQLite store cleanly from starter schema. */
  rebuildCleanDatabase?(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Checks persisted storage epoch and reloads internal state if another tab wrote newer changes. */
  syncFromPersistedStorageIfStale?(): Promise<boolean>;

  /** Returns detected wiped-storage recovery state when IndexedDB appeared wiped for a returning user. */
  getWipedRecoveryContext?(): WipedStorageRecoveryContext | null;
}
```

## `src/storage/storageProbes.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Restricted-Browser Storage Probes & Lifecycle Resource Registry (`src/storage/storageProbes.ts`).
 *
 * Intentionally free of React, DOM UI, and other `src/storage/*` module imports so it can be
 * imported safely from Dedicated Web Workers (`opfsTempStream.ts`) and main-thread adapters alike.
 *
 * Defends against:
 * - Safari Lockdown Mode & Firefox Private Browsing throwing `SecurityError` on property access
 *   to `localStorage`, `sessionStorage`, `indexedDB`, `navigator.storage`, `navigator.locks`,
 *   or `BroadcastChannel`.
 * - Stale IDB connections, open IDB transactions, or open BroadcastChannels blocking `versionchange`
 *   or bfcache preservation across `pagehide` and `visibilitychange` (`hidden`).
 */

export interface SafeWebLocksApi {
  request<R>(
    name: string,
    options: { mode?: 'exclusive' | 'shared'; signal?: AbortSignal },
    callback: () => Promise<R>
  ): Promise<R>;
}

export interface SafeStorageManager {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<StorageEstimate>;
  getDirectory?: () => Promise<unknown>;
}

export function getSafeLocalStorage(): Storage | null {
  try {
    const g = globalThis as unknown as { localStorage?: Storage; window?: { localStorage?: Storage } };
    const ls = g.localStorage ?? g.window?.localStorage;
    if (!ls || typeof ls.getItem !== 'function') {
      return null;
    }
    ls.getItem('__pedigree_probe__');
    return ls;
  } catch {
    return null;
  }
}

export function probeLocalStorageSupport(): { available: boolean; writable: boolean } {
  const ls = getSafeLocalStorage();
  if (!ls) return { available: false, writable: false };
  try {
    if (typeof ls.setItem !== 'function' || typeof ls.removeItem !== 'function') {
      return { available: true, writable: false };
    }
    const probeKey = '__pedigree_write_probe__';
    ls.setItem(probeKey, '1');
    ls.removeItem(probeKey);
    return { available: true, writable: true };
  } catch {
    return { available: true, writable: false };
  }
}

export function getSafeSessionStorage(): Storage | null {
  try {
    const g = globalThis as unknown as { sessionStorage?: Storage; window?: { sessionStorage?: Storage } };
    const ss = g.sessionStorage ?? g.window?.sessionStorage;
    if (!ss || typeof ss.getItem !== 'function') {
      return null;
    }
    ss.getItem('__pedigree_probe__');
    return ss;
  } catch {
    return null;
  }
}

export function getSafeIndexedDb(): IDBFactory | null {
  try {
    const g = globalThis as unknown as { indexedDB?: IDBFactory; window?: { indexedDB?: IDBFactory } };
    const idb = g.indexedDB ?? g.window?.indexedDB;
    if (!idb || typeof idb.open !== 'function') {
      return null;
    }
    return idb;
  } catch {
    return null;
  }
}

export function isIndexedDbBlockedError(err: unknown): boolean {
  if (!err) return false;
  const e = typeof err === 'object' ? (err as { name?: string; message?: string }) : undefined;
  const name = String(e?.name || '');
  const message = String(e?.message || (typeof err === 'string' ? err : ''));
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || name === 'VersionError') {
    return false;
  }
  if (
    name === 'SecurityError' ||
    name === 'InvalidStateError' ||
    name === 'UnknownError' ||
    name === 'NotAllowedError' ||
    name === 'NS_ERROR_FILE_ACCESS_DENIED'
  ) {
    return true;
  }
  return /indexeddb\s+is\s+unavailable|indexeddb\s+unavailable|private\s+browsing|lockdown|securityerror|not\s+allowed|backing\s+store|internal\s+error\s+opening\s+backing\s+store|mutation\s+operation\s+was\s+attempted\s+on\s+a\s+database\s+that\s+did\s+not\s+allow\s+mutations/i.test(
    `${name} ${message}`
  );
}

export function getSafeStorageManager(): SafeStorageManager | null {
  try {
    const g = globalThis as unknown as {
      navigator?: { storage?: SafeStorageManager };
    };
    const storage = g.navigator?.storage;
    if (!storage || typeof storage !== 'object') {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

export function getSafeWebLocks(): SafeWebLocksApi | null {
  try {
    const g = globalThis as unknown as {
      navigator?: { locks?: SafeWebLocksApi };
    };
    const locks = g.navigator?.locks;
    if (!locks || typeof locks.request !== 'function') {
      return null;
    }
    return locks;
  } catch {
    return null;
  }
}

export function getSafeBroadcastChannelCtor(): (new (name: string) => BroadcastChannel) | null {
  try {
    const g = globalThis as unknown as {
      BroadcastChannel?: new (name: string) => BroadcastChannel;
    };
    const ctor = g.BroadcastChannel;
    if (typeof ctor !== 'function') {
      return null;
    }
    return ctor;
  } catch {
    return null;
  }
}

export function probeBroadcastChannelSupport(): boolean {
  const Ctor = getSafeBroadcastChannelCtor();
  if (!Ctor) return false;
  try {
    const ch = new Ctor('__pedigree_bc_probe__');
    try {
      ch.close();
    } catch {
      // Ignore probe close error
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Active Resource Tracking (bfcache / pagehide / visibilitychange cleanup)
// ---------------------------------------------------------------------------

const activeIdbConnections = new Set<IDBDatabase>();
const activeIdbTransactions = new Set<IDBTransaction>();
const activeBroadcastChannels = new Map<BroadcastChannel, (() => void) | undefined>();
const pendingWebLockAborters = new Set<() => void>();

export function registerPendingWebLockAbort(abortFn: () => void): () => void {
  pendingWebLockAborters.add(abortFn);
  return () => {
    pendingWebLockAborters.delete(abortFn);
  };
}

export function abortPendingWebLocks(): number {
  let aborted = 0;
  for (const fn of Array.from(pendingWebLockAborters)) {
    pendingWebLockAborters.delete(fn);
    try {
      fn();
      aborted++;
    } catch {
      // Ignore abort error
    }
  }
  return aborted;
}

/**
 * Registers an open `IDBDatabase` connection so:
 * 1. `onversionchange` immediately closes it to prevent cross-tab upgrade stalls.
 * 2. `pagehide` / `visibilitychange === 'hidden'` closes any lingering connections for bfcache safety.
 */
export function trackActiveIdbConnection(db: IDBDatabase | null | undefined): () => void {
  if (!db) return () => {};
  activeIdbConnections.add(db);
  try {
    const prevHandler = db.onversionchange;
    db.onversionchange = (ev: IDBVersionChangeEvent) => {
      if (typeof prevHandler === 'function') {
        try {
          prevHandler.call(db, ev);
        } catch {
          // Ignore prior handler error
        }
      }
      activeIdbConnections.delete(db);
      try {
        db.close();
      } catch {
        // Ignore versionchange close error
      }
    };
  } catch {
    // Some lightweight test mocks do not permit setting onversionchange
  }
  return () => {
    activeIdbConnections.delete(db);
  };
}

/**
 * Tracks an active `IDBTransaction` so `pagehide` / `visibilitychange === 'hidden'`
 * can abort unfinished background transactions and unblock bfcache / locks.
 */
export function trackActiveIdbTransaction(tx: IDBTransaction | null | undefined): () => void {
  if (!tx) return () => {};
  activeIdbTransactions.add(tx);
  const cleanup = () => {
    activeIdbTransactions.delete(tx);
  };
  if (typeof tx.addEventListener === 'function') {
    try {
      tx.addEventListener('complete', cleanup, { once: true });
      tx.addEventListener('abort', cleanup, { once: true });
      tx.addEventListener('error', cleanup, { once: true });
    } catch {
      // Ignore event listener attachment failures on lightweight mocks
    }
  }
  return cleanup;
}

/**
 * Aborts any in-flight tracked IDB transactions and closes all tracked open IDB connections.
 */
export function releaseOpenIdbResources(): {
  transactionsAborted: number;
  connectionsClosed: number;
} {
  let transactionsAborted = 0;
  let connectionsClosed = 0;

  for (const tx of Array.from(activeIdbTransactions)) {
    activeIdbTransactions.delete(tx);
    try {
      if (typeof tx.abort === 'function') {
        tx.abort();
        transactionsAborted++;
      }
    } catch {
      // Transaction may already be finished/inactive
    }
  }

  for (const db of Array.from(activeIdbConnections)) {
    activeIdbConnections.delete(db);
    try {
      if (typeof db.close === 'function') {
        db.close();
        connectionsClosed++;
      }
    } catch {
      // Ignore close errors
    }
  }

  return { transactionsAborted, connectionsClosed };
}

export function trackBroadcastChannel(
  channel: BroadcastChannel | null | undefined,
  onForceClose?: () => void
): () => void {
  if (!channel) return () => {};
  activeBroadcastChannels.set(channel, onForceClose);
  return () => {
    activeBroadcastChannels.delete(channel);
  };
}

export function releaseOpenBroadcastChannels(): number {
  let closed = 0;
  for (const [ch, onForceClose] of Array.from(activeBroadcastChannels.entries())) {
    activeBroadcastChannels.delete(ch);
    try {
      if (typeof onForceClose === 'function') {
        onForceClose();
      }
    } catch {
      // Ignore cleanup callback errors
    }
    try {
      if (typeof ch.close === 'function') {
        ch.close();
      }
      closed++;
    } catch {
      // Ignore close error
    }
  }
  return closed;
}

export function getTrackedActiveResourceCountsForTests(): {
  idbConnections: number;
  idbTransactions: number;
  broadcastChannels: number;
} {
  return {
    idbConnections: activeIdbConnections.size,
    idbTransactions: activeIdbTransactions.size,
    broadcastChannels: activeBroadcastChannels.size,
  };
}
```

## `src/storage/storageProtection.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Storage Protection, Quota Guardrails, Rolling Local Backups, & PWA Install State.
 */

import { useCallback, useEffect, useState } from 'react';
import { getTierStoragePolicy } from '../core/deviceCapability';
import {
  BarnDatabaseSnapshot,
  getCoreClockSkewMs,
  nowEpochMs,
  nowIsoUtc,
  setCoreClockSkewMs,
} from '../core/models';
import {
  DiagnosticQuotaOperationKind,
  evaluateStorageQuotaForOperation,
  StorageQuotaEvaluationResult,
} from '../core/techyStuffGuardrails';
import { logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import { NativeContainerInfo, pedigreeBridge } from '../native/pedigreeBridge';
import { isOpfsSupported } from './opfsTempStream';
import { stripPhotoDataUrlsFromSnapshot } from './photoHydration';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  getSafeStorageManager,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
} from './storageProbes';

const ROLLING_IDB_NAME = 'community_pedigree_rolling_backups';
const ROLLING_STORE_NAME = 'snapshots';
const MAX_ROLLING_BACKUPS = 3;
const ROLLING_IDB_TIMEOUT_MS = 7000;

function estimateSnapshotByteSize(snapshot: BarnDatabaseSnapshot): number {
  let bytes = 512;
  bytes += (snapshot.speciesProfiles?.length || 0) * 480;
  bytes += (snapshot.animals?.length || 0) * 650;
  bytes += (snapshot.cages?.length || 0) * 200;
  bytes += (snapshot.breedings?.length || 0) * 350;
  bytes += (snapshot.tasks?.length || 0) * 240;
  bytes += (snapshot.careLogs?.length || 0) * 300;
  bytes += (snapshot.shows?.length || 0) * 280;
  bytes += (snapshot.feedAllocations?.length || 0) * 220;
  for (const fb of snapshot.feedBatches ?? []) {
    bytes += 360 + (fb.tagPhotoDataUrl?.length || 0) + (fb.tagPhotoThumbnailDataUrl?.length || 0);
  }
  for (const le of snapshot.ledgerEntries ?? []) {
    bytes +=
      320 +
      (le.receiptPhotoDataUrl?.length || 0) +
      (le.receiptPhotoThumbnailDataUrl?.length || 0);
  }
  bytes += (snapshot.processingLogs?.length || 0) * 320;
  for (const yp of snapshot.youthProjectBooks ?? []) {
    bytes += 540 + (yp.feedLogs?.length || 0) * 140;
  }
  bytes += (snapshot.clientContacts?.length || 0) * 320;
  bytes += (snapshot.waitlistEntries?.length || 0) * 320;
  bytes += (snapshot.animalReservations?.length || 0) * 440;
  bytes += (snapshot.woolHarvests?.length || 0) * 420;
  for (const photo of snapshot.animalPhotos ?? []) {
    const estimatedDataUrlBytes =
      photo.dataUrl?.length || (photo.storedBytes ? Math.ceil(photo.storedBytes * 1.37) : 0);
    bytes += 220 + estimatedDataUrlBytes + (photo.thumbnailDataUrl?.length || 0);
  }
  return bytes;
}

export interface StorageProtectionStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  checkedAtIso: string;
  isNativeWrapper: boolean;
  nativeContainerInfo: NativeContainerInfo | null;
}

export interface RollingBackupMeta {
  key: string;
  savedAtIso: string;
  animalCount: number;
  photoCount: number;
  speciesCount: number;
  byteSize: number;
}

interface StoredRollingBackup extends RollingBackupMeta {
  snapshot: BarnDatabaseSnapshot;
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    (typeof e.message === 'string' && /quota/i.test(e.message))
  );
}

export async function requestPersistentStorage(): Promise<StorageProtectionStatus> {
  const checkedAtIso = getAdjustedNowIsoUtc();
  const isNativeWrapper = pedigreeBridge.isNativeWrapper();
  const nativeInfoPromise = isNativeWrapper
    ? pedigreeBridge.getNativeContainerInfo(400)
    : Promise.resolve(null);

  const storage = getSafeStorageManager();
  if (!storage) {
    const nativeContainerInfo = await nativeInfoPromise;
    return {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      checkedAtIso,
      isNativeWrapper,
      nativeContainerInfo,
    };
  }

  // Never spoof navigator.storage.persisted() — Android WebView returns false honestly.
  let persisted = false;
  try {
    if (typeof storage.persisted === 'function') {
      persisted = await storage.persisted();
    }
    if (!persisted && typeof storage.persist === 'function') {
      persisted = await storage.persist();
    }
  } catch {
    persisted = false;
  }

  let usageBytes = 0;
  let quotaBytes = 0;
  try {
    if (typeof storage.estimate === 'function') {
      const est = await storage.estimate();
      usageBytes = Number(est.usage) || 0;
      quotaBytes = Number(est.quota) || 0;
    }
  } catch {
    // Ignore estimate failure
  }

  const nativeContainerInfo = await nativeInfoPromise;
  const percentUsed =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;

  return {
    supported: true,
    persisted,
    usageBytes,
    quotaBytes,
    percentUsed,
    checkedAtIso,
    isNativeWrapper,
    nativeContainerInfo,
  };
}

export async function checkStorageStatus(): Promise<StorageProtectionStatus> {
  const checkedAtIso = getAdjustedNowIsoUtc();
  const isNativeWrapper = pedigreeBridge.isNativeWrapper();
  const nativeInfoPromise = isNativeWrapper
    ? pedigreeBridge.getNativeContainerInfo(400)
    : Promise.resolve(null);

  const storage = getSafeStorageManager();
  if (!storage) {
    const nativeContainerInfo = await nativeInfoPromise;
    return {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      checkedAtIso,
      isNativeWrapper,
      nativeContainerInfo,
    };
  }
  let persisted = false;
  let usageBytes = 0;
  let quotaBytes = 0;
  try {
    if (typeof storage.persisted === 'function') {
      persisted = await storage.persisted();
    }
    if (typeof storage.estimate === 'function') {
      const est = await storage.estimate();
      usageBytes = Number(est.usage) || 0;
      quotaBytes = Number(est.quota) || 0;
    }
  } catch {
    // Ignore
  }
  const nativeContainerInfo = await nativeInfoPromise;
  const percentUsed =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;
  return {
    supported: true,
    persisted,
    usageBytes,
    quotaBytes,
    percentUsed,
    checkedAtIso,
    isNativeWrapper,
    nativeContainerInfo,
  };
}

function openRollingIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getSafeIndexedDb();
    if (!idb) {
      reject(new Error('Rolling backup IndexedDB is unavailable in this browser context.'));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Rolling backup IndexedDB open timed out after ${ROLLING_IDB_TIMEOUT_MS}ms — bypassing rolling backup`,
      });
      reject(new Error('Rolling backup IndexedDB open timeout'));
    }, ROLLING_IDB_TIMEOUT_MS);

    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err ?? 'Rolling IndexedDB error')));
    };

    try {
      const req = idb.open(ROLLING_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(ROLLING_STORE_NAME)) {
            db.createObjectStore(ROLLING_STORE_NAME, { keyPath: 'key' });
          }
        } catch (upgradeErr) {
          void import('./opfsStorage')
            .then((m) =>
              m.dumpIndexedDbDatabaseToOpfs(
                ROLLING_IDB_NAME,
                'Rolling backup IndexedDB schema upgrade failed'
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
          message: 'Corrective action: Rolling backup IndexedDB upgrade blocked by another tab — continuing without blocking UI',
        });
      };
      req.onsuccess = () => {
        if (settled) {
          try {
            req.result.close();
          } catch {
            // Ignore close failure
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
              m.dumpIndexedDbDatabaseToOpfs(
                ROLLING_IDB_NAME,
                'Rolling backup IndexedDB VersionError'
              )
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

export async function saveRollingSnapshotBackup(
  snapshot: BarnDatabaseSnapshot,
  options?: {
    maxRollingBackups?: number;
    dehydratePhotos?: boolean;
  }
): Promise<void> {
  if (!getSafeIndexedDb()) return;
  try {
    const policy = getTierStoragePolicy(detectCurrentDeviceCapability().tier);
    const maxRollingCap = Math.max(
      1,
      options?.maxRollingBackups ?? policy.rollingIdbCap ?? MAX_ROLLING_BACKUPS
    );
    const shouldDehydrate = options?.dehydratePhotos ?? policy.dehydrateMirrorPhotos;
    const targetSnapshot = shouldDehydrate
      ? stripPhotoDataUrlsFromSnapshot(snapshot)
      : snapshot;

    const entry: StoredRollingBackup = {
      key: `rolling-${getAdjustedNowMs()}`,
      savedAtIso: getAdjustedNowIsoUtc(),
      animalCount: targetSnapshot.animals.length,
      photoCount: (targetSnapshot.animalPhotos ?? []).length,
      speciesCount: targetSnapshot.speciesProfiles.length,
      byteSize: estimateSnapshotByteSize(targetSnapshot),
      snapshot: targetSnapshot,
    };
    const db = await openRollingIdb();
    const untrackDb = trackActiveIdbConnection(db);
    const closeDb = () => {
      untrackDb();
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readwrite');
        const untrackTx = trackActiveIdbTransaction(tx);
        const store = tx.objectStore(ROLLING_STORE_NAME);
        store.put(entry);

        const metas: Array<{ key: string; savedAtIso: string }> = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const val = cursor.value as Partial<StoredRollingBackup> | undefined;
            if (val?.key) {
              metas.push({
                key: val.key,
                savedAtIso: typeof val.savedAtIso === 'string' ? val.savedAtIso : '',
              });
            }
            cursor.continue();
          } else {
            metas.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
            for (let i = maxRollingCap; i < metas.length; i++) {
              store.delete(metas[i].key);
            }
          }
        };

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
          reject(tx.error || new Error('Rolling backup write aborted'));
        };
      });
    } finally {
      closeDb();
    }
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: isQuotaExceededError(err) ? 'memory' : 'storage',
      message: 'Corrective action: Skipped rolling snapshot backup write so primary save remains unaffected',
      error: err,
    });
  }
}

export async function listRollingSnapshotBackups(): Promise<RollingBackupMeta[]> {
  if (!getSafeIndexedDb()) return [];
  try {
    const db = await openRollingIdb();
    const untrackDb = trackActiveIdbConnection(db);
    try {
      return await new Promise<RollingBackupMeta[]>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readonly');
        const untrackTx = trackActiveIdbTransaction(tx);
        const store = tx.objectStore(ROLLING_STORE_NAME);
        const items: RollingBackupMeta[] = [];
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const rec = cursor.value as Partial<StoredRollingBackup> | undefined;
            if (rec && typeof rec.key === 'string') {
              items.push({
                key: rec.key,
                savedAtIso: typeof rec.savedAtIso === 'string' ? rec.savedAtIso : '',
                animalCount: Number(rec.animalCount) || 0,
                photoCount:
                  typeof rec.photoCount === 'number'
                    ? rec.photoCount
                    : Array.isArray(rec.snapshot?.animalPhotos)
                    ? rec.snapshot.animalPhotos.length
                    : 0,
                speciesCount: Number(rec.speciesCount) || 0,
                byteSize: Number(rec.byteSize) || 0,
              });
            }
            cursor.continue();
          } else {
            items.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
            untrackTx();
            resolve(items);
          }
        };
        req.onerror = () => {
          untrackTx();
          reject(req.error);
        };
        tx.onabort = () => {
          untrackTx();
          reject(tx.error || new Error('Rolling backup list aborted'));
        };
      });
    } finally {
      untrackDb();
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    }
  } catch {
    return [];
  }
}

export async function loadRollingSnapshotBackup(
  key: string
): Promise<BarnDatabaseSnapshot | null> {
  if (!getSafeIndexedDb()) return null;
  try {
    const db = await openRollingIdb();
    const untrackDb = trackActiveIdbConnection(db);
    try {
      return await new Promise<BarnDatabaseSnapshot | null>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readonly');
        const untrackTx = trackActiveIdbTransaction(tx);
        const req = tx.objectStore(ROLLING_STORE_NAME).get(key);
        req.onsuccess = () => {
          const rec = req.result as StoredRollingBackup | undefined;
          const snap = rec?.snapshot;
          untrackTx();
          if (
            !snap ||
            typeof snap !== 'object' ||
            !snap.settings ||
            !Array.isArray(snap.animals) ||
            !Array.isArray(snap.speciesProfiles)
          ) {
            resolve(null);
            return;
          }
          resolve(snap);
        };
        req.onerror = () => {
          untrackTx();
          reject(req.error);
        };
        tx.onabort = () => {
          untrackTx();
          reject(tx.error || new Error('Rolling backup load aborted'));
        };
      });
    } finally {
      untrackDb();
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    }
  } catch {
    return null;
  }
}

export async function deleteRollingSnapshotBackup(key: string): Promise<boolean> {
  if (!getSafeIndexedDb()) return false;
  try {
    const db = await openRollingIdb();
    const untrackDb = trackActiveIdbConnection(db);
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readwrite');
        const untrackTx = trackActiveIdbTransaction(tx);
        tx.objectStore(ROLLING_STORE_NAME).delete(key);
        tx.oncomplete = () => {
          untrackTx();
          resolve(true);
        };
        tx.onerror = () => {
          untrackTx();
          reject(tx.error);
        };
        tx.onabort = () => {
          untrackTx();
          reject(tx.error || new Error('Rolling backup delete aborted'));
        };
      });
    } finally {
      untrackDb();
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    }
  } catch {
    return false;
  }
}

// Manual Offline Mode Toggle & Timed Connectivity Probe
const MANUAL_OFFLINE_STORAGE_KEY = 'pedigree_manual_offline_v1';
const CLOCK_SKEW_STORAGE_KEY = 'pedigree_clock_skew_ms_v1';
export const CLOCK_DRIFT_WARNING_THRESHOLD_MS = 5 * 60_000; // 5 minutes

export type ConnectivityReason =
  | 'online'
  | 'manual_offline'
  | 'navigator_offline'
  | 'captive_or_unreachable';

export interface ConnectivityStatusSnapshot {
  navigatorOnline: boolean;
  manualOffline: boolean;
  probeStatus: 'idle' | 'probing' | 'reachable' | 'unreachable';
  probeDetail: string;
  lastProbeAtIso: string | null;
  clockSkewMs: number | null;
  clockDriftWarning: boolean;
  isEffectivelyOnline: boolean;
  reason: ConnectivityReason;
}

function readPersistedManualOffline(): boolean {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return false;
    return ls.getItem(MANUAL_OFFLINE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function readPersistedClockSkewMs(): number | null {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return null;
    const raw = ls.getItem(CLOCK_SKEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let manualOfflineState: boolean = readPersistedManualOffline();
let probeStatusState: ConnectivityStatusSnapshot['probeStatus'] = 'idle';
let probeDetailState = '';
let lastProbeAtIsoState: string | null = null;
let clockSkewMsState: number | null = readPersistedClockSkewMs();
setCoreClockSkewMs(clockSkewMsState);
const connectivityListeners = new Set<() => void>();
let browserConnectivityHooksAttached = false;

function computeConnectivityReason(
  navigatorOnline: boolean,
  manualOffline: boolean,
  probeStatus: ConnectivityStatusSnapshot['probeStatus']
): ConnectivityReason {
  if (manualOffline) return 'manual_offline';
  if (!navigatorOnline) return 'navigator_offline';
  if (probeStatus === 'unreachable') return 'captive_or_unreachable';
  return 'online';
}

export function getRecordedClockSkewMs(): number | null {
  return clockSkewMsState;
}

export function getAdjustedNowMs(): number {
  const skew = clockSkewMsState;
  if (skew === null || !Number.isFinite(skew)) return Date.now();
  return nowEpochMs();
}

export function getAdjustedNowIsoUtc(): string {
  if (clockSkewMsState !== getCoreClockSkewMs()) {
    setCoreClockSkewMs(clockSkewMsState);
  }
  return nowIsoUtc();
}

export function formatClockSkewHuman(skewMs: number | null | undefined): string {
  if (skewMs === null || skewMs === undefined || !Number.isFinite(skewMs)) {
    return '0 min';
  }
  const absMins = Math.round(Math.abs(skewMs) / 60_000);
  const direction = skewMs > 0 ? 'behind server time' : 'ahead of server time';
  if (absMins >= 120) {
    const hours = (absMins / 60).toFixed(1).replace(/\.0$/, '');
    return `${hours} hr ${direction}`;
  }
  return `${Math.max(1, absMins)} min ${direction}`;
}

export function recordServerDateHeaderSkew(
  dateHeader: string | null | undefined,
  localNowMs: number = Date.now()
): number | null {
  if (!dateHeader || typeof dateHeader !== 'string') return null;
  const parsedServerMs = Date.parse(dateHeader);
  if (!Number.isFinite(parsedServerMs) || parsedServerMs <= 0) return null;
  const skewMs = parsedServerMs - localNowMs;
  clockSkewMsState = skewMs;
  setCoreClockSkewMs(skewMs);
  try {
    const ls = getSafeLocalStorage();
    if (ls) {
      ls.setItem(CLOCK_SKEW_STORAGE_KEY, String(Math.round(skewMs)));
    }
  } catch {
    // Non-fatal in private browsing
  }
  notifyConnectivityListeners();
  return skewMs;
}

export function getConnectivitySnapshot(): ConnectivityStatusSnapshot {
  const navigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const reason = computeConnectivityReason(navigatorOnline, manualOfflineState, probeStatusState);
  const clockDriftWarning =
    clockSkewMsState !== null &&
    Number.isFinite(clockSkewMsState) &&
    Math.abs(clockSkewMsState) >= CLOCK_DRIFT_WARNING_THRESHOLD_MS;
  return {
    navigatorOnline,
    manualOffline: manualOfflineState,
    probeStatus: probeStatusState,
    probeDetail: probeDetailState,
    lastProbeAtIso: lastProbeAtIsoState,
    clockSkewMs: clockSkewMsState,
    clockDriftWarning,
    isEffectivelyOnline: reason === 'online',
    reason,
  };
}

function notifyConnectivityListeners(): void {
  for (const listener of connectivityListeners) {
    listener();
  }
}

export function isManualOfflineMode(): boolean {
  return manualOfflineState;
}

export function getEffectiveOnlineStatus(): boolean {
  return getConnectivitySnapshot().isEffectivelyOnline;
}

export function setManualOfflineMode(enabled: boolean): void {
  manualOfflineState = Boolean(enabled);
  try {
    const ls = getSafeLocalStorage();
    if (ls) {
      ls.setItem(MANUAL_OFFLINE_STORAGE_KEY, manualOfflineState ? 'true' : 'false');
    }
  } catch {
    // Non-fatal in private browsing
  }
  if (manualOfflineState) {
    probeDetailState = 'Manual App Offline Mode active — network actions held locally.';
  } else if (probeStatusState === 'unreachable') {
    probeStatusState = 'idle';
    probeDetailState = '';
  }
  notifyConnectivityListeners();
}

export function resetConnectivityStateForTests(): void {
  manualOfflineState = false;
  probeStatusState = 'idle';
  probeDetailState = '';
  lastProbeAtIsoState = null;
  clockSkewMsState = null;
  setCoreClockSkewMs(0);
  connectivityListeners.clear();
  try {
    const ls = getSafeLocalStorage();
    if (ls) {
      ls.removeItem(MANUAL_OFFLINE_STORAGE_KEY);
      ls.removeItem(CLOCK_SKEW_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export async function probeNetworkConnectivity(options?: {
  timeoutMs?: number;
  probeUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<ConnectivityStatusSnapshot> {
  const snapBefore = getConnectivitySnapshot();
  if (snapBefore.manualOffline) {
    probeStatusState = 'idle';
    probeDetailState = 'Skipped probe: Manual App Offline Mode is enabled.';
    notifyConnectivityListeners();
    return getConnectivitySnapshot();
  }
  if (!snapBefore.navigatorOnline) {
    probeStatusState = 'unreachable';
    probeDetailState = 'Browser reports no network interface connection.';
    lastProbeAtIsoState = getAdjustedNowIsoUtc();
    notifyConnectivityListeners();
    return getConnectivitySnapshot();
  }

  const fetchFn = options?.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!fetchFn) {
    probeStatusState = 'unreachable';
    probeDetailState = 'Fetch API unavailable to probe connectivity.';
    notifyConnectivityListeners();
    return getConnectivitySnapshot();
  }

  probeStatusState = 'probing';
  probeDetailState = 'Checking live reachability...';
  notifyConnectivityListeners();

  const timeoutMs = Math.max(500, options?.timeoutMs ?? 3500);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const baseProbeUrl = options?.probeUrl || './version.json';
    const sep = baseProbeUrl.includes('?') ? '&' : '?';
    const res = await fetchFn(`${baseProbeUrl}${sep}_probe=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller?.signal,
    });

    const dateHdr = res.headers?.get?.('date');
    if (dateHdr) {
      recordServerDateHeaderSkew(dateHdr);
    }

    if (!res.ok) {
      probeStatusState = 'unreachable';
      probeDetailState = `Probe returned HTTP ${res.status} (offline or captive Wi-Fi portal).`;
    } else {
      const contentType = res.headers?.get?.('content-type') || '';
      if (contentType && !/json|text\/plain/i.test(contentType)) {
        probeStatusState = 'unreachable';
        probeDetailState = 'Unexpected captive portal or proxy response instead of app manifest.';
      } else {
        await res.json();
        probeStatusState = 'reachable';
        probeDetailState = 'Live app manifest reachable.';
      }
    }
  } catch (err) {
    probeStatusState = 'unreachable';
    const isAbort = err instanceof Error && err.name === 'AbortError';
    probeDetailState = isAbort
      ? `Connectivity probe timed out after ${timeoutMs}ms (captive Wi-Fi or dead zone).`
      : 'Network unreachable during connectivity probe — holding edits locally.';
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
    lastProbeAtIsoState = getAdjustedNowIsoUtc();
    notifyConnectivityListeners();
  }

  return getConnectivitySnapshot();
}

export function useConnectivityStatus(): ConnectivityStatusSnapshot & {
  setManualOffline: (enabled: boolean) => void;
  probeNow: (options?: { timeoutMs?: number }) => Promise<ConnectivityStatusSnapshot>;
} {
  const [snap, setSnap] = useState<ConnectivityStatusSnapshot>(getConnectivitySnapshot);

  useEffect(() => {
    const sync = () => setSnap(getConnectivitySnapshot());
    connectivityListeners.add(sync);

    if (!browserConnectivityHooksAttached && typeof window !== 'undefined') {
      browserConnectivityHooksAttached = true;
      const handleBrowserOnline = () => {
        if (probeStatusState === 'unreachable') {
          probeStatusState = 'idle';
          probeDetailState = '';
        }
        notifyConnectivityListeners();
      };
      const handleBrowserOffline = () => {
        notifyConnectivityListeners();
      };
      window.addEventListener('online', handleBrowserOnline);
      window.addEventListener('offline', handleBrowserOffline);
    }

    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();

    return () => {
      connectivityListeners.delete(sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const probeNow = useCallback(
    (opts?: { timeoutMs?: number }) => probeNetworkConnectivity(opts),
    []
  );

  return {
    ...snap,
    setManualOffline: setManualOfflineMode,
    probeNow,
  };
}

export function useOnlineStatus(): boolean {
  return useConnectivityStatus().isEffectivelyOnline;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hasMsStream =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { MSStream?: unknown }).MSStream);
  const isTraditionalIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !hasMsStream;
  const isIpadOsDesktopUa =
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;
  return isTraditionalIos || isIpadOsDesktopUa;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const legacyStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (legacyStandalone) return true;
  try {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(display-mode: standalone)').matches;
    }
  } catch {
    // Ignore unsupported matchMedia in legacy WebViews
  }
  return false;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(isStandalonePwa);
  const [isIos] = useState<boolean>(isIosBrowser);

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const onMqChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    let usingLegacyListener = false;

    try {
      if (typeof window.matchMedia === 'function') {
        mq = window.matchMedia('(display-mode: standalone)');
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', onMqChange);
        } else if (typeof mq.addListener === 'function') {
          mq.addListener(onMqChange);
          usingLegacyListener = true;
          logDiagnosticEvent({
            level: 'info',
            category: 'runtime',
            message: 'Corrective action: Used legacy MediaQueryList.addListener fallback for standalone PWA detection',
          });
        }
      }
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message: 'Corrective action: matchMedia listener unavailable in this browser — continuing without display-mode listener',
        error: err,
      });
      mq = null;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      try {
        if (mq) {
          if (!usingLegacyListener && typeof mq.removeEventListener === 'function') {
            mq.removeEventListener('change', onMqChange);
          } else if (typeof mq.removeListener === 'function') {
            mq.removeListener(onMqChange);
          }
        }
      } catch {
        // Ignore cleanup failure
      }
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
    return outcome;
  }, [deferredPrompt]);

  return {
    canPromptInstall: !pedigreeBridge.isNativeWrapper() && Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    isIos,
    promptInstall,
  };
}

export interface DiagnosticQuotaPreflightResult extends StorageQuotaEvaluationResult {
  statusSnapshot: StorageProtectionStatus;
}

/**
 * Checks OPFS availability and IndexedDB/StorageManager quota headroom before running
 * heavy diagnostic ZIP dumps, photo re-optimization, or cache clearing / DB rebuilds.
 */
export async function verifyStorageQuotaForDiagnosticAction(options: {
  operation: DiagnosticQuotaOperationKind;
  operationLabel: string;
  estimatedRequiredBytes: number;
  requiresOpfsPreferred?: boolean;
}): Promise<DiagnosticQuotaPreflightResult> {
  const statusSnapshot = await checkStorageStatus();
  const opfsSupported = isOpfsSupported();
  const evalResult = evaluateStorageQuotaForOperation({
    operation: options.operation,
    operationLabel: options.operationLabel,
    estimatedRequiredBytes: options.estimatedRequiredBytes,
    storageStatus: statusSnapshot,
    opfsSupported,
    requiresOpfsPreferred: options.requiresOpfsPreferred,
  });

  if (evalResult.level !== 'ok') {
    logDiagnosticEvent({
      level: evalResult.level === 'blocked' ? 'error' : 'warn',
      category: 'storage',
      message: `${evalResult.headline}: ${evalResult.detail}`,
    });
  }

  return {
    ...evalResult,
    statusSnapshot,
  };
}

```

## `src/storage/webImageOptimizer.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Web / PWA Image Compression & Thumbnail Pipeline (`src/storage/webImageOptimizer.ts`).
 *
 * Optimizes both:
 * 1. Direct end-user photos added on an animal's page or editor modal (`File` / `Blob`)
 * 2. Incoming binary images extracted from any External Platform Importer (`Uint8Array`)
 *
 * Strategy:
 * - Honors smartphone EXIF orientation (`imageOrientation: 'from-image'`) and strips bloated camera EXIF/GPS tags.
 * - Proportional downscale to preset ceiling (`960px` / `1280px` / `1600px`) with high-quality bicubic smoothing; never upscales small photos.
 * - Encodes to modern `image/webp` (typically 93%–97% smaller than raw 12MP phone JPEGs while retaining crisp coat/tattoo detail), with automatic `image/jpeg` fallback.
 * - Generates a dedicated ~256px `thumbnailDataUrl` (~8–14 KB) so herd lists and multi-photo strips scroll at 60fps.
 * - Never-Inflate Guard: if an imported photo is already web-safe (`jpeg`/`webp`), fits within target bounds, and is smaller than the re-encoded output, keeps the smaller original payload.
 *
 * On React Native / Expo, swap in `expo-image-manipulator` implementing the same `OptimizedImagePayload` output.
 */

import { dataUrlToBinary } from '../core/backupArchive';
import {
  calculateSavingsPercent,
  capCanvasDevicePixelRatio,
  clampCanvasDimensionsToAreaCeiling,
  computeScaledDimensions,
  estimateDataUrlByteLength,
  getCanvasAreaCeiling,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
  resolveImageOptimizationPreset,
} from '../core/imageOptimizationSpec';
import { StagedImportedPhoto } from '../core/importers/importerTypes';
import { isFileReaderSupported, readBlobAsArrayBuffer } from '../utils/es2018Shims';
import {
  isSvgImageInput,
  MAX_IMAGE_PIXEL_DIMENSION,
  MAX_IMAGE_TOTAL_PIXELS,
  MAX_PHOTO_UPLOAD_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { AnimalPhoto, nowIsoUtc } from '../core/models';
import { logDiagnosticEvent } from './crashLogger';
import {
  detectCurrentDeviceCapability,
  probeWebpEncodeSupport,
} from './deviceCapabilityDetector';

export type ReleasableCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Releases canvas GPU/RAM backing memory promptly in `finally` blocks across Safari/WebKit/Chromium.
 */
export function releaseCanvas(canvas: ReleasableCanvas | null | undefined): void {
  if (!canvas) return;
  try {
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (ctx && typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, 1, 1);
    }
  } catch {
    // Ignore context/clear errors during teardown
  } finally {
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      // Ignore detached/readonly canvas teardown errors
    }
  }
}

/**
 * Verifies both `OffscreenCanvas` global presence and a live 2D context before worker canvas usage.
 */
export function probeOffscreenCanvas2dSupport(): boolean {
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }
  let probe: OffscreenCanvas | null = null;
  try {
    probe = new OffscreenCanvas(1, 1);
    const ctx = probe.getContext('2d');
    return ctx !== null;
  } catch {
    return false;
  } finally {
    releaseCanvas(probe);
  }
}

export function isConstrainedCanvasTier(): boolean {
  return detectCurrentDeviceCapability().shouldApplyLowMemoryHandling;
}

export function getEffectiveCanvasDevicePixelRatio(
  isConstrained: boolean = isConstrainedCanvasTier()
): number {
  const rawDpr =
    typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
      ? window.devicePixelRatio || 1
      : 1;
  return capCanvasDevicePixelRatio(rawDpr, isConstrained);
}

export function enforceCanvasDimensions(
  width: number,
  height: number,
  isConstrained: boolean = isConstrainedCanvasTier()
): { width: number; height: number; wasClamped: boolean } {
  return clampCanvasDimensionsToAreaCeiling(
    width,
    height,
    getCanvasAreaCeiling(isConstrained)
  );
}

interface DecodedCanvasSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeBlobToCanvasSource(
  blob: Blob,
  originalFileName = ''
): Promise<DecodedCanvasSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement loader
    }
  }

  return new Promise<DecodedCanvasSource>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    const releaseImageObjectUrl = () => {
      img.onload = null;
      img.onerror = null;
      try {
        img.src = '';
      } catch {
        // Ignore readonly src teardown
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
        cleanup: releaseImageObjectUrl,
      });
    };
    img.onerror = () => {
      releaseImageObjectUrl();
      const isHeic =
        /heic|heif/i.test(blob.type || '') || /\.(heic|heif)$/i.test(originalFileName);
      reject(
        new Error(
          isHeic
            ? `Cannot decode iPhone HEIC/HEIF photo "${originalFileName || 'image'}" in this browser. Change iPhone Camera Format to "Most Compatible" (JPEG) or export as JPG/PNG first.`
            : `Unsupported or unreadable image format${originalFileName ? ` (${originalFileName})` : ''}. Try JPG, PNG, or WebP.`
        )
      );
    };
    img.src = objectUrl;
  });
}

function renderToMainThreadCanvasDataUrl(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  isConstrained: boolean
): { dataUrl: string; mimeType: string } {
  const safeDims = enforceCanvasDimensions(targetWidth, targetHeight, isConstrained);
  const canvas = document.createElement('canvas');
  let jpegCanvas: HTMLCanvasElement | null = null;
  try {
    canvas.width = safeDims.width;
    canvas.height = safeDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D Canvas context unavailable for image optimization.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, safeDims.width, safeDims.height);

    // Prefer modern WebP (supports alpha transparency + ~35% smaller than JPEG at equal visual clarity)
    if (probeWebpEncodeSupport()) {
      const webpUrl = canvas.toDataURL('image/webp', quality);
      if (webpUrl.startsWith('data:image/webp')) {
        return { dataUrl: webpUrl, mimeType: 'image/webp' };
      }
    }

    // Fallback to JPEG if browser lacks WebP canvas encoding: composite over warm neutral card fill first
    jpegCanvas = document.createElement('canvas');
    jpegCanvas.width = safeDims.width;
    jpegCanvas.height = safeDims.height;
    const jCtx = jpegCanvas.getContext('2d');
    if (!jCtx) {
      throw new Error('2D Canvas JPEG fallback context unavailable.');
    }
    jCtx.fillStyle = '#F7F2E7';
    jCtx.fillRect(0, 0, safeDims.width, safeDims.height);
    jCtx.drawImage(canvas, 0, 0);
    const jpegUrl = jpegCanvas.toDataURL('image/jpeg', quality);
    return { dataUrl: jpegUrl, mimeType: 'image/jpeg' };
  } finally {
    releaseCanvas(canvas);
    releaseCanvas(jpegCanvas);
  }
}

async function renderToOffscreenWorkerDataUrl(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  isConstrained: boolean
): Promise<{ dataUrl: string; mimeType: string }> {
  const safeDims = enforceCanvasDimensions(targetWidth, targetHeight, isConstrained);
  const canvas = new OffscreenCanvas(safeDims.width, safeDims.height);
  let jpegCanvas: OffscreenCanvas | null = null;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('OffscreenCanvas 2D context unavailable for worker image optimization.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, safeDims.width, safeDims.height);

    if (typeof canvas.convertToBlob === 'function') {
      try {
        const webpBlob = await canvas.convertToBlob({ type: 'image/webp', quality });
        if (webpBlob.type === 'image/webp') {
          return { dataUrl: await blobToDataUrl(webpBlob), mimeType: 'image/webp' };
        }
      } catch {
        // Fall through to JPEG OffscreenCanvas encode
      }

      jpegCanvas = new OffscreenCanvas(safeDims.width, safeDims.height);
      const jCtx = jpegCanvas.getContext('2d');
      if (!jCtx) {
        throw new Error('OffscreenCanvas 2D JPEG fallback context unavailable.');
      }
      jCtx.fillStyle = '#F7F2E7';
      jCtx.fillRect(0, 0, safeDims.width, safeDims.height);
      jCtx.drawImage(canvas, 0, 0);
      const jpegBlob = await jpegCanvas.convertToBlob({ type: 'image/jpeg', quality });
      return { dataUrl: await blobToDataUrl(jpegBlob), mimeType: 'image/jpeg' };
    }

    throw new Error('OffscreenCanvas.convertToBlob unavailable.');
  } finally {
    releaseCanvas(canvas);
    releaseCanvas(jpegCanvas);
  }
}

async function renderToDataUrl(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  isConstrained: boolean
): Promise<{ dataUrl: string; mimeType: string }> {
  if (typeof document !== 'undefined') {
    return renderToMainThreadCanvasDataUrl(
      source,
      targetWidth,
      targetHeight,
      quality,
      isConstrained
    );
  }
  if (probeOffscreenCanvas2dSupport()) {
    return renderToOffscreenWorkerDataUrl(
      source,
      targetWidth,
      targetHeight,
      quality,
      isConstrained
    );
  }
  throw new Error(
    'Neither document 2D canvas nor OffscreenCanvas 2D context is available for image optimization.'
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (isFileReaderSupported()) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed reading image blob.'));
        reader.onabort = () => reject(new Error('Image blob read aborted.'));
        reader.readAsDataURL(blob);
      });
    } catch {
      // Fall through to ArrayBuffer + base64 conversion when FileReader is blocked (e.g. Lockdown Mode)
    }
  }

  const buffer = await readBlobAsArrayBuffer(blob);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : '';
  const mime = blob.type || 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
}

/**
 * Optimizes a browser `Blob` or `File` into a compact full-view `dataUrl` + tiny `thumbnailDataUrl`.
 */
export async function optimizeImageBlob(
  blob: Blob,
  originalFileName: string,
  presetId?: ImageOptimizationPresetId
): Promise<OptimizedImagePayload> {
  const sizeCheck = validateUploadFileSize(
    originalFileName || 'photo',
    blob.size,
    MAX_PHOTO_UPLOAD_BYTES,
    'a photo upload'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }
  const headBytes = new Uint8Array(await readBlobAsArrayBuffer(blob.slice(0, 512)));
  if (isSvgImageInput(blob.type, originalFileName, headBytes)) {
    throw new Error(
      `SVG image "${originalFileName || 'image.svg'}" cannot be imported as a raster animal photo. Please upload a JPG, PNG, WebP, or GIF image.`
    );
  }

  const preset = resolveImageOptimizationPreset(presetId);
  const originalBytes = blob.size;
  const decoded = await decodeBlobToCanvasSource(blob, originalFileName);

  try {
    if (
      !Number.isFinite(decoded.width) ||
      !Number.isFinite(decoded.height) ||
      decoded.width <= 0 ||
      decoded.height <= 0 ||
      decoded.width > MAX_IMAGE_PIXEL_DIMENSION ||
      decoded.height > MAX_IMAGE_PIXEL_DIMENSION ||
      decoded.width * decoded.height > MAX_IMAGE_TOTAL_PIXELS
    ) {
      throw new Error(
        `Image "${originalFileName || 'photo'}" (${decoded.width}x${decoded.height} px) exceeds the safe pixel resolution limit (${MAX_IMAGE_PIXEL_DIMENSION.toLocaleString()}px / 100 MP).`
      );
    }
    const isConstrained = isConstrainedCanvasTier();
    const maxCanvasAreaPx = getCanvasAreaCeiling(isConstrained);
    let activePreset = preset;
    let mainDims = computeScaledDimensions(
      decoded.width,
      decoded.height,
      activePreset.maxDimension,
      maxCanvasAreaPx
    );
    let mainEncoded: { dataUrl: string; mimeType: string };
    try {
      mainEncoded = await renderToDataUrl(
        decoded.source,
        mainDims.width,
        mainDims.height,
        activePreset.quality,
        isConstrained
      );
    } catch (renderErr) {
      // Automatic low-memory self-recovery: step down to Compact (960px) before failing
      if (activePreset.maxDimension > 960) {
        logDiagnosticEvent({
          level: 'warn',
          category: 'media',
          message: `Corrective action: Image canvas encode for "${originalFileName || 'photo'}" fell back to Compact 960px preset`,
          error: renderErr,
        });
        activePreset = resolveImageOptimizationPreset('compact');
        mainDims = computeScaledDimensions(
          decoded.width,
          decoded.height,
          activePreset.maxDimension,
          maxCanvasAreaPx
        );
        mainEncoded = await renderToDataUrl(
          decoded.source,
          mainDims.width,
          mainDims.height,
          activePreset.quality,
          isConstrained
        );
      } else {
        throw renderErr;
      }
    }
    let storedBytes = estimateDataUrlByteLength(mainEncoded.dataUrl);

    // Never-Inflate Guard: if input was already a compact JPEG/WebP within target dimensions
    // and smaller than re-encoded output, keep the smaller original bytes!
    const isAlreadyCompactWebFormat =
      blob.type === 'image/jpeg' || blob.type === 'image/webp';
    if (
      !mainDims.wasResized &&
      isAlreadyCompactWebFormat &&
      originalBytes > 0 &&
      originalBytes < storedBytes
    ) {
      const passthroughUrl = await blobToDataUrl(blob);
      mainEncoded = { dataUrl: passthroughUrl, mimeType: blob.type };
      storedBytes = originalBytes;
    }

    const thumbDims = computeScaledDimensions(
      decoded.width,
      decoded.height,
      activePreset.thumbnailDimension,
      maxCanvasAreaPx
    );
    const thumbEncoded = await renderToDataUrl(
      decoded.source,
      thumbDims.width,
      thumbDims.height,
      activePreset.thumbnailQuality,
      isConstrained
    );

    return {
      originalFileName,
      mimeType: mainEncoded.mimeType,
      width: mainDims.width,
      height: mainDims.height,
      originalBytes,
      storedBytes,
      savingsPercent: calculateSavingsPercent(originalBytes, storedBytes),
      thumbnailDataUrl:
        estimateDataUrlByteLength(thumbEncoded.dataUrl) < storedBytes
          ? thumbEncoded.dataUrl
          : mainEncoded.dataUrl,
      dataUrl: mainEncoded.dataUrl,
    };
  } finally {
    decoded.cleanup();
  }
}

/**
 * Convenience wrapper for `<input type="file">` uploads on an animal's page.
 */
export async function optimizeImageFile(
  file: File,
  presetId?: ImageOptimizationPresetId
): Promise<OptimizedImagePayload> {
  return optimizeImageBlob(file, file.name, presetId);
}

/**
 * Optimizes raw `Uint8Array` image bytes extracted from any External Platform Importer (e.g. HerdBoss `.ZIP`).
 */
export async function optimizeImageBytes(
  bytes: Uint8Array,
  originalFileName: string,
  mimeHint = 'image/jpeg',
  presetId?: ImageOptimizationPresetId
): Promise<OptimizedImagePayload> {
  // Create a clean ArrayBuffer copy slice for Blob compatibility across strict TypeScript DOM libs
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeHint || 'image/jpeg' });
  return optimizeImageBlob(blob, originalFileName, presetId);
}

export interface BatchImportPhotoProgress {
  completed: number;
  total: number;
  savedBytesSoFar: number;
}

export interface BatchImportPhotoResult {
  photos: AnimalPhoto[];
  totalOriginalBytes: number;
  totalStoredBytes: number;
  failedFiles: string[];
}

/**
 * Optimizes all `StagedImportedPhoto` items from any platform importer in tier-aware
 * non-blocking batches (1 on Tier 1–2 low-memory devices, 2 on Tier 3, 4 on Tiers 4–5),
 * producing ready-to-save `AnimalPhoto` entities with deterministic IDs.
 */
export async function optimizeStagedImporterPhotos(
  staged: StagedImportedPhoto[],
  presetId?: ImageOptimizationPresetId,
  onProgress?: (progress: BatchImportPhotoProgress) => void,
  options?: { concurrency?: number }
): Promise<BatchImportPhotoResult> {
  const ts = nowIsoUtc();
  const photos: AnimalPhoto[] = [];
  const failedFiles: string[] = [];
  let totalOriginalBytes = 0;
  let totalStoredBytes = 0;

  const detectedTier = detectCurrentDeviceCapability().tier;
  // Default sequential (1) to avoid concurrent decoded-bitmap memory spikes across devices
  const requestedConcurrency = options?.concurrency ?? 1;
  const CHUNK_SIZE =
    detectedTier <= 2 ? 1 : Math.max(1, Math.min(4, Math.round(requestedConcurrency)));
  for (let i = 0; i < staged.length; i += CHUNK_SIZE) {
    const slice = staged.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      slice.map(async (item) => {
        try {
          const opt = await optimizeImageBytes(
            item.bytes,
            item.originalFileName,
            item.mimeHint,
            presetId
          );
          const record: AnimalPhoto = {
            id: item.id,
            species: item.species,
            animalId: item.animalId,
            isPrimary: item.isPrimary,
            sortOrder: item.sortOrder,
            caption: item.caption,
            originalFileName: opt.originalFileName,
            mimeType: opt.mimeType,
            width: opt.width,
            height: opt.height,
            originalBytes: opt.originalBytes,
            storedBytes: opt.storedBytes,
            thumbnailDataUrl: opt.thumbnailDataUrl,
            dataUrl: opt.dataUrl,
            createdAt: ts,
            updatedAt: ts,
          };
          return { ok: true as const, record };
        } catch {
          return { ok: false as const, fileName: item.entryPath };
        }
      })
    );

    for (const res of chunkResults) {
      if (res.ok) {
        photos.push(res.record);
        totalOriginalBytes += res.record.originalBytes;
        totalStoredBytes += res.record.storedBytes;
      } else {
        failedFiles.push(res.fileName);
      }
    }

    if (onProgress) {
      onProgress({
        completed: Math.min(staged.length, i + slice.length),
        total: staged.length,
        savedBytesSoFar: Math.max(0, totalOriginalBytes - totalStoredBytes),
      });
    }

    // Yield to browser paint loop so progress bar stays responsive on large 100+ photo archives
    await new Promise((r) => setTimeout(r, 0));
  }

  // Ensure each animal still has a primary photo if its intended #0 photo failed to decode
  const grouped = new Map<string, AnimalPhoto[]>();
  for (const p of photos) {
    const arr = grouped.get(p.animalId) || [];
    arr.push(p);
    grouped.set(p.animalId, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    if (!arr.some((p) => p.isPrimary) && arr.length > 0) {
      arr[0].isPrimary = true;
    }
  }

  return {
    photos,
    totalOriginalBytes,
    totalStoredBytes,
    failedFiles,
  };
}

/**
 * Re-optimizes an existing stored `AnimalPhoto` record down to `targetPresetId`.
 * Honors Never-Inflate protection so photos that are already compact remain untouched.
 */
export async function reoptimizeAnimalPhotoRecord(
  photo: AnimalPhoto,
  targetPresetId?: ImageOptimizationPresetId
): Promise<{
  updated: boolean;
  reclaimedBytes: number;
  photo: AnimalPhoto;
}> {
  if (!photo.dataUrl) {
    return { updated: false, reclaimedBytes: 0, photo };
  }
  const binary = dataUrlToBinary(photo.dataUrl, photo.mimeType || 'image/webp');
  if (!binary || binary.bytes.byteLength === 0) {
    return { updated: false, reclaimedBytes: 0, photo };
  }
  const opt = await optimizeImageBytes(
    binary.bytes,
    photo.originalFileName || `${photo.id}.webp`,
    binary.mimeType,
    targetPresetId
  );
  const beforeBytes = Math.max(photo.storedBytes || 0, binary.bytes.byteLength);
  if (opt.storedBytes >= beforeBytes) {
    return { updated: false, reclaimedBytes: 0, photo };
  }
  const reclaimedBytes = Math.max(0, beforeBytes - opt.storedBytes);
  const nextPhoto: AnimalPhoto = {
    ...photo,
    mimeType: opt.mimeType,
    width: opt.width,
    height: opt.height,
    storedBytes: opt.storedBytes,
    thumbnailDataUrl: opt.thumbnailDataUrl || photo.thumbnailDataUrl,
    dataUrl: opt.dataUrl,
    _rev: (photo._rev ?? 0) + 1,
    updatedAt: nowIsoUtc(),
  };
  return { updated: true, reclaimedBytes, photo: nextPhoto };
}
```

## `src/storage/webSqliteAdapter.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Unencrypted Local SQLite Browser Adapter (`sql.js` WebAssembly + IndexedDB Persistence).
 *
 * Uses standard relational SQLite tables identical to what `expo-sqlite` executes on
 * native Android and iOS, and saves the unencrypted `.sqlite` binary file inside the
 * browser's local IndexedDB so users have 100% offline persistence AND 1-click access
 * to download or import the raw `.sqlite` file for Google Drive / OneDrive / SyncThing.
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  sanitizeSafeRasterImageDataUrl,
  validateSqliteFileHeader,
} from '../core/inputSanitization';
import {
  Animal,
  AnimalPhoto,
  AnimalReservation,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ClientContact,
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  FeedAllocation,
  FeedAllocationTargetType,
  FeedBatch,
  LedgerEntry,
  normalizeAnimalStatus,
  normalizeBreedScheduleOverrides,
  normalizeCalendarSyncSettings,
  normalizeClientKind,
  normalizeCurrencyCode,
  normalizeFeedPurgeWindowDays,
  normalizeHousingUnitType,
  normalizeIgnoredConflicts,
  normalizeLedgerCategory,
  normalizeLedgerEntryType,
  normalizeLitterWeightMilestones,
  normalizeOwnershipType,
  normalizePeltGrade,
  normalizePreferredContactMethod,
  normalizeProcessingStatus,
  normalizeReservationStatus,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeTargetWeightCurve,
  normalizeUltrasoundResult,
  normalizeWaitlistIntent,
  normalizeWaitlistStatus,
  normalizeWeightUnit,
  normalizeWoolHarvestMethod,
  normalizeYouthOrgType,
  normalizeYouthProjectFeedLogs,
  nowIsoUtc,
  ProcessingLog,
  ShowEvent,
  SpeciesProfile,
  WaitlistEntry,
  WoolHarvest,
  YouthProjectBook,
} from '../core/models';
import { normalizeIagarbScorecard } from '../core/woolFiber';
import { buildFullPredefinedSampleSnapshot } from '../core/sampleData';
import { reconcileCarrierTraitLists } from '../core/carrierGenetics';
import { getTierStoragePolicy } from '../core/deviceCapability';
import { buildEmptyShellSnapshot } from '../core/backupVault';
import {
  mergeEnteredAnimalIdsWithResults,
  normalizeShowResults,
} from '../core/showResults';
import { sanitizeSpeciesMemo } from '../core/speciesMemo';
import { isMemoryLikeError, logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import {
  getCurrentTabId,
  publishCrossTabDbCommit,
  withCrossTabLock,
} from './localSyncChannels';
import {
  detectReturningUserWipedStorage,
  dumpIndexedDbDatabaseToOpfs,
  dumpRawRecordsToOpfsRecoveryBackup,
  isVersionError,
  markPriorUseSentinelFromSnapshot,
  saveOpfsVaultBackup,
  WipedStorageRecoveryContext,
} from './opfsStorage';
import { stripPhotoDataUrlsFromSnapshot } from './photoHydration';
import { SnapshotLoadOptions, StorageAdapter } from './storageAdapter';
import {
  getAdjustedNowIsoUtc,
  isQuotaExceededError,
  listRollingSnapshotBackups,
  loadRollingSnapshotBackup,
  saveRollingSnapshotBackup,
} from './storageProtection';
import {
  getSafeIndexedDb,
  isIndexedDbBlockedError,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
} from './storageProbes';

const IDB_DB_NAME = 'community_pedigree_local_db';
const IDB_STORE_NAME = 'sqlite_files';
const IDB_PRIMARY_KEY = 'pedigree_master.sqlite';
const IDB_FALLBACK_SNAPSHOT_KEY = 'pedigree_fallback_json';
export const IDB_WRITE_EPOCH_KEY = 'pedigree_write_epoch';
export const DB_WRITE_LOCK_NAME = 'community_pedigree_db_write_v1';
const SQLITE_SCHEMA_VERSION = 6;

type SqlJsInitConfig = NonNullable<Parameters<typeof initSqlJs>[0]> & {
  useOldExtensionFunctions: boolean;
};

function createSqlJsInitConfig(): SqlJsInitConfig {
  return {
    locateFile: () => sqlWasmUrl,
    useOldExtensionFunctions: false,
  };
}

export interface PersistedWriteEpochMeta {
  epoch: number;
  writerTabId: string;
  updatedAtIso: string;
}

/**
 * Canonical SQLite DDL shared 1:1 with future `expo-sqlite` native adapter.
 */
export const PEDIGREE_SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS barn_settings (
    id TEXT PRIMARY KEY NOT NULL,
    barn_name TEXT NOT NULL,
    breeder_name TEXT NOT NULL,
    preferred_unit TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    default_species TEXT NOT NULL,
    pinned_landing_species TEXT NOT NULL,
    default_generations INTEGER NOT NULL,
    theme_mode TEXT NOT NULL,
    custom_colors_json TEXT NOT NULL DEFAULT '{}',
    image_optimization_preset TEXT NOT NULL DEFAULT 'balanced',
    extra_settings_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS species_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    default_animal_prefix TEXT NOT NULL DEFAULT '',
    preferred_unit TEXT NOT NULL DEFAULT '',
    memo_text TEXT NOT NULL DEFAULT '',
    memo_updated_at TEXT NOT NULL DEFAULT '',
    gestation_days INTEGER NOT NULL,
    rebreed_days_after_birth INTEGER NOT NULL,
    wean_days_after_birth INTEGER NOT NULL,
    maturity_days INTEGER NOT NULL DEFAULT 0,
    birth_event_label TEXT NOT NULL,
    male_label TEXT NOT NULL,
    female_label TEXT NOT NULL,
    offspring_label TEXT NOT NULL,
    example_breeds_json TEXT NOT NULL,
    milestones_json TEXT NOT NULL,
    breed_overrides_json TEXT NOT NULL DEFAULT '[]',
    target_weight_curve_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS animals (
    id TEXT PRIMARY KEY NOT NULL,
    tattoo TEXT NOT NULL,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT NOT NULL,
    variety TEXT NOT NULL,
    sex TEXT NOT NULL,
    status TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    needs_attention INTEGER NOT NULL DEFAULT 0,
    ignored_conflicts_json TEXT NOT NULL DEFAULT '[]',
    birth_date_iso TEXT NOT NULL,
    weight_grams INTEGER NOT NULL,
    genotype_json TEXT NOT NULL,
    genotype_raw TEXT NOT NULL,
    rufus_level TEXT NOT NULL DEFAULT '',
    suspected_carrier_of_json TEXT NOT NULL DEFAULT '[]',
    confirmed_carrier_of_json TEXT NOT NULL DEFAULT '[]',
    cleared_carrier_of_json TEXT NOT NULL DEFAULT '[]',
    registration_number TEXT NOT NULL,
    grand_champion_number TEXT NOT NULL,
    legs_count INTEGER NOT NULL,
    cage_location TEXT NOT NULL,
    breeder_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    ownership_type TEXT NOT NULL DEFAULT 'Owned',
    culled INTEGER NOT NULL DEFAULT 0,
    cull_date_iso TEXT NOT NULL DEFAULT '',
    cull_reason TEXT NOT NULL DEFAULT '',
    deceased_date_iso TEXT NOT NULL DEFAULT '',
    death_cause TEXT NOT NULL DEFAULT '',
    sold_date_iso TEXT NOT NULL DEFAULT '',
    sale_price_cents INTEGER NOT NULL DEFAULT 0,
    purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
    buyer_name TEXT NOT NULL DEFAULT '',
    sire_id TEXT NOT NULL,
    dam_id TEXT NOT NULL,
    notes TEXT NOT NULL,
    offloaded_archive_key TEXT NOT NULL DEFAULT '',
    offloaded_at_iso TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS animal_photos (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    animal_id TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    caption TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    original_bytes INTEGER NOT NULL,
    stored_bytes INTEGER NOT NULL,
    thumbnail_data_url TEXT NOT NULL,
    data_url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_animal_photos_animal_id ON animal_photos(animal_id);

  CREATE TABLE IF NOT EXISTS cages (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    label TEXT NOT NULL,
    section TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    notes TEXT NOT NULL,
    unit_type TEXT NOT NULL DEFAULT '',
    feed_lot_name TEXT NOT NULL DEFAULT '',
    feed_stock_remaining REAL NOT NULL DEFAULT 0,
    feed_stock_unit TEXT NOT NULL DEFAULT '',
    daily_ration_note TEXT NOT NULL DEFAULT '',
    feed_low_threshold REAL NOT NULL DEFAULT 0,
    maintenance_interval_days INTEGER NOT NULL DEFAULT 0,
    maintenance_task_label TEXT NOT NULL DEFAULT '',
    last_maintenance_date_iso TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS breedings (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    sire_id TEXT NOT NULL,
    dam_id TEXT NOT NULL,
    sire_name TEXT NOT NULL,
    dam_name TEXT NOT NULL,
    bred_date_iso TEXT NOT NULL,
    expected_due_date_iso TEXT NOT NULL,
    actual_birth_date_iso TEXT NOT NULL,
    projected_coi_percent REAL NOT NULL,
    live_count INTEGER NOT NULL,
    stillborn_count INTEGER NOT NULL,
    fostered_count INTEGER NOT NULL,
    weaned_count INTEGER NOT NULL,
    offspring_created INTEGER NOT NULL,
    status TEXT NOT NULL,
    service_fee_cents INTEGER NOT NULL DEFAULT 0,
    service_fee_direction TEXT NOT NULL DEFAULT 'none',
    ultrasound_date_iso TEXT NOT NULL DEFAULT '',
    ultrasound_result TEXT NOT NULL DEFAULT '',
    ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0,
    ultrasound_projected_due_iso TEXT NOT NULL DEFAULT '',
    litter_weight_milestones_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS barn_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    due_date_iso TEXT NOT NULL,
    linked_animal_id TEXT NOT NULL,
    linked_animal_name TEXT NOT NULL,
    linked_breeding_id TEXT NOT NULL,
    completed INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS care_logs (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    animal_id TEXT NOT NULL,
    date_iso TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    weight_grams INTEGER NOT NULL,
    show_leg_earned INTEGER NOT NULL,
    medication_name TEXT NOT NULL DEFAULT '',
    dosage TEXT NOT NULL DEFAULT '',
    administration_route TEXT NOT NULL DEFAULT '',
    withdrawal_days INTEGER NOT NULL DEFAULT 0,
    withdrawal_clear_date_iso TEXT NOT NULL DEFAULT '',
    body_condition_score REAL NOT NULL DEFAULT 0,
    famacha_score INTEGER NOT NULL DEFAULT 0,
    fecal_egg_count INTEGER NOT NULL DEFAULT 0,
    ultrasound_result TEXT NOT NULL DEFAULT '',
    ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shows (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    sanctioning_body TEXT NOT NULL,
    event_date_iso TEXT NOT NULL,
    entry_deadline_iso TEXT NOT NULL,
    entered_animal_ids_json TEXT NOT NULL,
    results_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feed_batches (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL,
    lot_number TEXT NOT NULL DEFAULT '',
    mill_code TEXT NOT NULL DEFAULT '',
    manufacture_date_iso TEXT NOT NULL DEFAULT '',
    purchase_date_iso TEXT NOT NULL,
    bag_count REAL NOT NULL DEFAULT 0,
    bag_weight_value REAL NOT NULL DEFAULT 0,
    bag_weight_unit TEXT NOT NULL DEFAULT 'lbs',
    total_quantity REAL NOT NULL DEFAULT 0,
    remaining_quantity REAL NOT NULL DEFAULT 0,
    low_stock_threshold REAL NOT NULL DEFAULT 0,
    total_cost_cents INTEGER NOT NULL DEFAULT 0,
    supplier_name TEXT NOT NULL DEFAULT '',
    protein_percent REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    tag_photo_data_url TEXT NOT NULL DEFAULT '',
    tag_photo_thumbnail_data_url TEXT NOT NULL DEFAULT '',
    tag_photo_mime_type TEXT NOT NULL DEFAULT '',
    tag_photo_bytes INTEGER NOT NULL DEFAULT 0,
    tag_photo_captured_date_iso TEXT NOT NULL DEFAULT '',
    tag_photo_purged_at_iso TEXT NOT NULL DEFAULT '',
    tag_photo_bytes_reclaimed INTEGER NOT NULL DEFAULT 0,
    ocr_raw_text TEXT NOT NULL DEFAULT '',
    ocr_confidence REAL NOT NULL DEFAULT 0,
    ocr_manual_override INTEGER NOT NULL DEFAULT 0,
    recall_flagged INTEGER NOT NULL DEFAULT 0,
    recall_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feed_batches_species ON feed_batches(species);
  CREATE INDEX IF NOT EXISTS idx_feed_batches_lot ON feed_batches(lot_number);

  CREATE TABLE IF NOT EXISTS feed_allocations (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    feed_batch_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL DEFAULT '',
    target_label TEXT NOT NULL DEFAULT '',
    date_iso TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'lbs',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feed_allocations_batch ON feed_allocations(feed_batch_id);

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    date_iso TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    vendor_or_party TEXT NOT NULL DEFAULT '',
    linked_animal_id TEXT NOT NULL DEFAULT '',
    linked_breeding_id TEXT NOT NULL DEFAULT '',
    linked_feed_batch_id TEXT NOT NULL DEFAULT '',
    linked_project_id TEXT NOT NULL DEFAULT '',
    receipt_photo_data_url TEXT NOT NULL DEFAULT '',
    receipt_photo_thumbnail_data_url TEXT NOT NULL DEFAULT '',
    receipt_photo_mime_type TEXT NOT NULL DEFAULT '',
    receipt_photo_bytes INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ledger_entries_species ON ledger_entries(species);
  CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries(date_iso);

  CREATE TABLE IF NOT EXISTS processing_logs (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    title TEXT NOT NULL,
    linked_animal_id TEXT NOT NULL DEFAULT '',
    linked_breeding_id TEXT NOT NULL DEFAULT '',
    scheduled_date_iso TEXT NOT NULL DEFAULT '',
    harvest_date_iso TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Processed',
    animal_count INTEGER NOT NULL DEFAULT 1,
    live_weight_grams INTEGER NOT NULL DEFAULT 0,
    dressed_weight_grams INTEGER NOT NULL DEFAULT 0,
    dress_out_percent REAL NOT NULL DEFAULT 0,
    pelt_count INTEGER NOT NULL DEFAULT 0,
    pelt_grade TEXT NOT NULL DEFAULT '',
    pelt_color_notes TEXT NOT NULL DEFAULT '',
    processing_cost_cents INTEGER NOT NULL DEFAULT 0,
    meat_value_cents INTEGER NOT NULL DEFAULT 0,
    pelt_value_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_processing_logs_species ON processing_logs(species);

  CREATE TABLE IF NOT EXISTS youth_project_books (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '4-H',
    project_title TEXT NOT NULL,
    member_name TEXT NOT NULL DEFAULT '',
    club_or_chapter TEXT NOT NULL DEFAULT '',
    leader_or_advisor TEXT NOT NULL DEFAULT '',
    project_year TEXT NOT NULL DEFAULT '',
    start_date_iso TEXT NOT NULL DEFAULT '',
    end_date_iso TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    linked_animal_ids_json TEXT NOT NULL DEFAULT '[]',
    linked_breeding_ids_json TEXT NOT NULL DEFAULT '[]',
    starting_inventory_value_cents INTEGER NOT NULL DEFAULT 0,
    ending_inventory_value_cents INTEGER NOT NULL DEFAULT 0,
    feed_logs_json TEXT NOT NULL DEFAULT '[]',
    goals_and_reflection TEXT NOT NULL DEFAULT '',
    show_and_community_notes TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_youth_project_books_species ON youth_project_books(species);

  CREATE TABLE IF NOT EXISTS client_contacts (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    full_name TEXT NOT NULL,
    ranch_or_herd_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    preferred_contact TEXT NOT NULL DEFAULT 'sms',
    client_kind TEXT NOT NULL DEFAULT 'pet_buyer',
    city_state TEXT NOT NULL DEFAULT '',
    shipping_address TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_client_contacts_species ON client_contacts(species);

  CREATE TABLE IF NOT EXISTS waitlist_entries (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    priority_rank INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Active',
    intent TEXT NOT NULL DEFAULT 'Show / Breeding',
    desired_breed TEXT NOT NULL DEFAULT '',
    desired_variety TEXT NOT NULL DEFAULT '',
    preferred_sex TEXT NOT NULL DEFAULT 'Any',
    preferred_breeding_id TEXT NOT NULL DEFAULT '',
    requested_by_date_iso TEXT NOT NULL DEFAULT '',
    inquiry_date_iso TEXT NOT NULL DEFAULT '',
    follow_up_date_iso TEXT NOT NULL DEFAULT '',
    last_contacted_date_iso TEXT NOT NULL DEFAULT '',
    max_budget_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_waitlist_entries_species ON waitlist_entries(species);

  CREATE TABLE IF NOT EXISTS animal_reservations (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    agreement_number TEXT NOT NULL DEFAULT '',
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    waitlist_entry_id TEXT NOT NULL DEFAULT '',
    animal_id TEXT NOT NULL DEFAULT '',
    breeding_id TEXT NOT NULL DEFAULT '',
    pick_order INTEGER NOT NULL DEFAULT 0,
    item_label TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending Deposit',
    reserved_date_iso TEXT NOT NULL DEFAULT '',
    hold_expires_date_iso TEXT NOT NULL DEFAULT '',
    total_price_cents INTEGER NOT NULL DEFAULT 0,
    deposit_required_cents INTEGER NOT NULL DEFAULT 0,
    deposit_paid_cents INTEGER NOT NULL DEFAULT 0,
    deposit_due_date_iso TEXT NOT NULL DEFAULT '',
    deposit_paid_date_iso TEXT NOT NULL DEFAULT '',
    pickup_scheduled_date_iso TEXT NOT NULL DEFAULT '',
    completed_date_iso TEXT NOT NULL DEFAULT '',
    balance_reminder_date_iso TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    ledger_entry_id TEXT NOT NULL DEFAULT '',
    terms_summary TEXT NOT NULL DEFAULT '',
    health_guarantee_notes TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_animal_reservations_species ON animal_reservations(species);

  CREATE TABLE IF NOT EXISTS wool_harvests (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    animal_id TEXT NOT NULL,
    harvest_date_iso TEXT NOT NULL,
    shearing_interval_days INTEGER NOT NULL DEFAULT 0,
    prime_weight_grams INTEGER NOT NULL DEFAULT 0,
    grade_weight_grams INTEGER NOT NULL DEFAULT 0,
    harvest_method TEXT NOT NULL DEFAULT 'Sheared',
    staple_length_mm REAL NOT NULL DEFAULT 0,
    iagarb_score_json TEXT NOT NULL DEFAULT '{}',
    witnessed_by TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wool_harvests_species ON wool_harvests(species);
  CREATE INDEX IF NOT EXISTS idx_wool_harvests_animal ON wool_harvests(animal_id);
`;

const IDB_OPEN_TIMEOUT_MS = 8000;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getSafeIndexedDb();
    if (!idb) {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }
    let settled = false;
    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cb();
    };
    const timer = setTimeout(() => {
      finish(() => {
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message:
            'Corrective action: Primary IndexedDB open timed out after 8s — falling back to non-destructive recovery',
        });
        reject(new Error('Timed out opening local IndexedDB storage.'));
      });
    }, IDB_OPEN_TIMEOUT_MS);

    try {
      const req = idb.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
            db.createObjectStore(IDB_STORE_NAME);
          }
        } catch (upgradeErr) {
          void dumpIndexedDbDatabaseToOpfs(
            IDB_DB_NAME,
            'Primary IndexedDB schema upgrade failed'
          ).catch(() => {});
          finish(() => reject(upgradeErr));
        }
      };
      req.onblocked = () => {
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message:
            'Corrective action: Primary IndexedDB connection blocked by another tab or worker',
        });
      };
      req.onsuccess = () => finish(() => resolve(req.result));
      req.onerror = () => {
        const err = req.error || new Error('IndexedDB open failed.');
        if (isVersionError(err)) {
          void dumpIndexedDbDatabaseToOpfs(
            IDB_DB_NAME,
            'Primary IndexedDB VersionError on open'
          ).catch(() => {});
        }
        finish(() => reject(err));
      };
    } catch (err) {
      finish(() => reject(err));
    }
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  const untrackDb = trackActiveIdbConnection(db);
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const untrackTx = trackActiveIdbTransaction(tx);
      const req = tx.objectStore(IDB_STORE_NAME).get(key);
      req.onsuccess = () => {
        untrackTx();
        resolve(req.result as T | undefined);
      };
      req.onerror = () => {
        untrackTx();
        reject(req.error);
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB read transaction aborted.'));
      };
    });
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  return idbSetAtomic([{ key, value }]);
}

async function idbSetAtomic(
  entries: Array<{ key: string; value: unknown }>
): Promise<void> {
  if (entries.length === 0) return;
  let db: IDBDatabase | null = null;
  let untrackDb: (() => void) | null = null;
  try {
    db = await openIdb();
    untrackDb = trackActiveIdbConnection(db);
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(IDB_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      const store = tx.objectStore(IDB_STORE_NAME);
      for (const entry of entries) {
        store.put(entry.value, entry.key);
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
        reject(tx.error || new Error('IndexedDB write transaction aborted.'));
      };
    });
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new Error(
        'Browser storage quota reached (QuotaExceededError). Export a backup and clear older photos or install to Home Screen to elevate storage.'
      );
    }
    throw err;
  } finally {
    untrackDb?.();
    try {
      db?.close();
    } catch {
      // Ignore close error
    }
  }
}

async function idbDelete(key: string): Promise<void> {
  if (!getSafeIndexedDb()) return;
  const db = await openIdb();
  const untrackDb = trackActiveIdbConnection(db);
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      tx.objectStore(IDB_STORE_NAME).delete(key);
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
    });
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

/**
 * Purges stale PWA CacheStorage assets, Service Worker registrations, and fallback snapshot caches
 * without deleting the user's primary IndexedDB herd database or diagnostic logs.
 */
export async function purgeStaleBrowserCaches(): Promise<{
  cachesCleared: number;
  serviceWorkersUnregistered: number;
}> {
  let cachesCleared = 0;
  let serviceWorkersUnregistered = 0;

  try {
    await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
  } catch {
    // Ignore IDB fallback delete failure
  }

  if (typeof caches !== 'undefined') {
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const deleted = await caches.delete(name);
        if (deleted) cachesCleared++;
      }
    } catch {
      // Ignore CacheStorage error
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const unregistered = await reg.unregister();
        if (unregistered) serviceWorkersUnregistered++;
      }
    } catch {
      // Ignore ServiceWorker unregister failure
    }
  }

  return { cachesCleared, serviceWorkersUnregistered };
}

function applySchemaMigrations(db: Database): void {
  db.run(PEDIGREE_SQLITE_SCHEMA);
  const alterStatements = [
    "ALTER TABLE barn_settings ADD COLUMN custom_colors_json TEXT NOT NULL DEFAULT '{}';",
    "ALTER TABLE barn_settings ADD COLUMN image_optimization_preset TEXT NOT NULL DEFAULT 'balanced';",
    "ALTER TABLE barn_settings ADD COLUMN extra_settings_json TEXT NOT NULL DEFAULT '{}';",
    "ALTER TABLE barn_settings ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD';",
    'ALTER TABLE species_profiles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE species_profiles ADD COLUMN default_animal_prefix TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN preferred_unit TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN memo_text TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN memo_updated_at TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE species_profiles ADD COLUMN maturity_days INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE species_profiles ADD COLUMN breed_overrides_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE species_profiles ADD COLUMN target_weight_curve_json TEXT NOT NULL DEFAULT '[]';",
    'ALTER TABLE animals ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE animals ADD COLUMN needs_attention INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN ignored_conflicts_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN suspected_carrier_of_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN confirmed_carrier_of_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN cleared_carrier_of_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN rufus_level TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN ownership_type TEXT NOT NULL DEFAULT 'Owned';",
    'ALTER TABLE animals ADD COLUMN culled INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN cull_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN cull_reason TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN deceased_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN death_cause TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN sold_date_iso TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE animals ADD COLUMN sale_price_cents INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE animals ADD COLUMN purchase_cost_cents INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN buyer_name TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE breedings ADD COLUMN service_fee_cents INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE breedings ADD COLUMN service_fee_direction TEXT NOT NULL DEFAULT 'none';",
    "ALTER TABLE breedings ADD COLUMN ultrasound_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE breedings ADD COLUMN ultrasound_result TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE breedings ADD COLUMN ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE breedings ADD COLUMN ultrasound_projected_due_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE breedings ADD COLUMN litter_weight_milestones_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE care_logs ADD COLUMN medication_name TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE care_logs ADD COLUMN dosage TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE care_logs ADD COLUMN administration_route TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE care_logs ADD COLUMN withdrawal_days INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE care_logs ADD COLUMN withdrawal_clear_date_iso TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE care_logs ADD COLUMN body_condition_score REAL NOT NULL DEFAULT 0;',
    'ALTER TABLE care_logs ADD COLUMN famacha_score INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE care_logs ADD COLUMN fecal_egg_count INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE care_logs ADD COLUMN ultrasound_result TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE care_logs ADD COLUMN ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN offloaded_archive_key TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN offloaded_at_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cages ADD COLUMN unit_type TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cages ADD COLUMN feed_lot_name TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE cages ADD COLUMN feed_stock_remaining REAL NOT NULL DEFAULT 0;',
    "ALTER TABLE cages ADD COLUMN feed_stock_unit TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cages ADD COLUMN daily_ration_note TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE cages ADD COLUMN feed_low_threshold REAL NOT NULL DEFAULT 0;',
    'ALTER TABLE cages ADD COLUMN maintenance_interval_days INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE cages ADD COLUMN maintenance_task_label TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cages ADD COLUMN last_maintenance_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE shows ADD COLUMN results_json TEXT NOT NULL DEFAULT '[]';",
  ];
  for (const stmt of alterStatements) {
    try {
      db.run(stmt);
    } catch {
      // Column already exists
    }
  }
  db.run(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION};`);
}

function readSqliteUserVersion(db: Database): number {
  try {
    const stmt = db.prepare('PRAGMA user_version;');
    try {
      if (stmt.step()) {
        const row = stmt.getAsObject() as { user_version?: unknown };
        const val = Number(row.user_version);
        return Number.isFinite(val) ? val : 0;
      }
    } finally {
      stmt.free();
    }
  } catch {
    // Ignore PRAGMA query failure
  }
  return 0;
}

export class WebSqliteAdapter implements StorageAdapter {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private fallbackSnapshot: BarnDatabaseSnapshot | null = null;
  private lastRollingSaveMs = 0;
  private wipedRecoveryContext: WipedStorageRecoveryContext | null = null;
  private loadedEpoch = 0;
  private ephemeralMode = false;

  constructor(private readonly tabId: string = getCurrentTabId()) {}

  get engineName(): string {
    if (this.ephemeralMode) {
      return this.db
        ? 'Local SQLite (Ephemeral Session)'
        : 'Ephemeral In-Memory Store (Private/Restricted Mode)';
    }
    return this.db ? 'Local SQLite (WASM + IndexedDB)' : 'Local IndexedDB Store';
  }

  isEphemeralMode(): boolean {
    return this.ephemeralMode;
  }

  getWipedRecoveryContext(): WipedStorageRecoveryContext | null {
    return this.wipedRecoveryContext;
  }

  getLoadedEpoch(): number {
    return this.loadedEpoch;
  }

  private async readPersistedWriteEpoch(): Promise<PersistedWriteEpochMeta> {
    if (this.ephemeralMode || !getSafeIndexedDb()) {
      return { epoch: 0, writerTabId: '', updatedAtIso: '' };
    }
    try {
      const meta = await idbGet<Partial<PersistedWriteEpochMeta>>(IDB_WRITE_EPOCH_KEY);
      const epoch = Number(meta?.epoch);
      if (meta && Number.isFinite(epoch) && epoch > 0) {
        return {
          epoch,
          writerTabId: typeof meta.writerTabId === 'string' ? meta.writerTabId : '',
          updatedAtIso: typeof meta.updatedAtIso === 'string' ? meta.updatedAtIso : '',
        };
      }
    } catch {
      // Ignore read failure; treat as epoch 0
    }
    return { epoch: 0, writerTabId: '', updatedAtIso: '' };
  }

  /**
   * Reloads `this.db` or `this.fallbackSnapshot` from IndexedDB if another tab has committed
   * a higher write epoch. MUST only be called while holding `DB_WRITE_LOCK_NAME` (or during
   * initialization under lock).
   */
  private async syncFromPersistedStorageIfStaleLocked(): Promise<boolean> {
    if (this.ephemeralMode || !getSafeIndexedDb()) {
      return false;
    }
    const persisted = await this.readPersistedWriteEpoch();
    if (persisted.epoch <= this.loadedEpoch) {
      return false;
    }

    if (this.SQL) {
      const savedBytes = await idbGet<Uint8Array>(IDB_PRIMARY_KEY).catch(() => undefined);
      if (savedBytes && savedBytes.byteLength > 0) {
        const headerCheck = validateSqliteFileHeader(savedBytes, IDB_PRIMARY_KEY);
        if (headerCheck.ok) {
          const reloadedDb = new this.SQL.Database(savedBytes);
          if (readSqliteUserVersion(reloadedDb) < SQLITE_SCHEMA_VERSION) {
            applySchemaMigrations(reloadedDb);
          }
          if (this.db) {
            try {
              this.db.close();
            } catch {
              // Ignore close error on superseded DB
            }
          }
          this.db = reloadedDb;
          this.fallbackSnapshot = null;
          this.loadedEpoch = persisted.epoch;
          return true;
        }
      }
    }

    const savedFallback = await idbGet<BarnDatabaseSnapshot>(IDB_FALLBACK_SNAPSHOT_KEY).catch(
      () => undefined
    );
    if (
      savedFallback &&
      typeof savedFallback === 'object' &&
      Array.isArray(savedFallback.animals) &&
      Array.isArray(savedFallback.speciesProfiles)
    ) {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close error
        }
        this.db = null;
      }
      this.fallbackSnapshot = savedFallback;
      this.loadedEpoch = persisted.epoch;
      return true;
    }

    this.loadedEpoch = persisted.epoch;
    return false;
  }

  async syncFromPersistedStorageIfStale(): Promise<boolean> {
    if (this.ephemeralMode || !getSafeIndexedDb()) {
      return false;
    }
    const persisted = await this.readPersistedWriteEpoch();
    if (persisted.epoch <= this.loadedEpoch) {
      return false;
    }
    return withCrossTabLock(DB_WRITE_LOCK_NAME, () => this.syncFromPersistedStorageIfStaleLocked());
  }

  private async findRecoveredBackupSnapshot(): Promise<{
    snapshot: BarnDatabaseSnapshot;
    source: string;
  } | null> {
    if (this.ephemeralMode || !getSafeIndexedDb()) {
      return null;
    }
    const saved = await idbGet<BarnDatabaseSnapshot>(IDB_FALLBACK_SNAPSHOT_KEY).catch(() => undefined);
    if (
      saved &&
      typeof saved === 'object' &&
      Array.isArray(saved.animals) &&
      Array.isArray(saved.speciesProfiles) &&
      (saved.animals.length > 0 || saved.speciesProfiles.length > 0)
    ) {
      return {
        snapshot: saved,
        source: 'IndexedDB JSON fallback mirror',
      };
    }

    try {
      const rollingList = await listRollingSnapshotBackups();
      for (const item of rollingList) {
        const recovered = await loadRollingSnapshotBackup(item.key);
        if (
          recovered &&
          (recovered.animals.length > 0 || recovered.speciesProfiles.length > 0)
        ) {
          return {
            snapshot: recovered,
            source: `rolling backup "${item.key}" (${item.savedAtIso})`,
          };
        }
      }
    } catch (rollingErr) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: 'Rolling backup scan failed while attempting non-destructive DB recovery',
        error: rollingErr,
      });
    }
    return null;
  }

  private async tryRestoreIntoFreshSqliteDbLocked(snapshot: BarnDatabaseSnapshot): Promise<boolean> {
    if (!this.SQL) return false;
    try {
      const freshDb = new this.SQL.Database();
      applySchemaMigrations(freshDb);
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close failure on previous handle
        }
      }
      this.db = freshDb;
      this.fallbackSnapshot = null;
      await this.replaceSnapshotLocked(snapshot, 'restoreFreshSqliteDb');
      return true;
    } catch (rebuildErr) {
      this.db = null;
      this.fallbackSnapshot = snapshot;
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message:
          'Corrective action: Fresh SQLite rebuild failed during recovery — continuing safely in IndexedDB JSON mode',
        error: rebuildErr,
      });
      return false;
    }
  }

  async initialize(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, () => this.initializeLocked(options));
  }

  private async initializeLocked(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    this.wipedRecoveryContext = null;
    this.ephemeralMode = false;
    const finalizeSnapshot = (snap: BarnDatabaseSnapshot): BarnDatabaseSnapshot =>
      options?.lightweightPhotos ? stripPhotoDataUrlsFromSnapshot(snap) : snap;

    const tryDetectWipedStorage = async (): Promise<BarnDatabaseSnapshot | null> => {
      if (this.ephemeralMode || !getSafeIndexedDb() || options?.allowSeedFresh) return null;
      const wiped = await detectReturningUserWipedStorage().catch(() => null);
      if (wiped && wiped.detected) {
        this.wipedRecoveryContext = wiped;
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: `Paused auto-seed: detected prior-use evidence (${wiped.reason}) while primary IndexedDB appeared empty`,
        });
        return finalizeSnapshot(buildEmptyShellSnapshot());
      }
      return null;
    };

    try {
      this.SQL = await initSqlJs(createSqlJsInitConfig());

      if (!getSafeIndexedDb()) {
        this.ephemeralMode = true;
        this.db = new this.SQL.Database();
        applySchemaMigrations(this.db);
        const seeded = buildFullPredefinedSampleSnapshot();
        await this.replaceSnapshotLocked(seeded, 'initializeEphemeralSeed');
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message:
            'IndexedDB unavailable (Private Browsing or Lockdown Mode) — running in ephemeral SQLite session mode',
        });
        return finalizeSnapshot(seeded);
      }

      const [savedBytes, epochMeta] = await Promise.all([
        idbGet<Uint8Array>(IDB_PRIMARY_KEY),
        this.readPersistedWriteEpoch(),
      ]);
      if (savedBytes && savedBytes.byteLength > 0) {
        const headerCheck = validateSqliteFileHeader(savedBytes, IDB_PRIMARY_KEY);
        if (!headerCheck.ok) {
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message: `Corrective action: Rejected corrupted primary SQLite header (${headerCheck.error}) — triggering non-destructive recovery`,
          });
          throw new Error(headerCheck.error);
        }
        this.db = new this.SQL.Database(savedBytes);
        this.loadedEpoch = epochMeta.epoch;

        // Automated pre-upgrade OPFS snapshot before migrating older schema versions
        const prevSchemaVer = readSqliteUserVersion(this.db);
        if (prevSchemaVer < SQLITE_SCHEMA_VERSION) {
          try {
            const preSnap = this.loadSnapshotUnlocked();
            if (preSnap.animals.length > 0) {
              await saveOpfsVaultBackup(preSnap, {
                kind: 'pre_upgrade',
                note: `Automatic pre-upgrade snapshot (SQLite schema v${prevSchemaVer} → v${SQLITE_SCHEMA_VERSION})`,
              });
            }
          } catch {
            // Non-blocking pre-upgrade snapshot
          }
        }

        try {
          applySchemaMigrations(this.db);
        } catch (migErr) {
          let salvagedSnapshot: BarnDatabaseSnapshot | null = null;
          const rawStores: Record<string, unknown[]> = {};
          try {
            salvagedSnapshot = this.loadSnapshotUnlocked();
          } catch {
            try {
              rawStores.animals = this.queryObjects('SELECT * FROM animals');
              rawStores.species_profiles = this.queryObjects('SELECT * FROM species_profiles');
            } catch {
              // Ignore raw salvage query errors
            }
          }
          await dumpRawRecordsToOpfsRecoveryBackup({
            sourceDbName: IDB_DB_NAME,
            reason: migErr instanceof Error ? migErr.message : 'SQLite schema migration failure',
            stores: rawStores,
            salvagedSnapshot,
          }).catch(() => {});
          throw migErr;
        }

        const snap = this.loadSnapshotUnlocked(options);
        if (snap.speciesProfiles.length === 0 && snap.animals.length === 0) {
          const recovered = await this.findRecoveredBackupSnapshot();
          if (recovered) {
            await this.replaceSnapshotLocked(recovered.snapshot, 'initializeRecoverEmptySqlite');
            logDiagnosticEvent({
              level: 'warn',
              category: 'storage',
              message: `Corrective action: Recovered ${recovered.snapshot.animals.length} animals from ${recovered.source} after empty SQLite database`,
            });
            return finalizeSnapshot(recovered.snapshot);
          }
          const wipedShell = await tryDetectWipedStorage();
          if (wipedShell) {
            return wipedShell;
          }
          const seeded = buildFullPredefinedSampleSnapshot();
          await this.replaceSnapshotLocked(seeded, 'initializeSeedEmptySqlite');
          logDiagnosticEvent({
            level: 'info',
            category: 'storage',
            message: `Corrective action: Empty SQLite store with no backups initialized with starter sample data (${seeded.animals.length} animals)`,
          });
          return finalizeSnapshot(seeded);
        }
        return snap;
      } else {
        const recovered = await this.findRecoveredBackupSnapshot();
        this.db = new this.SQL.Database();
        applySchemaMigrations(this.db);
        if (recovered) {
          await this.replaceSnapshotLocked(recovered.snapshot, 'initializeRecoverMissingSqlite');
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message: `Corrective action: Restored ${recovered.snapshot.animals.length} animals from ${recovered.source} when primary SQLite blob was missing`,
          });
          return finalizeSnapshot(recovered.snapshot);
        }
        const wipedShell = await tryDetectWipedStorage();
        if (wipedShell) {
          this.loadedEpoch = epochMeta.epoch;
          return wipedShell;
        }
        const seeded = buildFullPredefinedSampleSnapshot();
        await this.replaceSnapshotLocked(seeded, 'initializeFreshSeed');
        return finalizeSnapshot(seeded);
      }
    } catch (err) {
      if (!getSafeIndexedDb() || isIndexedDbBlockedError(err)) {
        this.ephemeralMode = true;
      }

      console.warn('WASM SQLite fallback to IndexedDB JSON / Ephemeral Session:', err);
      logDiagnosticEvent({
        level: this.ephemeralMode ? 'warn' : 'error',
        category: isMemoryLikeError(err) ? 'memory' : 'storage',
        message: this.ephemeralMode
          ? 'Browser storage restricted (Private Browsing or Lockdown Mode) — running safely in ephemeral session mode'
          : 'Primary SQLite load failed — attempting non-destructive recovery from fallback/rolling backup',
        error: err,
      });

      if (isVersionError(err)) {
        await dumpIndexedDbDatabaseToOpfs(IDB_DB_NAME, 'Primary SQLite IndexedDB VersionError').catch(
          () => {}
        );
      }

      if (this.ephemeralMode) {
        const seeded = buildFullPredefinedSampleSnapshot();
        if (this.SQL) {
          const rebuilt = await this.tryRestoreIntoFreshSqliteDbLocked(seeded);
          if (rebuilt) {
            return finalizeSnapshot(seeded);
          }
        }
        this.fallbackSnapshot = seeded;
        this.loadedEpoch = Math.max(this.loadedEpoch, 1);
        return finalizeSnapshot(seeded);
      }

      const recovered = await this.findRecoveredBackupSnapshot();
      if (recovered) {
        const rebuiltSqlite = await this.tryRestoreIntoFreshSqliteDbLocked(recovered.snapshot);
        if (!rebuiltSqlite) {
          this.fallbackSnapshot = recovered.snapshot;
          this.loadedEpoch = (await this.readPersistedWriteEpoch()).epoch;
        }
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: `Corrective action: Auto-recovered ${recovered.snapshot.animals.length} animals from ${recovered.source}${rebuiltSqlite ? ' and rebuilt clean SQLite DB' : ''}`,
        });
        return finalizeSnapshot(recovered.snapshot);
      }

      const wipedShell = await tryDetectWipedStorage();
      if (wipedShell) {
        this.loadedEpoch = (await this.readPersistedWriteEpoch()).epoch;
        return wipedShell;
      }

      const seeded = buildFullPredefinedSampleSnapshot();
      this.fallbackSnapshot = seeded;
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Primary & fallback stores unavailable — initialized clean starter snapshot (${seeded.animals.length} sample animals)`,
      });
      try {
        await this.persistToDiskLocked(seeded, 'initializeFallbackSeed');
      } catch {
        // Keep in-memory fallback even if quota is full
      }
      return finalizeSnapshot(seeded);
    }
  }

  private async persistToDiskLocked(
    preloadedSnapshot?: BarnDatabaseSnapshot,
    reason?: string
  ): Promise<void> {
    if (this.ephemeralMode || !getSafeIndexedDb()) {
      this.ephemeralMode = true;
      this.loadedEpoch = this.loadedEpoch + 1;
      publishCrossTabDbCommit({
        epoch: this.loadedEpoch,
        writerTabId: this.tabId,
        reason,
      });
      return;
    }

    const persisted = await this.readPersistedWriteEpoch();
    const nextEpoch = Math.max(persisted.epoch, this.loadedEpoch) + 1;
    const epochMeta: PersistedWriteEpochMeta = {
      epoch: nextEpoch,
      writerTabId: this.tabId,
      updatedAtIso: getAdjustedNowIsoUtc(),
    };

    try {
      if (this.db) {
        const bytes = this.db.export();
        await idbSetAtomic([
          { key: IDB_PRIMARY_KEY, value: bytes },
          { key: IDB_WRITE_EPOCH_KEY, value: epochMeta },
        ]);
      } else if (this.fallbackSnapshot) {
        await idbSetAtomic([
          { key: IDB_FALLBACK_SNAPSHOT_KEY, value: this.fallbackSnapshot },
          { key: IDB_WRITE_EPOCH_KEY, value: epochMeta },
        ]);
      }
      this.loadedEpoch = nextEpoch;
      publishCrossTabDbCommit({
        epoch: nextEpoch,
        writerTabId: this.tabId,
        reason,
      });
    } catch (err) {
      if (!isQuotaExceededError(err) && isIndexedDbBlockedError(err)) {
        this.ephemeralMode = true;
        this.loadedEpoch = nextEpoch;
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message:
            'IndexedDB write blocked by browser privacy/lockdown policy — degrading cleanly to ephemeral in-memory session mode',
          error: err,
        });
        publishCrossTabDbCommit({
          epoch: nextEpoch,
          writerTabId: this.tabId,
          reason,
        });
        return;
      }
      logDiagnosticEvent({
        level: 'error',
        category: isMemoryLikeError(err) ? 'memory' : 'storage',
        message: isQuotaExceededError(err)
          ? 'IndexedDB storage quota exceeded while saving database'
          : 'Failed writing local database to IndexedDB',
        error: err,
      });
      throw err;
    }

    // Periodically capture rolling snapshot backup + JSON fallback mirror (at most every 15s)
    const nowMs = Date.now();
    if (nowMs - this.lastRollingSaveMs > 15_000) {
      this.lastRollingSaveMs = nowMs;
      try {
        const policy = getTierStoragePolicy(detectCurrentDeviceCapability().tier);
        const snap = preloadedSnapshot
          ? policy.dehydrateMirrorPhotos
            ? stripPhotoDataUrlsFromSnapshot(preloadedSnapshot)
            : preloadedSnapshot
          : this.loadSnapshotUnlocked({ lightweightPhotos: policy.dehydrateMirrorPhotos });
        markPriorUseSentinelFromSnapshot(snap);
        void saveRollingSnapshotBackup(snap, {
          maxRollingBackups: policy.rollingIdbCap,
          dehydratePhotos: policy.dehydrateMirrorPhotos,
        }).catch(() => {});
        if (this.db) {
          void idbSet(IDB_FALLBACK_SNAPSHOT_KEY, snap).catch(() => {});
        }
      } catch {
        // Non-fatal background mirror error
      }
    }
  }

  private queryObjectsFromDb(db: Database, sql: string): Record<string, any>[] {
    const stmt = db.prepare(sql);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  private queryObjects(sql: string): Record<string, any>[] {
    if (!this.db) return [];
    return this.queryObjectsFromDb(this.db, sql);
  }

  private safeParseJson<T>(raw: unknown, fallback: T, contextLabel: string): T {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed === null || parsed === undefined ? fallback : (parsed as T);
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Auto-recovered malformed JSON in ${contextLabel} using safe default`,
        error: err,
      });
      return fallback;
    }
  }

  private loadSnapshotUnlocked(options?: SnapshotLoadOptions): BarnDatabaseSnapshot {
    if (!this.db) {
      const base = this.fallbackSnapshot ?? buildFullPredefinedSampleSnapshot();
      return options?.lightweightPhotos ? stripPhotoDataUrlsFromSnapshot(base) : base;
    }
    return this.readSnapshotFromDatabase(this.db, options);
  }

  async loadSnapshot(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    const persisted = await this.readPersistedWriteEpoch();
    if (persisted.epoch > this.loadedEpoch) {
      return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
        await this.syncFromPersistedStorageIfStaleLocked();
        return this.loadSnapshotUnlocked(options);
      });
    }
    return this.loadSnapshotUnlocked(options);
  }

  private readSnapshotFromDatabase(
    db: Database,
    options?: SnapshotLoadOptions
  ): BarnDatabaseSnapshot {
    const runQuery = (sql: string) => this.queryObjectsFromDb(db, sql);

    let sanitizedNumericCount = 0;
    const finiteNum = (raw: unknown, fallback: number): number => {
      if (raw === null || raw === undefined || raw === '') return fallback;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        sanitizedNumericCount++;
        return fallback;
      }
      return num;
    };
    const finiteNonNeg = (raw: unknown, fallback = 0): number => {
      const n = finiteNum(raw, fallback);
      if (n < 0) {
        sanitizedNumericCount++;
        return fallback;
      }
      return n;
    };
    const safeArray = <T>(val: unknown): T[] => (Array.isArray(val) ? (val as T[]) : []);

    const settingsRows = runQuery('SELECT * FROM barn_settings LIMIT 1');
    const sRow = settingsRows[0];
    const extraSettings = sRow?.extra_settings_json
      ? this.safeParseJson<Record<string, any>>(
          sRow.extra_settings_json,
          {},
          'barn_settings.extra_settings_json'
        )
      : {};
    const rawGen = Number(sRow?.default_generations);
    const parsedGen: 3 | 4 | 5 | 6 =
      rawGen === 4 || rawGen === 5 || rawGen === 6 ? rawGen : 3;

    const settings: BarnSettings = sRow
      ? {
          id: String(sRow.id),
          barnName: String(sRow.barn_name),
          breederName: String(sRow.breeder_name),
          preferredUnit: normalizeWeightUnit(sRow.preferred_unit, 'lbs_oz'),
          currencyCode: normalizeCurrencyCode(sRow.currency_code, 'USD'),
          defaultSpecies: String(sRow.default_species || 'Rabbit'),
          pinnedLandingSpecies: String(sRow.pinned_landing_species ?? ''),
          defaultGenerations: parsedGen,
          themeMode: sRow.theme_mode === 'dark' ? 'dark' : 'light',
          customColors: sRow.custom_colors_json
            ? this.safeParseJson(
                sRow.custom_colors_json,
                undefined,
                'barn_settings.custom_colors_json'
              )
            : undefined,
          imageOptimizationPreset:
            sRow.image_optimization_preset === 'compact' ||
            sRow.image_optimization_preset === 'balanced' ||
            sRow.image_optimization_preset === 'high_detail'
              ? sRow.image_optimization_preset
              : 'balanced',
          showHomeSummaryGrid:
            typeof extraSettings.showHomeSummaryGrid === 'boolean'
              ? extraSettings.showHomeSummaryGrid
              : true,
          barnNameOnboarded:
            typeof extraSettings.barnNameOnboarded === 'boolean'
              ? extraSettings.barnNameOnboarded
              : false,
          ignoredTaskIds: safeArray<string>(extraSettings.ignoredTaskIds),
          dismissedTaskGroupKeys:
            extraSettings.dismissedTaskGroupKeys &&
            typeof extraSettings.dismissedTaskGroupKeys === 'object'
              ? extraSettings.dismissedTaskGroupKeys
              : {},
          dismissedMemoAlertSignatures:
            extraSettings.dismissedMemoAlertSignatures &&
            typeof extraSettings.dismissedMemoAlertSignatures === 'object'
              ? extraSettings.dismissedMemoAlertSignatures
              : {},
          speciesHubBlockOrder:
            extraSettings.speciesHubBlockOrder &&
            typeof extraSettings.speciesHubBlockOrder === 'object'
              ? extraSettings.speciesHubBlockOrder
              : {},
          includePhotoOnPedigree: Boolean(extraSettings.includePhotoOnPedigree),
          breederLogoDataUrl:
            typeof extraSettings.breederLogoDataUrl === 'string'
              ? sanitizeSafeRasterImageDataUrl(extraSettings.breederLogoDataUrl) || undefined
              : undefined,
          calendarSync: normalizeCalendarSyncSettings(extraSettings.calendarSync),
          lastBackupMeta:
            extraSettings.lastBackupMeta && typeof extraSettings.lastBackupMeta === 'object'
              ? extraSettings.lastBackupMeta
              : undefined,
          backupReminderSnoozedUntilMs:
            typeof extraSettings.backupReminderSnoozedUntilMs === 'number' &&
            Number.isFinite(extraSettings.backupReminderSnoozedUntilMs)
              ? extraSettings.backupReminderSnoozedUntilMs
              : undefined,
          autoOffloadRetiredToOpfs: Boolean(extraSettings.autoOffloadRetiredToOpfs),
          feedTagPurgeWindowDays: normalizeFeedPurgeWindowDays(
            extraSettings.feedTagPurgeWindowDays,
            60
          ),
          updatedAt: String(sRow.updated_at || getAdjustedNowIsoUtc()),
        }
      : {
          id: 'barn_settings',
          barnName: 'Copper Creek Barn',
          breederName: '',
          preferredUnit: 'lbs_oz',
          currencyCode: 'USD',
          defaultSpecies: 'Rabbit',
          pinnedLandingSpecies: '',
          defaultGenerations: 3,
          themeMode: 'dark',
          imageOptimizationPreset: 'balanced',
          showHomeSummaryGrid: true,
          barnNameOnboarded: false,
          ignoredTaskIds: [],
          dismissedTaskGroupKeys: {},
          dismissedMemoAlertSignatures: {},
          speciesHubBlockOrder: {},
          includePhotoOnPedigree: false,
          calendarSync: { ...DEFAULT_CALENDAR_SYNC_SETTINGS },
          autoOffloadRetiredToOpfs: false,
          feedTagPurgeWindowDays: 60,
          updatedAt: getAdjustedNowIsoUtc(),
        };

    const speciesProfiles: SpeciesProfile[] = runQuery(
      'SELECT * FROM species_profiles ORDER BY sort_order ASC, name ASC'
    ).map((r, idx) => {
      const maturity = finiteNonNeg(r.maturity_days, 0);
      return {
        id: String(r.id),
        name: String(r.name),
        sortOrder: finiteNum(r.sort_order, idx),
        defaultAnimalPrefix: String(r.default_animal_prefix || ''),
        preferredUnit:
          r.preferred_unit === 'lbs_oz' ||
          r.preferred_unit === 'lbs' ||
          r.preferred_unit === 'grams' ||
          r.preferred_unit === 'kg'
            ? r.preferred_unit
            : undefined,
        memoText: sanitizeSpeciesMemo(r.memo_text ?? ''),
        memoUpdatedAt: String(r.memo_updated_at || ''),
        gestationDays: finiteNonNeg(r.gestation_days, 31),
        rebreedDaysAfterBirth: finiteNonNeg(r.rebreed_days_after_birth, 28),
        weanDaysAfterBirth: finiteNonNeg(r.wean_days_after_birth, 42),
        maturityDays: maturity > 0 ? maturity : undefined,
        birthEventLabel: String(r.birth_event_label),
        maleLabel: String(r.male_label),
        femaleLabel: String(r.female_label),
        offspringLabel: String(r.offspring_label),
        exampleBreeds: safeArray<string>(
          this.safeParseJson<string[]>(
            r.example_breeds_json || '[]',
            [],
            `species_profiles(${String(r.name)}).example_breeds_json`
          )
        ),
        milestones: safeArray(
          this.safeParseJson(
            r.milestones_json || '[]',
            [],
            `species_profiles(${String(r.name)}).milestones_json`
          )
        ),
        breedOverrides: normalizeBreedScheduleOverrides(
          safeArray(
            this.safeParseJson(
              r.breed_overrides_json || '[]',
              [],
              `species_profiles(${String(r.name)}).breed_overrides_json`
            )
          )
        ),
        targetWeightCurve: normalizeTargetWeightCurve(
          safeArray(
            this.safeParseJson(
              r.target_weight_curve_json || '[]',
              [],
              `species_profiles(${String(r.name)}).target_weight_curve_json`
            )
          )
        ),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const animals: Animal[] = runQuery('SELECT * FROM animals ORDER BY name ASC').map((r) =>
      this.mapAnimalRow(r, finiteNonNeg, safeArray)
    );

    const photoQuerySql = options?.lightweightPhotos
      ? `SELECT id, species, animal_id, is_primary, sort_order, caption, original_file_name, mime_type,
                width, height, original_bytes, stored_bytes,
                CASE WHEN length(thumbnail_data_url) > 0 THEN thumbnail_data_url ELSE data_url END AS thumbnail_data_url,
                '' AS data_url, created_at, updated_at
         FROM animal_photos ORDER BY is_primary DESC, sort_order ASC, created_at ASC`
      : 'SELECT * FROM animal_photos ORDER BY is_primary DESC, sort_order ASC, created_at ASC';

    const animalPhotos: AnimalPhoto[] = runQuery(photoQuerySql).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      animalId: String(r.animal_id),
      isPrimary: Number(r.is_primary) === 1,
      sortOrder: finiteNum(r.sort_order, 0),
      caption: String(r.caption || ''),
      originalFileName: String(r.original_file_name || ''),
      mimeType: String(r.mime_type || 'image/webp'),
      width: finiteNonNeg(r.width, 0),
      height: finiteNonNeg(r.height, 0),
      originalBytes: finiteNonNeg(r.original_bytes, 0),
      storedBytes: finiteNonNeg(r.stored_bytes, 0),
      thumbnailDataUrl: String(r.thumbnail_data_url || r.data_url || ''),
      dataUrl: options?.lightweightPhotos ? '' : String(r.data_url || ''),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const cages: CageLocation[] = runQuery('SELECT * FROM cages ORDER BY label ASC').map((r) => {
      const unitType = normalizeHousingUnitType(r.unit_type);
      const feedLotName = r.feed_lot_name ? String(r.feed_lot_name) : '';
      const feedStockRemaining = finiteNonNeg(r.feed_stock_remaining, 0);
      const feedStockUnit = r.feed_stock_unit ? String(r.feed_stock_unit) : '';
      const dailyRationNote = r.daily_ration_note ? String(r.daily_ration_note) : '';
      const feedLowThreshold = finiteNonNeg(r.feed_low_threshold, 0);
      const maintenanceIntervalDays = Math.round(finiteNonNeg(r.maintenance_interval_days, 0));
      const maintenanceTaskLabel = r.maintenance_task_label ? String(r.maintenance_task_label) : '';
      const lastMaintenanceDateIso = r.last_maintenance_date_iso
        ? String(r.last_maintenance_date_iso)
        : '';
      return {
        id: String(r.id),
        species: String(r.species),
        label: String(r.label),
        section: String(r.section),
        capacity: Math.max(1, finiteNonNeg(r.capacity, 1)),
        notes: String(r.notes),
        ...(unitType ? { unitType } : {}),
        ...(feedLotName ? { feedLotName } : {}),
        ...(feedStockRemaining > 0 ? { feedStockRemaining } : {}),
        ...(feedStockUnit ? { feedStockUnit } : {}),
        ...(dailyRationNote ? { dailyRationNote } : {}),
        ...(feedLowThreshold > 0 ? { feedLowThreshold } : {}),
        ...(maintenanceIntervalDays > 0 ? { maintenanceIntervalDays } : {}),
        ...(maintenanceTaskLabel ? { maintenanceTaskLabel } : {}),
        ...(lastMaintenanceDateIso ? { lastMaintenanceDateIso } : {}),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const breedings: BreedingRecord[] = runQuery(
      'SELECT * FROM breedings ORDER BY bred_date_iso DESC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      sireId: String(r.sire_id),
      damId: String(r.dam_id),
      sireName: String(r.sire_name),
      damName: String(r.dam_name),
      bredDateIso: String(r.bred_date_iso),
      expectedDueDateIso: String(r.expected_due_date_iso),
      actualBirthDateIso: String(r.actual_birth_date_iso),
      projectedCoiPercent: finiteNonNeg(r.projected_coi_percent, 0),
      liveCount: finiteNonNeg(r.live_count, 0),
      stillbornCount: finiteNonNeg(r.stillborn_count, 0),
      fosteredCount: finiteNonNeg(r.fostered_count, 0),
      weanedCount: finiteNonNeg(r.weaned_count, 0),
      offspringCreated: Number(r.offspring_created) === 1,
      status: (r.status as any) || 'Bred',
      serviceFeeCents: finiteNonNeg(r.service_fee_cents, 0),
      serviceFeeDirection: normalizeServiceFeeDirection(r.service_fee_direction),
      ultrasoundDateIso: String(r.ultrasound_date_iso || ''),
      ultrasoundResult: normalizeUltrasoundResult(r.ultrasound_result),
      ultrasoundFetalCount: finiteNonNeg(r.ultrasound_fetal_count, 0),
      ultrasoundProjectedDueIso: String(r.ultrasound_projected_due_iso || ''),
      litterWeightMilestones: normalizeLitterWeightMilestones(
        safeArray(
          this.safeParseJson(
            r.litter_weight_milestones_json || '[]',
            [],
            `breedings(${String(r.id)}).litter_weight_milestones_json`
          )
        )
      ),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const tasks: BarnTask[] = runQuery(
      'SELECT * FROM barn_tasks ORDER BY completed ASC, due_date_iso ASC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      title: String(r.title),
      category: (r.category as any) || 'Care',
      priority: (r.priority as any) || 'Normal',
      dueDateIso: String(r.due_date_iso),
      linkedAnimalId: String(r.linked_animal_id),
      linkedAnimalName: String(r.linked_animal_name),
      linkedBreedingId: String(r.linked_breeding_id),
      completed: Number(r.completed) === 1,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const careLogs: CareLog[] = runQuery(
      'SELECT * FROM care_logs ORDER BY date_iso DESC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      animalId: String(r.animal_id),
      dateIso: String(r.date_iso),
      type: (r.type as any) || 'Weight Check',
      title: String(r.title),
      weightGrams: finiteNonNeg(r.weight_grams, 0),
      showLegEarned: Number(r.show_leg_earned) === 1,
      medicationName: String(r.medication_name || ''),
      dosage: String(r.dosage || ''),
      administrationRoute: String(r.administration_route || ''),
      withdrawalDays: finiteNonNeg(r.withdrawal_days, 0),
      withdrawalClearDateIso: String(r.withdrawal_clear_date_iso || ''),
      bodyConditionScore: finiteNonNeg(r.body_condition_score, 0),
      famachaScore: finiteNonNeg(r.famacha_score, 0),
      fecalEggCount: finiteNonNeg(r.fecal_egg_count, 0),
      ultrasoundResult: normalizeUltrasoundResult(r.ultrasound_result),
      ultrasoundFetalCount: finiteNonNeg(r.ultrasound_fetal_count, 0),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const shows: ShowEvent[] = runQuery(
      'SELECT * FROM shows ORDER BY event_date_iso ASC'
    ).map((r) => {
      const parsedEnteredIds = safeArray<string>(
        this.safeParseJson<string[]>(
          r.entered_animal_ids_json || '[]',
          [],
          `shows(${String(r.name || r.id)}).entered_animal_ids_json`
        )
      );
      const parsedResults = normalizeShowResults(
        this.safeParseJson<unknown[]>(
          r.results_json || '[]',
          [],
          `shows(${String(r.name || r.id)}).results_json`
        ),
        { dropEmpty: false }
      );
      return {
        id: String(r.id),
        species: String(r.species),
        name: String(r.name),
        location: String(r.location),
        sanctioningBody: String(r.sanctioning_body),
        eventDateIso: String(r.event_date_iso),
        entryDeadlineIso: String(r.entry_deadline_iso),
        enteredAnimalIds: mergeEnteredAnimalIdsWithResults(parsedEnteredIds, parsedResults),
        results: parsedResults.length > 0 ? parsedResults : undefined,
        notes: String(r.notes),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const safeTableQuery = (tableName: string, sql: string): Record<string, any>[] => {
      try {
        const existsStmt = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
        );
        let exists = false;
        try {
          existsStmt.bind([tableName]);
          exists = existsStmt.step();
        } finally {
          existsStmt.free();
        }
        return exists ? runQuery(sql) : [];
      } catch {
        return [];
      }
    };

    const feedBatches: FeedBatch[] = safeTableQuery(
      'feed_batches',
      'SELECT * FROM feed_batches ORDER BY purchase_date_iso DESC, created_at DESC'
    ).map((r) => {
      const totalCostRaw = finiteNonNeg(r.total_cost_cents, 0);
      const proteinRaw = finiteNonNeg(r.protein_percent, 0);
      const tagPhotoDataUrl = r.tag_photo_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.tag_photo_data_url)) || undefined
        : undefined;
      const tagPhotoThumbnailDataUrl = r.tag_photo_thumbnail_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.tag_photo_thumbnail_data_url)) || tagPhotoDataUrl
        : tagPhotoDataUrl;
      const tagPhotoBytes = finiteNonNeg(r.tag_photo_bytes, 0);
      const tagPhotoBytesReclaimed = finiteNonNeg(r.tag_photo_bytes_reclaimed, 0);
      const ocrConf = finiteNonNeg(r.ocr_confidence, 0);
      return {
        id: String(r.id),
        species: String(r.species),
        brand: String(r.brand || ''),
        productName: String(r.product_name),
        lotNumber: String(r.lot_number || ''),
        millCode: String(r.mill_code || ''),
        manufactureDateIso: String(r.manufacture_date_iso || ''),
        purchaseDateIso: String(r.purchase_date_iso),
        bagCount: finiteNonNeg(r.bag_count, 0),
        bagWeightValue: finiteNonNeg(r.bag_weight_value, 0),
        bagWeightUnit: String(r.bag_weight_unit || 'lbs'),
        totalQuantity: finiteNonNeg(r.total_quantity, 0),
        remainingQuantity: finiteNonNeg(r.remaining_quantity, 0),
        lowStockThreshold: finiteNonNeg(r.low_stock_threshold, 0),
        ...(totalCostRaw > 0 ? { totalCostCents: Math.round(totalCostRaw) } : {}),
        supplierName: String(r.supplier_name || ''),
        ...(proteinRaw > 0 ? { proteinPercent: proteinRaw } : {}),
        notes: String(r.notes || ''),
        ...(tagPhotoDataUrl ? { tagPhotoDataUrl } : {}),
        ...(tagPhotoThumbnailDataUrl ? { tagPhotoThumbnailDataUrl } : {}),
        ...(r.tag_photo_mime_type ? { tagPhotoMimeType: String(r.tag_photo_mime_type) } : {}),
        ...(tagPhotoBytes > 0 ? { tagPhotoBytes } : {}),
        ...(r.tag_photo_captured_date_iso
          ? { tagPhotoCapturedDateIso: String(r.tag_photo_captured_date_iso) }
          : {}),
        ...(r.tag_photo_purged_at_iso
          ? { tagPhotoPurgedAtIso: String(r.tag_photo_purged_at_iso) }
          : {}),
        ...(tagPhotoBytesReclaimed > 0 ? { tagPhotoBytesReclaimed } : {}),
        ...(r.ocr_raw_text ? { ocrRawText: String(r.ocr_raw_text) } : {}),
        ...(ocrConf > 0 ? { ocrConfidence: ocrConf } : {}),
        ...(Number(r.ocr_manual_override) === 1 ? { ocrManualOverride: true } : {}),
        ...(Number(r.recall_flagged) === 1 ? { recallFlagged: true } : {}),
        ...(r.recall_note ? { recallNote: String(r.recall_note) } : {}),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const feedAllocations: FeedAllocation[] = safeTableQuery(
      'feed_allocations',
      'SELECT * FROM feed_allocations ORDER BY date_iso DESC, created_at DESC'
    ).map((r) => {
      const tType = String(r.target_type || 'general');
      const targetType: FeedAllocationTargetType =
        tType === 'cage' || tType === 'litter' || tType === 'animal' ? tType : 'general';
      return {
        id: String(r.id),
        species: String(r.species),
        feedBatchId: String(r.feed_batch_id),
        targetType,
        targetId: String(r.target_id || ''),
        targetLabel: String(r.target_label || ''),
        dateIso: String(r.date_iso),
        quantity: finiteNonNeg(r.quantity, 0),
        unit: String(r.unit || 'lbs'),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const ledgerEntries: LedgerEntry[] = safeTableQuery(
      'ledger_entries',
      'SELECT * FROM ledger_entries ORDER BY date_iso DESC, created_at DESC'
    ).map((r) => {
      const receiptPhotoDataUrl = r.receipt_photo_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.receipt_photo_data_url)) || undefined
        : undefined;
      const receiptPhotoThumbnailDataUrl = r.receipt_photo_thumbnail_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.receipt_photo_thumbnail_data_url)) ||
          receiptPhotoDataUrl
        : receiptPhotoDataUrl;
      const receiptPhotoBytes = finiteNonNeg(r.receipt_photo_bytes, 0);
      return {
        id: String(r.id),
        species: String(r.species),
        dateIso: String(r.date_iso || ''),
        entryType: normalizeLedgerEntryType(r.entry_type, 'expense'),
        category: normalizeLedgerCategory(r.category, 'other'),
        amountCents: Math.round(finiteNonNeg(r.amount_cents, 0)),
        title: String(r.title || ''),
        vendorOrParty: String(r.vendor_or_party || ''),
        ...(r.linked_animal_id ? { linkedAnimalId: String(r.linked_animal_id) } : {}),
        ...(r.linked_breeding_id ? { linkedBreedingId: String(r.linked_breeding_id) } : {}),
        ...(r.linked_feed_batch_id ? { linkedFeedBatchId: String(r.linked_feed_batch_id) } : {}),
        ...(r.linked_project_id ? { linkedProjectId: String(r.linked_project_id) } : {}),
        ...(receiptPhotoDataUrl ? { receiptPhotoDataUrl } : {}),
        ...(receiptPhotoThumbnailDataUrl ? { receiptPhotoThumbnailDataUrl } : {}),
        ...(r.receipt_photo_mime_type
          ? { receiptPhotoMimeType: String(r.receipt_photo_mime_type) }
          : {}),
        ...(receiptPhotoBytes > 0 ? { receiptPhotoBytes } : {}),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const processingLogs: ProcessingLog[] = safeTableQuery(
      'processing_logs',
      'SELECT * FROM processing_logs ORDER BY harvest_date_iso DESC, scheduled_date_iso DESC, created_at DESC'
    ).map((r) => {
      const dressPctRaw = finiteNonNeg(r.dress_out_percent, 0);
      const procCostRaw = Math.round(finiteNonNeg(r.processing_cost_cents, 0));
      const meatValRaw = Math.round(finiteNonNeg(r.meat_value_cents, 0));
      const peltValRaw = Math.round(finiteNonNeg(r.pelt_value_cents, 0));
      return {
        id: String(r.id),
        species: String(r.species),
        title: String(r.title || ''),
        ...(r.linked_animal_id ? { linkedAnimalId: String(r.linked_animal_id) } : {}),
        ...(r.linked_breeding_id ? { linkedBreedingId: String(r.linked_breeding_id) } : {}),
        scheduledDateIso: String(r.scheduled_date_iso || ''),
        harvestDateIso: String(r.harvest_date_iso || ''),
        status: normalizeProcessingStatus(r.status, 'Processed'),
        animalCount: Math.max(1, Math.round(finiteNonNeg(r.animal_count, 1))),
        liveWeightGrams: Math.round(finiteNonNeg(r.live_weight_grams, 0)),
        dressedWeightGrams: Math.round(finiteNonNeg(r.dressed_weight_grams, 0)),
        ...(dressPctRaw > 0 ? { dressOutPercent: dressPctRaw } : {}),
        peltCount: Math.round(finiteNonNeg(r.pelt_count, 0)),
        peltGrade: normalizePeltGrade(r.pelt_grade),
        peltColorNotes: String(r.pelt_color_notes || ''),
        ...(procCostRaw > 0 ? { processingCostCents: procCostRaw } : {}),
        ...(meatValRaw > 0 ? { meatValueCents: meatValRaw } : {}),
        ...(peltValRaw > 0 ? { peltValueCents: peltValRaw } : {}),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const youthProjectBooks: YouthProjectBook[] = safeTableQuery(
      'youth_project_books',
      'SELECT * FROM youth_project_books ORDER BY project_year DESC, start_date_iso DESC, created_at DESC'
    ).map((r) => {
      const linkedAnimalIds = safeArray<string>(
        this.safeParseJson<string[]>(
          r.linked_animal_ids_json || '[]',
          [],
          `youth_project_books(${String(r.id)}).linked_animal_ids_json`
        )
      );
      const linkedBreedingIds = safeArray<string>(
        this.safeParseJson<string[]>(
          r.linked_breeding_ids_json || '[]',
          [],
          `youth_project_books(${String(r.id)}).linked_breeding_ids_json`
        )
      );
      const feedLogs = normalizeYouthProjectFeedLogs(
        this.safeParseJson<unknown[]>(
          r.feed_logs_json || '[]',
          [],
          `youth_project_books(${String(r.id)}).feed_logs_json`
        )
      );
      return {
        id: String(r.id),
        species: String(r.species),
        organization: normalizeYouthOrgType(r.organization, '4-H'),
        projectTitle: String(r.project_title || ''),
        memberName: String(r.member_name || ''),
        clubOrChapter: String(r.club_or_chapter || ''),
        leaderOrAdvisor: String(r.leader_or_advisor || ''),
        projectYear: String(r.project_year || ''),
        startDateIso: String(r.start_date_iso || ''),
        endDateIso: String(r.end_date_iso || ''),
        status: String(r.status) === 'Completed' ? 'Completed' : 'Active',
        linkedAnimalIds,
        linkedBreedingIds,
        startingInventoryValueCents: Math.round(
          finiteNonNeg(r.starting_inventory_value_cents, 0)
        ),
        endingInventoryValueCents: Math.round(
          finiteNonNeg(r.ending_inventory_value_cents, 0)
        ),
        feedLogs,
        goalsAndReflection: String(r.goals_and_reflection || ''),
        showAndCommunityNotes: String(r.show_and_community_notes || ''),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const clientContacts: ClientContact[] = safeTableQuery(
      'client_contacts',
      'SELECT * FROM client_contacts ORDER BY full_name ASC, created_at DESC'
    ).map((r) => {
      const tags = safeArray<string>(
        this.safeParseJson<string[]>(
          r.tags_json || '[]',
          [],
          `client_contacts(${String(r.id)}).tags_json`
        )
      )
        .filter((t) => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim());
      return {
        id: String(r.id),
        species: String(r.species),
        fullName: String(r.full_name || ''),
        ranchOrHerdName: String(r.ranch_or_herd_name || ''),
        email: String(r.email || ''),
        phone: String(r.phone || ''),
        preferredContact: normalizePreferredContactMethod(r.preferred_contact, 'sms'),
        clientKind: normalizeClientKind(r.client_kind, 'pet_buyer'),
        cityState: String(r.city_state || ''),
        shippingAddress: String(r.shipping_address || ''),
        tags,
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const waitlistEntries: WaitlistEntry[] = safeTableQuery(
      'waitlist_entries',
      'SELECT * FROM waitlist_entries ORDER BY priority_rank ASC, inquiry_date_iso ASC, created_at ASC'
    ).map((r) => {
      const rawSex = String(r.preferred_sex || 'Any');
      const preferredSex: WaitlistEntry['preferredSex'] =
        rawSex === 'Male' || rawSex === 'Female' ? rawSex : 'Any';
      const maxBudgetRaw = Math.round(finiteNonNeg(r.max_budget_cents, 0));
      return {
        id: String(r.id),
        species: String(r.species),
        clientId: String(r.client_id || ''),
        clientName: String(r.client_name || ''),
        priorityRank: Math.max(1, Math.round(finiteNonNeg(r.priority_rank, 1))),
        status: normalizeWaitlistStatus(r.status, 'Active'),
        intent: normalizeWaitlistIntent(r.intent, 'Show / Breeding'),
        desiredBreed: String(r.desired_breed || ''),
        desiredVariety: String(r.desired_variety || ''),
        preferredSex,
        ...(r.preferred_breeding_id
          ? { preferredBreedingId: String(r.preferred_breeding_id) }
          : {}),
        requestedByDateIso: String(r.requested_by_date_iso || ''),
        inquiryDateIso: String(r.inquiry_date_iso || ''),
        followUpDateIso: String(r.follow_up_date_iso || ''),
        lastContactedDateIso: String(r.last_contacted_date_iso || ''),
        ...(maxBudgetRaw > 0 ? { maxBudgetCents: maxBudgetRaw } : {}),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const animalReservations: AnimalReservation[] = safeTableQuery(
      'animal_reservations',
      'SELECT * FROM animal_reservations ORDER BY reserved_date_iso DESC, created_at DESC'
    ).map((r) => {
      const pickOrderRaw = Math.round(finiteNonNeg(r.pick_order, 0));
      return {
        id: String(r.id),
        species: String(r.species),
        agreementNumber: String(r.agreement_number || ''),
        clientId: String(r.client_id || ''),
        clientName: String(r.client_name || ''),
        ...(r.waitlist_entry_id ? { waitlistEntryId: String(r.waitlist_entry_id) } : {}),
        ...(r.animal_id ? { animalId: String(r.animal_id) } : {}),
        ...(r.breeding_id ? { breedingId: String(r.breeding_id) } : {}),
        ...(pickOrderRaw > 0 ? { pickOrder: pickOrderRaw } : {}),
        itemLabel: String(r.item_label || ''),
        status: normalizeReservationStatus(r.status, 'Pending Deposit'),
        reservedDateIso: String(r.reserved_date_iso || ''),
        holdExpiresDateIso: String(r.hold_expires_date_iso || ''),
        totalPriceCents: Math.round(finiteNonNeg(r.total_price_cents, 0)),
        depositRequiredCents: Math.round(finiteNonNeg(r.deposit_required_cents, 0)),
        depositPaidCents: Math.round(finiteNonNeg(r.deposit_paid_cents, 0)),
        depositDueDateIso: String(r.deposit_due_date_iso || ''),
        depositPaidDateIso: String(r.deposit_paid_date_iso || ''),
        pickupScheduledDateIso: String(r.pickup_scheduled_date_iso || ''),
        completedDateIso: String(r.completed_date_iso || ''),
        balanceReminderDateIso: String(r.balance_reminder_date_iso || ''),
        paymentMethod: String(r.payment_method || ''),
        ...(r.ledger_entry_id ? { ledgerEntryId: String(r.ledger_entry_id) } : {}),
        termsSummary: String(r.terms_summary || ''),
        healthGuaranteeNotes: String(r.health_guarantee_notes || ''),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    if (sanitizedNumericCount > 0) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Sanitized ${sanitizedNumericCount} non-finite or negative SQLite numeric field(s) during loadSnapshot`,
      });
    }

    return {
      settings,
      speciesProfiles,
      animals,
      animalPhotos,
      cages,
      breedings,
      tasks,
      careLogs,
      shows,
      feedBatches,
      feedAllocations,
      ledgerEntries,
      processingLogs,
      youthProjectBooks,
      clientContacts,
      waitlistEntries,
      animalReservations,
      woolHarvests: safeTableQuery(
        'wool_harvests',
        'SELECT * FROM wool_harvests ORDER BY harvest_date_iso DESC, created_at DESC'
      ).map((r): WoolHarvest => {
        const intervalRaw = Math.round(finiteNonNeg(r.shearing_interval_days, 0));
        const stapleRaw = finiteNonNeg(r.staple_length_mm, 0);
        const rawScoreJson = r.iagarb_score_json
          ? this.safeParseJson<Record<string, unknown> | null>(
              r.iagarb_score_json,
              null,
              `wool_harvests(${String(r.id)}).iagarb_score_json`
            )
          : null;
        const iagarbScore =
          rawScoreJson && Object.keys(rawScoreJson).length > 0
            ? normalizeIagarbScorecard(rawScoreJson)
            : undefined;
        return {
          id: String(r.id),
          species: String(r.species),
          animalId: String(r.animal_id || ''),
          harvestDateIso: String(r.harvest_date_iso || ''),
          ...(intervalRaw > 0 ? { shearingIntervalDays: intervalRaw } : {}),
          primeWeightGrams: Math.round(finiteNonNeg(r.prime_weight_grams, 0)),
          gradeWeightGrams: Math.round(finiteNonNeg(r.grade_weight_grams, 0)),
          harvestMethod: normalizeWoolHarvestMethod(r.harvest_method, 'Shear'),
          ...(stapleRaw > 0 ? { stapleLengthMm: stapleRaw } : {}),
          ...(iagarbScore ? { iagarbScore } : {}),
          witnessedBy: String(r.witnessed_by || ''),
          notes: String(r.notes || ''),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        };
      }),
    };
  }

  async loadAnimalPhotoDataUrl(photoId: string): Promise<string | null> {
    if (!photoId) return null;
    await this.syncFromPersistedStorageIfStale();
    if (!this.db) {
      const found = (this.fallbackSnapshot?.animalPhotos ?? []).find((p) => p.id === photoId);
      return found?.dataUrl || found?.thumbnailDataUrl || null;
    }
    const stmt = this.db.prepare('SELECT data_url, thumbnail_data_url FROM animal_photos WHERE id = ? LIMIT 1');
    try {
      stmt.bind([photoId]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject() as { data_url?: unknown; thumbnail_data_url?: unknown };
      const resolved = String(row.data_url || row.thumbnail_data_url || '');
      return resolved || null;
    } finally {
      stmt.free();
    }
  }

  async loadAnimalPhotoDataUrlsBatch(photoIds?: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (photoIds && photoIds.length === 0) return out;
    await this.syncFromPersistedStorageIfStale();

    if (!this.db) {
      const wanted = photoIds ? new Set(photoIds) : null;
      for (const p of this.fallbackSnapshot?.animalPhotos ?? []) {
        if (wanted && !wanted.has(p.id)) continue;
        const val = p.dataUrl || p.thumbnailDataUrl || '';
        if (val) out[p.id] = val;
      }
      return out;
    }

    if (!photoIds) {
      const rows = this.queryObjects('SELECT id, data_url, thumbnail_data_url FROM animal_photos');
      for (const r of rows) {
        const id = String(r.id || '');
        const val = String(r.data_url || r.thumbnail_data_url || '');
        if (id && val) out[id] = val;
      }
      return out;
    }

    // Query in chunks of 200 to stay comfortably within SQLite parameter limits
    for (let i = 0; i < photoIds.length; i += 200) {
      const chunk = photoIds.slice(i, i + 200);
      const placeholders = chunk.map(() => '?').join(', ');
      const stmt = this.db.prepare(
        `SELECT id, data_url, thumbnail_data_url FROM animal_photos WHERE id IN (${placeholders})`
      );
      try {
        stmt.bind(chunk);
        while (stmt.step()) {
          const r = stmt.getAsObject() as { id?: unknown; data_url?: unknown; thumbnail_data_url?: unknown };
          const id = String(r.id || '');
          const val = String(r.data_url || r.thumbnail_data_url || '');
          if (id && val) out[id] = val;
        }
      } finally {
        stmt.free();
      }
    }
    return out;
  }

  private mapAnimalRow(
    r: Record<string, any>,
    finiteNonNeg?: (raw: unknown, fallback?: number) => number,
    safeArray?: <T>(val: unknown) => T[]
  ): Animal {
    const sanitizeNonNeg =
      finiteNonNeg ??
      ((raw: unknown, fallback = 0): number => {
        if (raw === null || raw === undefined || raw === '') return fallback;
        const num = Number(raw);
        return Number.isFinite(num) && num >= 0 ? num : fallback;
      });
    const toSafeArray =
      safeArray ?? (<T>(val: unknown): T[] => (Array.isArray(val) ? (val as T[]) : []));

    const animalLabel = String(r.name || r.id || 'unknown');
    const suspectedRaw = this.safeParseJson<unknown>(
      r.suspected_carrier_of_json || '[]',
      [],
      `animals(${animalLabel}).suspected_carrier_of_json`
    );
    const confirmedRaw = this.safeParseJson<unknown>(
      r.confirmed_carrier_of_json || '[]',
      [],
      `animals(${animalLabel}).confirmed_carrier_of_json`
    );
    const clearedRaw = this.safeParseJson<unknown>(
      r.cleared_carrier_of_json || '[]',
      [],
      `animals(${animalLabel}).cleared_carrier_of_json`
    );
    const carriers = reconcileCarrierTraitLists(suspectedRaw, confirmedRaw, clearedRaw);
    const rawSex = String(r.sex || 'Unknown');
    const sex: Animal['sex'] =
      rawSex === 'Male' || rawSex === 'Female' ? rawSex : 'Unknown';
    const status: Animal['status'] = normalizeAnimalStatus(r.status);

    return {
      id: String(r.id),
      tattoo: String(r.tattoo),
      name: String(r.name),
      species: String(r.species),
      breed: String(r.breed),
      variety: String(r.variety),
      sex,
      status,
      archived: Number(r.archived) === 1,
      needsAttention: Number(r.needs_attention) === 1,
      ignoredConflicts: normalizeIgnoredConflicts(
        this.safeParseJson(
          r.ignored_conflicts_json || '[]',
          [],
          `animals(${animalLabel}).ignored_conflicts_json`
        )
      ),
      birthDateIso: String(r.birth_date_iso),
      weightGrams: sanitizeNonNeg(r.weight_grams, 0),
      genotype: toSafeArray(
        this.safeParseJson(
          r.genotype_json || '[]',
          [],
          `animals(${animalLabel}).genotype_json`
        )
      ),
      genotypeRaw: String(r.genotype_raw),
      rufusLevel: normalizeRufusLevel(r.rufus_level),
      suspectedCarrierOf: carriers.suspectedCarrierOf,
      confirmedCarrierOf: carriers.confirmedCarrierOf,
      clearedCarrierOf: carriers.clearedCarrierOf,
      registrationNumber: String(r.registration_number),
      grandChampionNumber: String(r.grand_champion_number),
      legsCount: sanitizeNonNeg(r.legs_count, 0),
      cageLocation: String(r.cage_location),
      breederName: String(r.breeder_name),
      ownerName: String(r.owner_name),
      ownershipType: normalizeOwnershipType(r.ownership_type, 'Owned'),
      culled: Number(r.culled) === 1,
      cullDateIso: String(r.cull_date_iso || ''),
      cullReason: String(r.cull_reason || ''),
      deceasedDateIso: String(r.deceased_date_iso || ''),
      deathCause: String(r.death_cause || ''),
      soldDateIso: String(r.sold_date_iso || ''),
      salePriceCents: sanitizeNonNeg(r.sale_price_cents, 0),
      purchaseCostCents: sanitizeNonNeg(r.purchase_cost_cents, 0),
      buyerName: String(r.buyer_name || ''),
      sireId: String(r.sire_id),
      damId: String(r.dam_id),
      notes: String(r.notes),
      offloadedArchiveKey: r.offloaded_archive_key ? String(r.offloaded_archive_key) : undefined,
      offloadedAtIso: r.offloaded_at_iso ? String(r.offloaded_at_iso) : undefined,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async queryPedigreeNeighborhood(rootIds: string[], maxDepth: number): Promise<Animal[]> {
    const cleanRoots = Array.from(new Set(rootIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (cleanRoots.length === 0) return [];
    const boundedDepth = Math.min(8, Math.max(0, Math.floor(maxDepth)));
    await this.syncFromPersistedStorageIfStale();

    const MAX_RECORDS = 512;
    const collected: Animal[] = [];
    const visited = new Set<string>();
    let frontier = cleanRoots;

    if (!this.db) {
      const byId = new Map<string, Animal>();
      for (const a of this.fallbackSnapshot?.animals ?? []) {
        byId.set(a.id, a);
      }
      for (let depth = 0; depth <= boundedDepth && frontier.length > 0 && collected.length < MAX_RECORDS; depth++) {
        const nextFrontier: string[] = [];
        for (const id of frontier) {
          if (visited.has(id) || collected.length >= MAX_RECORDS) continue;
          visited.add(id);
          const found = byId.get(id);
          if (!found) continue;
          collected.push(found);
          if (depth < boundedDepth) {
            if (found.sireId && !visited.has(found.sireId)) nextFrontier.push(found.sireId);
            if (found.damId && !visited.has(found.damId)) nextFrontier.push(found.damId);
          }
        }
        frontier = nextFrontier;
      }
      return collected;
    }

    for (let depth = 0; depth <= boundedDepth && frontier.length > 0 && collected.length < MAX_RECORDS; depth++) {
      const batchToFetch: string[] = [];
      for (const id of frontier) {
        if (!visited.has(id)) {
          visited.add(id);
          batchToFetch.push(id);
        }
      }
      if (batchToFetch.length === 0) break;

      const nextFrontier: string[] = [];
      for (let i = 0; i < batchToFetch.length; i += 64) {
        if (collected.length >= MAX_RECORDS) break;
        const chunk = batchToFetch.slice(i, i + 64);
        const placeholders = chunk.map(() => '?').join(', ');
        const stmt = this.db.prepare(
          `SELECT * FROM animals WHERE id IN (${placeholders})`
        );
        try {
          stmt.bind(chunk);
          while (stmt.step()) {
            if (collected.length >= MAX_RECORDS) break;
            const animal = this.mapAnimalRow(stmt.getAsObject());
            collected.push(animal);
            if (depth < boundedDepth) {
              if (animal.sireId && !visited.has(animal.sireId)) nextFrontier.push(animal.sireId);
              if (animal.damId && !visited.has(animal.damId)) nextFrontier.push(animal.damId);
            }
          }
        } finally {
          stmt.free();
        }
      }
      frontier = nextFrontier;
    }

    return collected;
  }

  async queryPedigreeBranchAncestorsExist(
    animalIds: string[]
  ): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    const cleanIds = Array.from(new Set(animalIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (cleanIds.length === 0) return out;
    await this.syncFromPersistedStorageIfStale();

    if (!this.db) {
      const byId = new Map<string, Animal>();
      for (const a of this.fallbackSnapshot?.animals ?? []) {
        byId.set(a.id, a);
      }
      for (const id of cleanIds) {
        const a = byId.get(id);
        if (!a) {
          out[id] = false;
          continue;
        }
        out[id] = Boolean(
          (a.sireId && byId.has(a.sireId)) ||
            (a.damId && byId.has(a.damId)) ||
            a.offloadedArchiveKey
        );
      }
      return out;
    }

    const parentRefs: Array<{ id: string; sireId: string; damId: string; archivedKey: string }> = [];
    const candidateParentIds = new Set<string>();

    for (let i = 0; i < cleanIds.length; i += 64) {
      const chunk = cleanIds.slice(i, i + 64);
      const placeholders = chunk.map(() => '?').join(', ');
      const stmt = this.db.prepare(
        `SELECT id, sire_id, dam_id, offloaded_archive_key FROM animals WHERE id IN (${placeholders})`
      );
      try {
        stmt.bind(chunk);
        while (stmt.step()) {
          const r = stmt.getAsObject() as {
            id?: unknown;
            sire_id?: unknown;
            dam_id?: unknown;
            offloaded_archive_key?: unknown;
          };
          const id = String(r.id || '');
          const sireId = String(r.sire_id || '');
          const damId = String(r.dam_id || '');
          const archivedKey = String(r.offloaded_archive_key || '');
          if (id) {
            parentRefs.push({ id, sireId, damId, archivedKey });
            if (sireId) candidateParentIds.add(sireId);
            if (damId) candidateParentIds.add(damId);
          }
        }
      } finally {
        stmt.free();
      }
    }

    const existingParents = new Set<string>();
    const parentIdArr = Array.from(candidateParentIds);
    for (let i = 0; i < parentIdArr.length; i += 64) {
      const chunk = parentIdArr.slice(i, i + 64);
      const placeholders = chunk.map(() => '?').join(', ');
      const stmt = this.db.prepare(
        `SELECT id FROM animals WHERE id IN (${placeholders})`
      );
      try {
        stmt.bind(chunk);
        while (stmt.step()) {
          const r = stmt.getAsObject() as { id?: unknown };
          const pid = String(r.id || '');
          if (pid) existingParents.add(pid);
        }
      } finally {
        stmt.free();
      }
    }

    for (const ref of parentRefs) {
      out[ref.id] = Boolean(
        (ref.sireId && existingParents.has(ref.sireId)) ||
          (ref.damId && existingParents.has(ref.damId)) ||
          ref.archivedKey
      );
    }
    return out;
  }

  async replaceSnapshot(snapshot: BarnDatabaseSnapshot): Promise<void> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, () =>
      this.replaceSnapshotLocked(snapshot, 'replaceSnapshot')
    );
  }

  private async replaceSnapshotLocked(
    snapshot: BarnDatabaseSnapshot,
    reason = 'replaceSnapshot'
  ): Promise<void> {
    if (!this.db) {
      const existingById = new Map<string, string>();
      for (const prev of this.fallbackSnapshot?.animalPhotos ?? []) {
        if (prev.dataUrl) existingById.set(prev.id, prev.dataUrl);
      }
      const nextPhotos = (snapshot.animalPhotos ?? []).map((p) =>
        p.dataUrl ? p : { ...p, dataUrl: existingById.get(p.id) || p.thumbnailDataUrl || '' }
      );
      const nextSnap: BarnDatabaseSnapshot = { ...snapshot, animalPhotos: nextPhotos };
      this.fallbackSnapshot = nextSnap;
      await this.persistToDiskLocked(nextSnap, reason);
      return;
    }

    const existingPhotoDataUrls = new Map<string, string>();
    const hasDehydratedPhoto = (snapshot.animalPhotos ?? []).some((p) => !p.dataUrl);
    if (hasDehydratedPhoto) {
      for (const row of this.queryObjects('SELECT id, data_url FROM animal_photos')) {
        const id = String(row.id || '');
        const dataUrl = String(row.data_url || '');
        if (id && dataUrl) existingPhotoDataUrls.set(id, dataUrl);
      }
    }

    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run('DELETE FROM barn_settings;');
      this.db.run('DELETE FROM species_profiles;');
      this.db.run('DELETE FROM animals;');
      this.db.run('DELETE FROM animal_photos;');
      this.db.run('DELETE FROM cages;');
      this.db.run('DELETE FROM breedings;');
      this.db.run('DELETE FROM barn_tasks;');
      this.db.run('DELETE FROM care_logs;');
      this.db.run('DELETE FROM shows;');
      this.db.run('DELETE FROM feed_batches;');
      this.db.run('DELETE FROM feed_allocations;');
      this.db.run('DELETE FROM ledger_entries;');
      this.db.run('DELETE FROM processing_logs;');
      this.db.run('DELETE FROM youth_project_books;');
      this.db.run('DELETE FROM client_contacts;');
      this.db.run('DELETE FROM waitlist_entries;');
      this.db.run('DELETE FROM animal_reservations;');
      this.db.run('DELETE FROM wool_harvests;');

      this.upsertSettingsRow(snapshot.settings);
      for (const sp of snapshot.speciesProfiles) this.upsertSpeciesRow(sp);
      for (const a of snapshot.animals) this.upsertAnimalRow(a);
      for (const p of snapshot.animalPhotos ?? []) {
        const preservedDataUrl = p.dataUrl || existingPhotoDataUrls.get(p.id) || '';
        this.upsertAnimalPhotoRow(
          preservedDataUrl === p.dataUrl ? p : { ...p, dataUrl: preservedDataUrl }
        );
      }
      for (const c of snapshot.cages) this.upsertCageRow(c);
      for (const b of snapshot.breedings) this.upsertBreedingRow(b);
      for (const t of snapshot.tasks) this.upsertTaskRow(t);
      for (const l of snapshot.careLogs) this.upsertCareLogRow(l);
      for (const s of snapshot.shows) this.upsertShowRow(s);
      for (const fb of snapshot.feedBatches ?? []) this.upsertFeedBatchRow(fb);
      for (const fa of snapshot.feedAllocations ?? []) this.upsertFeedAllocationRow(fa);
      for (const le of snapshot.ledgerEntries ?? []) this.upsertLedgerEntryRow(le);
      for (const pl of snapshot.processingLogs ?? []) this.upsertProcessingLogRow(pl);
      for (const yp of snapshot.youthProjectBooks ?? []) this.upsertYouthProjectBookRow(yp);
      for (const cc of snapshot.clientContacts ?? []) this.upsertClientContactRow(cc);
      for (const wl of snapshot.waitlistEntries ?? []) this.upsertWaitlistEntryRow(wl);
      for (const ar of snapshot.animalReservations ?? []) this.upsertAnimalReservationRow(ar);
      for (const wh of snapshot.woolHarvests ?? []) this.upsertWoolHarvestRow(wh);

      this.db.run('COMMIT;');
    } catch (e) {
      try {
        this.db.run('ROLLBACK;');
      } catch {
        // Ignore rollback error so root exception surfaces cleanly
      }
      throw e;
    }

    await this.persistToDiskLocked(hasDehydratedPhoto ? undefined : snapshot, reason);
  }

  private upsertSettingsRow(s: BarnSettings): void {
    const extraJson = JSON.stringify({
      showHomeSummaryGrid: s.showHomeSummaryGrid ?? true,
      barnNameOnboarded: s.barnNameOnboarded ?? false,
      ignoredTaskIds: s.ignoredTaskIds ?? [],
      dismissedTaskGroupKeys: s.dismissedTaskGroupKeys ?? {},
      dismissedMemoAlertSignatures: s.dismissedMemoAlertSignatures ?? {},
      speciesHubBlockOrder: s.speciesHubBlockOrder ?? {},
      includePhotoOnPedigree: s.includePhotoOnPedigree ?? false,
      breederLogoDataUrl: s.breederLogoDataUrl
        ? sanitizeSafeRasterImageDataUrl(s.breederLogoDataUrl) || undefined
        : undefined,
      calendarSync: s.calendarSync ? normalizeCalendarSyncSettings(s.calendarSync) : undefined,
      lastBackupMeta: s.lastBackupMeta ?? undefined,
      backupReminderSnoozedUntilMs: s.backupReminderSnoozedUntilMs ?? undefined,
      autoOffloadRetiredToOpfs: Boolean(s.autoOffloadRetiredToOpfs),
      feedTagPurgeWindowDays: normalizeFeedPurgeWindowDays(s.feedTagPurgeWindowDays, 60),
    });
    this.db?.run(
      `INSERT OR REPLACE INTO barn_settings
       (id, barn_name, breeder_name, preferred_unit, currency_code, default_species, pinned_landing_species, default_generations, theme_mode, custom_colors_json, image_optimization_preset, extra_settings_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id || 'barn_settings',
        s.barnName,
        s.breederName,
        s.preferredUnit,
        normalizeCurrencyCode(s.currencyCode, 'USD'),
        s.defaultSpecies,
        s.pinnedLandingSpecies,
        s.defaultGenerations,
        s.themeMode,
        JSON.stringify(s.customColors || {}),
        s.imageOptimizationPreset || 'balanced',
        extraJson,
        s.updatedAt,
      ]
    );
  }

  private upsertSpeciesRow(sp: SpeciesProfile): void {
    this.db?.run(
      `INSERT OR REPLACE INTO species_profiles
       (id, name, sort_order, default_animal_prefix, preferred_unit, memo_text, memo_updated_at, gestation_days, rebreed_days_after_birth, wean_days_after_birth, maturity_days, birth_event_label, male_label, female_label, offspring_label, example_breeds_json, milestones_json, breed_overrides_json, target_weight_curve_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sp.id,
        sp.name,
        sp.sortOrder ?? 0,
        sp.defaultAnimalPrefix || '',
        sp.preferredUnit || '',
        sanitizeSpeciesMemo(sp.memoText ?? ''),
        String(sp.memoUpdatedAt || ''),
        sp.gestationDays,
        sp.rebreedDaysAfterBirth,
        sp.weanDaysAfterBirth,
        sp.maturityDays && sp.maturityDays > 0 ? Math.round(sp.maturityDays) : 0,
        sp.birthEventLabel,
        sp.maleLabel,
        sp.femaleLabel,
        sp.offspringLabel,
        JSON.stringify(sp.exampleBreeds),
        JSON.stringify(sp.milestones),
        JSON.stringify(normalizeBreedScheduleOverrides(sp.breedOverrides)),
        JSON.stringify(normalizeTargetWeightCurve(sp.targetWeightCurve)),
        sp.createdAt,
        sp.updatedAt,
      ]
    );
  }

  private upsertAnimalRow(a: Animal): void {
    const carriers = reconcileCarrierTraitLists(
      a.suspectedCarrierOf,
      a.confirmedCarrierOf,
      a.clearedCarrierOf
    );
    this.db?.run(
      `INSERT OR REPLACE INTO animals
       (id, tattoo, name, species, breed, variety, sex, status, archived, needs_attention, ignored_conflicts_json, birth_date_iso, weight_grams, genotype_json, genotype_raw, rufus_level, suspected_carrier_of_json, confirmed_carrier_of_json, cleared_carrier_of_json, registration_number, grand_champion_number, legs_count, cage_location, breeder_name, owner_name, ownership_type, culled, cull_date_iso, cull_reason, deceased_date_iso, death_cause, sold_date_iso, sale_price_cents, purchase_cost_cents, buyer_name, sire_id, dam_id, notes, offloaded_archive_key, offloaded_at_iso, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.tattoo,
        a.name,
        a.species,
        a.breed,
        a.variety,
        a.sex,
        a.status,
        a.archived ? 1 : 0,
        a.needsAttention ? 1 : 0,
        JSON.stringify(normalizeIgnoredConflicts(a.ignoredConflicts)),
        a.birthDateIso,
        a.weightGrams,
        JSON.stringify(a.genotype),
        a.genotypeRaw,
        normalizeRufusLevel(a.rufusLevel),
        JSON.stringify(carriers.suspectedCarrierOf),
        JSON.stringify(carriers.confirmedCarrierOf),
        JSON.stringify(carriers.clearedCarrierOf),
        a.registrationNumber,
        a.grandChampionNumber,
        a.legsCount,
        a.cageLocation,
        a.breederName,
        a.ownerName,
        normalizeOwnershipType(a.ownershipType, 'Owned'),
        a.culled ? 1 : 0,
        a.cullDateIso || '',
        a.cullReason || '',
        a.deceasedDateIso || '',
        a.deathCause || '',
        a.soldDateIso || '',
        a.salePriceCents && a.salePriceCents > 0 ? Math.round(a.salePriceCents) : 0,
        a.purchaseCostCents && a.purchaseCostCents > 0 ? Math.round(a.purchaseCostCents) : 0,
        a.buyerName || '',
        a.sireId,
        a.damId,
        a.notes,
        a.offloadedArchiveKey || '',
        a.offloadedAtIso || '',
        a.createdAt,
        a.updatedAt,
      ]
    );
  }

  private upsertAnimalPhotoRow(p: AnimalPhoto): void {
    let resolvedDataUrl = p.dataUrl;
    if (!resolvedDataUrl && this.db) {
      const stmt = this.db.prepare('SELECT data_url FROM animal_photos WHERE id = ? LIMIT 1');
      try {
        stmt.bind([p.id]);
        if (stmt.step()) {
          const existing = stmt.getAsObject() as { data_url?: unknown };
          resolvedDataUrl = String(existing.data_url || '');
        }
      } finally {
        stmt.free();
      }
    }
    this.db?.run(
      `INSERT OR REPLACE INTO animal_photos
       (id, species, animal_id, is_primary, sort_order, caption, original_file_name, mime_type, width, height, original_bytes, stored_bytes, thumbnail_data_url, data_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.species,
        p.animalId,
        p.isPrimary ? 1 : 0,
        p.sortOrder,
        p.caption,
        p.originalFileName,
        p.mimeType,
        p.width,
        p.height,
        p.originalBytes,
        p.storedBytes,
        p.thumbnailDataUrl,
        resolvedDataUrl,
        p.createdAt,
        p.updatedAt,
      ]
    );
  }

  private upsertCageRow(c: CageLocation): void {
    this.db?.run(
      `INSERT OR REPLACE INTO cages
       (id, species, label, section, capacity, notes, unit_type, feed_lot_name, feed_stock_remaining, feed_stock_unit, daily_ration_note, feed_low_threshold, maintenance_interval_days, maintenance_task_label, last_maintenance_date_iso, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.species,
        c.label,
        c.section,
        c.capacity,
        c.notes,
        c.unitType || '',
        c.feedLotName || '',
        Number.isFinite(Number(c.feedStockRemaining)) && Number(c.feedStockRemaining) > 0
          ? Number(c.feedStockRemaining)
          : 0,
        c.feedStockUnit || '',
        c.dailyRationNote || '',
        Number.isFinite(Number(c.feedLowThreshold)) && Number(c.feedLowThreshold) > 0
          ? Number(c.feedLowThreshold)
          : 0,
        Number.isFinite(Number(c.maintenanceIntervalDays)) && Number(c.maintenanceIntervalDays) > 0
          ? Math.round(Number(c.maintenanceIntervalDays))
          : 0,
        c.maintenanceTaskLabel || '',
        c.lastMaintenanceDateIso || '',
        c.createdAt,
        c.updatedAt,
      ]
    );
  }

  private upsertBreedingRow(b: BreedingRecord): void {
    this.db?.run(
      `INSERT OR REPLACE INTO breedings
       (id, species, sire_id, dam_id, sire_name, dam_name, bred_date_iso, expected_due_date_iso, actual_birth_date_iso, projected_coi_percent, live_count, stillborn_count, fostered_count, weaned_count, offspring_created, status, service_fee_cents, service_fee_direction, ultrasound_date_iso, ultrasound_result, ultrasound_fetal_count, ultrasound_projected_due_iso, litter_weight_milestones_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id,
        b.species,
        b.sireId,
        b.damId,
        b.sireName,
        b.damName,
        b.bredDateIso,
        b.expectedDueDateIso,
        b.actualBirthDateIso,
        b.projectedCoiPercent,
        b.liveCount,
        b.stillbornCount,
        b.fosteredCount,
        b.weanedCount,
        b.offspringCreated ? 1 : 0,
        b.status,
        b.serviceFeeCents && b.serviceFeeCents > 0 ? Math.round(b.serviceFeeCents) : 0,
        normalizeServiceFeeDirection(b.serviceFeeDirection),
        b.ultrasoundDateIso || '',
        normalizeUltrasoundResult(b.ultrasoundResult),
        b.ultrasoundFetalCount && b.ultrasoundFetalCount > 0
          ? Math.round(b.ultrasoundFetalCount)
          : 0,
        b.ultrasoundProjectedDueIso || '',
        JSON.stringify(normalizeLitterWeightMilestones(b.litterWeightMilestones)),
        b.notes,
        b.createdAt,
        b.updatedAt,
      ]
    );
  }

  private upsertTaskRow(t: BarnTask): void {
    this.db?.run(
      `INSERT OR REPLACE INTO barn_tasks
       (id, species, title, category, priority, due_date_iso, linked_animal_id, linked_animal_name, linked_breeding_id, completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.species,
        t.title,
        t.category,
        t.priority,
        t.dueDateIso,
        t.linkedAnimalId,
        t.linkedAnimalName,
        t.linkedBreedingId,
        t.completed ? 1 : 0,
        t.createdAt,
        t.updatedAt,
      ]
    );
  }

  private upsertCareLogRow(l: CareLog): void {
    this.db?.run(
      `INSERT OR REPLACE INTO care_logs
       (id, species, animal_id, date_iso, type, title, weight_grams, show_leg_earned, medication_name, dosage, administration_route, withdrawal_days, withdrawal_clear_date_iso, body_condition_score, famacha_score, fecal_egg_count, ultrasound_result, ultrasound_fetal_count, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        l.id,
        l.species,
        l.animalId,
        l.dateIso,
        l.type,
        l.title,
        l.weightGrams,
        l.showLegEarned ? 1 : 0,
        l.medicationName || '',
        l.dosage || '',
        l.administrationRoute || '',
        l.withdrawalDays && l.withdrawalDays > 0 ? Math.round(l.withdrawalDays) : 0,
        l.withdrawalClearDateIso || '',
        l.bodyConditionScore && l.bodyConditionScore > 0 ? Number(l.bodyConditionScore) : 0,
        l.famachaScore && l.famachaScore > 0 ? Math.round(l.famachaScore) : 0,
        l.fecalEggCount && l.fecalEggCount > 0 ? Math.round(l.fecalEggCount) : 0,
        normalizeUltrasoundResult(l.ultrasoundResult),
        l.ultrasoundFetalCount && l.ultrasoundFetalCount > 0
          ? Math.round(l.ultrasoundFetalCount)
          : 0,
        l.notes,
        l.createdAt,
        l.updatedAt,
      ]
    );
  }

  private upsertShowRow(s: ShowEvent): void {
    const cleanResults = normalizeShowResults(s.results ?? [], { dropEmpty: false });
    const syncedEnteredIds = mergeEnteredAnimalIdsWithResults(s.enteredAnimalIds ?? [], cleanResults);
    this.db?.run(
      `INSERT OR REPLACE INTO shows
       (id, species, name, location, sanctioning_body, event_date_iso, entry_deadline_iso, entered_animal_ids_json, results_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.species,
        s.name,
        s.location,
        s.sanctioningBody,
        s.eventDateIso,
        s.entryDeadlineIso,
        JSON.stringify(syncedEnteredIds),
        JSON.stringify(cleanResults),
        s.notes,
        s.createdAt,
        s.updatedAt,
      ]
    );
  }

  private upsertFeedBatchRow(f: FeedBatch): void {
    const safePhoto = f.tagPhotoDataUrl
      ? sanitizeSafeRasterImageDataUrl(f.tagPhotoDataUrl) || ''
      : '';
    const safeThumb = f.tagPhotoThumbnailDataUrl
      ? sanitizeSafeRasterImageDataUrl(f.tagPhotoThumbnailDataUrl) || safePhoto
      : safePhoto;
    this.db?.run(
      `INSERT OR REPLACE INTO feed_batches
       (id, species, brand, product_name, lot_number, mill_code, manufacture_date_iso, purchase_date_iso, bag_count, bag_weight_value, bag_weight_unit, total_quantity, remaining_quantity, low_stock_threshold, total_cost_cents, supplier_name, protein_percent, notes, tag_photo_data_url, tag_photo_thumbnail_data_url, tag_photo_mime_type, tag_photo_bytes, tag_photo_captured_date_iso, tag_photo_purged_at_iso, tag_photo_bytes_reclaimed, ocr_raw_text, ocr_confidence, ocr_manual_override, recall_flagged, recall_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.id,
        f.species,
        f.brand || '',
        f.productName,
        f.lotNumber || '',
        f.millCode || '',
        f.manufactureDateIso || '',
        f.purchaseDateIso,
        Number.isFinite(Number(f.bagCount)) && Number(f.bagCount) >= 0 ? Number(f.bagCount) : 0,
        Number.isFinite(Number(f.bagWeightValue)) && Number(f.bagWeightValue) >= 0 ? Number(f.bagWeightValue) : 0,
        f.bagWeightUnit || 'lbs',
        Number.isFinite(Number(f.totalQuantity)) && Number(f.totalQuantity) >= 0 ? Number(f.totalQuantity) : 0,
        Number.isFinite(Number(f.remainingQuantity)) && Number(f.remainingQuantity) >= 0 ? Number(f.remainingQuantity) : 0,
        Number.isFinite(Number(f.lowStockThreshold)) && Number(f.lowStockThreshold) >= 0 ? Number(f.lowStockThreshold) : 0,
        f.totalCostCents && f.totalCostCents > 0 ? Math.round(f.totalCostCents) : 0,
        f.supplierName || '',
        f.proteinPercent && f.proteinPercent > 0 ? Number(f.proteinPercent) : 0,
        f.notes || '',
        safePhoto,
        safeThumb,
        f.tagPhotoMimeType || '',
        f.tagPhotoBytes && f.tagPhotoBytes > 0 ? Math.round(f.tagPhotoBytes) : 0,
        f.tagPhotoCapturedDateIso || '',
        f.tagPhotoPurgedAtIso || '',
        f.tagPhotoBytesReclaimed && f.tagPhotoBytesReclaimed > 0 ? Math.round(f.tagPhotoBytesReclaimed) : 0,
        f.ocrRawText || '',
        f.ocrConfidence && f.ocrConfidence > 0 ? Number(f.ocrConfidence) : 0,
        f.ocrManualOverride ? 1 : 0,
        f.recallFlagged ? 1 : 0,
        f.recallNote || '',
        f.createdAt,
        f.updatedAt,
      ]
    );
  }

  private upsertFeedAllocationRow(fa: FeedAllocation): void {
    this.db?.run(
      `INSERT OR REPLACE INTO feed_allocations
       (id, species, feed_batch_id, target_type, target_id, target_label, date_iso, quantity, unit, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fa.id,
        fa.species,
        fa.feedBatchId,
        fa.targetType,
        fa.targetId || '',
        fa.targetLabel || '',
        fa.dateIso,
        Number.isFinite(Number(fa.quantity)) && Number(fa.quantity) >= 0 ? Number(fa.quantity) : 0,
        fa.unit || 'lbs',
        fa.notes || '',
        fa.createdAt,
        fa.updatedAt,
      ]
    );
  }

  private upsertLedgerEntryRow(le: LedgerEntry): void {
    const safePhoto = le.receiptPhotoDataUrl
      ? sanitizeSafeRasterImageDataUrl(le.receiptPhotoDataUrl) || ''
      : '';
    const safeThumb = le.receiptPhotoThumbnailDataUrl
      ? sanitizeSafeRasterImageDataUrl(le.receiptPhotoThumbnailDataUrl) || safePhoto
      : safePhoto;
    this.db?.run(
      `INSERT OR REPLACE INTO ledger_entries
       (id, species, date_iso, entry_type, category, amount_cents, title, vendor_or_party, linked_animal_id, linked_breeding_id, linked_feed_batch_id, linked_project_id, receipt_photo_data_url, receipt_photo_thumbnail_data_url, receipt_photo_mime_type, receipt_photo_bytes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        le.id,
        le.species,
        le.dateIso || '',
        normalizeLedgerEntryType(le.entryType, 'expense'),
        normalizeLedgerCategory(le.category, 'other'),
        Number.isFinite(Number(le.amountCents)) && Number(le.amountCents) >= 0
          ? Math.round(Number(le.amountCents))
          : 0,
        le.title || '',
        le.vendorOrParty || '',
        le.linkedAnimalId || '',
        le.linkedBreedingId || '',
        le.linkedFeedBatchId || '',
        le.linkedProjectId || '',
        safePhoto,
        safeThumb,
        le.receiptPhotoMimeType || '',
        le.receiptPhotoBytes && le.receiptPhotoBytes > 0 ? Math.round(le.receiptPhotoBytes) : 0,
        le.notes || '',
        le.createdAt,
        le.updatedAt,
      ]
    );
  }

  private upsertProcessingLogRow(pl: ProcessingLog): void {
    this.db?.run(
      `INSERT OR REPLACE INTO processing_logs
       (id, species, title, linked_animal_id, linked_breeding_id, scheduled_date_iso, harvest_date_iso, status, animal_count, live_weight_grams, dressed_weight_grams, dress_out_percent, pelt_count, pelt_grade, pelt_color_notes, processing_cost_cents, meat_value_cents, pelt_value_cents, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pl.id,
        pl.species,
        pl.title || '',
        pl.linkedAnimalId || '',
        pl.linkedBreedingId || '',
        pl.scheduledDateIso || '',
        pl.harvestDateIso || '',
        normalizeProcessingStatus(pl.status, 'Processed'),
        Number.isFinite(Number(pl.animalCount)) && Number(pl.animalCount) >= 1
          ? Math.round(Number(pl.animalCount))
          : 1,
        Number.isFinite(Number(pl.liveWeightGrams)) && Number(pl.liveWeightGrams) >= 0
          ? Math.round(Number(pl.liveWeightGrams))
          : 0,
        Number.isFinite(Number(pl.dressedWeightGrams)) && Number(pl.dressedWeightGrams) >= 0
          ? Math.round(Number(pl.dressedWeightGrams))
          : 0,
        typeof pl.dressOutPercent === 'number' && Number.isFinite(pl.dressOutPercent) && pl.dressOutPercent > 0
          ? pl.dressOutPercent
          : 0,
        Number.isFinite(Number(pl.peltCount)) && Number(pl.peltCount) >= 0
          ? Math.round(Number(pl.peltCount))
          : 0,
        normalizePeltGrade(pl.peltGrade),
        pl.peltColorNotes || '',
        pl.processingCostCents && pl.processingCostCents > 0 ? Math.round(pl.processingCostCents) : 0,
        pl.meatValueCents && pl.meatValueCents > 0 ? Math.round(pl.meatValueCents) : 0,
        pl.peltValueCents && pl.peltValueCents > 0 ? Math.round(pl.peltValueCents) : 0,
        pl.notes || '',
        pl.createdAt,
        pl.updatedAt,
      ]
    );
  }

  private upsertYouthProjectBookRow(yp: YouthProjectBook): void {
    this.db?.run(
      `INSERT OR REPLACE INTO youth_project_books
       (id, species, organization, project_title, member_name, club_or_chapter, leader_or_advisor, project_year, start_date_iso, end_date_iso, status, linked_animal_ids_json, linked_breeding_ids_json, starting_inventory_value_cents, ending_inventory_value_cents, feed_logs_json, goals_and_reflection, show_and_community_notes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        yp.id,
        yp.species,
        normalizeYouthOrgType(yp.organization, '4-H'),
        yp.projectTitle || '',
        yp.memberName || '',
        yp.clubOrChapter || '',
        yp.leaderOrAdvisor || '',
        yp.projectYear || '',
        yp.startDateIso || '',
        yp.endDateIso || '',
        yp.status === 'Completed' ? 'Completed' : 'Active',
        JSON.stringify(Array.isArray(yp.linkedAnimalIds) ? yp.linkedAnimalIds : []),
        JSON.stringify(Array.isArray(yp.linkedBreedingIds) ? yp.linkedBreedingIds : []),
        Number.isFinite(Number(yp.startingInventoryValueCents)) &&
        Number(yp.startingInventoryValueCents) >= 0
          ? Math.round(Number(yp.startingInventoryValueCents))
          : 0,
        Number.isFinite(Number(yp.endingInventoryValueCents)) &&
        Number(yp.endingInventoryValueCents) >= 0
          ? Math.round(Number(yp.endingInventoryValueCents))
          : 0,
        JSON.stringify(normalizeYouthProjectFeedLogs(yp.feedLogs)),
        yp.goalsAndReflection || '',
        yp.showAndCommunityNotes || '',
        yp.notes || '',
        yp.createdAt,
        yp.updatedAt,
      ]
    );
  }

  private upsertClientContactRow(cc: ClientContact): void {
    this.db?.run(
      `INSERT OR REPLACE INTO client_contacts
       (id, species, full_name, ranch_or_herd_name, email, phone, preferred_contact, client_kind, city_state, shipping_address, tags_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cc.id,
        cc.species,
        cc.fullName || '',
        cc.ranchOrHerdName || '',
        cc.email || '',
        cc.phone || '',
        normalizePreferredContactMethod(cc.preferredContact, 'sms'),
        normalizeClientKind(cc.clientKind, 'pet_buyer'),
        cc.cityState || '',
        cc.shippingAddress || '',
        JSON.stringify(Array.isArray(cc.tags) ? cc.tags : []),
        cc.notes || '',
        cc.createdAt,
        cc.updatedAt,
      ]
    );
  }

  private upsertWaitlistEntryRow(wl: WaitlistEntry): void {
    const cleanSex =
      wl.preferredSex === 'Male' || wl.preferredSex === 'Female' ? wl.preferredSex : 'Any';
    this.db?.run(
      `INSERT OR REPLACE INTO waitlist_entries
       (id, species, client_id, client_name, priority_rank, status, intent, desired_breed, desired_variety, preferred_sex, preferred_breeding_id, requested_by_date_iso, inquiry_date_iso, follow_up_date_iso, last_contacted_date_iso, max_budget_cents, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wl.id,
        wl.species,
        wl.clientId || '',
        wl.clientName || '',
        Number.isFinite(Number(wl.priorityRank)) && Number(wl.priorityRank) >= 1
          ? Math.round(Number(wl.priorityRank))
          : 1,
        normalizeWaitlistStatus(wl.status, 'Active'),
        normalizeWaitlistIntent(wl.intent, 'Show / Breeding'),
        wl.desiredBreed || '',
        wl.desiredVariety || '',
        cleanSex,
        wl.preferredBreedingId || '',
        wl.requestedByDateIso || '',
        wl.inquiryDateIso || '',
        wl.followUpDateIso || '',
        wl.lastContactedDateIso || '',
        wl.maxBudgetCents && wl.maxBudgetCents > 0 ? Math.round(wl.maxBudgetCents) : 0,
        wl.notes || '',
        wl.createdAt,
        wl.updatedAt,
      ]
    );
  }

  private upsertAnimalReservationRow(ar: AnimalReservation): void {
    this.db?.run(
      `INSERT OR REPLACE INTO animal_reservations
       (id, species, agreement_number, client_id, client_name, waitlist_entry_id, animal_id, breeding_id, pick_order, item_label, status, reserved_date_iso, hold_expires_date_iso, total_price_cents, deposit_required_cents, deposit_paid_cents, deposit_due_date_iso, deposit_paid_date_iso, pickup_scheduled_date_iso, completed_date_iso, balance_reminder_date_iso, payment_method, ledger_entry_id, terms_summary, health_guarantee_notes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ar.id,
        ar.species,
        ar.agreementNumber || '',
        ar.clientId || '',
        ar.clientName || '',
        ar.waitlistEntryId || '',
        ar.animalId || '',
        ar.breedingId || '',
        ar.pickOrder && ar.pickOrder > 0 ? Math.round(ar.pickOrder) : 0,
        ar.itemLabel || '',
        normalizeReservationStatus(ar.status, 'Pending Deposit'),
        ar.reservedDateIso || '',
        ar.holdExpiresDateIso || '',
        Number.isFinite(Number(ar.totalPriceCents)) && Number(ar.totalPriceCents) >= 0
          ? Math.round(Number(ar.totalPriceCents))
          : 0,
        Number.isFinite(Number(ar.depositRequiredCents)) && Number(ar.depositRequiredCents) >= 0
          ? Math.round(Number(ar.depositRequiredCents))
          : 0,
        Number.isFinite(Number(ar.depositPaidCents)) && Number(ar.depositPaidCents) >= 0
          ? Math.round(Number(ar.depositPaidCents))
          : 0,
        ar.depositDueDateIso || '',
        ar.depositPaidDateIso || '',
        ar.pickupScheduledDateIso || '',
        ar.completedDateIso || '',
        ar.balanceReminderDateIso || '',
        ar.paymentMethod || '',
        ar.ledgerEntryId || '',
        ar.termsSummary || '',
        ar.healthGuaranteeNotes || '',
        ar.notes || '',
        ar.createdAt,
        ar.updatedAt,
      ]
    );
  }

  private upsertWoolHarvestRow(wh: WoolHarvest): void {
    const interval =
      typeof wh.shearingIntervalDays === 'number' &&
      Number.isFinite(wh.shearingIntervalDays) &&
      wh.shearingIntervalDays > 0
        ? Math.round(wh.shearingIntervalDays)
        : 0;
    const staple =
      typeof wh.stapleLengthMm === 'number' &&
      Number.isFinite(wh.stapleLengthMm) &&
      wh.stapleLengthMm > 0
        ? wh.stapleLengthMm
        : 0;
    const scoreJson = wh.iagarbScore
      ? JSON.stringify(normalizeIagarbScorecard(wh.iagarbScore))
      : '{}';
    this.db?.run(
      `INSERT OR REPLACE INTO wool_harvests
       (id, species, animal_id, harvest_date_iso, shearing_interval_days, prime_weight_grams, grade_weight_grams, harvest_method, staple_length_mm, iagarb_score_json, witnessed_by, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wh.id,
        wh.species,
        wh.animalId || '',
        wh.harvestDateIso || '',
        interval,
        Number.isFinite(Number(wh.primeWeightGrams)) && Number(wh.primeWeightGrams) >= 0
          ? Math.round(Number(wh.primeWeightGrams))
          : 0,
        Number.isFinite(Number(wh.gradeWeightGrams)) && Number(wh.gradeWeightGrams) >= 0
          ? Math.round(Number(wh.gradeWeightGrams))
          : 0,
        normalizeWoolHarvestMethod(wh.harvestMethod, 'Shear'),
        staple,
        scoreJson,
        wh.witnessedBy || '',
        wh.notes || '',
        wh.createdAt,
        wh.updatedAt,
      ]
    );
  }

  private async withLockedWrite(reason: string, mutate: () => void): Promise<void> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
      await this.syncFromPersistedStorageIfStaleLocked();
      mutate();
      await this.persistToDiskLocked(undefined, reason);
    });
  }

  async saveSettings(settings: BarnSettings): Promise<void> {
    await this.withLockedWrite('saveSettings', () => {
      if (this.db) {
        this.upsertSettingsRow(settings);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.settings = settings;
      }
    });
  }

  async saveSpeciesProfile(profile: SpeciesProfile): Promise<void> {
    await this.withLockedWrite('saveSpeciesProfile', () => {
      if (this.db) {
        this.upsertSpeciesRow(profile);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.speciesProfiles.findIndex((p) => p.id === profile.id);
        if (idx >= 0) this.fallbackSnapshot.speciesProfiles[idx] = profile;
        else this.fallbackSnapshot.speciesProfiles.push(profile);
        this.fallbackSnapshot.speciesProfiles.sort(
          (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
        );
      }
    });
  }

  async saveSpeciesProfilesBatch(profiles: SpeciesProfile[]): Promise<void> {
    if (profiles.length === 0) return;
    await this.withLockedWrite('saveSpeciesProfilesBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const sp of profiles) this.upsertSpeciesRow(sp);
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error so root exception surfaces cleanly
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        for (const sp of profiles) {
          const idx = this.fallbackSnapshot.speciesProfiles.findIndex((p) => p.id === sp.id);
          if (idx >= 0) this.fallbackSnapshot.speciesProfiles[idx] = sp;
          else this.fallbackSnapshot.speciesProfiles.push(sp);
        }
        this.fallbackSnapshot.speciesProfiles.sort(
          (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
        );
      }
    });
  }

  async deleteSpeciesProfile(id: string): Promise<void> {
    await this.withLockedWrite('deleteSpeciesProfile', () => {
      if (this.db) {
        this.db.run('DELETE FROM species_profiles WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.speciesProfiles = this.fallbackSnapshot.speciesProfiles.filter(
          (p) => p.id !== id
        );
      }
    });
  }

  async saveAnimal(animal: Animal): Promise<void> {
    await this.withLockedWrite('saveAnimal', () => {
      if (this.db) {
        this.upsertAnimalRow(animal);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.animals.findIndex((a) => a.id === animal.id);
        if (idx >= 0) this.fallbackSnapshot.animals[idx] = animal;
        else this.fallbackSnapshot.animals.push(animal);
      }
    });
  }

  async saveAnimalsBatch(animals: Animal[]): Promise<void> {
    if (animals.length === 0) return;
    await this.withLockedWrite('saveAnimalsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const a of animals) this.upsertAnimalRow(a);
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error so root exception surfaces cleanly
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        for (const a of animals) {
          const idx = this.fallbackSnapshot.animals.findIndex((x) => x.id === a.id);
          if (idx >= 0) this.fallbackSnapshot.animals[idx] = a;
          else this.fallbackSnapshot.animals.push(a);
        }
      }
    });
  }

  async deleteAnimal(id: string): Promise<void> {
    await this.withLockedWrite('deleteAnimal', () => {
      if (this.db) {
        this.db.run('DELETE FROM animals WHERE id = ?', [id]);
        this.db.run('DELETE FROM animal_photos WHERE animal_id = ?', [id]);
        this.db.run('DELETE FROM care_logs WHERE animal_id = ?', [id]);
        this.db.run('DELETE FROM wool_harvests WHERE animal_id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.animals = this.fallbackSnapshot.animals.filter((a) => a.id !== id);
        this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
          (p) => p.animalId !== id
        );
        this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter(
          (l) => l.animalId !== id
        );
        this.fallbackSnapshot.woolHarvests = (this.fallbackSnapshot.woolHarvests || []).filter(
          (w) => w.animalId !== id
        );
      }
    });
  }

  async deleteAnimalsBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await this.withLockedWrite('deleteAnimalsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const id of ids) {
            this.db.run('DELETE FROM animals WHERE id = ?', [id]);
            this.db.run('DELETE FROM animal_photos WHERE animal_id = ?', [id]);
            this.db.run('DELETE FROM care_logs WHERE animal_id = ?', [id]);
            this.db.run('DELETE FROM wool_harvests WHERE animal_id = ?', [id]);
          }
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error so root exception surfaces cleanly
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.animals = this.fallbackSnapshot.animals.filter((a) => !idSet.has(a.id));
        this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
          (p) => !idSet.has(p.animalId)
        );
        this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter(
          (l) => !idSet.has(l.animalId)
        );
        this.fallbackSnapshot.woolHarvests = (this.fallbackSnapshot.woolHarvests || []).filter(
          (w) => !idSet.has(w.animalId)
        );
      }
    });
  }

  async saveAnimalPhoto(photo: AnimalPhoto): Promise<void> {
    await this.withLockedWrite('saveAnimalPhoto', () => {
      if (this.db) {
        this.upsertAnimalPhotoRow(photo);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.animalPhotos || [];
        const idx = list.findIndex((p) => p.id === photo.id);
        const preserved =
          !photo.dataUrl && idx >= 0 ? { ...photo, dataUrl: list[idx].dataUrl } : photo;
        if (idx >= 0) list[idx] = preserved;
        else list.push(preserved);
        this.fallbackSnapshot.animalPhotos = list;
      }
    });
  }

  async saveAnimalPhotosBatch(photos: AnimalPhoto[]): Promise<void> {
    if (photos.length === 0) return;
    await this.withLockedWrite('saveAnimalPhotosBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const p of photos) this.upsertAnimalPhotoRow(p);
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error so root exception surfaces cleanly
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.animalPhotos || [];
        for (const p of photos) {
          const idx = list.findIndex((x) => x.id === p.id);
          const preserved =
            !p.dataUrl && idx >= 0 ? { ...p, dataUrl: list[idx].dataUrl } : p;
          if (idx >= 0) list[idx] = preserved;
          else list.push(preserved);
        }
        this.fallbackSnapshot.animalPhotos = list;
      }
    });
  }

  async deleteAnimalPhoto(id: string): Promise<void> {
    await this.withLockedWrite('deleteAnimalPhoto', () => {
      if (this.db) {
        this.db.run('DELETE FROM animal_photos WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
          (p) => p.id !== id
        );
      }
    });
  }

  async saveCage(cage: CageLocation): Promise<void> {
    await this.withLockedWrite('saveCage', () => {
      if (this.db) {
        this.upsertCageRow(cage);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.cages.findIndex((c) => c.id === cage.id);
        if (idx >= 0) this.fallbackSnapshot.cages[idx] = cage;
        else this.fallbackSnapshot.cages.push(cage);
      }
    });
  }

  async deleteCage(id: string): Promise<void> {
    await this.withLockedWrite('deleteCage', () => {
      if (this.db) {
        this.db.run('DELETE FROM cages WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.cages = this.fallbackSnapshot.cages.filter((c) => c.id !== id);
      }
    });
  }

  async saveBreeding(breeding: BreedingRecord): Promise<void> {
    await this.withLockedWrite('saveBreeding', () => {
      if (this.db) {
        this.upsertBreedingRow(breeding);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.breedings.findIndex((b) => b.id === breeding.id);
        if (idx >= 0) this.fallbackSnapshot.breedings[idx] = breeding;
        else this.fallbackSnapshot.breedings.push(breeding);
      }
    });
  }

  async deleteBreeding(id: string): Promise<void> {
    await this.withLockedWrite('deleteBreeding', () => {
      if (this.db) {
        this.db.run('DELETE FROM breedings WHERE id = ?', [id]);
        this.db.run('DELETE FROM barn_tasks WHERE linked_breeding_id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.breedings = this.fallbackSnapshot.breedings.filter((b) => b.id !== id);
        this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter(
          (t) => t.linkedBreedingId !== id
        );
      }
    });
  }

  async saveTask(task: BarnTask): Promise<void> {
    await this.withLockedWrite('saveTask', () => {
      if (this.db) {
        this.upsertTaskRow(task);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.tasks.findIndex((t) => t.id === task.id);
        if (idx >= 0) this.fallbackSnapshot.tasks[idx] = task;
        else this.fallbackSnapshot.tasks.push(task);
      }
    });
  }

  async saveTasksBatch(tasks: BarnTask[]): Promise<void> {
    if (tasks.length === 0) return;
    await this.withLockedWrite('saveTasksBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const t of tasks) this.upsertTaskRow(t);
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error so root exception surfaces cleanly
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        for (const t of tasks) {
          const idx = this.fallbackSnapshot.tasks.findIndex((x) => x.id === t.id);
          if (idx >= 0) this.fallbackSnapshot.tasks[idx] = t;
          else this.fallbackSnapshot.tasks.push(t);
        }
      }
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.withLockedWrite('deleteTask', () => {
      if (this.db) {
        this.db.run('DELETE FROM barn_tasks WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter((t) => t.id !== id);
      }
    });
  }

  async deleteTasksBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await this.withLockedWrite('deleteTasksBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const id of ids) {
            this.db.run('DELETE FROM barn_tasks WHERE id = ?', [id]);
          }
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error so root exception surfaces cleanly
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter((t) => !idSet.has(t.id));
      }
    });
  }

  async saveCareLog(log: CareLog): Promise<void> {
    await this.withLockedWrite('saveCareLog', () => {
      if (this.db) {
        this.upsertCareLogRow(log);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.careLogs.findIndex((l) => l.id === log.id);
        if (idx >= 0) this.fallbackSnapshot.careLogs[idx] = log;
        else this.fallbackSnapshot.careLogs.push(log);
      }
    });
  }

  async saveCareLogsBatch(logs: CareLog[]): Promise<void> {
    if (logs.length === 0) return;
    await this.withLockedWrite('saveCareLogsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const log of logs) this.upsertCareLogRow(log);
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error so root exception surfaces cleanly
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        for (const log of logs) {
          const idx = this.fallbackSnapshot.careLogs.findIndex((l) => l.id === log.id);
          if (idx >= 0) this.fallbackSnapshot.careLogs[idx] = log;
          else this.fallbackSnapshot.careLogs.push(log);
        }
      }
    });
  }

  async deleteCareLog(id: string): Promise<void> {
    await this.withLockedWrite('deleteCareLog', () => {
      if (this.db) {
        this.db.run('DELETE FROM care_logs WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter((l) => l.id !== id);
      }
    });
  }

  async saveShow(show: ShowEvent): Promise<void> {
    await this.withLockedWrite('saveShow', () => {
      if (this.db) {
        this.upsertShowRow(show);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.shows.findIndex((s) => s.id === show.id);
        if (idx >= 0) this.fallbackSnapshot.shows[idx] = show;
        else this.fallbackSnapshot.shows.push(show);
      }
    });
  }

  async deleteShow(id: string): Promise<void> {
    await this.withLockedWrite('deleteShow', () => {
      if (this.db) {
        this.db.run('DELETE FROM shows WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.shows = this.fallbackSnapshot.shows.filter((s) => s.id !== id);
      }
    });
  }

  async saveFeedBatch(batch: FeedBatch): Promise<void> {
    await this.withLockedWrite('saveFeedBatch', () => {
      if (this.db) {
        this.upsertFeedBatchRow(batch);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.feedBatches ?? [];
        const idx = list.findIndex((f) => f.id === batch.id);
        if (idx >= 0) list[idx] = batch;
        else list.push(batch);
        this.fallbackSnapshot.feedBatches = list;
      }
    });
  }

  async saveFeedBatchesBatch(batches: FeedBatch[]): Promise<void> {
    if (batches.length === 0) return;
    await this.withLockedWrite('saveFeedBatchesBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const b of batches) this.upsertFeedBatchRow(b);
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.feedBatches ?? [];
        for (const b of batches) {
          const idx = list.findIndex((x) => x.id === b.id);
          if (idx >= 0) list[idx] = b;
          else list.push(b);
        }
        this.fallbackSnapshot.feedBatches = list;
      }
    });
  }

  async deleteFeedBatch(id: string): Promise<void> {
    await this.withLockedWrite('deleteFeedBatch', () => {
      if (this.db) {
        this.db.run('DELETE FROM feed_batches WHERE id = ?', [id]);
        this.db.run('DELETE FROM feed_allocations WHERE feed_batch_id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.feedBatches = (this.fallbackSnapshot.feedBatches ?? []).filter(
          (f) => f.id !== id
        );
        this.fallbackSnapshot.feedAllocations = (this.fallbackSnapshot.feedAllocations ?? []).filter(
          (fa) => fa.feedBatchId !== id
        );
      }
    });
  }

  async saveFeedAllocation(allocation: FeedAllocation): Promise<void> {
    await this.withLockedWrite('saveFeedAllocation', () => {
      if (this.db) {
        this.upsertFeedAllocationRow(allocation);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.feedAllocations ?? [];
        const idx = list.findIndex((a) => a.id === allocation.id);
        if (idx >= 0) list[idx] = allocation;
        else list.push(allocation);
        this.fallbackSnapshot.feedAllocations = list;
      }
    });
  }

  async deleteFeedAllocation(id: string): Promise<void> {
    await this.withLockedWrite('deleteFeedAllocation', () => {
      if (this.db) {
        this.db.run('DELETE FROM feed_allocations WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.feedAllocations = (this.fallbackSnapshot.feedAllocations ?? []).filter(
          (fa) => fa.id !== id
        );
      }
    });
  }

  async saveLedgerEntry(entry: LedgerEntry): Promise<void> {
    await this.withLockedWrite('saveLedgerEntry', () => {
      if (this.db) {
        this.upsertLedgerEntryRow(entry);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.ledgerEntries ?? [];
        const idx = list.findIndex((x) => x.id === entry.id);
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        this.fallbackSnapshot.ledgerEntries = list;
      }
    });
  }

  async saveLedgerEntriesBatch(entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.withLockedWrite('saveLedgerEntriesBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const e of entries) this.upsertLedgerEntryRow(e);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.ledgerEntries ?? [];
        for (const e of entries) {
          const idx = list.findIndex((x) => x.id === e.id);
          if (idx >= 0) list[idx] = e;
          else list.push(e);
        }
        this.fallbackSnapshot.ledgerEntries = list;
      }
    });
  }

  async deleteLedgerEntry(id: string): Promise<void> {
    await this.withLockedWrite('deleteLedgerEntry', () => {
      if (this.db) {
        this.db.run('DELETE FROM ledger_entries WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.ledgerEntries = (this.fallbackSnapshot.ledgerEntries ?? []).filter(
          (x) => x.id !== id
        );
      }
    });
  }

  async saveProcessingLog(log: ProcessingLog): Promise<void> {
    await this.withLockedWrite('saveProcessingLog', () => {
      if (this.db) {
        this.upsertProcessingLogRow(log);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.processingLogs ?? [];
        const idx = list.findIndex((x) => x.id === log.id);
        if (idx >= 0) list[idx] = log;
        else list.push(log);
        this.fallbackSnapshot.processingLogs = list;
      }
    });
  }

  async saveProcessingLogsBatch(logs: ProcessingLog[]): Promise<void> {
    if (logs.length === 0) return;
    await this.withLockedWrite('saveProcessingLogsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const l of logs) this.upsertProcessingLogRow(l);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.processingLogs ?? [];
        for (const l of logs) {
          const idx = list.findIndex((x) => x.id === l.id);
          if (idx >= 0) list[idx] = l;
          else list.push(l);
        }
        this.fallbackSnapshot.processingLogs = list;
      }
    });
  }

  async deleteProcessingLog(id: string): Promise<void> {
    await this.withLockedWrite('deleteProcessingLog', () => {
      if (this.db) {
        this.db.run('DELETE FROM processing_logs WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.processingLogs = (this.fallbackSnapshot.processingLogs ?? []).filter(
          (x) => x.id !== id
        );
      }
    });
  }

  async saveYouthProjectBook(project: YouthProjectBook): Promise<void> {
    await this.withLockedWrite('saveYouthProjectBook', () => {
      if (this.db) {
        this.upsertYouthProjectBookRow(project);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.youthProjectBooks ?? [];
        const idx = list.findIndex((x) => x.id === project.id);
        if (idx >= 0) list[idx] = project;
        else list.push(project);
        this.fallbackSnapshot.youthProjectBooks = list;
      }
    });
  }

  async saveYouthProjectBooksBatch(projects: YouthProjectBook[]): Promise<void> {
    if (projects.length === 0) return;
    await this.withLockedWrite('saveYouthProjectBooksBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const yp of projects) this.upsertYouthProjectBookRow(yp);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.youthProjectBooks ?? [];
        for (const yp of projects) {
          const idx = list.findIndex((x) => x.id === yp.id);
          if (idx >= 0) list[idx] = yp;
          else list.push(yp);
        }
        this.fallbackSnapshot.youthProjectBooks = list;
      }
    });
  }

  async deleteYouthProjectBook(id: string): Promise<void> {
    await this.withLockedWrite('deleteYouthProjectBook', () => {
      if (this.db) {
        this.db.run('DELETE FROM youth_project_books WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.youthProjectBooks = (
          this.fallbackSnapshot.youthProjectBooks ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveClientContact(client: ClientContact): Promise<void> {
    await this.withLockedWrite('saveClientContact', () => {
      if (this.db) {
        this.upsertClientContactRow(client);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.clientContacts ?? [];
        const idx = list.findIndex((x) => x.id === client.id);
        if (idx >= 0) list[idx] = client;
        else list.push(client);
        this.fallbackSnapshot.clientContacts = list;
      }
    });
  }

  async saveClientContactsBatch(clients: ClientContact[]): Promise<void> {
    if (clients.length === 0) return;
    await this.withLockedWrite('saveClientContactsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const cc of clients) this.upsertClientContactRow(cc);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.clientContacts ?? [];
        for (const cc of clients) {
          const idx = list.findIndex((x) => x.id === cc.id);
          if (idx >= 0) list[idx] = cc;
          else list.push(cc);
        }
        this.fallbackSnapshot.clientContacts = list;
      }
    });
  }

  async deleteClientContact(id: string): Promise<void> {
    await this.withLockedWrite('deleteClientContact', () => {
      if (this.db) {
        this.db.run('DELETE FROM client_contacts WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.clientContacts = (
          this.fallbackSnapshot.clientContacts ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveWaitlistEntry(entry: WaitlistEntry): Promise<void> {
    await this.withLockedWrite('saveWaitlistEntry', () => {
      if (this.db) {
        this.upsertWaitlistEntryRow(entry);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.waitlistEntries ?? [];
        const idx = list.findIndex((x) => x.id === entry.id);
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        this.fallbackSnapshot.waitlistEntries = list;
      }
    });
  }

  async saveWaitlistEntriesBatch(entries: WaitlistEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.withLockedWrite('saveWaitlistEntriesBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const wl of entries) this.upsertWaitlistEntryRow(wl);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.waitlistEntries ?? [];
        for (const wl of entries) {
          const idx = list.findIndex((x) => x.id === wl.id);
          if (idx >= 0) list[idx] = wl;
          else list.push(wl);
        }
        this.fallbackSnapshot.waitlistEntries = list;
      }
    });
  }

  async deleteWaitlistEntry(id: string): Promise<void> {
    await this.withLockedWrite('deleteWaitlistEntry', () => {
      if (this.db) {
        this.db.run('DELETE FROM waitlist_entries WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.waitlistEntries = (
          this.fallbackSnapshot.waitlistEntries ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveAnimalReservation(reservation: AnimalReservation): Promise<void> {
    await this.withLockedWrite('saveAnimalReservation', () => {
      if (this.db) {
        this.upsertAnimalReservationRow(reservation);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.animalReservations ?? [];
        const idx = list.findIndex((x) => x.id === reservation.id);
        if (idx >= 0) list[idx] = reservation;
        else list.push(reservation);
        this.fallbackSnapshot.animalReservations = list;
      }
    });
  }

  async saveAnimalReservationsBatch(reservations: AnimalReservation[]): Promise<void> {
    if (reservations.length === 0) return;
    await this.withLockedWrite('saveAnimalReservationsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const ar of reservations) this.upsertAnimalReservationRow(ar);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.animalReservations ?? [];
        for (const ar of reservations) {
          const idx = list.findIndex((x) => x.id === ar.id);
          if (idx >= 0) list[idx] = ar;
          else list.push(ar);
        }
        this.fallbackSnapshot.animalReservations = list;
      }
    });
  }

  async deleteAnimalReservation(id: string): Promise<void> {
    await this.withLockedWrite('deleteAnimalReservation', () => {
      if (this.db) {
        this.db.run('DELETE FROM animal_reservations WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.animalReservations = (
          this.fallbackSnapshot.animalReservations ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveWoolHarvest(harvest: WoolHarvest): Promise<void> {
    await this.withLockedWrite('saveWoolHarvest', () => {
      if (this.db) {
        this.upsertWoolHarvestRow(harvest);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.woolHarvests ?? [];
        const idx = list.findIndex((x) => x.id === harvest.id);
        if (idx >= 0) list[idx] = harvest;
        else list.push(harvest);
        this.fallbackSnapshot.woolHarvests = list;
      }
    });
  }

  async saveWoolHarvestsBatch(harvests: WoolHarvest[]): Promise<void> {
    if (harvests.length === 0) return;
    await this.withLockedWrite('saveWoolHarvestsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const wh of harvests) this.upsertWoolHarvestRow(wh);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.woolHarvests ?? [];
        for (const wh of harvests) {
          const idx = list.findIndex((x) => x.id === wh.id);
          if (idx >= 0) list[idx] = wh;
          else list.push(wh);
        }
        this.fallbackSnapshot.woolHarvests = list;
      }
    });
  }

  async deleteWoolHarvest(id: string): Promise<void> {
    await this.withLockedWrite('deleteWoolHarvest', () => {
      if (this.db) {
        this.db.run('DELETE FROM wool_harvests WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.woolHarvests = (
          this.fallbackSnapshot.woolHarvests ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async exportRawSqliteBytes(): Promise<Uint8Array | null> {
    await this.syncFromPersistedStorageIfStale();
    if (!this.db) return null;
    return this.db.export();
  }

  async inspectRawSqliteBytes(
    bytes: Uint8Array,
    options?: SnapshotLoadOptions
  ): Promise<BarnDatabaseSnapshot> {
    const headerCheck = validateSqliteFileHeader(bytes);
    if (!headerCheck.ok) {
      throw new Error(headerCheck.error);
    }
    if (!this.SQL) {
      this.SQL = await initSqlJs(createSqlJsInitConfig());
    }
    if (!this.SQL) {
      throw new Error('SQLite WebAssembly engine is not available in this browser.');
    }
    const tempDb = new this.SQL.Database(bytes);
    try {
      applySchemaMigrations(tempDb);
      return this.readSnapshotFromDatabase(tempDb, options);
    } finally {
      try {
        tempDb.close();
      } catch {
        // Ignore close error on inspection database
      }
    }
  }

  async importRawSqliteBytes(
    bytes: Uint8Array,
    options?: SnapshotLoadOptions
  ): Promise<BarnDatabaseSnapshot> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
      if (!this.SQL) {
        this.SQL = await initSqlJs(createSqlJsInitConfig());
      }
      if (!this.SQL) {
        throw new Error('SQLite WebAssembly engine is not available in this browser.');
      }
      const headerCheck = validateSqliteFileHeader(bytes);
      if (!headerCheck.ok) {
        throw new Error(headerCheck.error);
      }
      const importedDb = new this.SQL.Database(bytes);
      applySchemaMigrations(importedDb);
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close error on superseded DB
        }
      }
      this.db = importedDb;
      this.fallbackSnapshot = null;
      await this.persistToDiskLocked(undefined, 'importRawSqliteBytes');
      return this.loadSnapshotUnlocked(options);
    });
  }

  async resetConnection(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close error on already-closed WASM DB
        }
        this.db = null;
      }
      this.SQL = null;
      this.fallbackSnapshot = null;
      this.loadedEpoch = 0;
      this.ephemeralMode = false;
      if (getSafeIndexedDb()) {
        try {
          await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
        } catch {
          // Ignore fallback delete failure
        }
      }
      return this.initializeLocked(options);
    });
  }

  async rebuildCleanDatabase(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close error
        }
        this.db = null;
      }
      this.SQL = null;
      this.fallbackSnapshot = null;
      this.loadedEpoch = 0;
      this.ephemeralMode = false;
      if (getSafeIndexedDb()) {
        try {
          await idbDelete(IDB_PRIMARY_KEY);
          await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
        } catch (err) {
          if (!isIndexedDbBlockedError(err)) {
            throw err;
          }
        }
      }
      return this.initializeLocked({ ...options, allowSeedFresh: options?.allowSeedFresh ?? true });
    });
  }
}
```

## `src/storage/__tests__/backgroundFreezeAndToast.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackgroundPausedError,
  clearPausedBackgroundJob,
  getPausedBackgroundJobs,
  notifyBackgroundTransition,
  registerFreezeLifecycleListener,
  registerPausedBackgroundJob,
  resetBackgroundFreezeCoordinatorForTests,
} from '../backgroundFreezeCoordinator';
import {
  clearEmergencySessionTrace,
  DiagnosticLogEntry,
  emitAsyncErrorToast,
  getActiveAsyncErrorToasts,
  handleUnhandledRejectionReason,
  inspectPreviousSessionUncleanExit,
  logDiagnosticEvent,
  markCleanSessionExit,
  normalizeStoredDiagnosticEntry,
  readEmergencySessionTrace,
  resetAsyncErrorToastsForTests,
  shouldIgnoreConsoleDiagnosticMessage,
  writeEmergencySessionTraceSync,
} from '../crashLogger';
import { syncWithPickedDirectory } from '../localSyncChannels';

function createMemoryStorage(options?: { failSetItem?: boolean }): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      if (options?.failSetItem) {
        const err = new Error('Simulated QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, value);
    },
  };
}

function makeFakeEntry(i: number, override?: Partial<DiagnosticLogEntry>): DiagnosticLogEntry {
  return {
    id: `entry-${i}`,
    timestampIso: '2026-04-01T12:00:00.000Z',
    timestampMs: 1_775_044_800_000 + i,
    sessionId: 'sess-test',
    level: 'error',
    category: 'storage',
    route: 'herd',
    message: `Storage failure #${i}`,
    ...override,
  };
}

describe('Mobile Background Freeze Coordinator, Emergency Session Trace & Async Error Toasts', () => {
  afterEach(() => {
    resetAsyncErrorToastsForTests();
    resetBackgroundFreezeCoordinatorForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('bounds sessionStorage emergency traces to 5 sanitized entries and scrubs base64 URIs', () => {
    const sessionMock = createMemoryStorage();
    const hugeBase64 = `data:image/jpeg;base64,${'A'.repeat(160)}`;

    for (let i = 1; i <= 7; i++) {
      const ok = writeEmergencySessionTraceSync(
        makeFakeEntry(i, {
          message: `Crash ${i} with payload ${hugeBase64}`,
          stack: `Error: Crash ${i}\n${hugeBase64}\n${'x'.repeat(300)}`,
        }),
        sessionMock
      );
      expect(ok).toBe(true);
    }

    const traces = readEmergencySessionTrace(sessionMock);
    expect(traces).toHaveLength(5);
    expect(traces.map((t) => t.id)).toEqual([
      'entry-3',
      'entry-4',
      'entry-5',
      'entry-6',
      'entry-7',
    ]);
    for (const item of traces) {
      expect(item.message).toContain('[image-data-uri omitted]');
      expect(item.message).not.toContain('AAAAAAAAAAAA');
      expect((item.stack || '').length).toBeLessThanOrEqual(260);
    }

    clearEmergencySessionTrace(sessionMock);
    expect(readEmergencySessionTrace(sessionMock)).toHaveLength(0);
  });

  it('falls back to sessionStorage emergency trace when localStorage throws QuotaExceededError during write', () => {
    const failingLocal = createMemoryStorage({ failSetItem: true });
    const emergencySession = createMemoryStorage();
    vi.stubGlobal('localStorage', failingLocal);
    vi.stubGlobal('sessionStorage', emergencySession);

    const quotaErr = new Error('QuotaExceededError: storage full');
    quotaErr.name = 'QuotaExceededError';
    handleUnhandledRejectionReason(quotaErr);

    const emergencyEntries = readEmergencySessionTrace(emergencySession);
    expect(emergencyEntries.length).toBeGreaterThanOrEqual(1);
    expect(emergencyEntries[emergencyEntries.length - 1]?.message).toContain('QuotaExceeded');

    const toasts = getActiveAsyncErrorToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.severity).toBe('error');
    expect(toasts[0]?.sticky).toBe(true);
    expect(toasts[0]?.title).toContain('Device Storage Full');
  });

  it('deduplicates repeated async error toasts, auto-dismisses minor warnings after 9s, and skips AbortError', () => {
    vi.useFakeTimers();

    // AbortError user cancel never surfaces a noisy error toast
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    handleUnhandledRejectionReason(abortErr);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);

    // Clean BackgroundPausedError emits non-sticky warning auto-dismissing at 9s
    handleUnhandledRejectionReason(new BackgroundPausedError('Folder Sync'));
    // Second identical pause inside 4.5s dedupe window is collapsed
    handleUnhandledRejectionReason(new BackgroundPausedError('Folder Sync'));
    expect(getActiveAsyncErrorToasts()).toHaveLength(1);
    expect(getActiveAsyncErrorToasts()[0]?.sticky).toBe(false);
    expect(getActiveAsyncErrorToasts()[0]?.severity).toBe('warning');

    vi.advanceTimersByTime(8999);
    expect(getActiveAsyncErrorToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);

    // Caps active stack at 2 and prefers dropping non-sticky notices over sticky errors
    emitAsyncErrorToast({
      title: 'Critical Write Fault',
      detail: 'Could not save litter record',
      severity: 'error',
      sticky: true,
    });
    emitAsyncErrorToast({
      title: 'Minor Notice A',
      detail: 'Transient pause',
      severity: 'warning',
      sticky: false,
    });
    emitAsyncErrorToast({
      title: 'Minor Notice B',
      detail: 'Second warning triggers eviction',
      severity: 'warning',
      sticky: false,
    });

    const active = getActiveAsyncErrorToasts();
    expect(active).toHaveLength(2);
    expect(active.some((t) => t.title === 'Critical Write Fault')).toBe(true);
    expect(active.some((t) => t.title === 'Minor Notice B')).toBe(true);
  });

  it('auto-resumes minor paused background jobs on visible, while keeping severity jobs sticky until user tap', () => {
    const onHidden = vi.fn();
    const onVisible = vi.fn();
    const unsub = registerFreezeLifecycleListener({ id: 'test-sub', onHidden, onVisible });

    const autoResumeSpy = vi.fn();
    const stickySeveritySpy = vi.fn();

    registerPausedBackgroundJob({
      taskId: 'clean-sync',
      label: 'Folder Sync',
      pausedAtMs: Date.now(),
      severity: 'minor',
      resumeHandler: autoResumeSpy,
    });
    registerPausedBackgroundJob({
      taskId: 'perm-lost-sync',
      label: 'Vault Sync',
      pausedAtMs: Date.now(),
      severity: 'severity',
      severityReason: 'Permission prompt required',
      resumeHandler: stickySeveritySpy,
    });

    notifyBackgroundTransition('hidden');
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(autoResumeSpy).not.toHaveBeenCalled();

    notifyBackgroundTransition('visible');
    expect(onVisible).toHaveBeenCalledTimes(1);
    // Ergonomic auto-resume runs immediately for clean minor pauses
    expect(autoResumeSpy).toHaveBeenCalledTimes(1);
    // Severity issue stays paused until user explicitly taps Resume
    expect(stickySeveritySpy).not.toHaveBeenCalled();
    expect(getPausedBackgroundJobs().map((j) => j.taskId)).toEqual(['perm-lost-sync']);

    clearPausedBackgroundJob('perm-lost-sync');
    unsub();
  });

  it('cooperatively checkpoints & throws BackgroundPausedError when visibilityState turns hidden mid-folder-sync', async () => {
    const docState = { visibilityState: 'visible' as 'visible' | 'hidden' };
    const writtenFiles: Record<string, string> = {};

    const peerDeltaJson = JSON.stringify({
      format: 'community-pedigree-delta-v1',
      device_id: 'peer-barn-2',
      exported_at: '2026-04-01T12:00:00.000Z',
      operations: [
        {
          op_id: 'op-peer-1',
          entity_type: 'animal',
          entity_uuid: 'anim-1',
          device_id: 'peer-barn-2',
          timestamp: '2026-04-01T12:00:00.000Z',
          logical_counter: 1,
          field_name: 'weightGrams',
          new_value: 2450,
        },
      ],
    });

    const fakeEntries: Array<[string, any]> = [
      [
        'delta_peer-barn-2.json',
        {
          kind: 'file',
          async getFile() {
            // Simulate user locking phone screen after first peer file finishes reading
            docState.visibilityState = 'hidden';
            return {
              name: 'delta_peer-barn-2.json',
              size: peerDeltaJson.length,
              async text() {
                return peerDeltaJson;
              },
            };
          },
        },
      ],
      [
        'delta_peer-barn-3.json',
        {
          kind: 'file',
          async getFile() {
            throw new Error('Should have paused before reading second peer file');
          },
        },
      ],
    ];

    // Mock IDB so we verify incoming ops + checkpoint write and deterministic db.close() on commit/abort
    const putRecords: Record<string, any[]> = {
      sync_handles: [],
      sync_outbox: [],
      sync_checkpoints: [],
    };
    let syncOpenCount = 0;
    let syncCloseCount = 0;
    vi.stubGlobal('indexedDB', {
      open(dbName: string) {
        const isSyncDb = dbName === 'community_pedigree_sync_v1';
        if (isSyncDb) syncOpenCount++;
        const req: any = { result: null, error: null };
        queueMicrotask(() => {
          const fakeDb = {
            close() {
              if (isSyncDb) syncCloseCount++;
            },
            transaction(storeName: string) {
              const tx: any = {
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore() {
                  return {
                    put(val: any) {
                      putRecords[storeName]?.push(val);
                      queueMicrotask(() => tx.oncomplete?.());
                      return {};
                    },
                  };
                },
              };
              return tx;
            },
          };
          req.result = fakeDb;
          req.onsuccess?.();
        });
        return req;
      },
    });

    const dirHandle = {
      name: 'Barn Sync Folder',
      async *entries() {
        for (const pair of fakeEntries) {
          yield pair;
        }
      },
      async getFileHandle(filename: string) {
        return {
          async createWritable() {
            let content = '';
            return {
              async write(data: string) {
                content += data;
              },
              async close() {
                writtenFiles[filename] = content;
              },
            };
          },
        };
      },
    };

    await expect(
      syncWithPickedDirectory({
        deviceId: 'dev-main',
        localOperations: [],
        masterBackupJson: '{}',
        dirHandleOverride: dirHandle,
        visibilityDoc: docState,
      })
    ).rejects.toBeInstanceOf(BackgroundPausedError);

    // Master/local delta files should NOT have been partially overwritten while hidden
    expect(writtenFiles['delta_dev-main.json']).toBeUndefined();
    expect(writtenFiles['pedigree_master_backup.json']).toBeUndefined();

    // Parsed incoming peer op & checkpoint were saved safely before throw, and IDB handles closed
    expect(putRecords.sync_outbox).toHaveLength(1);
    expect(putRecords.sync_outbox[0]?.op_id).toBe('op-peer-1');
    expect(putRecords.sync_checkpoints).toHaveLength(1);
    expect(putRecords.sync_checkpoints[0]?.incomingOpsQueued).toBe(1);
    expect(syncOpenCount).toBe(3);
    expect(syncCloseCount).toBe(syncOpenCount);
  });

  it('closes IndexedDB handle deterministically even when a write transaction aborts mid-batch', async () => {
    let syncOpenCount = 0;
    let syncCloseCount = 0;
    vi.stubGlobal('indexedDB', {
      open(dbName: string) {
        const isSyncDb = dbName === 'community_pedigree_sync_v1';
        if (isSyncDb) syncOpenCount++;
        const req: any = { result: null, error: null };
        queueMicrotask(() => {
          const fakeDb = {
            close() {
              if (isSyncDb) syncCloseCount++;
            },
            transaction() {
              const tx: any = {
                error: new Error('Transaction aborted by OS freeze'),
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore() {
                  return {
                    put() {
                      queueMicrotask(() => tx.onabort?.());
                      return {};
                    },
                  };
                },
              };
              return tx;
            },
          };
          req.result = fakeDb;
          req.onsuccess?.();
        });
        return req;
      },
    });

    const dirHandle = {
      name: 'Abort Test Folder',
      async *entries() {
        // Trigger immediate pause without extra files
      },
      async getFileHandle() {
        throw new Error('Should not write files while hidden');
      },
    };

    await expect(
      syncWithPickedDirectory({
        deviceId: 'dev-main',
        localOperations: [],
        masterBackupJson: '{}',
        dirHandleOverride: dirHandle,
        visibilityDoc: { visibilityState: 'hidden' },
      })
    ).rejects.toBeInstanceOf(BackgroundPausedError);

    expect(syncOpenCount).toBe(2);
    expect(syncCloseCount).toBe(syncOpenCount);
  });

  it('ignores Vite dev-proxy WebSocket console noise while preserving real errors', () => {
    expect(
      shouldIgnoreConsoleDiagnosticMessage(
        '[vite] failed to connect to websocket.\nyour current setup:\n  (browser) example.com/ <--[HTTP]--> localhost:3000/'
      )
    ).toBe(true);
    expect(shouldIgnoreConsoleDiagnosticMessage('[vite] server connection lost. Polling for restart...')).toBe(
      true
    );
    expect(shouldIgnoreConsoleDiagnosticMessage('[vite] connecting...')).toBe(true);

    expect(shouldIgnoreConsoleDiagnosticMessage('[vite] Internal Server Error\nSyntaxError')).toBe(false);
    expect(shouldIgnoreConsoleDiagnosticMessage('Failed writing local database to IndexedDB')).toBe(false);
  });

  it('normalizes legacy stored Vite WebSocket noise and low-heap lifecycle exits out of Memory Alerts', () => {
    const viteWsEntry = makeFakeEntry(10, {
      category: 'console',
      level: 'error',
      message: '[vite] failed to connect to websocket.\nyour current setup: ...',
    });
    expect(normalizeStoredDiagnosticEntry(viteWsEntry)).toBeNull();

    const lowHeapLegacyExit = makeFakeEntry(11, {
      category: 'memory',
      level: 'warn',
      message:
        'Previous session (sess-mwmc32si-cu0lt) terminated unexpectedly without clean pagehide (last active 2026-11-18T16:29:41.842Z, route "home", JS heap 6.8%). Possible mobile OS tab kill / out-of-memory reload.',
      details: JSON.stringify({
        previousSessionId: 'sess-mwmc32si-cu0lt',
        lastRoute: 'home',
        lastHeapPercent: 6.8,
        lastHeapBytes: 68_000_000,
        downtimeMs: 10_370,
      }),
    });
    const normalizedLow = normalizeStoredDiagnosticEntry(lowHeapLegacyExit);
    expect(normalizedLow?.category).toBe('lifecycle');
    expect(normalizedLow?.level).toBe('warn');

    const highHeapExit = makeFakeEntry(12, {
      category: 'memory',
      level: 'error',
      message:
        'Previous session (sess-oom-999) terminated unexpectedly without clean pagehide (last active 2026-11-18T16:29:41.842Z, route "home", JS heap 84.2%). Possible mobile OS tab kill / out-of-memory reload.',
      details: JSON.stringify({
        previousSessionId: 'sess-oom-999',
        lastHeapPercent: 84.2,
      }),
    });
    const normalizedHigh = normalizeStoredDiagnosticEntry(highHeapExit);
    expect(normalizedHigh?.category).toBe('memory');
    expect(normalizedHigh?.level).toBe('error');
  });

  it('keeps lifecycle warnings in lifecycle category and classifies only genuine high-heap exits or OOM faults as memory', () => {
    const localMock = createMemoryStorage();
    vi.stubGlobal('localStorage', localMock);

    // 1. Explicit lifecycle category is never hijacked to memory by descriptive text
    const lifecycleEntry = logDiagnosticEvent({
      level: 'warn',
      category: 'lifecycle',
      message: 'Session suspended without out-of-memory indicator',
    });
    expect(lifecycleEntry?.category).toBe('lifecycle');

    // 2. Real storage/runtime memory faults still elevate to memory
    const oomEntry = logDiagnosticEvent({
      level: 'error',
      category: 'storage',
      message: 'Array buffer allocation failed',
      error: new RangeError('Out of memory'),
    });
    expect(oomEntry?.category).toBe('memory');

    // 3. Low-heap (6.8%) unclean exit logs as lifecycle warn (not Memory Alert)
    localMock.setItem(
      'pedigree_session_heartbeat_v1',
      JSON.stringify({
        sessionId: 'sess-prev-low-heap',
        active: true,
        startedAtMs: Date.now() - 20_000,
        lastAliveMs: Date.now() - 10_000,
        lastRoute: 'home',
        lastHeapPercent: 6.8,
        lastHeapBytes: 68_000_000,
      })
    );
    const lowExitLog = inspectPreviousSessionUncleanExit();
    expect(lowExitLog?.category).toBe('lifecycle');
    expect(lowExitLog?.level).toBe('warn');
    expect(lowExitLog?.message).not.toContain('out-of-memory');

    // 4. High-heap (82.5%) unclean exit logs as memory error
    localMock.setItem(
      'pedigree_session_heartbeat_v1',
      JSON.stringify({
        sessionId: 'sess-prev-high-heap',
        active: true,
        startedAtMs: Date.now() - 20_000,
        lastAliveMs: Date.now() - 10_000,
        lastRoute: 'pedigree',
        lastHeapPercent: 82.5,
        lastHeapBytes: 825_000_000,
      })
    );
    const highExitLog = inspectPreviousSessionUncleanExit();
    expect(highExitLog?.category).toBe('memory');
    expect(highExitLog?.level).toBe('error');

    // 5. markCleanSessionExit clears active flag cleanly so no warning fires
    markCleanSessionExit();
    expect(inspectPreviousSessionUncleanExit()).toBeNull();
  });
});
```

## `src/storage/__tests__/capturedIdeasStore.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCapturedIdeas,
  deleteCapturedIdea,
  loadCapturedIdeas,
  saveCapturedIdea,
} from '../capturedIdeasStore';

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe('capturedIdeasStore — offline persistence, sanitization & cleanup', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizes, saves, loads, deletes, and clears captured ideas via offline fallback storage', async () => {
    const initial = await loadCapturedIdeas();
    expect(initial).toEqual([]);

    const saved = await saveCapturedIdea('  <b>Add</b> feed lot & weight reminders  ');
    expect(saved.entry.text).toBe('Add feed lot &amp; weight reminders');
    expect(saved.entry.createdAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(saved.ideas).toHaveLength(1);

    const loaded = await loadCapturedIdeas();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(saved.entry.id);

    const savedSecond = await saveCapturedIdea('Track winter breeding shelter temps');
    expect(savedSecond.ideas).toHaveLength(2);

    const afterDelete = await deleteCapturedIdea(saved.entry.id);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].id).toBe(savedSecond.entry.id);

    const afterClear = await clearCapturedIdeas();
    expect(afterClear).toEqual([]);
    expect(await loadCapturedIdeas()).toEqual([]);
  });

  it('rejects invalid or empty idea inputs before writing to storage', async () => {
    await expect(saveCapturedIdea('<script>alert(1)</script>')).rejects.toThrow();
    expect(await loadCapturedIdeas()).toEqual([]);
  });
});
```

<!-- END OF PART 15 OF 16 (16 files) -->

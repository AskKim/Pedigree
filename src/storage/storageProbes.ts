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

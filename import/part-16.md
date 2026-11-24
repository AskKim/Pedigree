# Codebase Export: AskKim/Pedigree (Part 16 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 24 (`src/storage/__tests__/crossTabLockAndReload.test.ts` -> `src/utils/__tests__/virtualWindow.test.ts`)
- **Index:** [index.md](./index.md)

---
## `src/storage/__tests__/crossTabLockAndReload.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Animal, BarnDatabaseSnapshot } from '../../core/models';
import { SyncOperation } from '../../core/syncOutbox';

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
  default: path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
}));

import {
  appendSyncConflictsToIdb,
  appendSyncOperationsToIdb,
  clearAllSyncStateInIdb,
  DB_WRITE_EPOCH_LS_KEY,
  loadAllSyncConflictsFromIdb,
  loadAllSyncOperationsFromIdb,
  loadSyncCheckpointFromIdb,
  publishCrossTabDbCommit,
  saveSyncCheckpointToIdb,
  subscribeCrossTabDbCommits,
  TAB_SYNC_CHANNEL_NAME,
} from '../localSyncChannels';
import { IDB_WRITE_EPOCH_KEY, WebSqliteAdapter } from '../webSqliteAdapter';

interface SharedMockIdbEnv {
  kvStores: Map<string, Map<string, unknown>>;
  keyPathStores: Map<string, Map<string, Record<string, any>>>;
}

function installSharedIdbAndWebLocks(options?: { withBroadcastChannel?: boolean }) {
  const env: SharedMockIdbEnv = {
    kvStores: new Map([
      ['sqlite_files', new Map()],
      ['pedigree_rolling_backups', new Map()],
    ]),
    keyPathStores: new Map([
      ['sync_outbox', new Map()],
      ['sync_conflicts', new Map()],
      ['sync_handles', new Map()],
      ['sync_checkpoints', new Map()],
    ]),
  };

  const getKvMap = (name: string) => {
    let m = env.kvStores.get(name);
    if (!m) {
      m = new Map();
      env.kvStores.set(name, m);
    }
    return m;
  };

  const getKpMap = (name: string) => {
    let m = env.keyPathStores.get(name);
    if (!m) {
      m = new Map();
      env.keyPathStores.set(name, m);
    }
    return m;
  };

  const keyPathForStore = (storeName: string): string => {
    if (storeName === 'sync_outbox') return 'op_id';
    if (storeName === 'sync_conflicts') return 'conflict_id';
    if (storeName === 'sync_checkpoints') return 'taskId';
    return 'key';
  };

  const indexedDbMock = {
    open(dbName: string) {
      const req: any = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        const fakeDb = {
          objectStoreNames: {
            contains: (name: string) => env.kvStores.has(name) || env.keyPathStores.has(name),
          },
          close() {},
          transaction(storeNames: string | string[]) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const tx: any = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              error: null,
              objectStore(storeName: string) {
                const isKeyPath = dbName === 'community_pedigree_sync_v1' || env.keyPathStores.has(storeName);
                const finishTxSoon = () => {
                  queueMicrotask(() => tx.oncomplete?.());
                };
                if (isKeyPath) {
                  const map = getKpMap(storeName);
                  const kp = keyPathForStore(storeName);
                  return {
                    get(key: string) {
                      const r: any = { result: undefined, onsuccess: null, onerror: null };
                      queueMicrotask(() => {
                        r.result = map.get(key);
                        r.onsuccess?.();
                        if (names.length > 0) finishTxSoon();
                      });
                      return r;
                    },
                    getAll() {
                      const r: any = { result: [], onsuccess: null, onerror: null };
                      queueMicrotask(() => {
                        r.result = Array.from(map.values());
                        r.onsuccess?.();
                      });
                      return r;
                    },
                    put(val: Record<string, any>) {
                      const id = String(val?.[kp] ?? '');
                      if (id) map.set(id, { ...val });
                      finishTxSoon();
                      return {};
                    },
                    delete(key: string) {
                      map.delete(key);
                      finishTxSoon();
                      return {};
                    },
                    clear() {
                      map.clear();
                      finishTxSoon();
                      return {};
                    },
                  };
                }

                const map = getKvMap(storeName);
                return {
                  get(key: string) {
                    const r: any = { result: undefined, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      r.result = map.get(key);
                      r.onsuccess?.();
                    });
                    return r;
                  },
                  getAll() {
                    const r: any = { result: [], onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      r.result = Array.from(map.values());
                      r.onsuccess?.();
                    });
                    return r;
                  },
                  put(val: unknown, key: string) {
                    const cloned = val instanceof Uint8Array ? new Uint8Array(val) : structuredClone(val);
                    map.set(key, cloned);
                    finishTxSoon();
                    return {};
                  },
                  delete(key: string) {
                    map.delete(key);
                    finishTxSoon();
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
  };

  // True mutual-exclusion Web Locks mock recording max concurrency per lock name
  const lockQueues = new Map<string, Promise<void>>();
  const activeHolders = new Map<string, number>();
  const maxConcurrency = new Map<string, number>();

  const locksMock = {
    request<T>(name: string, _opts: { mode?: string }, callback: () => Promise<T>): Promise<T> {
      const prev = lockQueues.get(name) ?? Promise.resolve();
      const next = prev.catch(() => undefined).then(async () => {
        const curr = (activeHolders.get(name) ?? 0) + 1;
        activeHolders.set(name, curr);
        maxConcurrency.set(name, Math.max(maxConcurrency.get(name) ?? 0, curr));
        try {
          return await callback();
        } finally {
          activeHolders.set(name, (activeHolders.get(name) ?? 1) - 1);
        }
      });
      lockQueues.set(
        name,
        next.then(
          () => undefined,
          () => undefined
        )
      );
      return next;
    },
  };

  // localStorage + storage event dispatcher
  const lsMap = new Map<string, string>();
  const storageListeners = new Set<(ev: StorageEvent) => void>();
  const winMock = {
    addEventListener(type: string, cb: any) {
      if (type === 'storage') storageListeners.add(cb);
    },
    removeEventListener(type: string, cb: any) {
      if (type === 'storage') storageListeners.delete(cb);
    },
    dispatchStorageEvent(key: string, newValue: string | null) {
      const ev = { key, newValue } as StorageEvent;
      for (const cb of storageListeners) {
        cb(ev);
      }
    },
  };
  const lsMock = {
    getItem: (k: string) => lsMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      lsMap.set(k, String(v));
    },
    removeItem: (k: string) => {
      lsMap.delete(k);
    },
    clear: () => lsMap.clear(),
  };

  // BroadcastChannel mock shared across instances
  const bcInstances = new Set<MockBroadcastChannel>();
  class MockBroadcastChannel {
    private listeners = new Set<(ev: MessageEvent) => void>();
    constructor(public readonly name: string) {
      bcInstances.add(this);
    }
    addEventListener(type: string, cb: (ev: MessageEvent) => void) {
      if (type === 'message') this.listeners.add(cb);
    }
    removeEventListener(type: string, cb: (ev: MessageEvent) => void) {
      if (type === 'message') this.listeners.delete(cb);
    }
    postMessage(data: unknown) {
      for (const peer of bcInstances) {
        if (peer === this || peer.name !== this.name) continue;
        for (const cb of peer.listeners) {
          cb({ data } as MessageEvent);
        }
      }
    }
    close() {
      bcInstances.delete(this);
      this.listeners.clear();
    }
  }

  vi.stubGlobal('indexedDB', indexedDbMock);
  vi.stubGlobal('localStorage', lsMock);
  vi.stubGlobal('window', winMock);
  vi.stubGlobal('navigator', { locks: locksMock });
  if (options?.withBroadcastChannel === false) {
    vi.stubGlobal('BroadcastChannel', undefined);
  } else {
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  }

  return { env, lsMap, maxConcurrency, winMock };
}

function makeTestAnimal(id: string, name: string, species = 'Rabbit'): Animal {
  const now = '2026-04-01T12:00:00.000Z';
  return {
    id,
    tattoo: id.toUpperCase(),
    name,
    species,
    breed: 'Rex',
    variety: 'Castor',
    sex: 'Male',
    status: 'Active',
    archived: false,
    needsAttention: false,
    ignoredConflicts: [],
    birthDateIso: '2025-05-01',
    weightGrams: 3400,
    genotype: [],
    genotypeRaw: '',
    rufusLevel: '',
    suspectedCarrierOf: [],
    confirmedCarrierOf: [],
    clearedCarrierOf: [],
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: 'R-1',
    breederName: 'Copper Creek',
    ownerName: 'Copper Creek',
    ownershipType: 'Owned',
    culled: false,
    cullDateIso: '',
    cullReason: '',
    deceasedDateIso: '',
    deathCause: '',
    soldDateIso: '',
    salePriceCents: 0,
    purchaseCostCents: 0,
    buyerName: '',
    sireId: '',
    damId: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Cross-Tab Web Locks, Stale WASM Reload & Silent Commit Sync', () => {
  it('prevents Tab B with stale WASM DB from overwriting Tab A committed writes and syncs reads via epoch', async () => {
    const { env, maxConcurrency } = installSharedIdbAndWebLocks();

    const adapterA = new WebSqliteAdapter('tab-a');
    const adapterB = new WebSqliteAdapter('tab-b');

    const initA = await adapterA.initialize({ lightweightPhotos: true });
    const initB = await adapterB.initialize({ lightweightPhotos: true });
    expect(initA.animals.length).toBeGreaterThan(0);
    expect(initB.animals.length).toBe(initA.animals.length);
    expect(adapterA.getLoadedEpoch()).toBe(1);
    expect(adapterB.getLoadedEpoch()).toBe(1);

    // Tab A writes Animal Alpha -> bumps epoch to 2
    const animalAlpha = makeTestAnimal('cross-tab-alpha', 'Cross Tab Alpha');
    await adapterA.saveAnimal(animalAlpha);
    expect(adapterA.getLoadedEpoch()).toBe(2);
    expect(adapterB.getLoadedEpoch()).toBe(1); // Tab B has NOT reloaded yet

    // Tab B (holding stale epoch 1 WASM DB) writes Animal Beta -> must reload Alpha from IDB BEFORE mutating!
    const animalBeta = makeTestAnimal('cross-tab-beta', 'Cross Tab Beta');
    await adapterB.saveAnimal(animalBeta);
    expect(adapterB.getLoadedEpoch()).toBe(3);

    // Verify both Alpha and Beta exist in Tab B AND in Tab A when Tab A calls loadSnapshot()
    const snapFromB: BarnDatabaseSnapshot = await adapterB.loadSnapshot({ lightweightPhotos: true });
    expect(snapFromB.animals.some((a) => a.id === 'cross-tab-alpha')).toBe(true);
    expect(snapFromB.animals.some((a) => a.id === 'cross-tab-beta')).toBe(true);

    const snapFromA: BarnDatabaseSnapshot = await adapterA.loadSnapshot({ lightweightPhotos: true });
    expect(adapterA.getLoadedEpoch()).toBe(3);
    expect(snapFromA.animals.some((a) => a.id === 'cross-tab-alpha')).toBe(true);
    expect(snapFromA.animals.some((a) => a.id === 'cross-tab-beta')).toBe(true);

    const epochMeta = env.kvStores.get('sqlite_files')?.get(IDB_WRITE_EPOCH_KEY) as {
      epoch: number;
      writerTabId: string;
    };
    expect(epochMeta.epoch).toBe(3);
    expect(epochMeta.writerTabId).toBe('tab-b');
    expect(maxConcurrency.get('community_pedigree_db_write_v1')).toBe(1);
  });

  it('serializes simultaneous Promise.all writes from two tabs without dropping either animal', async () => {
    const { maxConcurrency } = installSharedIdbAndWebLocks();

    const adapterA = new WebSqliteAdapter('tab-a');
    const adapterB = new WebSqliteAdapter('tab-b');
    await adapterA.initialize({ lightweightPhotos: true });
    await adapterB.initialize({ lightweightPhotos: true });

    const a1 = makeTestAnimal('race-animal-1', 'Race One');
    const a2 = makeTestAnimal('race-animal-2', 'Race Two');

    await Promise.all([adapterA.saveAnimal(a1), adapterB.saveAnimal(a2)]);

    const finalA = await adapterA.loadSnapshot({ lightweightPhotos: true });
    const finalB = await adapterB.loadSnapshot({ lightweightPhotos: true });

    expect(finalA.animals.some((a) => a.id === 'race-animal-1')).toBe(true);
    expect(finalA.animals.some((a) => a.id === 'race-animal-2')).toBe(true);
    expect(finalB.animals.some((a) => a.id === 'race-animal-1')).toBe(true);
    expect(finalB.animals.some((a) => a.id === 'race-animal-2')).toBe(true);
    expect(maxConcurrency.get('community_pedigree_db_write_v1')).toBe(1);
  });

  it('delivers remote commits silently once per epoch, ignores self-tab commits, and falls back to storage events for ES2018 Safari', () => {
    const { winMock } = installSharedIdbAndWebLocks({ withBroadcastChannel: true });

    const deliveredForB: Array<{ epoch: number; writerTabId: string }> = [];
    const unsubscribeB = subscribeCrossTabDbCommits(
      (ev) => {
        deliveredForB.push({ epoch: ev.epoch, writerTabId: ev.writerTabId });
      },
      { selfTabId: 'tab-b' }
    );

    // Self-tab commit is ignored
    const selfPayload = publishCrossTabDbCommit({ epoch: 10, writerTabId: 'tab-b', reason: 'self' });
    winMock.dispatchStorageEvent(DB_WRITE_EPOCH_LS_KEY, JSON.stringify(selfPayload));
    expect(deliveredForB).toHaveLength(0);

    // Remote commit from Tab A -> BroadcastChannel delivers epoch 11, duplicate storage event for epoch 11 is deduped!
    const remotePayload = publishCrossTabDbCommit({
      epoch: 11,
      writerTabId: 'tab-a',
      reason: 'saveAnimal',
    });
    // Wait: BroadcastChannel posts via postMessage synchronously to peer channels; let's check both paths
    const senderChannel = new (globalThis as any).BroadcastChannel(TAB_SYNC_CHANNEL_NAME);
    senderChannel.postMessage(remotePayload);
    winMock.dispatchStorageEvent(DB_WRITE_EPOCH_LS_KEY, JSON.stringify(remotePayload));
    senderChannel.close();

    expect(deliveredForB).toHaveLength(1);
    expect(deliveredForB[0]).toEqual({ epoch: 11, writerTabId: 'tab-a' });
    unsubscribeB();

    // ES2018 Safari fallback (BroadcastChannel === undefined): storage event alone delivers commit
    installSharedIdbAndWebLocks({ withBroadcastChannel: false });
    const deliveredFallback: number[] = [];
    const unsubscribeFallback = subscribeCrossTabDbCommits(
      (ev) => deliveredFallback.push(ev.epoch),
      { selfTabId: 'tab-safari' }
    );
    const safariPayload = publishCrossTabDbCommit({
      epoch: 12,
      writerTabId: 'tab-other',
      reason: 'safariFallback',
    });
    // Trigger storage event simulation
    const win2 = (globalThis as any).window;
    win2.dispatchStorageEvent(DB_WRITE_EPOCH_LS_KEY, JSON.stringify(safariPayload));
    expect(deliveredFallback).toEqual([12]);
    unsubscribeFallback();
  });

  it('resolves colliding (device_id, logical_counter) pairs cleanly inside appendSyncOperationsToIdb lock', async () => {
    const { maxConcurrency } = installSharedIdbAndWebLocks();

    const makeOp = (opId: string, counter: number): SyncOperation => ({
      op_id: opId,
      device_id: 'dev-shared',
      logical_counter: counter,
      timestamp: '2026-04-01T12:00:00.000Z',
      entity_type: 'animal',
      entity_uuid: `animal-${opId}`,
      field_name: 'name',
      new_value: `Rabbit ${opId}`,
    });

    // Two concurrent appends claiming the exact same logical_counter = 1
    const [writtenA, writtenB] = await Promise.all([
      appendSyncOperationsToIdb([makeOp('op-a', 1)]),
      appendSyncOperationsToIdb([makeOp('op-b', 1)]),
    ]);

    expect(writtenA).toHaveLength(1);
    expect(writtenB).toHaveLength(1);
    expect(writtenA[0].logical_counter).not.toBe(writtenB[0].logical_counter);

    const allOps = await loadAllSyncOperationsFromIdb();
    expect(allOps).toHaveLength(2);
    const counters = allOps.map((o) => o.logical_counter).sort((a, b) => a - b);
    expect(counters).toEqual([1, 2]);
    expect(maxConcurrency.get('community_pedigree_sync_outbox_v1')).toBe(1);
  });

  it('wipes sync_outbox, sync_conflicts, and sync_checkpoints cleanly via clearAllSyncStateInIdb', async () => {
    installSharedIdbAndWebLocks();

    await appendSyncOperationsToIdb([
      {
        op_id: 'op-reset-1',
        device_id: 'dev-a',
        logical_counter: 1,
        timestamp: '2026-06-01T12:00:00.000Z',
        entity_type: 'animal',
        entity_uuid: 'ani-1',
        field_name: 'name',
        new_value: 'Stale Name',
      },
    ]);
    await appendSyncConflictsToIdb([
      {
        conflict_id: 'conf-1',
        entity_type: 'animal',
        entity_uuid: 'ani-1',
        entity_label: 'Stale',
        field_name: 'name',
        winning_value: 'A',
        winning_device_id: 'dev-a',
        winning_timestamp: '2026-06-01T12:00:00.000Z',
        losing_value: 'B',
        losing_device_id: 'dev-b',
        losing_timestamp: '2026-06-01T11:59:00.000Z',
        detected_at: '2026-06-01T12:01:00.000Z',
        resolved: false,
      },
    ]);
    await saveSyncCheckpointToIdb({
      taskId: 'directory_sync',
      folderName: 'BarnSync',
      phase: 'writing_delta',
      peerFilesRead: 1,
      incomingOpsQueued: 2,
      updatedAtIso: '2026-06-01T12:02:00.000Z',
    });

    await clearAllSyncStateInIdb();

    expect(await loadAllSyncOperationsFromIdb()).toEqual([]);
    expect(await loadAllSyncConflictsFromIdb()).toEqual([]);
    expect(await loadSyncCheckpointFromIdb('directory_sync')).toBeNull();
  });
});
```

## `src/storage/__tests__/es2018AndPwaUpdate.test.ts`

```typescript
import { describe, expect, it, vi } from 'vitest';
import {
  ensureEs2018Globals,
  readBlobAsArrayBuffer,
  readBlobAsText,
} from '../../utils/es2018Shims';
import {
  applyPwaUpdateNow,
  attachControllerChangeReloadGuard,
  checkForPwaUpdateNow,
  getPwaUpdateState,
  initPwaUpdater,
  markPreUpgradeBackupVerified,
  resetPwaUpdateManagerForTests,
  setPwaUpdatePolicy,
} from '../pwaUpdateManager';
import {
  getConnectivitySnapshot,
  getEffectiveOnlineStatus,
  probeNetworkConnectivity,
  resetConnectivityStateForTests,
  setManualOfflineMode,
} from '../storageProtection';

describe('ES2018 runtime shims (es2018Shims)', () => {
  it('polyfills globalThis, Promise.allSettled, and Object.fromEntries only when missing', async () => {
    const fakePromise: any = function FakePromise(this: any) {};
    fakePromise.all = Promise.all.bind(Promise);
    fakePromise.resolve = Promise.resolve.bind(Promise);

    const fakeObject: any = {};
    const mockHost: Record<string, any> = {
      Promise: fakePromise,
      Object: fakeObject,
    };

    ensureEs2018Globals(mockHost);

    expect(mockHost.globalThis).toBe(mockHost);
    expect(typeof fakePromise.allSettled).toBe('function');
    expect(typeof fakeObject.fromEntries).toBe('function');

    const settled = await fakePromise.allSettled([
      Promise.resolve('ok'),
      Promise.reject(new Error('fail')),
    ]);
    expect(settled[0]).toEqual({ status: 'fulfilled', value: 'ok' });
    expect(settled[1].status).toBe('rejected');

    expect(
      fakeObject.fromEntries([
        ['a', 1],
        ['b', 'two'],
      ])
    ).toEqual({ a: 1, b: 'two' });
  });

  it('installs non-enumerable Blob.prototype.arrayBuffer/text and String.prototype.trimStart/trimEnd shims and reads via FileReader when native methods are absent', async () => {
    function FakeBlob(this: any, bytes: number[]) {
      this._bytes = bytes;
    }
    const fakeStringProto: Record<string, any> = {};
    const FakeString: any = function () {};
    FakeString.prototype = fakeStringProto;

    const mockHost: Record<string, any> = {
      Promise,
      Object: { fromEntries: Object.fromEntries },
      Blob: FakeBlob,
      String: FakeString,
    };

    ensureEs2018Globals(mockHost);

    expect(typeof FakeBlob.prototype.arrayBuffer).toBe('function');
    expect(typeof FakeBlob.prototype.text).toBe('function');
    expect(Object.keys(FakeBlob.prototype)).not.toContain('arrayBuffer');
    expect(Object.keys(FakeBlob.prototype)).not.toContain('text');
    expect(typeof fakeStringProto.trimStart).toBe('function');
    expect(typeof fakeStringProto.trimEnd).toBe('function');
    expect(fakeStringProto.trimStart.call('  \nhello ')).toBe('hello ');
    expect(fakeStringProto.trimEnd.call(' hello\t  ')).toBe(' hello');

    // Mock ES2018 FileReader (no Blob.prototype.arrayBuffer or .text natively)
    class MockFileReader {
      public result: ArrayBuffer | string | null = null;
      public error: Error | null = null;
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      public onabort: (() => void) | null = null;

      readAsArrayBuffer(blob: any) {
        const bytes: number[] = blob._bytes || [];
        this.result = new Uint8Array(bytes).buffer;
        queueMicrotask(() => this.onload?.());
      }

      readAsText(blob: any) {
        const bytes: number[] = blob._bytes || [];
        this.result = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);
    try {
      const legacyBlob = new (FakeBlob as any)([72, 105, 33]); // "Hi!"
      const buf = await readBlobAsArrayBuffer(legacyBlob);
      expect(Array.from(new Uint8Array(buf))).toEqual([72, 105, 33]);

      const txt = await readBlobAsText(legacyBlob);
      expect(txt).toBe('Hi!');

      // Also verify the shimmed prototype methods delegate without recursion
      const protoBuf = await legacyBlob.arrayBuffer();
      const protoTxt = await legacyBlob.text();
      expect(Array.from(new Uint8Array(protoBuf))).toEqual([72, 105, 33]);
      expect(protoTxt).toBe('Hi!');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('prefers native blob.text()/arrayBuffer() over FileReader and degrades cleanly if FileReader throws SecurityError', async () => {
    const fileReaderSpy = vi.fn(function () {
      throw new DOMException('FileReader blocked', 'SecurityError');
    });
    vi.stubGlobal('FileReader', fileReaderSpy);
    try {
      const nativeBlob = new Blob(['Hello Pedigree'], { type: 'text/plain' });
      expect(await readBlobAsText(nativeBlob)).toBe('Hello Pedigree');
      expect(new TextDecoder().decode(await readBlobAsArrayBuffer(nativeBlob))).toBe(
        'Hello Pedigree'
      );
      expect(fileReaderSpy).not.toHaveBeenCalled();

      // Legacy blob without .text()/.arrayBuffer() when FileReader is blocked -> Response fallback
      const rawBytes = new TextEncoder().encode('ResponseFallback');
      const noMethodBlob = {
        size: rawBytes.byteLength,
        type: 'text/plain',
        slice() {
          return new Blob([rawBytes]);
        },
      } as unknown as Blob;
      const origResponse = globalThis.Response;
      vi.stubGlobal(
        'Response',
        class FakeResponse {
          constructor(private readonly body: unknown) {}
          async arrayBuffer() {
            void this.body;
            return rawBytes.buffer.slice(0);
          }
          async text() {
            return 'ResponseFallback';
          }
        }
      );
      try {
        expect(await readBlobAsText(noMethodBlob)).toBe('ResponseFallback');
        expect(new TextDecoder().decode(await readBlobAsArrayBuffer(noMethodBlob))).toBe(
          'ResponseFallback'
        );
      } finally {
        vi.stubGlobal('Response', origResponse);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('pwaUpdateManager (manual prompt gate & controllerchange handshake)', () => {
  it('surfaces waiting update, triggers reload handler once on controllerchange, and invokes update callback', async () => {
    resetPwaUpdateManagerForTests();

    const listeners: Record<string, Array<() => void>> = {};
    const mockSwContainer = {
      addEventListener(event: string, fn: () => void) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
    };
    const reloadSpy = vi.fn();
    attachControllerChangeReloadGuard(mockSwContainer, reloadSpy);

    const updateSpy = vi.fn(async () => {});
    initPwaUpdater((opts) => {
      opts?.onNeedRefresh?.();
      return updateSpy;
    });

    expect(getPwaUpdateState().updateAvailable).toBe(true);

    const applied = await applyPwaUpdateNow();
    expect(applied).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(true);

    // Firing controllerchange multiple times must reload at most once (`refreshing` guard)
    for (const cb of listeners['controllerchange'] || []) {
      cb();
      cb();
    }
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    resetPwaUpdateManagerForTests();
  });

  it('respects pinned policy and blocks SW swap on revoked versions or unverified schema jumps', async () => {
    resetPwaUpdateManagerForTests();
    resetConnectivityStateForTests();

    const updateSpy = vi.fn(async () => {});
    initPwaUpdater((opts) => {
      opts?.onNeedRefresh?.();
      return updateSpy;
    });

    // Pinned policy blocks automatic check & manual apply
    setPwaUpdatePolicy('pinned');
    expect(await checkForPwaUpdateNow()).toBe('pinned');
    expect(await applyPwaUpdateNow()).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();

    // Unpin back to notify, test Upgrade Gate revoked release block
    setPwaUpdatePolicy('notify');
    const revokedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('status.json')) {
        return new Response(
          JSON.stringify({ allowUpdates: true, revokedVersions: ['0.9.9-recalled'] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          appVersion: '0.9.9-recalled',
          schemaVersion: 6,
          minDirectUpgradeSchema: 4,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    expect(await applyPwaUpdateNow({ fetchImpl: revokedFetch })).toBe(false);
    expect(getPwaUpdateState().gateDecision?.status).toBe('blocked_revoked');
    expect(updateSpy).not.toHaveBeenCalled();

    // Test schemaDelta >= 2 requiring pre-upgrade backup verification before apply succeeds
    const schemaJumpFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('status.json')) {
        return new Response(JSON.stringify({ allowUpdates: true, revokedVersions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ appVersion: '0.5.0', schemaVersion: 8, minDirectUpgradeSchema: 4 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    expect(await applyPwaUpdateNow({ fetchImpl: schemaJumpFetch })).toBe(false);
    expect(getPwaUpdateState().gateDecision?.status).toBe('requires_verified_backup');
    expect(updateSpy).not.toHaveBeenCalled();

    markPreUpgradeBackupVerified(true);
    expect(await applyPwaUpdateNow({ fetchImpl: schemaJumpFetch })).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(true);

    resetPwaUpdateManagerForTests();
    resetConnectivityStateForTests();
  });
});

describe('storageProtection — manual offline toggle & captive-portal connectivity probe', () => {
  it('switches effective online state immediately and detects captive HTML vs valid JSON manifests', async () => {
    resetConnectivityStateForTests();

    setManualOfflineMode(true);
    expect(getEffectiveOnlineStatus()).toBe(false);
    expect(getConnectivitySnapshot().reason).toBe('manual_offline');

    const skippedProbe = await probeNetworkConnectivity({
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(skippedProbe.reason).toBe('manual_offline');

    setManualOfflineMode(false);
    // Captive Wi-Fi returns HTTP 200 text/html instead of JSON
    const captiveHtmlFetch = vi.fn(async () => {
      return new Response('<html><body>Wi-Fi Login</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as unknown as typeof fetch;

    const captiveSnap = await probeNetworkConnectivity({ fetchImpl: captiveHtmlFetch });
    expect(captiveSnap.probeStatus).toBe('unreachable');
    expect(captiveSnap.reason).toBe('captive_or_unreachable');
    expect(captiveSnap.isEffectivelyOnline).toBe(false);

    // Valid live version.json clears captive failure and captures Date clock skew
    const liveJsonFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ appVersion: '0.1.0-prealpha.1' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          date: new Date(Date.now() + 60_000).toUTCString(),
        },
      });
    }) as unknown as typeof fetch;

    const liveSnap = await probeNetworkConnectivity({ fetchImpl: liveJsonFetch });
    expect(liveSnap.probeStatus).toBe('reachable');
    expect(liveSnap.isEffectivelyOnline).toBe(true);
    expect(typeof liveSnap.clockSkewMs).toBe('number');

    resetConnectivityStateForTests();
  });
});

describe('deviceCapabilityDetector — browser feature signal probing', () => {
  it('safely detects missing or throwing optional browser APIs without crashing', async () => {
    const { detectCurrentBrowserCompatibility, readBrowserFeatureSignals } = await import(
      '../deviceCapabilityDetector'
    );
    const { classifyDeviceCapability } = await import('../../core/deviceCapability');

    const originalWindow = globalThis.window;
    const originalNav = globalThis.navigator;
    const originalWasm = globalThis.WebAssembly;
    const originalWorker = globalThis.Worker;

    try {
      const restrictedWindow: Record<string, unknown> = {
        get indexedDB() {
          throw new Error('SecurityError: indexedDB blocked');
        },
      };
      Object.defineProperty(globalThis, 'window', {
        value: restrictedWindow,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        },
        configurable: true,
      });
      Object.defineProperty(globalThis, 'WebAssembly', {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'Worker', {
        value: undefined,
        configurable: true,
      });

      const signals = readBrowserFeatureSignals();
      expect(signals.indexedDbSupported).toBe(false);
      expect(signals.wasmSupported).toBe(false);
      expect(signals.moduleWorkerSupported).toBe(false);
      expect(signals.opfsSupported).toBe(false);
      expect(signals.directoryPickerSupported).toBe(false);
      expect(signals.persistStorageSupported).toBe(false);
      expect(signals.clipboardWriteSupported).toBe(false);
      expect(signals.webShareFilesSupported).toBe(false);

      const assessment = classifyDeviceCapability({
        deviceMemoryGb: null,
        hardwareConcurrency: 4,
        jsHeapLimitBytes: null,
        usedHeapBytes: null,
        userAgent: signals.userAgent,
        maxTouchPoints: 5,
        coarsePointer: true,
        screenWidthPx: 390,
        screenHeightPx: 844,
        devicePixelRatio: 3,
      });
      const compat = detectCurrentBrowserCompatibility(assessment);
      expect(compat.wasmFallbackActive).toBe(true);
      expect(compat.isOutdatedBrowser).toBe(true);
      expect(compat.shouldConfirmHeavyZipExport).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
      Object.defineProperty(globalThis, 'WebAssembly', { value: originalWasm, configurable: true });
      Object.defineProperty(globalThis, 'Worker', { value: originalWorker, configurable: true });
    }
  });
});

```

## `src/storage/__tests__/opfsStorage.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildArchivedAnimalsBundle,
  deserializeVaultBackupPayload,
} from '../../core/backupVault';
import { getTierStoragePolicy } from '../../core/deviceCapability';
import { buildFullPredefinedSampleSnapshot } from '../../core/sampleData';
import {
  getPersistedBackupSyncStatus,
  setBackupSyncHandleForTest,
} from '../localSyncChannels';
import {
  clearOpfsPruneSyncWarning,
  clearPriorUseSentinel,
  deleteOpfsHerdArchive,
  deleteOpfsVaultBackup,
  detectReturningUserWipedStorage,
  dumpRawRecordsToOpfsRecoveryBackup,
  flushOpfsBackupsToSyncFolder,
  isOpfsSupported,
  listOpfsHerdArchives,
  listOpfsVaultBackups,
  loadOpfsHerdArchive,
  loadOpfsVaultBackup,
  markPriorUseSentinelFromSnapshot,
  markTempOpfsFileActive,
  MAX_MONTHLY_OPFS_BACKUPS,
  MAX_PRE_UPGRADE_OPFS_BACKUPS,
  MAX_RECOVERY_DUMP_OPFS_BACKUPS,
  MONTHLY_BACKUP_INTERVAL_MS,
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsSyncAccessHandle,
  OpfsWritableStream,
  probeOpfsRuntime,
  readOpfsHerdArchiveBlob,
  readOpfsPruneSyncWarning,
  readOpfsVaultBackupBlob,
  resetOpfsProbesForTests,
  runOpfsExportCanary,
  safeAwaitOpfsClose,
  safeAwaitOpfsFlush,
  safeAwaitOpfsGetSize,
  safeAwaitOpfsTruncate,
  saveOpfsHerdArchive,
  saveOpfsVaultBackup,
  setOpfsRootResolverForTest,
  shouldCreateMonthlyOpfsBackup,
  shouldRunExportCanary,
  sweepOrphanedOpfsTmpOnBoot,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
} from '../opfsStorage';
import { getOpfsRoot, writeFileToOpfsDir } from '../opfsTempStream';

interface MockFileEntry {
  kind: 'file';
  name: string;
  bytes: Uint8Array;
}

interface MockDirNode {
  kind: 'directory';
  name: string;
  dirs: Map<string, MockDirNode>;
  files: Map<string, MockFileEntry>;
}

function createInMemoryOpfsMock(options?: {
  onCreateWritable?: (fileName: string, callIndex: number) => {
    failOnceWithQuotaExceeded?: boolean;
    throwOnWrite?: Error;
    spyClose: ReturnType<typeof vi.fn<() => void>>;
  };
}) {
  const rootNode: MockDirNode = {
    kind: 'directory',
    name: '',
    dirs: new Map(),
    files: new Map(),
  };
  let writeCallCounter = 0;

  const toUint8 = async (data: string | Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> => {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return new Uint8Array(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  };

  const makeFileHandle = (entry: MockFileEntry): OpfsFileHandle => ({
    kind: 'file',
    name: entry.name,
    async getFile(): Promise<Blob> {
      const copy = new Uint8Array(entry.bytes.byteLength);
      copy.set(entry.bytes);
      if (typeof Blob !== 'undefined') {
        return new Blob([copy], { type: 'application/octet-stream' });
      }
      return {
        size: copy.byteLength,
        type: 'application/octet-stream',
        async text() {
          return new TextDecoder().decode(copy);
        },
        async arrayBuffer() {
          return copy.buffer;
        },
      } as unknown as Blob;
    },
    async createWritable(): Promise<OpfsWritableStream> {
      writeCallCounter += 1;
      const hook = options?.onCreateWritable?.(entry.name, writeCallCounter);
      const stagedChunks: Uint8Array[] = [];
      return {
        async write(data) {
          if (hook?.throwOnWrite) {
            throw hook.throwOnWrite;
          }
          if (hook?.failOnceWithQuotaExceeded) {
            const quotaErr = new Error('Simulated OPFS storage quota exceeded');
            quotaErr.name = 'QuotaExceededError';
            throw quotaErr;
          }
          stagedChunks.push(await toUint8(data));
        },
        async close() {
          hook?.spyClose();
          if (stagedChunks.length > 0) {
            const total = stagedChunks.reduce((sum, c) => sum + c.byteLength, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of stagedChunks) {
              merged.set(c, offset);
              offset += c.byteLength;
            }
            entry.bytes = merged;
          }
        },
      };
    },
  });

  const makeDirHandle = (node: MockDirNode): OpfsDirectoryHandle => ({
    kind: 'directory',
    name: node.name,
    async getDirectoryHandle(name, opts) {
      let child = node.dirs.get(name);
      if (!child) {
        if (!opts?.create) {
          throw new Error(`Directory "${name}" not found`);
        }
        child = {
          kind: 'directory',
          name,
          dirs: new Map(),
          files: new Map(),
        };
        node.dirs.set(name, child);
      }
      return makeDirHandle(child);
    },
    async getFileHandle(name, opts) {
      let file = node.files.get(name);
      if (!file) {
        if (!opts?.create) {
          throw new Error(`File "${name}" not found`);
        }
        file = { kind: 'file', name, bytes: new Uint8Array(0) };
        node.files.set(name, file);
      }
      return makeFileHandle(file);
    },
    async removeEntry(name) {
      if (!node.files.delete(name) && !node.dirs.delete(name)) {
        throw new Error(`Entry "${name}" not found`);
      }
    },
    async *entries() {
      for (const [k, dir] of node.dirs.entries()) {
        yield [k, makeDirHandle(dir)];
      }
      for (const [k, f] of node.files.entries()) {
        yield [k, makeFileHandle(f)];
      }
    },
  });

  return {
    rootNode,
    rootHandle: makeDirHandle(rootNode),
  };
}

function installLocalStorageShim() {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  });
  return store;
}

afterEach(() => {
  setOpfsRootResolverForTest(null);
  setBackupSyncHandleForTest(null);
  clearOpfsPruneSyncWarning();
  clearPriorUseSentinel();
  resetOpfsProbesForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('opfsStorage handles, QuotaExceededError recovery & /tmp sweeps', () => {
  it('always closes writable handle in try/finally even if write throws, and purges /tmp on QuotaExceededError', async () => {
    installLocalStorageShim();
    const closeSpies: Array<ReturnType<typeof vi.fn<() => void>>> = [];
    const mock = createInMemoryOpfsMock({
      onCreateWritable: (fileName, callIndex) => {
        const spyClose = vi.fn<() => void>();
        closeSpies.push(spyClose);
        // Simulate QuotaExceededError on first attempt writing target vault file
        if (fileName.startsWith('manual-vault-') && callIndex === 2) {
          return { failOnceWithQuotaExceeded: true, spyClose };
        }
        return { spyClose };
      },
    });
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    expect(isOpfsSupported()).toBe(true);

    // Seed an orphan file inside /tmp
    const tmpWritten = await writeTempOpfsFile('export', 'orphan-payload', 'json');
    expect(tmpWritten?.fileName).toBeTruthy();
    expect(mock.rootNode.dirs.get('tmp')?.files.size).toBe(1);

    // Attempt vault save — callIndex 2 hits QuotaExceededError, purges /tmp, retries cleanly
    const snap = buildFullPredefinedSampleSnapshot();
    const meta = await saveOpfsVaultBackup(snap, { kind: 'manual', note: 'Retry check' });
    expect(meta).not.toBeNull();
    expect(mock.rootNode.dirs.get('tmp')?.files.size).toBe(0);
    // Every writable opened (tmp write, failed vault write, retry vault write, index write) closed cleanly
    expect(closeSpies.length).toBeGreaterThanOrEqual(4);
    for (const spy of closeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it('closes writable handle even on non-quota hard write error and sweeps leftover /tmp on boot', async () => {
    const closeSpy = vi.fn<() => void>();
    const mock = createInMemoryOpfsMock({
      onCreateWritable: (_fileName, callIndex) => {
        if (callIndex === 2) {
          return { throwOnWrite: new Error('Disk hardware error'), spyClose: closeSpy };
        }
        return { spyClose: vi.fn<() => void>() };
      },
    });
    setOpfsRootResolverForTest(async () => mock.rootHandle);

    await writeTempOpfsFile('cage', 'stale-tmp-html', 'html');
    await expect(writeTempOpfsFile('pedigree', 'should-fail', 'htm')).rejects.toThrow(
      /Disk hardware error/
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const swept = await sweepOrphanedOpfsTmpOnBoot();
    expect(swept.filesRemoved).toBeGreaterThanOrEqual(1);
    expect(mock.rootNode.dirs.get('tmp')?.files.size).toBe(0);
  });

  it('streams multi-chunk payloads via writeTempOpfsFileStreamed, recovers from QuotaExceededError, and cleans up partial files on failure', async () => {
    const closeSpies: Array<ReturnType<typeof vi.fn<() => void>>> = [];
    let quotaHit = false;
    const mock = createInMemoryOpfsMock({
      onCreateWritable: (fileName) => {
        const spyClose = vi.fn<() => void>();
        closeSpies.push(spyClose);
        if (!quotaHit && fileName.startsWith('streamed-') && closeSpies.length === 2) {
          quotaHit = true;
          return { failOnceWithQuotaExceeded: true, spyClose };
        }
        return { spyClose };
      },
    });
    setOpfsRootResolverForTest(async () => mock.rootHandle);

    // Seed an inactive orphan file in /tmp that QuotaExceededError recovery should purge
    const orphan = await writeTempOpfsFile('export', 'stale-orphan', 'txt');
    expect(mock.rootNode.dirs.get('tmp')?.files.has(orphan!.fileName)).toBe(true);

    const streamed = await writeTempOpfsFileStreamed(
      'streamed',
      'json',
      async (writeChunk) => {
        await writeChunk('{"part":1,');
        await writeChunk(new TextEncoder().encode('"part2":"ok"}'));
        return { chunksWritten: 2 };
      },
      { keepActiveAfterWrite: true }
    );

    expect(streamed).not.toBeNull();
    expect(streamed!.meta.chunksWritten).toBe(2);
    expect(await streamed!.blob.text()).toBe('{"part":1,"part2":"ok"}');
    expect(mock.rootNode.dirs.get('tmp')?.files.has(orphan!.fileName)).toBe(false);
    expect(mock.rootNode.dirs.get('tmp')?.files.has(streamed!.fileName)).toBe(true);
    unmarkTempOpfsFileActive(streamed!.fileName);

    // Large >256KB binary write should be chunked cleanly without losing bytes
    const bigBytes = new Uint8Array(300 * 1024);
    bigBytes.fill(0x5a);
    bigBytes[bigBytes.byteLength - 1] = 0x7f;
    const largeRes = await writeTempOpfsFile('bigbin', bigBytes, 'bin');
    expect(largeRes).not.toBeNull();
    const storedEntry = mock.rootNode.dirs.get('tmp')?.files.get(largeRes!.fileName);
    expect(storedEntry?.bytes.byteLength).toBe(300 * 1024);
    expect(storedEntry?.bytes[storedEntry.bytes.byteLength - 1]).toBe(0x7f);

    // Mid-stream non-quota failure must close writable and remove partial /tmp file
    await expect(
      writeTempOpfsFileStreamed('abort', 'zip', async (writeChunk) => {
        await writeChunk(new Uint8Array([1, 2, 3]));
        throw new Error('Mid-stream abort');
      })
    ).rejects.toThrow(/Mid-stream abort/);

    const remainingNames = Array.from(mock.rootNode.dirs.get('tmp')?.files.keys() ?? []);
    expect(remainingNames.some((n) => n.startsWith('abort-'))).toBe(false);
    for (const spy of closeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});

describe('opfsStorage Backup Vault retention, monthly scheduling & recovery dumps', () => {
  it('enforces 6 monthly and 3 pre_upgrade retention caps and restores migrated snapshots', async () => {
    installLocalStorageShim();
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    const snap = buildFullPredefinedSampleSnapshot();

    for (let i = 0; i < MAX_MONTHLY_OPFS_BACKUPS + 2; i++) {
      await saveOpfsVaultBackup(snap, {
        kind: 'monthly',
        note: `Monthly #${i + 1}`,
      });
    }
    for (let i = 0; i < MAX_PRE_UPGRADE_OPFS_BACKUPS + 2; i++) {
      await saveOpfsVaultBackup(snap, {
        kind: 'pre_upgrade',
        note: `Pre-upgrade #${i + 1}`,
      });
    }

    const listed = await listOpfsVaultBackups();
    const monthlyCount = listed.filter((b) => b.kind === 'monthly').length;
    const preUpgradeCount = listed.filter((b) => b.kind === 'pre_upgrade').length;
    expect(monthlyCount).toBe(MAX_MONTHLY_OPFS_BACKUPS);
    expect(preUpgradeCount).toBe(MAX_PRE_UPGRADE_OPFS_BACKUPS);

    const target = listed[0];
    const loaded = await loadOpfsVaultBackup(target.key, snap.settings);
    expect(loaded).not.toBeNull();
    expect(loaded!.migrated.checksumValid).toBe(true);
    expect(loaded!.migrated.snapshot.animals.length).toBe(snap.animals.length);

    expect(await deleteOpfsVaultBackup(target.key)).toBe(true);
    const afterDelete = await listOpfsVaultBackups();
    expect(afterDelete.some((b) => b.key === target.key)).toBe(false);
  });

  it('respects 30-day monthly backup cadence', async () => {
    installLocalStorageShim();
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    const snap = buildFullPredefinedSampleSnapshot();

    expect(await shouldCreateMonthlyOpfsBackup(Date.now())).toBe(true);
    await saveOpfsVaultBackup(snap, { kind: 'monthly' });
    expect(await shouldCreateMonthlyOpfsBackup(Date.now() + 1000)).toBe(false);
    expect(
      await shouldCreateMonthlyOpfsBackup(Date.now() + MONTHLY_BACKUP_INTERVAL_MS + 5000)
    ).toBe(true);
  });

  it('writes recovery_dump JSON to OPFS /backups during migration failure rescue', async () => {
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    const snap = buildFullPredefinedSampleSnapshot();

    const meta = await dumpRawRecordsToOpfsRecoveryBackup({
      sourceDbName: 'pedigree-barn-db',
      reason: 'Simulated VersionError rescue',
      salvagedSnapshot: snap,
    });
    expect(meta).not.toBeNull();
    expect(meta!.kind).toBe('recovery_dump');
    expect(meta!.fileName.startsWith('recovery-pre-reset-')).toBe(true);

    const backupsDir = mock.rootNode.dirs.get('backups');
    expect(backupsDir?.files.has(meta!.fileName)).toBe(true);
  });
});

describe('opfsStorage Archived Herds, Wiped-Storage Detection & Export Canary', () => {
  it('saves, lists, loads, and deletes .archive.zip herd bundles in /archives', async () => {
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    const snap = buildFullPredefinedSampleSnapshot();
    const firstRabbit = snap.animals.find((a) => a.species === 'Rabbit')!;

    const built = buildArchivedAnimalsBundle(snap, [firstRabbit.id]);
    await saveOpfsHerdArchive(built.indexEntry, built.zipBytes);

    const list = await listOpfsHerdArchives();
    expect(list).toHaveLength(1);
    expect(list[0].archiveKey).toBe(built.archiveKey);

    const loaded = await loadOpfsHerdArchive(built.archiveKey, snap.settings);
    expect(loaded).not.toBeNull();
    expect(loaded!.unpacked.animals[0].id).toBe(firstRabbit.id);

    expect(await deleteOpfsHerdArchive(built.archiveKey)).toBe(true);
    expect(await listOpfsHerdArchives()).toHaveLength(0);
  });

  it('detects wiped browser storage via prior-use sentinel or OPFS vault and runs clean Export Canary', async () => {
    installLocalStorageShim();
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);

    // Fresh browser -> no wiped storage pause
    const freshCheck = await detectReturningUserWipedStorage();
    expect(freshCheck.detected).toBe(false);
    expect(freshCheck.reason).toBe('none');

    // Returning user with non-testing animal record -> triggers sentinel detection
    const snap = buildFullPredefinedSampleSnapshot();
    snap.animals.push({
      ...snap.animals[0],
      id: 'user-custom-animal-1',
      name: 'Barn Champion',
      tattoo: 'BC1',
    });
    markPriorUseSentinelFromSnapshot(snap);

    const sentinelCheck = await detectReturningUserWipedStorage();
    expect(sentinelCheck.detected).toBe(true);
    expect(sentinelCheck.reason).toBe('sentinel');
    expect(sentinelCheck.sentinel?.nonTestingCount).toBe(1);

    // If OPFS backup exists, prioritizes opfs_backups & returns latestOpfsBackup
    await saveOpfsVaultBackup(snap, { kind: 'manual', note: 'Before iOS 7-day purge' });
    const vaultCheck = await detectReturningUserWipedStorage();
    expect(vaultCheck.detected).toBe(true);
    expect(vaultCheck.reason).toBe('opfs_backups');
    expect(vaultCheck.latestOpfsBackup?.animalCount).toBe(snap.animals.length);

    // Verify idle export canary succeeds and cleans up `/tmp/canary-probe.json`
    const canaryRes = await runOpfsExportCanary(snap);
    expect(canaryRes.ok).toBe(true);
    expect(mock.rootNode.dirs.get('tmp')?.files.has('canary-probe.json')).toBe(false);

    // Sanity check compressed .vault.zip payload decrypts/validates cleanly
    const rawVaultBuf = await (
      await mock.rootHandle
        .getDirectoryHandle('backups')
        .then((d) => d.getFileHandle(vaultCheck.latestOpfsBackup!.fileName))
        .then((f) => f.getFile())
    ).arrayBuffer();
    const parsed = deserializeVaultBackupPayload(
      new Uint8Array(rawVaultBuf),
      snap.settings,
      vaultCheck.latestOpfsBackup!.fileName
    );
    expect(parsed.snapshot.animals.some((a) => a.id === 'user-custom-animal-1')).toBe(true);
  });
});

describe('opfsStorage concurrency locks, active /tmp protection, binary dump compaction & Blob readers', () => {
  it('serializes concurrent saveOpfsVaultBackup & saveOpfsHerdArchive calls so zero index entries are dropped', async () => {
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    const snap = buildFullPredefinedSampleSnapshot();

    const savedVaults = await Promise.all([
      saveOpfsVaultBackup(snap, { kind: 'manual', note: 'Concurrent 1' }),
      saveOpfsVaultBackup(snap, { kind: 'manual', note: 'Concurrent 2' }),
      saveOpfsVaultBackup(snap, { kind: 'manual', note: 'Concurrent 3' }),
    ]);
    expect(savedVaults.every((v) => v !== null)).toBe(true);
    const vaultList = await listOpfsVaultBackups();
    expect(vaultList).toHaveLength(3);

    const vaultBlob = await readOpfsVaultBackupBlob(vaultList[0].key);
    expect(vaultBlob).not.toBeNull();
    expect(vaultBlob!.blob.size).toBe(vaultList[0].byteSize);

    const rabbits = snap.animals.filter((a) => a.species === 'Rabbit');
    const b1 = buildArchivedAnimalsBundle(snap, [rabbits[0].id]);
    const b2 = buildArchivedAnimalsBundle(snap, [rabbits[1].id]);
    await Promise.all([
      saveOpfsHerdArchive(b1.indexEntry, b1.zipBytes),
      saveOpfsHerdArchive(b2.indexEntry, b2.zipBytes),
    ]);
    const archivesList = await listOpfsHerdArchives();
    expect(archivesList).toHaveLength(2);

    const archiveBlob = await readOpfsHerdArchiveBlob(b1.archiveKey);
    expect(archiveBlob).not.toBeNull();
    expect(archiveBlob!.blob.size).toBe(b1.zipBytes.byteLength);
  });

  it('preserves active /tmp exports during QuotaExceededError purge while clearing orphans', async () => {
    const mock = createInMemoryOpfsMock({
      onCreateWritable: (fileName, callIndex) => {
        if (fileName.startsWith('manual-vault-') && callIndex === 3) {
          return { failOnceWithQuotaExceeded: true, spyClose: vi.fn<() => void>() };
        }
        return { spyClose: vi.fn<() => void>() };
      },
    });
    setOpfsRootResolverForTest(async () => mock.rootHandle);

    const orphan = await writeTempOpfsFile('export', 'stale', 'json');
    const activeExport = await writeTempOpfsFile('export', 'active-in-flight', 'json', {
      keepActiveAfterWrite: true,
    });

    const snap = buildFullPredefinedSampleSnapshot();
    await saveOpfsVaultBackup(snap, { kind: 'manual', note: 'Keep active tmp alive' });

    const tmpFiles = mock.rootNode.dirs.get('tmp')?.files;
    expect(tmpFiles?.has(orphan!.fileName)).toBe(false);
    expect(tmpFiles?.has(activeExport!.fileName)).toBe(true);
    unmarkTempOpfsFileActive(activeExport!.fileName);
  });

  it('compacts raw Uint8Array SQLite blobs in recovery_dump JSON instead of key-by-key array expansion', async () => {
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);

    const sqliteStub = new Uint8Array([83, 81, 76, 105, 116, 101, 32, 102]);
    const meta = await dumpRawRecordsToOpfsRecoveryBackup({
      sourceDbName: 'pedigree-sqlite-db',
      reason: 'Simulated VersionError binary dump',
      stores: { sqlite_blob: [{ key: 'pedigree_master.sqlite', bytes: sqliteStub }] },
    });
    expect(meta).not.toBeNull();
    const blobRes = await readOpfsVaultBackupBlob(meta!.key);
    const dumpText = await blobRes!.blob.text();
    const parsed = JSON.parse(dumpText);
    const dumpedRow = parsed.stores.sqlite_blob[0];
    expect(dumpedRow.bytes.__binaryType).toBe('Uint8Array');
    expect(dumpedRow.bytes.byteLength).toBe(sqliteStub.byteLength);
    expect(typeof dumpedRow.bytes.base64).toBe('string');
  });
});

describe('opfsStorage Phase B: Tier 1/2 caps, pre-prune sync offload, mixed .vault.zip/.json self-heal & canary cooldown', () => {
  it('enforces Tier 1 retention caps and offloads expiring backups to connected Backup Sync before pruning', async () => {
    installLocalStorageShim();
    const opfsMock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => opfsMock.rootHandle);

    const syncMock = createInMemoryOpfsMock();
    setBackupSyncHandleForTest({
      kind: 'directory',
      name: 'CloudSyncFolder',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getDirectoryHandle: (name: string, opts?: { create?: boolean }) =>
        syncMock.rootHandle.getDirectoryHandle(name, opts),
    });

    const tier1Policy = getTierStoragePolicy(1);
    const snap = buildFullPredefinedSampleSnapshot();
    const offloadedNames: string[] = [];

    for (let i = 0; i < tier1Policy.manualCap + 2; i++) {
      const meta = await saveOpfsVaultBackup(snap, {
        kind: 'manual',
        note: `Tier 1 Manual #${i + 1}`,
        policyOverride: tier1Policy,
      });
      if (meta && i < 2) {
        offloadedNames.push(meta.fileName);
      }
    }

    const listed = await listOpfsVaultBackups();
    expect(listed.filter((b) => b.kind === 'manual')).toHaveLength(tier1Policy.manualCap);

    // Expiring files must have been pushed into `<SyncFolder>/pedigree-vault-archive/` before deletion
    const archiveDirNode = syncMock.rootNode.dirs.get('pedigree-vault-archive');
    expect(archiveDirNode).toBeDefined();
    expect(archiveDirNode!.files.size).toBe(2);
    expect(readOpfsPruneSyncWarning()).toBeNull();

    // Disconnect sync folder & push past cap -> FIFO prunes unbacked copy and records prune warning; flushing after reconnect clears it
    setBackupSyncHandleForTest(null);
    await saveOpfsVaultBackup(snap, {
      kind: 'manual',
      note: 'Unbacked overflow',
      policyOverride: tier1Policy,
    });
    const warn = readOpfsPruneSyncWarning();
    expect(warn).not.toBeNull();
    expect(warn!.count).toBeGreaterThanOrEqual(1);
    expect(warn!.retained).toBe(false);

    setBackupSyncHandleForTest({
      kind: 'directory',
      name: 'CloudSyncFolder',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getDirectoryHandle: (name: string, opts?: { create?: boolean }) =>
        syncMock.rootHandle.getDirectoryHandle(name, opts),
    });
    const flushRes = await flushOpfsBackupsToSyncFolder({ policyOverride: tier1Policy });
    expect(flushRes.pushed).toBe(tier1Policy.manualCap);
    expect(readOpfsPruneSyncWarning()).toBeNull();
  });

  it('retains expiring local OPFS backups on permission_required and write_failed, then flushes & trims cleanly after re-auth', async () => {
    installLocalStorageShim();
    const opfsMock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => opfsMock.rootHandle);

    const syncMock = createInMemoryOpfsMock();
    let permState: 'granted' | 'prompt' = 'prompt';
    setBackupSyncHandleForTest({
      kind: 'directory',
      name: 'NeedsReauthFolder',
      queryPermission: async () => permState,
      requestPermission: async () => permState,
      getDirectoryHandle: (name: string, opts?: { create?: boolean }) =>
        syncMock.rootHandle.getDirectoryHandle(name, opts),
    });

    const tier1Policy = getTierStoragePolicy(1);
    const snap = buildFullPredefinedSampleSnapshot();

    // Exceed manualCap while permission is 'prompt' -> expiring backup must be RETAINED in OPFS!
    for (let i = 0; i < tier1Policy.manualCap + 1; i++) {
      await saveOpfsVaultBackup(snap, {
        kind: 'manual',
        note: `Pending Auth #${i + 1}`,
        policyOverride: tier1Policy,
      });
    }

    const whilePromptList = await listOpfsVaultBackups();
    expect(whilePromptList.filter((b) => b.kind === 'manual')).toHaveLength(tier1Policy.manualCap + 1);
    const promptWarn = readOpfsPruneSyncWarning();
    expect(promptWarn).not.toBeNull();
    expect(promptWarn!.reason).toBe('permission_required');
    expect(promptWarn!.retained).toBe(true);

    // Also test write_failed retains expiring local backups instead of deleting them
    clearOpfsPruneSyncWarning();
    setBackupSyncHandleForTest({
      kind: 'directory',
      name: 'BrokenDiskFolder',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getDirectoryHandle: async () => {
        throw new Error('EIO: simulated sync folder I/O failure');
      },
    });
    await saveOpfsVaultBackup(snap, {
      kind: 'manual',
      note: 'Write Failed Overflow',
      policyOverride: tier1Policy,
    });
    const whileWriteFailList = await listOpfsVaultBackups();
    expect(whileWriteFailList.filter((b) => b.kind === 'manual')).toHaveLength(
      tier1Policy.manualCap + 2
    );
    const writeFailWarn = readOpfsPruneSyncWarning();
    expect(writeFailWarn?.reason).toBe('write_failed');
    expect(writeFailWarn?.retained).toBe(true);

    // Once user re-authorizes & flushes with tier1Policy, all retained items push cleanly and local OPFS trims to cap
    permState = 'granted';
    setBackupSyncHandleForTest({
      kind: 'directory',
      name: 'NeedsReauthFolder',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getDirectoryHandle: (name: string, opts?: { create?: boolean }) =>
        syncMock.rootHandle.getDirectoryHandle(name, opts),
    });

    const flushRes = await flushOpfsBackupsToSyncFolder({ policyOverride: tier1Policy });
    expect(flushRes.pushed).toBe(tier1Policy.manualCap + 2);
    expect(flushRes.failed).toBe(0);
    expect(readOpfsPruneSyncWarning()).toBeNull();

    const afterFlushList = await listOpfsVaultBackups();
    expect(afterFlushList.filter((b) => b.kind === 'manual')).toHaveLength(tier1Policy.manualCap);
    const archiveDirNode = syncMock.rootNode.dirs.get('pedigree-vault-archive');
    expect(archiveDirNode!.files.size).toBe(tier1Policy.manualCap + 2);
  });

  it('migrates legacy pedigree.backupSinkMeta.v1 localStorage key and backup_sink_folder IDB handle transparently', async () => {
    const lsStore = installLocalStorageShim();
    lsStore.set(
      'pedigree.backupSinkMeta.v1',
      JSON.stringify({
        folderName: 'Legacy Sync Drive',
        configuredAtIso: '2025-01-02T03:04:05.000Z',
        lastPushFileName: 'old-vault.vault.zip',
        lastPushAtIso: '2025-01-03T04:05:06.000Z',
      })
    );

    const handlesMap = new Map<string, any>([
      [
        'backup_sink_folder',
        {
          key: 'backup_sink_folder',
          folderName: 'Legacy Sync Drive',
          configuredAtIso: '2025-01-02T03:04:05.000Z',
          handle: {
            kind: 'directory',
            name: 'Legacy Sync Drive',
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted',
          },
        },
      ],
    ]);

    vi.stubGlobal('window', {
      showDirectoryPicker: async () => {
        throw new Error('Not called during status read');
      },
    });
    vi.stubGlobal('indexedDB', {
      open() {
        const req: any = { result: null, error: null };
        queueMicrotask(() => {
          req.result = {
            close() {},
            transaction() {
              const tx: any = {
                onabort: null,
                objectStore() {
                  return {
                    get(k: string) {
                      const gReq: any = { result: undefined, onsuccess: null, onerror: null };
                      queueMicrotask(() => {
                        gReq.result = handlesMap.get(k);
                        gReq.onsuccess?.();
                      });
                      return gReq;
                    },
                  };
                },
              };
              return tx;
            },
          };
          req.onsuccess?.();
        });
        return req;
      },
    });

    const status = await getPersistedBackupSyncStatus();
    expect(status.supported).toBe(true);
    expect(status.configured).toBe(true);
    expect(status.folderName).toBe('Legacy Sync Drive');
    expect(status.permissionState).toBe('granted');
    expect(status.lastPushFileName).toBe('old-vault.vault.zip');
    expect(lsStore.has('pedigree.backupSyncMeta.v1')).toBe(true);
    expect(lsStore.has('pedigree.backupSinkMeta.v1')).toBe(false);
  });

  it('self-heals vault-index.json across mixed .vault.zip and legacy .json files and caps recovery_dump entries', async () => {
    installLocalStorageShim();
    const mock = createInMemoryOpfsMock();
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    const snap = buildFullPredefinedSampleSnapshot();

    const zipMeta = await saveOpfsVaultBackup(snap, {
      kind: 'manual',
      note: 'Compressed',
      policyOverride: { compressVaultBackups: true },
    });
    const jsonMeta = await saveOpfsVaultBackup(snap, {
      kind: 'manual',
      note: 'Legacy uncompressed',
      policyOverride: { compressVaultBackups: false },
    });

    // Delete vault-index.json to trigger self-healing index rebuild
    const backupsDir = await mock.rootHandle.getDirectoryHandle('backups');
    await backupsDir.removeEntry('vault-index.json');

    const rebuilt = await listOpfsVaultBackups();
    expect(rebuilt.map((r) => r.key).sort()).toEqual([jsonMeta!.key, zipMeta!.key].sort());

    const loadedZip = await loadOpfsVaultBackup(zipMeta!.key, snap.settings);
    const loadedJson = await loadOpfsVaultBackup(jsonMeta!.key, snap.settings);
    expect(loadedZip?.migrated.snapshot.animals).toHaveLength(snap.animals.length);
    expect(loadedJson?.migrated.snapshot.animals).toHaveLength(snap.animals.length);

    // Verify recovery_dump cap enforcement
    for (let i = 0; i < MAX_RECOVERY_DUMP_OPFS_BACKUPS + 2; i++) {
      await dumpRawRecordsToOpfsRecoveryBackup({
        sourceDbName: 'pedigree-db',
        reason: `Crash #${i + 1}`,
        stores: { test_store: [{ id: i }] },
      });
    }
    const afterDumps = await listOpfsVaultBackups();
    expect(afterDumps.filter((b) => b.kind === 'recovery_dump')).toHaveLength(
      MAX_RECOVERY_DUMP_OPFS_BACKUPS
    );
  });

  it('applies 1-hour failure cooldown on Export Canary so failing OPFS does not retry immediately', async () => {
    installLocalStorageShim();
    const mock = createInMemoryOpfsMock({
      onCreateWritable: (fileName) => {
        if (fileName === 'canary-probe.json') {
          return {
            throwOnWrite: new Error('Simulated OPFS write error'),
            spyClose: vi.fn<() => void>(),
          };
        }
        return { spyClose: vi.fn<() => void>() };
      },
    });
    setOpfsRootResolverForTest(async () => mock.rootHandle);
    const snap = buildFullPredefinedSampleSnapshot();

    const t0 = Date.now();
    expect(shouldRunExportCanary(t0)).toBe(true);
    const failed = await runOpfsExportCanary(snap);
    expect(failed.ok).toBe(false);

    // Immediate retry should be cooled down; retry after >1 hour should be allowed
    expect(shouldRunExportCanary(Date.now() + 10_000)).toBe(false);
    expect(shouldRunExportCanary(Date.now() + 65 * 60 * 1000)).toBe(true);
  });
});

describe('opfsTempStream Safari 15.2–16.3 handle compatibility, SyncAccessHandle fallback & restricted probes', () => {
  it('safely awaits close(), flush(), getSize(), and truncate() across both sync void/number and Promise returns, and skips double-close', async () => {
    const syncHandle: OpfsSyncAccessHandle = {
      write: () => 4,
      flush: vi.fn<() => void>(),
      getSize: vi.fn<() => number>(() => 42),
      truncate: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
    };

    await safeAwaitOpfsTruncate(syncHandle, 0);
    await safeAwaitOpfsFlush(syncHandle);
    expect(await safeAwaitOpfsGetSize(syncHandle)).toBe(42);
    await safeAwaitOpfsClose(syncHandle);
    await safeAwaitOpfsClose(syncHandle); // double-close must be a no-op
    expect(syncHandle.close).toHaveBeenCalledTimes(1);

    const asyncHandle: OpfsSyncAccessHandle = {
      write: () => 4,
      flush: vi.fn(async () => {}),
      getSize: vi.fn(async () => 128),
      truncate: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };

    await safeAwaitOpfsTruncate(asyncHandle, 0);
    await safeAwaitOpfsFlush(asyncHandle);
    expect(await safeAwaitOpfsGetSize(asyncHandle)).toBe(128);
    await safeAwaitOpfsClose(asyncHandle);
    await safeAwaitOpfsClose(asyncHandle);
    expect(asyncHandle.close).toHaveBeenCalledTimes(1);
  });

  it('writes via worker createSyncAccessHandle() with 0 args (never readwrite-unsafe) when createWritable is unavailable', async () => {
    let storedBytes = new Uint8Array(0);
    const createSyncSpy = vi.fn(async (): Promise<OpfsSyncAccessHandle> => {
      return {
        write(buf: ArrayBuffer | ArrayBufferView, opts?: { at?: number }) {
          const view =
            buf instanceof ArrayBuffer
              ? new Uint8Array(buf)
              : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          const at = opts?.at ?? 0;
          const next = new Uint8Array(Math.max(storedBytes.byteLength, at + view.byteLength));
          next.set(storedBytes);
          next.set(view, at);
          storedBytes = next;
          return view.byteLength;
        },
        async truncate(newSize: number) {
          storedBytes = storedBytes.slice(0, newSize);
        },
        async flush() {},
        async getSize() {
          return storedBytes.byteLength;
        },
        async close() {},
      };
    });

    const syncOnlyDir: OpfsDirectoryHandle = {
      kind: 'directory',
      name: 'tmp',
      async getDirectoryHandle() {
        throw new Error('unexpected subdir');
      },
      async getFileHandle(name: string) {
        return {
          kind: 'file',
          name,
          async getFile() {
            return new Blob([storedBytes]);
          },
          createSyncAccessHandle: createSyncSpy,
        };
      },
      async removeEntry() {},
    };

    await writeFileToOpfsDir(syncOnlyDir, 'worker-sync.json', '{"ok":true}');
    expect(createSyncSpy).toHaveBeenCalledTimes(1);
    expect(createSyncSpy).toHaveBeenCalledWith();
    expect(new TextDecoder().decode(storedBytes)).toBe('{"ok":true}');
  });

  it('degrades cleanly without throwing when navigator.storage getter or getDirectory() throws SecurityError', async () => {
    setOpfsRootResolverForTest(null);
    resetOpfsProbesForTests();

    const throwingNav = {
      get storage() {
        throw new DOMException('Blocked in Lockdown Mode', 'SecurityError');
      },
    };
    vi.stubGlobal('navigator', throwingNav);

    expect(isOpfsSupported()).toBe(false);
    const probeA = await probeOpfsRuntime();
    expect(probeA.supported).toBe(false);
    expect(await getOpfsRoot()).toBeNull();

    // Now simulate navigator.storage present, but getDirectory() rejects with SecurityError
    resetOpfsProbesForTests();
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn(async () => {
          throw new DOMException('OPFS unavailable in Private Browsing', 'SecurityError');
        }),
      },
    });
    const probeB = await probeOpfsRuntime();
    expect(probeB.supported).toBe(false);
    expect(isOpfsSupported()).toBe(false);
    expect(await getOpfsRoot()).toBeNull();
  });
});
```

## `src/storage/__tests__/passphraseAndClockSkew.test.ts`

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOCK_DRIFT_WARNING_THRESHOLD_MS,
  formatClockSkewHuman,
  getAdjustedNowIsoUtc,
  getAdjustedNowMs,
  getConnectivitySnapshot,
  getRecordedClockSkewMs,
  recordServerDateHeaderSkew,
  resetConnectivityStateForTests,
} from '../storageProtection';
import { evaluateBackupStatus } from '../../core/backupStatus';
import { makeEmptySnapshot } from '../../core/__tests__/testFixtures';
import {
  decryptBytesWithPassphrase,
  decryptTextWithPassphrase,
  encryptBytesWithPassphrase,
  encryptTextWithPassphrase,
  supportsPassphraseCrypto,
} from '../passphraseCrypto';
import {
  EncryptedSyncPassphraseError,
  parseDeltaFileTextAsync,
} from '../localSyncChannels';
import { createOutboxOperation } from '../../core/syncOutbox';
import { BarnTask, getCoreClockSkewMs, nowIsoUtc } from '../../core/models';
import { formatTimestampedBackupSlug } from '../../core/syncAndExports';
import { pushTasksToGoogleCalendar } from '../../utils/googleCalendarClient';
import { fetchUpgradeGateDecision, resetPwaUpdateManagerForTests } from '../pwaUpdateManager';

describe('Stage B storage & network resilience (IMP-023)', () => {
  afterEach(() => {
    resetConnectivityStateForTests();
    resetPwaUpdateManagerForTests();
    vi.restoreAllMocks();
  });

  describe('Device Clock Skew Compensation & Drift Warning', () => {
    it('captures server Date header skew, triggers 5-min drift warning, and shifts getAdjustedNowIsoUtc', () => {
      resetConnectivityStateForTests();
      const localFixedNow = Date.parse('2026-06-01T12:00:00.000Z');
      // Device clock is 15 minutes slow compared to server Date header
      const serverDateHeader = 'Mon, 01 Jun 2026 12:15:00 GMT';

      const skew = recordServerDateHeaderSkew(serverDateHeader, localFixedNow);
      expect(skew).toBe(15 * 60_000);
      expect(getRecordedClockSkewMs()).toBe(15 * 60_000);
      expect(getCoreClockSkewMs()).toBe(15 * 60_000);

      const snap = getConnectivitySnapshot();
      expect(snap.clockDriftWarning).toBe(true);
      expect(Math.abs(snap.clockSkewMs ?? 0)).toBeGreaterThanOrEqual(
        CLOCK_DRIFT_WARNING_THRESHOLD_MS
      );
      expect(formatClockSkewHuman(snap.clockSkewMs)).toContain('15 min behind server time');

      const adjustedMs = Date.parse(getAdjustedNowIsoUtc());
      expect(Math.abs(adjustedMs - (Date.now() + 15 * 60_000))).toBeLessThan(2000);
      const coreNowMs = Date.parse(nowIsoUtc());
      expect(Math.abs(coreNowMs - (Date.now() + 15 * 60_000))).toBeLessThan(2000);
    });

    it('propagates HTTP Date skew from uncached upgrade-gate manifest checks and aligns backup slugs', async () => {
      resetConnectivityStateForTests();
      vi.useFakeTimers();
      try {
        const deviceClockMs = Date.parse('2026-06-01T12:00:00.000Z');
        vi.setSystemTime(deviceClockMs);
        const serverDate = 'Mon, 01 Jun 2026 13:30:00 GMT'; // +90 minutes ahead

        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('version.json')) {
              return new Response(
                JSON.stringify({
                  appVersion: '0.1.0-prealpha.1',
                  schemaVersion: 6,
                  minDirectUpgradeSchema: 1,
                }),
                {
                  status: 200,
                  headers: {
                    'content-type': 'application/json',
                    date: serverDate,
                  },
                }
              );
            }
            return new Response(
              JSON.stringify({ allowUpdates: true, revokedVersions: [] }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }
            );
          })
        );

        await fetchUpgradeGateDecision();
        expect(getRecordedClockSkewMs()).toBe(90 * 60_000);
        expect(getCoreClockSkewMs()).toBe(90 * 60_000);

        const slug = formatTimestampedBackupSlug();
        const expectedHour = String(new Date(Date.parse('2026-06-01T13:30:00.000Z')).getHours()).padStart(2, '0');
        expect(slug).toContain(`-${expectedHour}30`);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps clockDriftWarning false when drift is under 5 minutes', () => {
      const localFixedNow = Date.parse('2026-06-01T12:00:00.000Z');
      recordServerDateHeaderSkew('Mon, 01 Jun 2026 12:02:00 GMT', localFixedNow);
      expect(getConnectivitySnapshot().clockDriftWarning).toBe(false);
    });

    it('aligns backup age and reminder snooze window with getAdjustedNowMs when device clock is skewed', () => {
      resetConnectivityStateForTests();
      vi.useFakeTimers();
      try {
        const deviceClockMs = Date.parse('2026-06-01T12:00:00.000Z');
        vi.setSystemTime(deviceClockMs);
        // Server clock is 2 hours ahead of rewound device clock
        recordServerDateHeaderSkew('Mon, 01 Jun 2026 14:00:00 GMT', deviceClockMs);

        const adjustedNow = getAdjustedNowMs();
        expect(adjustedNow).toBe(Date.parse('2026-06-01T14:00:00.000Z'));

        const snap = makeEmptySnapshot();
        const lastBackup = {
          exportedAtIso: '2026-06-01T13:30:00.000Z',
          format: 'zip' as const,
        };
        const status = evaluateBackupStatus(snap, lastBackup, adjustedNow, 0);
        expect(status.lastExportRelative).toBe('30m ago');

        // A 1-hour snooze from device clock (13:00Z) would still appear expired relative to adjusted 14:00Z
        const expiredSnooze = evaluateBackupStatus(
          snap,
          null,
          adjustedNow,
          Date.parse('2026-06-01T13:00:00.000Z')
        );
        expect(expiredSnooze.showDismissibleBanner).toBe(false); // empty test snap has no real data
        expect(status.ageDays).toBeCloseTo(30 / (60 * 24), 4);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Web Crypto Passphrase Encryption (AES-256-GCM + PBKDF2)', () => {
    it('round-trips bytes and delta JSON text with fast test iteration counts and rejects wrong passphrases', async () => {
      if (!supportsPassphraseCrypto()) {
        return;
      }

      const rawBytes = new Uint8Array([1, 2, 3, 4, 5, 99, 250]);
      const envBytes = await encryptBytesWithPassphrase(rawBytes, 'barn-secret-2026', {
        payloadKind: 'zip_archive',
        originalFileName: 'barn.zip',
        iterations: 10_000,
      });

      const restoredBytes = await decryptBytesWithPassphrase(envBytes, 'barn-secret-2026');
      expect(Array.from(restoredBytes)).toEqual(Array.from(rawBytes));

      await expect(decryptBytesWithPassphrase(envBytes, 'wrong-pass')).rejects.toThrow(
        /incorrect passphrase/i
      );

      const deltaPayload = JSON.stringify({
        format: 'community-pedigree-delta-v1',
        device_id: 'dev-a',
        exported_at: '2026-06-01T12:00:00.000Z',
        operations: [
          createOutboxOperation({
            entityType: 'animal',
            entityUuid: 'ani-1',
            deviceId: 'dev-a',
            logicalCounter: 1,
            fieldName: 'name',
            newValue: 'Clover',
            timestamp: '2026-06-01T12:00:00.000Z',
            recordRev: 1,
          }),
        ],
      });

      const encryptedDeltaEnv = await encryptTextWithPassphrase(
        deltaPayload,
        'worker-pass-42',
        {
          payloadKind: 'delta_log',
          originalFileName: 'delta_dev-a.json',
          iterations: 10_000,
        }
      );
      const encryptedDeltaJson = JSON.stringify(encryptedDeltaEnv);

      await expect(parseDeltaFileTextAsync(encryptedDeltaJson)).rejects.toBeInstanceOf(
        EncryptedSyncPassphraseError
      );

      const decryptedDelta = await parseDeltaFileTextAsync(
        encryptedDeltaJson,
        'worker-pass-42'
      );
      expect(decryptedDelta.wasEncrypted).toBe(true);
      expect(decryptedDelta.operations).toHaveLength(1);
      expect(decryptedDelta.operations[0]?.new_value).toBe('Clover');

      const plainParsed = await parseDeltaFileTextAsync(deltaPayload);
      expect(plainParsed.wasEncrypted).toBe(false);
      expect(plainParsed.operations).toHaveLength(1);
    });
  });

  describe('Google Calendar 409 conflict update-in-place + Date skew capture', () => {
    it('retries with PUT using deterministic event id when POST returns 409', async () => {
      const calls: Array<{ url: string; method: string }> = [];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        calls.push({ url, method });
        if (method === 'POST') {
          return new Response(JSON.stringify({ error: { code: 409 } }), {
            status: 409,
            headers: {
              'content-type': 'application/json',
              date: new Date(Date.now() + 10 * 60_000).toUTCString(),
            },
          });
        }
        return new Response(JSON.stringify({ htmlLink: 'https://calendar.google.com/e/1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

      vi.stubGlobal('fetch', fetchMock);

      const task: BarnTask = {
        id: 'deterministic-task-id-001',
        species: 'Rabbit',
        title: 'Wean Litter',
        dueDateIso: '2026-07-01',
        priority: 'Normal',
        category: 'Weaning',
        linkedAnimalId: '',
        linkedAnimalName: '',
        linkedBreedingId: '',
        completed: false,
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      };

      const res = await pushTasksToGoogleCalendar({
        accessToken: 'fake-token',
        calendarId: 'primary',
        tasks: [task],
        config: {},
        barnName: 'Kim Barn',
      });

      expect(res.createdCount).toBe(1);
      expect(res.failedCount).toBe(0);
      expect(res.htmlLinks).toEqual(['https://calendar.google.com/e/1']);
      expect(calls.map((c) => c.method)).toEqual(['POST', 'PUT']);
      expect(calls[1]?.url).toMatch(/\/events\/cped[a-v0-9]+$/);
      expect(getConnectivitySnapshot().clockDriftWarning).toBe(true);
    });
  });
});
```

## `src/storage/__tests__/pedigreeLazyFetch.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Animal } from '../../core/models';

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
  default: path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
}));

import { WebSqliteAdapter } from '../webSqliteAdapter';

interface MockRequest<T = unknown> {
  result: T | null;
  error: Error | null;
  onupgradeneeded: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

interface MockTransaction {
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  error: Error | null;
  objectStore: (storeName: string) => {
    get: (key: string) => MockRequest;
    getAll: () => MockRequest<unknown[]>;
    put: (val: unknown, key?: string) => Record<string, never>;
    delete: (key: string) => Record<string, never>;
    clear: () => Record<string, never>;
  };
}

function installInMemoryIdb() {
  const kvStores = new Map<string, Map<string, unknown>>([
    ['sqlite_files', new Map()],
    ['pedigree_rolling_backups', new Map()],
  ]);
  const lsMap = new Map<string, string>();

  const indexedDbMock = {
    open() {
      const req: MockRequest = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => {
        const fakeDb = {
          objectStoreNames: {
            contains: (name: string) => kvStores.has(name),
          },
          close() {},
          transaction() {
            const tx: MockTransaction = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              error: null,
              objectStore(storeName: string) {
                let map = kvStores.get(storeName);
                if (!map) {
                  map = new Map();
                  kvStores.set(storeName, map);
                }
                const finish = () => queueMicrotask(() => tx.oncomplete?.());
                return {
                  get(key: string) {
                    const r: MockRequest = {
                      result: null,
                      error: null,
                      onupgradeneeded: null,
                      onsuccess: null,
                      onerror: null,
                    };
                    queueMicrotask(() => {
                      r.result = map!.get(key) ?? null;
                      r.onsuccess?.();
                    });
                    return r;
                  },
                  getAll() {
                    const r: MockRequest<unknown[]> = {
                      result: [],
                      error: null,
                      onupgradeneeded: null,
                      onsuccess: null,
                      onerror: null,
                    };
                    queueMicrotask(() => {
                      r.result = Array.from(map!.values());
                      r.onsuccess?.();
                    });
                    return r;
                  },
                  put(val: unknown, key?: string) {
                    const cloned =
                      val instanceof Uint8Array ? new Uint8Array(val) : structuredClone(val);
                    map!.set(String(key ?? ''), cloned);
                    finish();
                    return {};
                  },
                  delete(key: string) {
                    map!.delete(key);
                    finish();
                    return {};
                  },
                  clear() {
                    map!.clear();
                    finish();
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
  };

  vi.stubGlobal('indexedDB', indexedDbMock);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => lsMap.get(k) ?? null,
    setItem: (k: string, v: string) => lsMap.set(k, String(v)),
    removeItem: (k: string) => lsMap.delete(k),
    clear: () => lsMap.clear(),
  });
  vi.stubGlobal('window', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

function makeAnimal(id: string, name: string, overrides: Partial<Animal> = {}): Animal {
  const now = '2026-06-01T12:00:00.000Z';
  return {
    id,
    tattoo: id.toUpperCase(),
    name,
    species: 'Rabbit',
    breed: 'Rex',
    variety: 'Castor',
    sex: 'Male',
    status: 'Active',
    archived: false,
    needsAttention: false,
    ignoredConflicts: [],
    birthDateIso: '2024-01-01',
    weightGrams: 3200,
    genotype: [],
    genotypeRaw: '',
    rufusLevel: '',
    suspectedCarrierOf: [],
    confirmedCarrierOf: [],
    clearedCarrierOf: [],
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: '',
    breederName: '',
    ownerName: '',
    ownershipType: 'Owned',
    culled: false,
    cullDateIso: '',
    cullReason: '',
    deceasedDateIso: '',
    deathCause: '',
    soldDateIso: '',
    salePriceCents: 0,
    purchaseCostCents: 0,
    buyerName: '',
    sireId: '',
    damId: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WebSqliteAdapter lazy pedigree neighborhood & branch existence probes', () => {
  it('queries bounded 0..6 generation neighborhoods safely with cycle protection', async () => {
    installInMemoryIdb();
    const adapter = new WebSqliteAdapter('lazy-ped-tab');
    await adapter.initialize({ lightweightPhotos: true });

    // Build a 6-gen lineage with an intentional cycle at Gen 6 -> Gen 4
    const gen6 = makeAnimal('ped-g6', 'Gen 6 Ancestor', { sireId: 'ped-g4' });
    const gen5 = makeAnimal('ped-g5', 'Gen 5 Ancestor', { sireId: 'ped-g6' });
    const gen4 = makeAnimal('ped-g4', 'Gen 4 Ancestor', { sireId: 'ped-g5' });
    const gen3 = makeAnimal('ped-g3', 'Gen 3 Sire', { sireId: 'ped-g4' });
    const gen3Offloaded = makeAnimal('ped-g3-off', 'Gen 3 Offloaded', {
      offloadedArchiveKey: 'archive-2026.archive.zip',
    });
    const gen2 = makeAnimal('ped-g2', 'Gen 2 Sire', { sireId: 'ped-g3', damId: 'ped-g3-off' });
    const gen1 = makeAnimal('ped-g1', 'Gen 1 Sire', { sireId: 'ped-g2' });
    const subject = makeAnimal('ped-g0', 'Subject', { sex: 'Female', sireId: 'ped-g1' });
    const gen3Leaf = makeAnimal('ped-g3-leaf', 'Gen 3 Leaf');

    await adapter.saveAnimalsBatch([
      gen6,
      gen5,
      gen4,
      gen3,
      gen3Offloaded,
      gen2,
      gen1,
      subject,
      gen3Leaf,
    ]);

    // Depth 3 from subject fetches Gen 0..3 only (excludes Gen 4..6)
    const depth3 = await adapter.queryPedigreeNeighborhood(['ped-g0'], 3);
    const depth3Ids = new Set(depth3.map((a) => a.id));
    expect(depth3Ids.has('ped-g0')).toBe(true);
    expect(depth3Ids.has('ped-g1')).toBe(true);
    expect(depth3Ids.has('ped-g2')).toBe(true);
    expect(depth3Ids.has('ped-g3')).toBe(true);
    expect(depth3Ids.has('ped-g3-off')).toBe(true);
    expect(depth3Ids.has('ped-g4')).toBe(false);

    // Expanding Gen 3 branch fetches Gen 4..6 cleanly without looping infinitely on ped-g6 -> ped-g4
    const branchExpand = await adapter.queryPedigreeNeighborhood(['ped-g3'], 3);
    const branchIds = new Set(branchExpand.map((a) => a.id));
    expect(branchIds.has('ped-g3')).toBe(true);
    expect(branchIds.has('ped-g4')).toBe(true);
    expect(branchIds.has('ped-g5')).toBe(true);
    expect(branchIds.has('ped-g6')).toBe(true);

    // Branch existence check probes SQLite parent presence & offloaded archive pointers
    const existence = await adapter.queryPedigreeBranchAncestorsExist([
      'ped-g3',
      'ped-g3-off',
      'ped-g3-leaf',
      'non-existent-id',
    ]);
    expect(existence['ped-g3']).toBe(true);
    expect(existence['ped-g3-off']).toBe(true);
    expect(existence['ped-g3-leaf']).toBe(false);
    expect(existence['non-existent-id']).toBeUndefined();
  });
});
```

## `src/storage/__tests__/photoHydrationAndWorker.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimalPhoto, BarnDatabaseSnapshot } from '../../core/models';
import {
  analyzePhotoStorageFootprintPure,
  OVERSIZED_PHOTO_BYTES_THRESHOLD,
  pruneFullResPayloadsFromSnapshotPure,
} from '../../core/photoMaintenance';
import { buildFullPredefinedSampleSnapshot } from '../../core/sampleData';
import {
  buildCompleteBackupZipArchive,
  buildPhotosOnlyZipArchive,
  parseBackupArchiveInput,
  streamCompleteBackupZipArchive,
  streamPhotosOnlyZipArchive,
} from '../../core/backupArchive';
import { generateBarnBackupJsonChunks } from '../../core/syncAndExports';
import {
  BoundedPhotoDataCache,
  hydrateSnapshotWithPhotoDataUrls,
  stripPhotoDataUrlsFromSnapshot,
} from '../photoHydration';
import {
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsWritableStream,
  setOpfsRootResolverForTest,
} from '../opfsStorage';
import {
  buildCompleteBackupZipOffThread,
  buildCompleteBackupZipToOpfsTmpOffThread,
  buildImporterWorkerSnapshot,
  buildPhotosOnlyZipOffThread,
  buildPhotosOnlyZipToOpfsTmpOffThread,
  buildSupportBundleZipOffThread,
  parseBackupArchiveOffThread,
  parseExternalImportOffThread,
  resetArchiveWorkerForTests,
} from '../offThreadWorkerClient';

function makeTestSnapshot(): BarnDatabaseSnapshot {
  const sample = buildFullPredefinedSampleSnapshot();
  const settings = sample.settings;
  const rabbitPhoto: AnimalPhoto = {
    id: 'photo-rabbit-1',
    species: 'Rabbit',
    animalId: 'a-rabbit-1',
    isPrimary: true,
    sortOrder: 0,
    caption: 'Front pose',
    originalFileName: 'clover.jpg',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    originalBytes: 1000,
    storedBytes: 68,
    thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const goatPhoto: AnimalPhoto = {
    id: 'photo-goat-1',
    species: 'Goat',
    animalId: 'a-goat-1',
    isPrimary: true,
    sortOrder: 0,
    caption: 'Dairy stand',
    originalFileName: 'daisy.jpg',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    originalBytes: 1200,
    storedBytes: 68,
    thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  return {
    settings,
    speciesProfiles: sample.speciesProfiles.slice(0, 2),
    animals: [
      {
        id: 'a-rabbit-1',
        species: 'Rabbit',
        name: 'Clover',
        tattoo: 'CLV1',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Female',
        birthDateIso: '2024-03-01',
        sireId: '',
        damId: '',
        weightGrams: 1650,
        status: 'Active',
        archived: false,
        needsAttention: false,
        legsCount: 0,
        registrationNumber: '',
        grandChampionNumber: '',
        cageLocation: 'R-1',
        breederName: 'Tester',
        ownerName: 'Tester',
        genotype: [],
        genotypeRaw: '',
        notes: '',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'a-goat-1',
        species: 'Goat',
        name: 'Daisy',
        tattoo: 'DSY1',
        breed: 'Nigerian Dwarf',
        variety: 'Chamoisee',
        sex: 'Female',
        birthDateIso: '2023-04-12',
        sireId: '',
        damId: '',
        weightGrams: 28000,
        status: 'Active',
        archived: false,
        needsAttention: false,
        legsCount: 0,
        registrationNumber: '',
        grandChampionNumber: '',
        cageLocation: 'G-1',
        breederName: 'Tester',
        ownerName: 'Tester',
        genotype: [],
        genotypeRaw: '',
        notes: '',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    animalPhotos: [rabbitPhoto, goatPhoto],
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    feedBatches: [],
    feedAllocations: [],
  };
}

function createSimpleOpfsMock() {
  const dirs = new Map<string, Map<string, Uint8Array>>();
  let writeCount = 0;

  const toUint8 = async (data: string | Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> => {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return new Uint8Array(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(await data.arrayBuffer());
  };

  const makeDir = (dirName: string): OpfsDirectoryHandle => {
    if (!dirs.has(dirName)) dirs.set(dirName, new Map());
    const files = dirs.get(dirName)!;
    return {
      kind: 'directory',
      name: dirName,
      async getDirectoryHandle(name, opts) {
        if (!dirs.has(name)) {
          if (!opts?.create) throw new Error(`Missing dir ${name}`);
          dirs.set(name, new Map());
        }
        return makeDir(name);
      },
      async getFileHandle(name, opts): Promise<OpfsFileHandle> {
        if (!files.has(name)) {
          if (!opts?.create) throw new Error(`Missing file ${name}`);
          files.set(name, new Uint8Array(0));
        }
        return {
          kind: 'file',
          name,
          async getFile() {
            const bytes = files.get(name) ?? new Uint8Array(0);
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            return new Blob([copy], { type: 'application/octet-stream' });
          },
          async createWritable(): Promise<OpfsWritableStream> {
            writeCount += 1;
            const chunks: Uint8Array[] = [];
            return {
              async write(data) {
                chunks.push(await toUint8(data));
              },
              async close() {
                const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
                const merged = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) {
                  merged.set(c, off);
                  off += c.byteLength;
                }
                files.set(name, merged);
              },
            };
          },
        };
      },
      async removeEntry(name) {
        if (!files.delete(name)) throw new Error(`Missing file ${name}`);
      },
      async *entries() {
        for (const [k] of files.entries()) {
          yield [k, await this.getFileHandle(k)] as [string, OpfsFileHandle];
        }
      },
    };
  };

  return {
    dirs,
    getWriteCount: () => writeCount,
    rootHandle: makeDir(''),
  };
}

afterEach(() => {
  setOpfsRootResolverForTest(null);
  resetArchiveWorkerForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BoundedPhotoDataCache & snapshot hydration', () => {
  it('enforces LRU eviction and refreshes recency on get', () => {
    const cache = new BoundedPhotoDataCache(2);
    cache.set('p1', 'data:p1');
    cache.set('p2', 'data:p2');
    // Touch p1 so p2 becomes least-recently-used
    expect(cache.get('p1')).toBe('data:p1');
    cache.set('p3', 'data:p3');

    expect(cache.size()).toBe(2);
    expect(cache.get('p2')).toBeUndefined();
    expect(cache.get('p1')).toBe('data:p1');
    expect(cache.get('p3')).toBe('data:p3');

    cache.resize(1);
    expect(cache.size()).toBe(1);
    expect(cache.get('p3')).toBe('data:p3');
    cache.delete('p3');
    expect(cache.size()).toBe(0);

    // Byte-budget enforcement & trimTo
    const byteCache = new BoundedPhotoDataCache(10, 15);
    byteCache.set('a', '12345678'); // 8 bytes
    byteCache.set('b', '1234567'); // total 15
    expect(byteCache.size()).toBe(2);
    expect(byteCache.byteSize()).toBe(15);
    byteCache.set('c', '12345678'); // exceeds 15 -> evicts 'a' (remaining 15)
    expect(byteCache.get('a')).toBeUndefined();
    expect(byteCache.size()).toBe(2);
    byteCache.trimTo(1, 10);
    expect(byteCache.size()).toBe(1);
    expect(byteCache.byteSize()).toBe(8);
  });

  it('strips full-res dataUrls cleanly while retaining thumbnails, and hydrates selectively by species & cache', async () => {
    const fullSnap = makeTestSnapshot();
    const stripped = stripPhotoDataUrlsFromSnapshot(fullSnap);

    expect(stripped.animalPhotos).toHaveLength(2);
    expect(stripped.animalPhotos![0].dataUrl).toBe('');
    expect(stripped.animalPhotos![0].thumbnailDataUrl).toBe(
      fullSnap.animalPhotos![0].thumbnailDataUrl
    );
    expect(stripped.animalPhotos![1].dataUrl).toBe('');

    const cache = new BoundedPhotoDataCache(4);
    const fetchBatch = vi.fn(async (ids: string[]) => {
      const out: Record<string, string> = {};
      for (const id of ids) {
        const match = fullSnap.animalPhotos!.find((p) => p.id === id);
        if (match) out[id] = match.dataUrl;
      }
      return out;
    });

    // Hydrate only Rabbit photos
    const rabbitHydrated = await hydrateSnapshotWithPhotoDataUrls(
      stripped,
      fetchBatch,
      'Rabbit',
      cache
    );
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch).toHaveBeenCalledWith(['photo-rabbit-1']);
    expect(rabbitHydrated.animalPhotos![0].dataUrl).toBe(fullSnap.animalPhotos![0].dataUrl);
    expect(rabbitHydrated.animalPhotos![1].dataUrl).toBe('');

    // Cached lookup should avoid re-fetching cached photo IDs
    cache.set('photo-goat-1', fullSnap.animalPhotos![1].dataUrl);
    const allFromCache = await hydrateSnapshotWithPhotoDataUrls(
      rabbitHydrated,
      fetchBatch,
      undefined,
      cache
    );
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(allFromCache.animalPhotos![1].dataUrl).toBe(fullSnap.animalPhotos![1].dataUrl);
  });

  it('strips image payloads in buildImporterWorkerSnapshot while keeping photo metadata', () => {
    const snap = makeTestSnapshot();
    const light = buildImporterWorkerSnapshot(snap);
    expect(light.animalPhotos).toHaveLength(2);
    expect(light.animalPhotos![0].id).toBe('photo-rabbit-1');
    expect(light.animalPhotos![0].isPrimary).toBe(true);
    expect(light.animalPhotos![0].dataUrl).toBe('');
    expect(light.animalPhotos![0].thumbnailDataUrl).toBe('');
  });

  it('audits dehydrated photo metadata accurately without loading full-res blobs and supports clock-adjusted pruning', () => {
    const snap = makeTestSnapshot();
    snap.animalPhotos = [
      {
        ...snap.animalPhotos![0],
        storedBytes: OVERSIZED_PHOTO_BYTES_THRESHOLD + 32 * 1024,
        width: 2400,
        height: 1800,
      },
      {
        ...snap.animalPhotos![1],
        storedBytes: 95 * 1024,
        width: 1024,
        height: 768,
      },
    ];
    const stripped = stripPhotoDataUrlsFromSnapshot(snap);
    expect(stripped.animalPhotos!.every((p) => p.dataUrl === '')).toBe(true);

    const footprint = analyzePhotoStorageFootprintPure(stripped, 'balanced');
    expect(footprint.oversizedPhotoIds).toEqual(['photo-rabbit-1']);
    expect(footprint.fullResPrunableIds).toEqual(['photo-rabbit-1', 'photo-goat-1']);

    const cache = new BoundedPhotoDataCache(4);
    cache.set('photo-rabbit-1', snap.animalPhotos![0].dataUrl);
    cache.set('photo-goat-1', snap.animalPhotos![1].dataUrl);

    const customTs = '2026-08-15T14:30:00.000Z';
    const pruned = pruneFullResPayloadsFromSnapshotPure(snap, ['photo-rabbit-1'], customTs);
    expect(pruned.prunedCount).toBe(1);
    expect(pruned.updatedPhotos[0]?.updatedAt).toBe(customTs);
    expect(pruned.updatedPhotos[0]?.dataUrl).toBe(snap.animalPhotos![0].thumbnailDataUrl);

    for (const p of pruned.updatedPhotos) {
      cache.delete(p.id);
    }
    expect(cache.get('photo-rabbit-1')).toBeUndefined();
    expect(cache.get('photo-goat-1')).toBe(snap.animalPhotos![1].dataUrl);
  });
});

describe('offThreadWorkerClient async ZIP & external import execution', () => {
  it('builds and parses complete and photos-only .ZIP archives via fallback cleanly', async () => {
    const snap = makeTestSnapshot();
    const completeZip = await buildCompleteBackupZipOffThread(snap);
    expect(completeZip.bytes.byteLength).toBeGreaterThan(100);
    expect(completeZip.animalCount).toBe(2);
    expect(completeZip.photoCount).toBe(2);

    const parsed = await parseBackupArchiveOffThread(
      completeZip.bytes,
      'backup-test.zip',
      snap.settings
    );
    expect(parsed.kind).toBe('full_snapshot');
    if (parsed.kind === 'full_snapshot') {
      expect(parsed.snapshot.animals).toHaveLength(2);
      expect(parsed.snapshot.animalPhotos).toHaveLength(2);
      expect(parsed.photosReconstructed).toBe(2);
    }

    const photosZip = await buildPhotosOnlyZipOffThread(snap);
    expect(photosZip.photoCount).toBe(2);

    const parsedPhotosOnly = await parseBackupArchiveOffThread(
      photosZip.bytes,
      'photos-only.zip',
      snap.settings
    );
    expect(parsedPhotosOnly.kind).toBe('photos_only');
    if (parsedPhotosOnly.kind === 'photos_only') {
      expect(parsedPhotosOnly.photos).toHaveLength(2);
    }
  });

  it('parses external CSV import off-thread cleanly with dehydrated snapshot', async () => {
    const snap = stripPhotoDataUrlsFromSnapshot(makeTestSnapshot());
    const csvText = 'Name,Tattoo,Sex,Breed\nBramble,BRM9,Male,Holland Lop\n';
    const preview = await parseExternalImportOffThread(
      'universal-csv',
      [{ fileName: 'herd.csv', bytes: new TextEncoder().encode(csvText) }],
      snap,
      {
        fallbackSpeciesName: 'Rabbit',
        appendDeferredImageFilenamesToNotes: true,
      }
    );
    expect(preview.animals.some((a) => a.name === 'Bramble' && a.tattoo === 'BRM9')).toBe(true);
  });

  it('builds support bundle .ZIP archive asynchronously without blocking', async () => {
    const snap = makeTestSnapshot();
    const bundle = await buildSupportBundleZipOffThread({
      entries: [],
      summary: {
        totalEntries: 0,
        errorCount: 0,
        memoryWarningCount: 0,
        crashCount: 0,
        oldestEntryIso: null,
        newestEntryIso: null,
        config: {
          verboseEnabled: true,
          retentionDays: 7,
          supportEmail: '',
        },
        currentMemory: {
          usedHeapBytes: null,
          totalHeapBytes: null,
          heapLimitBytes: null,
          heapPercent: null,
          deviceMemoryGb: null,
        },
        sessionId: 'test-session',
        userAgent: 'vitest',
        platformInfo: 'node',
      },
      snapshot: snap,
      includeData: true,
      includePhotos: false,
    });
    expect(bundle.bytes.byteLength).toBeGreaterThan(50);
    expect(bundle.filename.endsWith('.zip')).toBe(true);
    expect(bundle.includedPhotos).toBe(false);
  });
});

describe('Phase 2 compatibility & memory fallbacks', () => {
  it('detects iPadOS 13+ MacIntel multi-touch UA in isIosBrowser cleanly', async () => {
    const { isIosBrowser } = await import('../storageProtection');
    const originalNav = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        },
        configurable: true,
      });
      expect(isIosBrowser()).toBe(true);

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 0,
        },
        configurable: true,
      });
      expect(isIosBrowser()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        configurable: true,
      });
    }
  });

  it('copyTextWithFallback uses clipboard first, falls back to execCommand, and returns unsupported safely', async () => {
    const { copyTextWithFallback } = await import('../../utils/webFileActions');
    const originalNav = globalThis.navigator;
    const originalDoc = globalThis.document;

    try {
      // 1. Primary clipboard API succeeds
      Object.defineProperty(globalThis, 'navigator', {
        value: { clipboard: { writeText: vi.fn(async () => {}) } },
        configurable: true,
      });
      expect(await copyTextWithFallback('https://example.test/?task=1')).toBe('clipboard');

      // 2. Primary clipboard rejects -> falls back to document.execCommand('copy')
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          clipboard: {
            writeText: vi.fn(async () => {
              throw new Error('Blocked in iframe');
            }),
          },
        },
        configurable: true,
      });
      const fakeTextarea = {
        value: '',
        style: {} as Record<string, string>,
        setAttribute: vi.fn(),
        focus: vi.fn(),
        select: vi.fn(),
      };
      const fakeBody = {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      };
      Object.defineProperty(globalThis, 'document', {
        value: {
          createElement: vi.fn(() => fakeTextarea),
          execCommand: vi.fn(() => true),
          body: fakeBody,
        },
        configurable: true,
      });
      expect(await copyTextWithFallback('fallback-text')).toBe('execCommand');
      expect(fakeBody.appendChild).toHaveBeenCalledTimes(1);
      expect(fakeBody.removeChild).toHaveBeenCalledTimes(1);

      // 3. Neither available -> returns 'unsupported' without throwing
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
      });
      Object.defineProperty(globalThis, 'document', {
        value: undefined,
        configurable: true,
      });
      expect(await copyTextWithFallback('no-copy')).toBe('unsupported');
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'document', {
        value: originalDoc,
        configurable: true,
      });
    }
  });

  it('bounds optimizeStagedImporterPhotos concurrency and yields progress accurately', async () => {
    const { optimizeStagedImporterPhotos } = await import('../webImageOptimizer');
    const staged = Array.from({ length: 3 }, (_, idx) => ({
      id: `p-${idx}`,
      species: 'Rabbit',
      animalId: 'a-1',
      animalName: 'Clover',
      isPrimary: idx === 0,
      sortOrder: idx,
      caption: '',
      entryPath: `photos/img-${idx}.jpg`,
      originalFileName: `img-${idx}.jpg`,
      mimeHint: 'image/jpeg',
      // Small fake payload will fail canvas decode in Node and cleanly record failedFiles
      bytes: new Uint8Array([1, 2, 3]),
    }));

    const progressCalls: number[] = [];
    const result = await optimizeStagedImporterPhotos(
      staged,
      'compact',
      (p) => progressCalls.push(p.completed),
      { concurrency: 1 }
    );

    expect(result.failedFiles).toHaveLength(3);
    expect(progressCalls).toEqual([1, 2, 3]);
  });
});

describe('Low-RAM export streaming & OPFS /tmp staging for all exports', () => {
  it('streams complete & photos-only ZIP archives incrementally with identical parsed output to synchronous builders', async () => {
    const snap = makeTestSnapshot();

    const streamedCompleteChunks: Uint8Array[] = [];
    const completeSummary = await streamCompleteBackupZipArchive(snap, (chunk) => {
      streamedCompleteChunks.push(chunk);
    });
    expect(streamedCompleteChunks.length).toBeGreaterThan(1);
    const completeLen = streamedCompleteChunks.reduce((sum, c) => sum + c.byteLength, 0);
    expect(completeSummary.totalZipBytes).toBe(completeLen);

    const streamedCompleteBytes = new Uint8Array(completeLen);
    let offset = 0;
    for (const c of streamedCompleteChunks) {
      streamedCompleteBytes.set(c, offset);
      offset += c.byteLength;
    }

    const syncComplete = buildCompleteBackupZipArchive(snap);
    expect(completeSummary.animalCount).toBe(syncComplete.animalCount);
    expect(completeSummary.photoCount).toBe(syncComplete.photoCount);
    expect(completeSummary.binderCount).toBe(syncComplete.binderCount);

    const parsedComplete = parseBackupArchiveInput(
      streamedCompleteBytes,
      'streamed-complete.zip',
      snap.settings
    );
    expect(parsedComplete.kind).toBe('full_snapshot');
    if (parsedComplete.kind === 'full_snapshot') {
      expect(parsedComplete.snapshot.animals).toHaveLength(2);
      expect(parsedComplete.snapshot.animalPhotos).toHaveLength(2);
      expect(parsedComplete.photosReconstructed).toBe(2);
    }

    const streamedPhotosChunks: Uint8Array[] = [];
    const photosSummary = await streamPhotosOnlyZipArchive(snap, (chunk) => {
      streamedPhotosChunks.push(chunk);
    });
    const photosBytes = new Uint8Array(photosSummary.totalZipBytes);
    offset = 0;
    for (const c of streamedPhotosChunks) {
      photosBytes.set(c, offset);
      offset += c.byteLength;
    }
    const syncPhotos = buildPhotosOnlyZipArchive(snap);
    expect(photosSummary.photoCount).toBe(syncPhotos.photoCount);
    const parsedPhotos = parseBackupArchiveInput(photosBytes, 'streamed-photos.zip', snap.settings);
    expect(parsedPhotos.kind).toBe('photos_only');
    if (parsedPhotos.kind === 'photos_only') {
      expect(parsedPhotos.photos).toHaveLength(2);
    }
  });

  it('streams off-thread ZIP archives directly into OPFS /tmp when OPFS is available and falls back to bytes when unavailable', async () => {
    const snap = makeTestSnapshot();
    const opfsMock = createSimpleOpfsMock();
    setOpfsRootResolverForTest(async () => opfsMock.rootHandle);

    const completeTmp = await buildCompleteBackupZipToOpfsTmpOffThread(snap);
    expect(completeTmp.opfsTempFileName).toBeTruthy();
    expect(completeTmp.bytes).toBeUndefined();
    expect(completeTmp.blob).toBeDefined();
    expect(opfsMock.dirs.get('tmp')?.has(completeTmp.opfsTempFileName!)).toBe(true);

    const parsedComplete = parseBackupArchiveInput(
      new Uint8Array(await completeTmp.blob!.arrayBuffer()),
      'opfs-complete.zip',
      snap.settings
    );
    expect(parsedComplete.kind).toBe('full_snapshot');

    const photosTmp = await buildPhotosOnlyZipToOpfsTmpOffThread(snap);
    expect(photosTmp.opfsTempFileName).toBeTruthy();
    expect(photosTmp.blob).toBeDefined();
    expect(opfsMock.dirs.get('tmp')?.has(photosTmp.opfsTempFileName!)).toBe(true);

    // Without OPFS, falls back cleanly to Uint8Array bytes
    setOpfsRootResolverForTest(null);
    const originalNav = globalThis.navigator;
    vi.stubGlobal('navigator', {});
    try {
      const fallbackZip = await buildCompleteBackupZipToOpfsTmpOffThread(snap);
      expect(fallbackZip.opfsTempFileName).toBeNull();
      expect(fallbackZip.bytes).toBeDefined();
      expect(fallbackZip.bytes!.byteLength).toBe(fallbackZip.byteSize);
    } finally {
      vi.stubGlobal('navigator', originalNav);
    }
  });

  it('stages small (<512 KB) .HTM downloads, streamed JSON chunks, and Web Share payloads through OPFS /tmp and cleans up immediately', async () => {
    vi.useFakeTimers();
    const {
      downloadTextChunks,
      downloadTextFile,
      shareBinaryFileOrDownload,
      shareTextFileOrDownload,
    } = await import('../../utils/webFileActions');

    const opfsMock = createSimpleOpfsMock();
    setOpfsRootResolverForTest(async () => opfsMock.rootHandle);

    const clickedAnchors: Array<{ download: string; href: string }> = [];
    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => {
      const u = `blob:mock-${createdUrls.length + 1}`;
      createdUrls.push(u);
      return u;
    });
    URL.revokeObjectURL = vi.fn((u: string) => {
      revokedUrls.push(u);
    });

    const fakeBody = { appendChild: vi.fn(), removeChild: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const anchor = {
          href: '',
          download: '',
          parentNode: fakeBody,
          click: () => {
            clickedAnchors.push({ download: anchor.download, href: anchor.href });
          },
        };
        return anchor;
      }),
      body: fakeBody,
    });

    try {
      // 1. Small (< 512 KB) Printable .HTM pedigree should still stage through OPFS /tmp
      await downloadTextFile('clover-pedigree.htm', '<html><body>Small 12 KB Pedigree</body></html>', 'text/html');
      expect(clickedAnchors).toHaveLength(1);
      expect(clickedAnchors[0].download).toBe('clover-pedigree.htm');
      expect(opfsMock.dirs.get('tmp')?.size).toBe(1);

      await vi.advanceTimersByTimeAsync(4500);
      expect(revokedUrls).toHaveLength(1);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);

      // 2. shareTextFileOrDownload stages through OPFS /tmp and cleans up immediately on share resolve
      const shareSpy = vi.fn(async () => {});
      vi.stubGlobal('navigator', {
        canShare: vi.fn(() => true),
        share: shareSpy,
      });

      const sharedRes = await shareTextFileOrDownload({
        filename: 'cage-card.htm',
        content: '<html><body>Cage Card</body></html>',
        mimeType: 'text/html',
        title: 'Cage Card',
      });
      expect(sharedRes).toBe('shared');
      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);

      // 3. shareBinaryFileOrDownload falling back to download hands off the staged /tmp blob without double-writing
      const writesBeforeFallback = opfsMock.getWriteCount();
      vi.stubGlobal('navigator', {
        canShare: vi.fn(() => true),
        share: vi.fn(async () => {
          throw new Error('Share sheet dismissed');
        }),
      });
      const fallbackRes = await shareBinaryFileOrDownload({
        filename: 'support-bundle.zip',
        bytes: new Uint8Array([80, 75, 3, 4]),
        mimeType: 'application/zip',
        title: 'Support Bundle',
      });
      expect(fallbackRes).toBe('downloaded');
      expect(opfsMock.getWriteCount()).toBe(writesBeforeFallback + 1);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(1);

      await vi.advanceTimersByTimeAsync(4500);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);

      // 4. downloadTextChunks streams JSON backup chunks directly into OPFS /tmp
      const snap = makeTestSnapshot();
      await downloadTextChunks(
        'streamed-backup.json',
        generateBarnBackupJsonChunks(snap),
        'application/json'
      );
      expect(clickedAnchors.some((a) => a.download === 'streamed-backup.json')).toBe(true);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(1);
      await vi.advanceTimersByTimeAsync(4500);
      expect(opfsMock.dirs.get('tmp')?.size).toBe(0);
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});

describe('Canvas memory guardrails, OffscreenCanvas probe, sequential hydration & iOS PWA shares', () => {
  it('probes OffscreenCanvas 2D context before worker usage and releases probe backing store', async () => {
    const { probeOffscreenCanvas2dSupport, releaseCanvas } = await import('../webImageOptimizer');

    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(probeOffscreenCanvas2dSupport()).toBe(false);

    const widthHistory: number[] = [];
    const heightHistory: number[] = [];
    const clearRect = vi.fn();

    class NullCtxOffscreenCanvas {
      private _w: number;
      private _h: number;
      constructor(w: number, h: number) {
        this._w = w;
        this._h = h;
      }
      get width() {
        return this._w;
      }
      set width(v: number) {
        widthHistory.push(v);
        this._w = v;
      }
      get height() {
        return this._h;
      }
      set height(v: number) {
        heightHistory.push(v);
        this._h = v;
      }
      getContext() {
        return null;
      }
    }
    vi.stubGlobal('OffscreenCanvas', NullCtxOffscreenCanvas);
    expect(probeOffscreenCanvas2dSupport()).toBe(false);
    expect(widthHistory).toEqual([1, 0]);
    expect(heightHistory).toEqual([1, 0]);

    class ThrowingCtxOffscreenCanvas {
      width = 1;
      height = 1;
      getContext() {
        throw new Error('2D unavailable in worker');
      }
    }
    vi.stubGlobal('OffscreenCanvas', ThrowingCtxOffscreenCanvas);
    expect(probeOffscreenCanvas2dSupport()).toBe(false);

    const sequence: string[] = [];
    class WorkingOffscreenCanvas {
      private _w: number;
      private _h: number;
      constructor(w: number, h: number) {
        this._w = w;
        this._h = h;
      }
      get width() {
        return this._w;
      }
      set width(v: number) {
        sequence.push(`w:${v}`);
        this._w = v;
      }
      get height() {
        return this._h;
      }
      set height(v: number) {
        sequence.push(`h:${v}`);
        this._h = v;
      }
      getContext(type: string) {
        if (type !== '2d') return null;
        return {
          clearRect: (...args: number[]) => {
            clearRect(...args);
            sequence.push('clear');
          },
        };
      }
    }
    vi.stubGlobal('OffscreenCanvas', WorkingOffscreenCanvas);
    expect(probeOffscreenCanvas2dSupport()).toBe(true);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(sequence).toEqual(['w:1', 'h:1', 'clear', 'w:0', 'h:0']);

    sequence.length = 0;
    const standaloneCanvas = new WorkingOffscreenCanvas(800, 600) as unknown as OffscreenCanvas;
    releaseCanvas(standaloneCanvas);
    expect(sequence).toEqual(['w:1', 'h:1', 'clear', 'w:0', 'h:0']);
    expect(standaloneCanvas.width).toBe(0);
    expect(standaloneCanvas.height).toBe(0);
  });

  it('caps DPR via getEffectiveCanvasDevicePixelRatio and enforces constrained area ceiling', async () => {
    const { enforceCanvasDimensions, getEffectiveCanvasDevicePixelRatio } = await import(
      '../webImageOptimizer'
    );

    vi.stubGlobal('window', { devicePixelRatio: 3 });
    expect(getEffectiveCanvasDevicePixelRatio(false)).toBe(2);
    expect(getEffectiveCanvasDevicePixelRatio(true)).toBe(1);

    vi.stubGlobal('window', { devicePixelRatio: 0 });
    expect(getEffectiveCanvasDevicePixelRatio(false)).toBe(1);

    const standardCap = enforceCanvasDimensions(5000, 5000, false);
    expect(standardCap.wasClamped).toBe(true);
    expect(standardCap.width * standardCap.height).toBeLessThanOrEqual(16_000_000);

    const constrainedCap = enforceCanvasDimensions(3000, 2000, true);
    expect(constrainedCap.wasClamped).toBe(true);
    expect(constrainedCap.width * constrainedCap.height).toBeLessThanOrEqual(3_000_000);
  });

  it('hydrates photos sequentially in bounded batches and safely revokes only blob: URLs', async () => {
    const { revokeBlobUrlIfNeeded } = await import('../photoHydration');
    const revoked: string[] = [];
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn((u: string) => {
      revoked.push(u);
    });

    try {
      revokeBlobUrlIfNeeded('data:image/webp;base64,AAAA');
      revokeBlobUrlIfNeeded('https://example.com/photo.jpg');
      revokeBlobUrlIfNeeded('');
      revokeBlobUrlIfNeeded(null);
      expect(revoked).toHaveLength(0);

      revokeBlobUrlIfNeeded('blob:https://example.test/123');
      expect(revoked).toEqual(['blob:https://example.test/123']);
    } finally {
      URL.revokeObjectURL = origRevoke;
    }

    const baseSnap = makeTestSnapshot();
    const extraPhotos: AnimalPhoto[] = Array.from({ length: 5 }, (_, idx) => ({
      ...baseSnap.animalPhotos![0],
      id: `photo-seq-${idx}`,
      dataUrl: '',
    }));
    const snap: BarnDatabaseSnapshot = {
      ...baseSnap,
      animalPhotos: extraPhotos,
    };

    let activeFetches = 0;
    let peakConcurrentFetches = 0;
    const chunkCalls: string[][] = [];

    const hydrated = await hydrateSnapshotWithPhotoDataUrls(
      snap,
      async (ids) => {
        activeFetches += 1;
        peakConcurrentFetches = Math.max(peakConcurrentFetches, activeFetches);
        chunkCalls.push(ids);
        await Promise.resolve();
        activeFetches -= 1;
        return Object.fromEntries(ids.map((id) => [id, `data:image/png;base64,${id}`]));
      },
      undefined,
      undefined,
      { batchSize: 2 }
    );

    expect(peakConcurrentFetches).toBe(1);
    expect(chunkCalls).toEqual([
      ['photo-seq-0', 'photo-seq-1'],
      ['photo-seq-2', 'photo-seq-3'],
      ['photo-seq-4'],
    ]);
    expect(hydrated.animalPhotos!.every((p) => p.dataUrl.startsWith('data:image/png;base64,'))).toBe(
      true
    );
  });

  it('uses files-only navigator.canShare/share for iOS standalone PWA, ignores AbortError cleanly, and surfaces non-abort errors', async () => {
    const {
      downloadTextFile,
      isFileShareAbortError,
      isInstalledIosPwa,
      shareTextFileOrDownload,
    } = await import('../../utils/webFileActions');

    const abortErr = new Error('User cancelled');
    abortErr.name = 'AbortError';
    expect(isFileShareAbortError(abortErr)).toBe(true);
    expect(isFileShareAbortError(new Error('Other'))).toBe(false);

    const anchorClickSpy = vi.fn();
    const revokeSpy = vi.fn();
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:ios-fallback');
    URL.revokeObjectURL = revokeSpy;

    const fakeBody = { appendChild: vi.fn(), removeChild: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        parentNode: fakeBody,
        click: anchorClickSpy,
      })),
      body: fakeBody,
    });

    try {
      const shareCalls: ShareData[] = [];
      const canShareCalls: ShareData[] = [];

      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
        canShare: vi.fn((data: ShareData) => {
          canShareCalls.push(data);
          return Boolean(data.files && data.files.length === 1);
        }),
        share: vi.fn(async (data: ShareData) => {
          shareCalls.push(data);
        }),
      });

      expect(isInstalledIosPwa()).toBe(true);

      // 1. Passes ONLY `{ files: [file] }` with no extra title/text/url keys
      const sharedOutcome = await shareTextFileOrDownload({
        filename: 'pedigree.htm',
        content: '<html><body>Test</body></html>',
        mimeType: 'text/html',
        title: 'Pedigree Certificate',
        text: 'Ignored on iOS standalone',
      });
      expect(sharedOutcome).toBe('shared');
      expect(canShareCalls).toHaveLength(1);
      expect(shareCalls).toHaveLength(1);
      expect(Object.keys(shareCalls[0])).toEqual(['files']);
      expect(shareCalls[0].title).toBeUndefined();
      expect(shareCalls[0].text).toBeUndefined();
      expect(shareCalls[0].url).toBeUndefined();
      expect(anchorClickSpy).not.toHaveBeenCalled();

      // 2. AbortError returns 'cancelled' cleanly without falling back to <a download> or throwing
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
        canShare: vi.fn(() => true),
        share: vi.fn(async () => {
          throw abortErr;
        }),
      });

      const cancelledOutcome = await shareTextFileOrDownload({
        filename: 'pedigree.htm',
        content: '<html></html>',
        mimeType: 'text/html',
        title: 'Pedigree',
      });
      expect(cancelledOutcome).toBe('cancelled');
      expect(anchorClickSpy).not.toHaveBeenCalled();

      // 3. When canShare rejects files on iOS standalone PWA, surfaces visible error instead of silent swallow or broken anchor
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
        canShare: vi.fn(() => false),
        share: vi.fn(async () => {}),
      });

      await expect(
        shareTextFileOrDownload({
          filename: 'pedigree.htm',
          content: '<html></html>',
          mimeType: 'text/html',
          title: 'Pedigree',
        })
      ).rejects.toThrow(/iOS Home Screen/i);
      expect(anchorClickSpy).not.toHaveBeenCalled();

      // 4. Desktop/non-iOS anchor download fallback revokes blob: immediately if click() fails
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0',
        platform: 'Win32',
        maxTouchPoints: 0,
      });
      anchorClickSpy.mockImplementationOnce(() => {
        throw new Error('Blocked popup');
      });
      await expect(downloadTextFile('test.txt', 'hello', 'text/plain')).rejects.toThrow(
        'Blocked popup'
      );
      expect(revokeSpy).toHaveBeenCalledWith('blob:ios-fallback');
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});


```

## `src/storage/__tests__/restrictedBrowserAndBfcache.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Animal } from '../../core/models';

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
  default: path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
}));

import {
  notifyBackgroundTransition,
  notifyPageHide,
  registerFreezeLifecycleListener,
  resetBackgroundFreezeCoordinatorForTests,
} from '../backgroundFreezeCoordinator';
import {
  subscribeCrossTabDbCommits,
  withCrossTabLock,
} from '../localSyncChannels';
import {
  getActiveOpfsHandleCountForTests,
  OpfsCloseableHandle,
  resetOpfsProbesForTests,
  trackActiveOpfsHandle,
} from '../opfsTempStream';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  getSafeWebLocks,
  getTrackedActiveResourceCountsForTests,
  probeBroadcastChannelSupport,
  probeLocalStorageSupport,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
  trackBroadcastChannel,
} from '../storageProbes';
import { WebSqliteAdapter } from '../webSqliteAdapter';

function makeTestAnimal(id: string, name: string): Animal {
  const now = '2026-04-01T12:00:00.000Z';
  return {
    id,
    tattoo: id.toUpperCase(),
    name,
    species: 'Rabbit',
    breed: 'Rex',
    variety: 'Castor',
    sex: 'Male',
    status: 'Active',
    archived: false,
    needsAttention: false,
    ignoredConflicts: [],
    birthDateIso: '2025-05-01',
    weightGrams: 3200,
    genotype: [],
    genotypeRaw: '',
    rufusLevel: '',
    suspectedCarrierOf: [],
    confirmedCarrierOf: [],
    clearedCarrierOf: [],
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: 'R-1',
    breederName: 'Copper Creek',
    ownerName: 'Copper Creek',
    ownershipType: 'Owned',
    culled: false,
    cullDateIso: '',
    cullReason: '',
    deceasedDateIso: '',
    deathCause: '',
    soldDateIso: '',
    salePriceCents: 0,
    purchaseCostCents: 0,
    buyerName: '',
    sireId: '',
    damId: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(() => {
  resetBackgroundFreezeCoordinatorForTests();
  resetOpfsProbesForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Restricted-Browser Probes, Web Lock Timeouts, bfcache Release & Ephemeral Mode', () => {
  it('safely catches throwing getters in Safari Lockdown Mode for localStorage, indexedDB, navigator.locks, and BroadcastChannel', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('localStorage disabled', 'SecurityError');
      },
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('indexedDB disabled', 'SecurityError');
      },
    });
    vi.stubGlobal('navigator', {
      get locks() {
        throw new DOMException('Web Locks disabled', 'SecurityError');
      },
    });
    vi.stubGlobal(
      'BroadcastChannel',
      class ThrowingBroadcastChannel {
        constructor() {
          throw new DOMException('BroadcastChannel disabled', 'SecurityError');
        }
      }
    );

    expect(getSafeLocalStorage()).toBeNull();
    expect(probeLocalStorageSupport()).toEqual({ available: false, writable: false });
    expect(getSafeIndexedDb()).toBeNull();
    expect(getSafeWebLocks()).toBeNull();
    expect(probeBroadcastChannelSupport()).toBe(false);

    // Cleanup property descriptors we replaced with getters
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('withCrossTabLock aborts hung Web Lock after timeoutMs and executes task exactly once, plus survives SecurityError', async () => {
    let observedAbort = false;
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(
          (
            _name: string,
            opts: { mode?: string; signal?: AbortSignal },
            _cb: () => Promise<unknown>
          ) => {
            return new Promise((_resolve, reject) => {
              opts.signal?.addEventListener('abort', () => {
                observedAbort = true;
                reject(new DOMException('Lock request aborted', 'AbortError'));
              });
            });
          }
        ),
      },
    });

    const taskSpy = vi.fn(async () => 'timeout-fallback-ok');
    const result = await withCrossTabLock('test-hung-lock', taskSpy, { timeoutMs: 25 });
    expect(result).toBe('timeout-fallback-ok');
    expect(observedAbort).toBe(true);
    expect(taskSpy).toHaveBeenCalledTimes(1);

    // SecurityError rejection from locks.request falls back cleanly without failing
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(() => Promise.reject(new DOMException('Blocked', 'SecurityError'))),
      },
    });
    const secTaskSpy = vi.fn(async () => 'security-fallback-ok');
    expect(await withCrossTabLock('test-sec-lock', secTaskSpy)).toBe('security-fallback-ok');
    expect(secTaskSpy).toHaveBeenCalledTimes(1);
  });

  it('releases active OPFS handles, IDB transactions/connections, and BroadcastChannels on pagehide and visibilitychange(hidden), and reopens subscription channel on visible', async () => {
    const windowListeners = new Map<string, Set<(ev: Event) => void>>();
    vi.stubGlobal('window', {
      addEventListener(type: string, cb: (ev: Event) => void) {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type)!.add(cb);
      },
      removeEventListener(type: string, cb: (ev: Event) => void) {
        windowListeners.get(type)?.delete(cb);
      },
    });

    const openChannels = new Set<MockBc>();
    class MockBc {
      public closed = false;
      private listeners = new Set<(ev: MessageEvent) => void>();
      constructor(public readonly name: string) {
        openChannels.add(this);
      }
      addEventListener(type: string, cb: (ev: MessageEvent) => void) {
        if (type === 'message') this.listeners.add(cb);
      }
      removeEventListener(type: string, cb: (ev: MessageEvent) => void) {
        if (type === 'message') this.listeners.delete(cb);
      }
      postMessage(data: unknown) {
        for (const peer of openChannels) {
          if (peer === this || peer.name !== this.name || peer.closed) continue;
          for (const cb of peer.listeners) cb({ data } as MessageEvent);
        }
      }
      close() {
        this.closed = true;
        openChannels.delete(this);
      }
    }
    vi.stubGlobal('BroadcastChannel', MockBc);

    const opfsCloseSpy = vi.fn(async () => {});
    const fakeOpfsHandle: OpfsCloseableHandle = {
      write: () => 0,
      flush: async () => {},
      getSize: async () => 0,
      truncate: async () => {},
      close: opfsCloseSpy,
    };
    trackActiveOpfsHandle(fakeOpfsHandle);

    const idbTxAbortSpy = vi.fn();
    const idbDbCloseSpy = vi.fn();
    trackActiveIdbTransaction({
      abort: idbTxAbortSpy,
      addEventListener: () => {},
    } as unknown as IDBTransaction);
    trackActiveIdbConnection({
      close: idbDbCloseSpy,
      onversionchange: null,
    } as unknown as IDBDatabase);

    const adhocBc = new MockBc('adhoc');
    trackBroadcastChannel(adhocBc as unknown as BroadcastChannel);

    const releaseSpy = vi.fn();
    const unsubLifecycle = registerFreezeLifecycleListener({
      id: 'bfcache-probe-test',
      onReleaseResources: releaseSpy,
    });

    const delivered: number[] = [];
    const unsubCommits = subscribeCrossTabDbCommits(
      (ev) => delivered.push(ev.epoch),
      { selfTabId: 'tab-listener' }
    );
    expect(openChannels.size).toBe(2); // adhoc + subscription channel

    // Simulate visibilitychange -> hidden
    notifyBackgroundTransition('hidden');
    await Promise.resolve();

    expect(opfsCloseSpy).toHaveBeenCalledTimes(1);
    expect(getActiveOpfsHandleCountForTests()).toBe(0);
    expect(idbTxAbortSpy).toHaveBeenCalledTimes(1);
    expect(idbDbCloseSpy).toHaveBeenCalledTimes(1);
    expect(adhocBc.closed).toBe(true);
    expect(openChannels.size).toBe(0);
    expect(getTrackedActiveResourceCountsForTests()).toEqual({
      idbConnections: 0,
      idbTransactions: 0,
      broadcastChannels: 0,
    });
    expect(releaseSpy).toHaveBeenCalledWith('hidden');

    // Simulate returning to visible -> subscription BroadcastChannel auto-recovers
    notifyBackgroundTransition('visible');
    expect(openChannels.size).toBe(1);

    const peerSender = new MockBc('community_pedigree_tab_sync_v1');
    peerSender.postMessage({
      epoch: 42,
      writerTabId: 'tab-other',
      committedAtIso: '2026-04-01T12:00:00.000Z',
    });
    expect(delivered).toEqual([42]);
    peerSender.close();

    // Even if state was already hidden, notifyPageHide MUST still fire resource release
    notifyBackgroundTransition('hidden');
    notifyPageHide();
    expect(releaseSpy).toHaveBeenCalledWith('pagehide');

    unsubCommits();
    unsubLifecycle();
  });

  it('degrades WebSqliteAdapter cleanly into ephemeral session mode when IndexedDB and localStorage are blocked (Firefox Private / Safari Lockdown)', async () => {
    vi.stubGlobal('indexedDB', {
      open() {
        const req: {
          result: null;
          error: DOMException;
          onerror: (() => void) | null;
          onsuccess: null;
          onupgradeneeded: null;
          onblocked: null;
        } = {
          result: null,
          error: new DOMException(
            'A mutation operation was attempted on a database that did not allow mutations.',
            'InvalidStateError'
          ),
          onerror: null,
          onsuccess: null,
          onupgradeneeded: null,
          onblocked: null,
        };
        queueMicrotask(() => req.onerror?.());
        return req;
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('SecurityError: localStorage blocked', 'SecurityError');
      },
    });
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(() => Promise.reject(new DOMException('Blocked', 'SecurityError'))),
      },
    });

    try {
      const adapter = new WebSqliteAdapter('private-tab');
      const initial = await adapter.initialize({ lightweightPhotos: true });
      expect(initial.animals.length).toBeGreaterThan(0);
      expect(adapter.isEphemeralMode()).toBe(true);
      expect(adapter.engineName).toContain('Ephemeral');

      // CRUD writes must succeed in memory without throwing
      const custom = makeTestAnimal('ephem-1', 'Ephemeral Buck');
      await adapter.saveAnimal(custom);
      const reloaded = await adapter.loadSnapshot({ lightweightPhotos: true });
      expect(reloaded.animals.some((a) => a.id === 'ephem-1')).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }
  });

  it('still propagates QuotaExceededError on write instead of masking quota exhaustion as ephemeral mode', async () => {
    const kv = new Map<string, unknown>();
    let failWritesWithQuota = false;

    vi.stubGlobal('indexedDB', {
      open() {
        const req: any = { result: null, error: null };
        queueMicrotask(() => {
          req.result = {
            close() {},
            transaction() {
              const tx: any = { oncomplete: null, onerror: null, onabort: null, error: null };
              tx.objectStore = () => ({
                get(key: string) {
                  const r: any = { result: undefined };
                  queueMicrotask(() => {
                    r.result = kv.get(key);
                    r.onsuccess?.();
                  });
                  return r;
                },
                put(val: unknown, key: string) {
                  queueMicrotask(() => {
                    if (failWritesWithQuota) {
                      const err = new Error('Storage full');
                      err.name = 'QuotaExceededError';
                      tx.error = err;
                      tx.onerror?.();
                    } else {
                      kv.set(key, val);
                      tx.oncomplete?.();
                    }
                  });
                  return {};
                },
                delete(key: string) {
                  kv.delete(key);
                  queueMicrotask(() => tx.oncomplete?.());
                  return {};
                },
              });
              return tx;
            },
          };
          req.onsuccess?.();
        });
        return req;
      },
    });
    vi.stubGlobal('navigator', {});

    const adapter = new WebSqliteAdapter('quota-tab');
    await adapter.initialize({ lightweightPhotos: true });
    expect(adapter.isEphemeralMode()).toBe(false);

    failWritesWithQuota = true;
    await expect(
      adapter.saveAnimal(makeTestAnimal('quota-fail-1', 'Too Big'))
    ).rejects.toThrow(/QuotaExceededError/);
    expect(adapter.isEphemeralMode()).toBe(false);
  });
});
```

## `src/utils/comboboxNav.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure keyboard-navigation helpers for WAI-ARIA comboboxes & listboxes.
 */

export function clampComboboxIndex(currentIndex: number, totalItems: number): number {
  if (totalItems <= 0 || currentIndex < 0) {
    return -1;
  }
  return Math.min(currentIndex, totalItems - 1);
}

/**
 * Computes the next enabled option index for ArrowDown, ArrowUp, Home, and End keys.
 * Returns -1 when no enabled options exist.
 */
export function stepEnabledComboboxIndex(
  currentIndex: number,
  totalItems: number,
  key: string,
  isDisabled?: (index: number) => boolean
): number {
  if (totalItems <= 0) {
    return -1;
  }

  const checkDisabled = (idx: number): boolean => (isDisabled ? Boolean(isDisabled(idx)) : false);

  if (key === 'Home') {
    for (let idx = 0; idx < totalItems; idx++) {
      if (!checkDisabled(idx)) return idx;
    }
    return -1;
  }

  if (key === 'End') {
    for (let idx = totalItems - 1; idx >= 0; idx--) {
      if (!checkDisabled(idx)) return idx;
    }
    return -1;
  }

  if (key !== 'ArrowDown' && key !== 'ArrowUp') {
    return clampComboboxIndex(currentIndex, totalItems);
  }

  const delta = key === 'ArrowDown' ? 1 : -1;
  let candidate =
    currentIndex < 0 || currentIndex >= totalItems
      ? key === 'ArrowDown'
        ? 0
        : totalItems - 1
      : (currentIndex + delta + totalItems) % totalItems;

  for (let steps = 0; steps < totalItems; steps++) {
    if (!checkDisabled(candidate)) {
      return candidate;
    }
    candidate = (candidate + delta + totalItems) % totalItems;
  }

  return -1;
}
```

## `src/utils/es2018Shims.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Minimal zero-dependency ES2018 runtime shims.
 * Targets 2018-era browsers (Chrome 68+, Safari 12+, Firefox 63+, Edge 79+ — and older where possible)
 * without core-js bloat:
 * - globalThis (ES2020)
 * - Promise.allSettled (ES2020)
 * - Object.fromEntries (ES2019)
 * - Blob.prototype.arrayBuffer / Blob.prototype.text (Chrome 76+ / Safari 14+ -> FileReader fallback)
 * - String.prototype.trimStart / trimEnd (Chrome 66+ / Safari 12+)
 */

type MarkedShimFn = ((...args: any[]) => any) & { __pedigreeEs2018Shim?: boolean };

export function isFileReaderSupported(): boolean {
  try {
    if (typeof FileReader !== 'function') return false;
    const probe = new FileReader();
    return Boolean(probe && typeof probe.readAsArrayBuffer === 'function');
  } catch {
    return false;
  }
}

/**
 * Reads any Blob/File into an ArrayBuffer safely across modern browsers (preferring native
 * `blob.arrayBuffer()`), legacy 2018 browsers (`FileReader`), and Safari Lockdown Mode (`Response`).
 */
export async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  const candidate = (blob as unknown as { arrayBuffer?: MarkedShimFn })?.arrayBuffer;
  if (typeof candidate === 'function' && !candidate.__pedigreeEs2018Shim) {
    try {
      return await Promise.resolve(candidate.call(blob));
    } catch {
      // Fall through cleanly if native method rejects or is blocked
    }
  }

  if (isFileReaderSupported()) {
    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new Error('FileReader did not return an ArrayBuffer.'));
          }
        };
        reader.onerror = () => {
          reject(reader.error || new Error('Failed to read binary file data.'));
        };
        reader.onabort = () => {
          reject(new Error('Binary file read was aborted.'));
        };
        reader.readAsArrayBuffer(blob);
      });
    } catch {
      // Fall through cleanly to Response fallback
    }
  }

  if (typeof Response === 'function') {
    try {
      return await new Response(blob).arrayBuffer();
    } catch {
      // Fall through to structured error below
    }
  }

  throw new Error('Blob binary reader is unavailable in this browser.');
}

/**
 * Reads any Blob/File as UTF-8 text safely, preferring native `blob.text()` first, then
 * `FileReader`, `Response`, and `TextDecoder` fallbacks.
 */
export async function readBlobAsText(blob: Blob): Promise<string> {
  const candidate = (blob as unknown as { text?: MarkedShimFn })?.text;
  if (typeof candidate === 'function' && !candidate.__pedigreeEs2018Shim) {
    try {
      return await Promise.resolve(candidate.call(blob));
    } catch {
      // Fall through cleanly if native method rejects or is blocked
    }
  }

  if (isFileReaderSupported()) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.onerror = () => {
          reject(reader.error || new Error('Failed to read text file data.'));
        };
        reader.onabort = () => {
          reject(new Error('Text file read was aborted.'));
        };
        reader.readAsText(blob, 'utf-8');
      });
    } catch {
      // Fall through cleanly to Response / TextDecoder fallback
    }
  }

  if (typeof Response === 'function') {
    try {
      return await new Response(blob).text();
    } catch {
      // Fall through to ArrayBuffer decode fallback
    }
  }

  const buf = await readBlobAsArrayBuffer(blob);
  if (typeof TextDecoder === 'function') {
    return new TextDecoder('utf-8').decode(new Uint8Array(buf));
  }
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function defineNonEnumerableMethod(
  proto: Record<string, any> | undefined,
  methodName: string,
  fn: MarkedShimFn
): void {
  if (!proto || typeof proto[methodName] === 'function') return;
  try {
    Object.defineProperty(proto, methodName, {
      value: fn,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    try {
      proto[methodName] = fn;
    } catch {
      // Ignore frozen prototypes
    }
  }
}

export function ensureEs2018Globals(host?: Record<string, unknown>): void {
  const g: Record<string, any> | undefined =
    host ??
    (typeof globalThis !== 'undefined'
      ? (globalThis as Record<string, any>)
      : typeof window !== 'undefined'
      ? (window as Record<string, any>)
      : typeof self !== 'undefined'
      ? (self as Record<string, any>)
      : typeof global !== 'undefined'
      ? (global as Record<string, any>)
      : undefined);

  if (!g) return;

  if (typeof g.globalThis === 'undefined') {
    try {
      g.globalThis = g;
    } catch {
      // Ignore read-only global hosts
    }
  }

  const promiseObj = (g.Promise ?? (typeof Promise === 'function' ? Promise : undefined)) as
    | Record<string, any>
    | undefined;

  if (promiseObj && typeof promiseObj['allSettled'] !== 'function') {
    promiseObj['allSettled'] = function allSettledShim(values: Iterable<unknown>): Promise<unknown[]> {
      const items = Array.from(values);
      return promiseObj.all(
        items.map((item) =>
          promiseObj.resolve(item).then(
            (value: unknown) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ status: 'rejected' as const, reason })
          )
        )
      );
    };
  }

  const objectObj = (g.Object ?? Object) as Record<string, any>;
  if (objectObj && typeof objectObj['fromEntries'] !== 'function') {
    objectObj['fromEntries'] = function fromEntriesShim(
      entries: Iterable<readonly [PropertyKey, unknown]>
    ): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      if (!entries) return out;
      for (const pair of entries) {
        if (pair != null) {
          out[String(pair[0])] = pair[1];
        }
      }
      return out;
    };
  }

  const blobCtor = (g.Blob ?? (typeof Blob === 'function' ? Blob : undefined)) as
    | { prototype?: Record<string, any> }
    | undefined;
  if (blobCtor?.prototype) {
    const arrayBufferShim: MarkedShimFn = function blobArrayBufferShim(this: Blob) {
      return readBlobAsArrayBuffer(this);
    };
    arrayBufferShim.__pedigreeEs2018Shim = true;
    defineNonEnumerableMethod(blobCtor.prototype, 'arrayBuffer', arrayBufferShim);

    const textShim: MarkedShimFn = function blobTextShim(this: Blob) {
      return readBlobAsText(this);
    };
    textShim.__pedigreeEs2018Shim = true;
    defineNonEnumerableMethod(blobCtor.prototype, 'text', textShim);
  }

  const stringCtor = (g.String ?? String) as { prototype?: Record<string, any> } | undefined;
  if (stringCtor?.prototype) {
    const trimStartShim: MarkedShimFn = function stringTrimStartShim(this: string) {
      return typeof (this as any).trimLeft === 'function'
        ? (this as any).trimLeft()
        : String(this).replace(/^[\s\uFEFF\xA0]+/, '');
    };
    defineNonEnumerableMethod(stringCtor.prototype, 'trimStart', trimStartShim);

    const trimEndShim: MarkedShimFn = function stringTrimEndShim(this: string) {
      return typeof (this as any).trimRight === 'function'
        ? (this as any).trimRight()
        : String(this).replace(/[\s\uFEFF\xA0]+$/, '');
    };
    defineNonEnumerableMethod(stringCtor.prototype, 'trimEnd', trimEndShim);
  }
}

ensureEs2018Globals();
```

## `src/utils/googleCalendarClient.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client-Side Google Calendar API & Sign-In Integration.
 *
 * Follows Google Workspace client-side auth rules:
 * - Access tokens are cached strictly in memory (never in localStorage/sessionStorage).
 * - Automatically clears cached tokens when the user signs out.
 * - Callers fall back cleanly to offline `.ics` generation when offline, unauthenticated,
 *   or when the Google Calendar API cannot be reached.
 */

import type { Auth, User } from 'firebase/auth';
import {
  buildGoogleCalendarEventPayload,
  CalendarExportContext,
} from '../core/calendarExport';
import { BarnTask, CalendarSyncSettings } from '../core/models';

import { logDiagnosticEvent } from '../storage/crashLogger';
import { recordServerDateHeaderSkew } from '../storage/storageProtection';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;

let cachedAuth: Auth | null = null;
let authInitAttempted = false;
let authInitPromise: Promise<Auth | null> | null = null;

async function getFirebaseAuthSafe(): Promise<Auth | null> {
  if (cachedAuth) return cachedAuth;
  if (authInitAttempted) return null;
  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    try {
      const [{ getApp, getApps, initializeApp }, { getAuth }, { default: firebaseConfig }] =
        await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
          import('../../firebase-applet-config.json'),
        ]);
      const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      cachedAuth = getAuth(firebaseApp);
      return cachedAuth;
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message:
          'Corrective action: Firebase Auth unavailable during startup — continuing in offline .ICS calendar mode',
        error: err,
      });
      return null;
    } finally {
      authInitAttempted = true;
      authInitPromise = null;
    }
  })();

  return authInitPromise;
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary: boolean;
  timeZone?: string;
}

export interface GoogleCalendarPushResult {
  createdCount: number;
  failedCount: number;
  htmlLinks: string[];
  authExpired: boolean;
  errorMessage?: string;
}

export function initGoogleCalendarAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
): () => void {
  let cancelled = false;
  let unsubscribe = () => {};

  void (async () => {
    const authInstance = await getFirebaseAuthSafe();
    if (cancelled) return;
    if (!authInstance) {
      onAuthFailure?.(null);
      return;
    }
    try {
      const { onAuthStateChanged } = await import('firebase/auth');
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(authInstance, (user: User | null) => {
        if (user && cachedAccessToken) {
          onAuthSuccess?.(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          onAuthFailure?.(user);
        }
      });
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message:
          'Corrective action: Google Calendar auth listener could not attach — using offline .ICS fallback',
        error: err,
      });
      if (!cancelled) {
        onAuthFailure?.(null);
      }
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export async function signInGoogleCalendar(): Promise<{
  user: User;
  accessToken: string;
}> {
  const authInstance = await getFirebaseAuthSafe();
  if (!authInstance) {
    throw new Error('Google Calendar sign-in is unavailable in this browser environment. Use offline .ICS export instead.');
  }
  try {
    isSigningIn = true;
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    for (const scope of GOOGLE_CALENDAR_SCOPES) {
      provider.addScope(scope);
    }
    const result = await signInWithPopup(authInstance, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Calendar access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleCalendar(): Promise<void> {
  cachedAccessToken = null;
  if (!cachedAuth) return;
  await cachedAuth.signOut();
}

export function getGoogleCalendarAccessToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleCalendarUser(): User | null {
  return cachedAuth?.currentUser ?? null;
}

export async function listWritableGoogleCalendars(
  accessToken: string
): Promise<GoogleCalendarOption[]> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  recordServerDateHeaderSkew(res.headers?.get?.('date'));
  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('GOOGLE_AUTH_EXPIRED');
  }
  if (!res.ok) {
    throw new Error(`Could not load Google calendars (${res.status}).`);
  }
  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      primary?: boolean;
      timeZone?: string;
    }>;
  };
  const items = Array.isArray(json.items) ? json.items : [];
  return items
    .filter((c) => typeof c.id === 'string' && c.id.length > 0)
    .map((c) => ({
      id: c.id!,
      summary: c.summary || (c.primary ? 'Primary Calendar' : c.id!),
      primary: Boolean(c.primary),
      timeZone: c.timeZone,
    }));
}

export async function pushTasksToGoogleCalendar(params: {
  accessToken: string;
  calendarId: string;
  tasks: BarnTask[];
  config: Partial<CalendarSyncSettings>;
  barnName: string;
  context?: CalendarExportContext;
}): Promise<GoogleCalendarPushResult> {
  const { accessToken, calendarId, tasks, config, barnName, context } = params;
  const timeZone =
    (typeof Intl !== 'undefined' &&
      Intl.DateTimeFormat().resolvedOptions().timeZone) ||
    'UTC';

  const datedTasks = tasks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
  let createdCount = 0;
  let failedCount = 0;
  const htmlLinks: string[] = [];
  let authExpired = false;
  let errorMessage: string | undefined;

  const targetId = encodeURIComponent(calendarId || 'primary');

  for (const task of datedTasks) {
    const payload = buildGoogleCalendarEventPayload(
      task,
      config,
      barnName,
      timeZone,
      context
    );
    if (!payload) continue;

    try {
      let res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${targetId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      recordServerDateHeaderSkew(res.headers?.get?.('date'));

      // Deterministic event ID already exists on Google Calendar -> update in place (prevents duplicates)
      if (res.status === 409 && payload.id) {
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${targetId}/events/${encodeURIComponent(payload.id)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );
        recordServerDateHeaderSkew(res.headers?.get?.('date'));
      }

      if (res.status === 401 || res.status === 403) {
        cachedAccessToken = null;
        authExpired = true;
        failedCount += datedTasks.length - createdCount - failedCount;
        errorMessage = 'Google Calendar session expired. Please sign in again.';
        break;
      }

      if (!res.ok) {
        failedCount += 1;
        errorMessage = `Google Calendar returned status ${res.status}.`;
        continue;
      }

      const data = (await res.json()) as { htmlLink?: string };
      createdCount += 1;
      if (data.htmlLink) {
        htmlLinks.push(data.htmlLink);
      }
    } catch (err) {
      failedCount += datedTasks.length - createdCount - failedCount;
      errorMessage = err instanceof Error ? err.message : 'Network connection failed.';
      break;
    }
  }

  return {
    createdCount,
    failedCount,
    htmlLinks,
    authExpired,
    errorMessage,
  };
}
```

## `src/utils/lazyRoute.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Route-level code splitting helpers (`lazyNamedRoute`, `RouteLoadingFallback`,
 * and `RouteErrorBoundary`) to reduce startup JS parse/compile memory on mobile devices
 * while keeping chunk-fetch failures recoverable offline and online.
 */

import { AlertTriangle, Home, RefreshCw, RotateCcw } from 'lucide-react';
import React from 'react';
import { logDiagnosticEvent, markCleanSessionExit, recordReactCrash } from '../storage/crashLogger';

type NamedModule = Record<string, unknown>;

export async function loadWithSingleRetry<T extends NamedModule>(
  loader: () => Promise<T>,
  exportName: string,
  routeLabel: string,
  retryDelayMs = 250
): Promise<{ default: React.ComponentType<any> }> {
  try {
    const mod = await loader();
    const resolved = mod[exportName];
    if (!resolved) {
      throw new Error(`Route module "${routeLabel}" did not export "${exportName}".`);
    }
    return { default: resolved as React.ComponentType<any> };
  } catch (firstErr) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'runtime',
      message: `Lazy route chunk load retry for "${routeLabel}"`,
      error: firstErr,
    });
    if (retryDelayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelayMs);
      });
    }
    try {
      const mod = await loader();
      const resolved = mod[exportName];
      if (!resolved) {
        throw new Error(`Route module "${routeLabel}" did not export "${exportName}".`);
      }
      logDiagnosticEvent({
        level: 'info',
        category: 'runtime',
        message: `Corrective action: Recovered lazy route chunk "${routeLabel}" on automatic retry.`,
      });
      return { default: resolved as React.ComponentType<any> };
    } catch (retryErr) {
      logDiagnosticEvent({
        level: 'error',
        category: 'runtime',
        message: `Lazy route chunk "${routeLabel}" failed after retry`,
        error: retryErr,
      });
      throw retryErr;
    }
  }
}

export function lazyNamedRoute<TProps>(
  loader: () => Promise<NamedModule>,
  exportName: string,
  routeLabel: string
): React.LazyExoticComponent<React.ComponentType<TProps>> {
  return React.lazy(() => loadWithSingleRetry(loader, exportName, routeLabel)) as React.LazyExoticComponent<
    React.ComponentType<TProps>
  >;
}

export function RouteLoadingFallback({ label }: { label: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label}`}
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-5 w-48 rounded-lg bg-[var(--barn-subtle)] animate-pulse" />
        <div className="h-4 w-24 rounded-lg bg-[var(--barn-subtle)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-20 rounded-xl bg-[var(--barn-subtle)] animate-pulse" />
        <div className="h-20 rounded-xl bg-[var(--barn-subtle)] animate-pulse" />
        <div className="h-20 rounded-xl bg-[var(--barn-subtle)] animate-pulse" />
      </div>
      <p className="text-xs text-[var(--barn-muted)]">Loading {label}…</p>
    </section>
  );
}

interface RouteErrorBoundaryProps {
  routeKey: string;
  routeLabel: string;
  onNavigateHome: () => void;
  children: React.ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryNonce: number;
}

export class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryNonce: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps): void {
    if (prevProps.routeKey !== this.props.routeKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    recordReactCrash(error, info.componentStack || '');
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return <React.Fragment key={this.state.retryNonce}>{this.props.children}</React.Fragment>;
    }

    const message = this.state.error?.message || 'Unable to load this screen.';
    const looksLikeChunkFailure = /chunk|dynamically imported module|loading css|failed to fetch/i.test(
      message
    );

    return (
      <section
        role="alert"
        className="bg-[var(--barn-surface)] border border-[var(--barn-terracotta)] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[var(--barn-terracotta)]" aria-hidden="true" />
          </div>
          <div className="space-y-1 min-w-0">
            <h2 className="font-display text-lg font-semibold">
              Could not open {this.props.routeLabel}
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              {looksLikeChunkFailure
                ? 'This screen module did not finish loading (often due to an offline connection before caching or a fresh app update). Your saved herd database is intact.'
                : 'An unexpected error interrupted this screen. Your saved offline herd database remains safe.'}
            </p>
            <p className="text-[11px] font-mono text-[var(--barn-danger)] break-words pt-1">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              this.setState((prev) => ({
                hasError: false,
                error: null,
                retryNonce: prev.retryNonce + 1,
              }))
            }
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry Screen
          </button>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onNavigateHome();
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--barn-subtle)]"
          >
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            Back to All Species
          </button>
          <button
            type="button"
            onClick={() => {
              markCleanSessionExit();
              window.location.reload();
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--barn-subtle)]"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Reload App
          </button>
        </div>
      </section>
    );
  }
}
```

## `src/utils/useAccessibleDialog.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Accessible Modal Dialog Hook (`src/utils/useAccessibleDialog.ts`).
 *
 * Provides consistent keyboard & screen-reader dialog behavior across all modals:
 * - Saves previously focused trigger element and restores focus on close/unmount
 * - Traps `Tab` / `Shift+Tab` inside the active (topmost) modal dialog
 * - Handles `Escape` on the topmost `[role="dialog"][aria-modal="true"]` only
 *   (unless prevented by an inner combobox or `closeOnEscape === false`)
 * - Moves initial focus cleanly into the dialog on open
 */

import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled]):not([aria-hidden="true"])',
  'input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"])',
  'select:not([disabled]):not([aria-hidden="true"])',
  'textarea:not([disabled]):not([aria-hidden="true"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
].join(', ');

function getVisibleFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return candidates.filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    return el.getClientRects().length > 0;
  });
}

function isTopmostDialog(container: HTMLElement): boolean {
  const allDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  if (allDialogs.length === 0) return true;
  return allDialogs[allDialogs.length - 1] === container;
}

export interface UseAccessibleDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function useAccessibleDialog<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeOnEscape = true,
  initialFocusRef,
}: UseAccessibleDialogOptions): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const container = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const rafId = window.requestAnimationFrame(() => {
      const targetEl = initialFocusRef?.current;
      if (targetEl && typeof targetEl.focus === 'function') {
        targetEl.focus({ preventScroll: true });
        return;
      }
      if (!container) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && container.contains(active) && active !== container) {
        return;
      }
      const focusables = getVisibleFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus({ preventScroll: true });
      } else {
        container.focus({ preventScroll: true });
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!container || !isTopmostDialog(container)) return;

      if (e.key === 'Escape') {
        if (!e.defaultPrevented && closeOnEscape) {
          e.preventDefault();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusables = getVisibleFocusableElements(container);
        if (focusables.length === 0) {
          e.preventDefault();
          container.focus({ preventScroll: true });
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (!active || !container.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus({ preventScroll: true });
          return;
        }

        if (e.shiftKey) {
          if (active === first || active === container) {
            e.preventDefault();
            last.focus({ preventScroll: true });
          }
        } else if (active === last) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
      if (
        previouslyFocused &&
        previouslyFocused.isConnected &&
        typeof previouslyFocused.focus === 'function'
      ) {
        window.requestAnimationFrame(() => {
          if (previouslyFocused.isConnected) {
            previouslyFocused.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [isOpen, closeOnEscape, initialFocusRef]);

  return dialogRef;
}
```

## `src/utils/useAsyncSubmitLock.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Synchronous + React Rapid-Tap / Double-Submit Race Guard (`src/utils/useAsyncSubmitLock.ts`).
 *
 * Guarantees:
 * - Immediate synchronous `ref` gating blocks <16ms same-frame double-taps before React re-renders.
 * - Guaranteed `try/finally` release so rejected async saves never strand a button disabled.
 * - Optional short post-settle cooldown prevents bounce double-submissions on inline forms.
 * - `useAsyncKeyedLock` isolates concurrent actions per record/row ID for silent inline toggles.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncLockController {
  isLocked: () => boolean;
  isDisposed: () => boolean;
  run: <T>(fn: () => Promise<T> | T) => Promise<{ skipped: boolean; value?: T }>;
  dispose: () => void;
}

export function createAsyncLockController(options?: {
  postSettleCooldownMs?: number;
  onLockChange?: (locked: boolean) => void;
}): AsyncLockController {
  let locked = false;
  let disposed = false;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  const cooldownMs = Math.max(0, options?.postSettleCooldownMs ?? 0);

  const setLocked = (next: boolean) => {
    if (locked === next) return;
    locked = next;
    if (!disposed) {
      options?.onLockChange?.(next);
    }
  };

  return {
    isLocked: () => locked,
    isDisposed: () => disposed,
    async run<T>(fn: () => Promise<T> | T): Promise<{ skipped: boolean; value?: T }> {
      if (locked || disposed) {
        return { skipped: true };
      }
      if (cooldownTimer !== null) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
      setLocked(true);
      try {
        const value = await fn();
        return { skipped: false, value };
      } finally {
        if (disposed) {
          locked = false;
        } else if (cooldownMs > 0) {
          cooldownTimer = setTimeout(() => {
            cooldownTimer = null;
            setLocked(false);
          }, cooldownMs);
        } else {
          setLocked(false);
        }
      }
    },
    dispose() {
      disposed = true;
      locked = false;
      if (cooldownTimer !== null) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
    },
  };
}

export interface AsyncKeyedLockController {
  isLocked: (key: string) => boolean;
  isDisposed: () => boolean;
  getLockedKeys: () => string[];
  run: <T>(key: string, fn: () => Promise<T> | T) => Promise<{ skipped: boolean; value?: T }>;
  dispose: () => void;
}

export function createAsyncKeyedLockController(options?: {
  onKeysChange?: (keys: string[]) => void;
}): AsyncKeyedLockController {
  const lockedKeys = new Set<string>();
  let disposed = false;

  const notify = () => {
    if (!disposed) {
      options?.onKeysChange?.(Array.from(lockedKeys));
    }
  };

  return {
    isLocked: (key: string) => lockedKeys.has(key),
    isDisposed: () => disposed,
    getLockedKeys: () => Array.from(lockedKeys),
    async run<T>(
      key: string,
      fn: () => Promise<T> | T
    ): Promise<{ skipped: boolean; value?: T }> {
      if (!key || disposed || lockedKeys.has(key)) {
        return { skipped: true };
      }
      lockedKeys.add(key);
      notify();
      try {
        const value = await fn();
        return { skipped: false, value };
      } finally {
        lockedKeys.delete(key);
        notify();
      }
    },
    dispose() {
      disposed = true;
      lockedKeys.clear();
    },
  };
}

export function useAsyncSubmitLock(options?: { postSettleCooldownMs?: number }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cooldownMs = options?.postSettleCooldownMs ?? 0;
  const cooldownMsRef = useRef(cooldownMs);
  cooldownMsRef.current = cooldownMs;

  const controllerRef = useRef<AsyncLockController | null>(null);
  if (!controllerRef.current || controllerRef.current.isDisposed()) {
    controllerRef.current = createAsyncLockController({
      postSettleCooldownMs: cooldownMsRef.current,
      onLockChange: (next) => setIsSubmitting(next),
    });
  }

  useEffect(() => {
    let controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      controller = createAsyncLockController({
        postSettleCooldownMs: cooldownMsRef.current,
        onLockChange: (next) => setIsSubmitting(next),
      });
      controllerRef.current = controller;
    }
    setIsSubmitting(controller.isLocked());
    return () => {
      controller.dispose();
    };
  }, []);

  const runLocked = useCallback(async <T>(fn: () => Promise<T> | T) => {
    const controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      return { skipped: true };
    }
    return controller.run(fn);
  }, []);

  const isLockedNow = useCallback(() => controllerRef.current?.isLocked() ?? false, []);

  return {
    isSubmitting,
    isLockedNow,
    runLocked,
  };
}

export function useAsyncKeyedLock() {
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);

  const controllerRef = useRef<AsyncKeyedLockController | null>(null);
  if (!controllerRef.current || controllerRef.current.isDisposed()) {
    controllerRef.current = createAsyncKeyedLockController({
      onKeysChange: (keys) => setLockedKeys(keys),
    });
  }

  useEffect(() => {
    let controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      controller = createAsyncKeyedLockController({
        onKeysChange: (keys) => setLockedKeys(keys),
      });
      controllerRef.current = controller;
    }
    const currentKeys = controller.getLockedKeys();
    setLockedKeys((prev) =>
      prev.length === currentKeys.length && prev.every((k, i) => k === currentKeys[i])
        ? prev
        : currentKeys
    );
    return () => {
      controller.dispose();
    };
  }, []);

  const runKeyLocked = useCallback(async <T>(key: string, fn: () => Promise<T> | T) => {
    const controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      return { skipped: true };
    }
    return controller.run(key, fn);
  }, []);

  const isKeyLocked = useCallback(
    (key: string) =>
      lockedKeys.indexOf(key) !== -1 || (controllerRef.current?.isLocked(key) ?? false),
    [lockedKeys]
  );

  return {
    lockedKeys,
    hasAnyLocked: lockedKeys.length > 0,
    isKeyLocked,
    runKeyLocked,
  };
}
```

## `src/utils/useVirtualWindow.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Zero-dependency ES2018-compatible scroll window virtualizer for large
 * Herd, Breeding, and Reports lists/tables.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VirtualWindowRange {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

export interface ComputeVirtualWindowParams {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  estimateSize: number;
  overscan?: number;
  initialFallbackCount?: number;
  measuredHeights?: ReadonlyMap<number, number>;
}

/**
 * Pure ES2018 calculation for visible index window and top/bottom spacer heights.
 * Guarantees at least `initialFallbackCount` items on zero-height pre-layout renders.
 */
export function computeVirtualWindow(params: ComputeVirtualWindowParams): VirtualWindowRange {
  const itemCount = Math.max(0, Math.floor(params.itemCount));
  const estimateSize = Math.max(20, params.estimateSize || 44);
  const overscan = Math.max(0, Math.floor(params.overscan ?? 6));
  const initialFallbackCount = Math.max(1, Math.floor(params.initialFallbackCount ?? 20));
  const measured = params.measuredHeights;

  if (itemCount === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    };
  }

  const getHeight = (idx: number): number => {
    if (!measured) return estimateSize;
    const h = measured.get(idx);
    return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : estimateSize;
  };

  let totalHeight = 0;
  for (let i = 0; i < itemCount; i++) {
    totalHeight += getHeight(i);
  }

  const viewportHeight = Math.max(0, params.viewportHeight || 0);
  if (viewportHeight <= 0) {
    const endIndex = Math.min(itemCount - 1, initialFallbackCount - 1);
    let renderedHeight = 0;
    for (let i = 0; i <= endIndex; i++) {
      renderedHeight += getHeight(i);
    }
    return {
      startIndex: 0,
      endIndex,
      paddingTop: 0,
      paddingBottom: Math.max(0, totalHeight - renderedHeight),
      totalHeight,
    };
  }

  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const clampedScrollTop = Math.max(0, Math.min(params.scrollTop || 0, maxScrollTop));
  const visibleBottom = clampedScrollTop + viewportHeight;

  let offset = 0;
  let rawStart = 0;
  let foundStart = false;
  let rawEnd = itemCount - 1;

  for (let i = 0; i < itemCount; i++) {
    const h = getHeight(i);
    const nextOffset = offset + h;
    if (!foundStart && nextOffset > clampedScrollTop) {
      rawStart = i;
      foundStart = true;
    }
    if (offset >= visibleBottom) {
      rawEnd = Math.max(rawStart, i - 1);
      break;
    }
    offset = nextOffset;
  }

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(itemCount - 1, rawEnd + overscan);

  let paddingTop = 0;
  for (let i = 0; i < startIndex; i++) {
    paddingTop += getHeight(i);
  }

  let renderedHeight = 0;
  for (let i = startIndex; i <= endIndex; i++) {
    renderedHeight += getHeight(i);
  }

  const paddingBottom = Math.max(0, totalHeight - paddingTop - renderedHeight);

  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    totalHeight,
  };
}

export interface UseVirtualWindowOptions {
  itemCount: number;
  estimateSize: number;
  overscan?: number;
  initialFallbackCount?: number;
  /** Change this key (e.g. search query, filter, species) to reset scrollTop to 0 and clear stale row heights. */
  resetKey?: string;
}

export interface UseVirtualWindowResult {
  scrollContainerRef: (node: HTMLDivElement | null) => void;
  measureRowRef: (index: number) => (node: HTMLElement | null) => void;
  windowRange: VirtualWindowRange;
  scrollToTop: () => void;
}

export function useVirtualWindow(options: UseVirtualWindowOptions): UseVirtualWindowResult {
  const { itemCount, estimateSize, overscan = 6, initialFallbackCount = 20, resetKey = '' } = options;

  const containerElRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightsRef = useRef<Map<number, number>>(new Map());
  const rowElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const elementIndexMapRef = useRef<Map<HTMLElement, number>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const [scrollMetrics, setScrollMetrics] = useState<{ scrollTop: number; viewportHeight: number }>({
    scrollTop: 0,
    viewportHeight: 0,
  });
  const [measureVersion, setMeasureVersion] = useState(0);

  const syncMetricsNow = useCallback(() => {
    const el = containerElRef.current;
    if (!el) return;
    const nextTop = el.scrollTop || 0;
    const nextHeight = el.clientHeight || 0;
    setScrollMetrics((prev) => {
      if (
        Math.abs(prev.scrollTop - nextTop) < 4 &&
        Math.abs(prev.viewportHeight - nextHeight) < 2
      ) {
        return prev;
      }
      return { scrollTop: nextTop, viewportHeight: nextHeight };
    });
  }, []);

  const scheduleMetricsSync = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      syncMetricsNow();
      return;
    }
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      syncMetricsNow();
    });
  }, [syncMetricsNow]);

  const scrollToTop = useCallback(() => {
    const el = containerElRef.current;
    if (el) {
      el.scrollTop = 0;
    }
    setScrollMetrics((prev) => ({
      scrollTop: 0,
      viewportHeight: el?.clientHeight ?? prev.viewportHeight,
    }));
  }, []);

  // Reset cached row measurements & scroll offset when filter/species/query changes
  useEffect(() => {
    measuredHeightsRef.current.clear();
    setMeasureVersion((v) => v + 1);
    scrollToTop();
  }, [resetKey, scrollToTop]);

  // Trim stale high-index measurements if itemCount shrinks
  useEffect(() => {
    const map = measuredHeightsRef.current;
    if (map.size === 0) return;
    let deleted = false;
    map.forEach((_val, idx) => {
      if (idx >= itemCount) {
        map.delete(idx);
        deleted = true;
      }
    });
    if (deleted) {
      setMeasureVersion((v) => v + 1);
    }
  }, [itemCount]);

  // Manage ResizeObserver for row elements and scroll container
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const target = entry.target as HTMLElement;
        if (target === containerElRef.current) {
          scheduleMetricsSync();
          continue;
        }
        const idx = elementIndexMapRef.current.get(target);
        if (typeof idx === 'number') {
          const rect = target.getBoundingClientRect();
          const h = Math.round(rect.height || entry.contentRect.height);
          if (h > 0 && measuredHeightsRef.current.get(idx) !== h) {
            measuredHeightsRef.current.set(idx, h);
            changed = true;
          }
        }
      }
      if (changed) {
        setMeasureVersion((v) => v + 1);
      }
    });
    resizeObserverRef.current = ro;

    if (containerElRef.current) {
      ro.observe(containerElRef.current);
    }
    rowElementsRef.current.forEach((el) => {
      ro.observe(el);
    });

    return () => {
      ro.disconnect();
      resizeObserverRef.current = null;
    };
  }, [scheduleMetricsSync]);

  // Attach/detach scroll & window resize listeners cleanly
  const scrollContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      const prev = containerElRef.current;
      if (prev && prev !== node) {
        prev.removeEventListener('scroll', scheduleMetricsSync);
        if (resizeObserverRef.current) {
          resizeObserverRef.current.unobserve(prev);
        }
      }
      containerElRef.current = node;
      if (node) {
        node.addEventListener('scroll', scheduleMetricsSync, { passive: true });
        if (resizeObserverRef.current) {
          resizeObserverRef.current.observe(node);
        }
        syncMetricsNow();
      }
    },
    [scheduleMetricsSync, syncMetricsNow]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('resize', scheduleMetricsSync, { passive: true });
    return () => {
      window.removeEventListener('resize', scheduleMetricsSync);
      if (rafIdRef.current !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (containerElRef.current) {
        containerElRef.current.removeEventListener('scroll', scheduleMetricsSync);
      }
    };
  }, [scheduleMetricsSync]);

  const rowCallbacksRef = useRef<Map<number, (node: HTMLElement | null) => void>>(new Map());

  useEffect(() => {
    const callbacks = rowCallbacksRef.current;
    if (callbacks.size > Math.max(512, itemCount + 128)) {
      callbacks.clear();
    }
  }, [itemCount]);

  useEffect(() => {
    const callbacks = rowCallbacksRef.current;
    const rowElements = rowElementsRef.current;
    const elementIndexMap = elementIndexMapRef.current;
    return () => {
      callbacks.clear();
      rowElements.clear();
      elementIndexMap.clear();
    };
  }, []);

  const measureRowRef = useCallback((index: number) => {
    const existing = rowCallbacksRef.current.get(index);
    if (existing) return existing;

    const cb = (node: HTMLElement | null) => {
      const prevNode = rowElementsRef.current.get(index);
      if (prevNode && prevNode !== node) {
        elementIndexMapRef.current.delete(prevNode);
        if (resizeObserverRef.current) {
          resizeObserverRef.current.unobserve(prevNode);
        }
      }
      if (!node) {
        rowElementsRef.current.delete(index);
        return;
      }
      if (prevNode === node) {
        return;
      }
      rowElementsRef.current.set(index, node);
      elementIndexMapRef.current.set(node, index);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.observe(node);
      }
      const rect = node.getBoundingClientRect();
      const h = Math.round(rect.height);
      if (h > 0 && measuredHeightsRef.current.get(index) !== h) {
        measuredHeightsRef.current.set(index, h);
        setMeasureVersion((v) => v + 1);
      }
    };
    rowCallbacksRef.current.set(index, cb);
    return cb;
  }, []);

  const windowRange = useMemo(() => {
    void measureVersion;
    return computeVirtualWindow({
      itemCount,
      scrollTop: scrollMetrics.scrollTop,
      viewportHeight: scrollMetrics.viewportHeight,
      estimateSize,
      overscan,
      initialFallbackCount,
      measuredHeights: measuredHeightsRef.current,
    });
  }, [
    itemCount,
    scrollMetrics.scrollTop,
    scrollMetrics.viewportHeight,
    estimateSize,
    overscan,
    initialFallbackCount,
    measureVersion,
  ]);

  return {
    scrollContainerRef,
    measureRowRef,
    windowRange,
    scrollToTop,
  };
}
```

## `src/utils/webFileActions.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Web Browser File Download & Upload Wrappers.
 *
 * CROSS-PLATFORM MIGRATION NOTE:
 * Isolated from `src/core/` so React Native / Expo replaces only this file with
 * `expo-file-system` + `expo-sharing` + `expo-document-picker`.
 */

import { pedigreeBridge } from '../native/pedigreeBridge';
import { logDiagnosticEvent } from '../storage/crashLogger';
import {
  isOpfsSupported,
  markTempOpfsFileActive,
  readTempOpfsFileAsBlob,
  removeTempOpfsFile,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
} from '../storage/opfsStorage';
import { isIosBrowser, isStandalonePwa } from '../storage/storageProtection';
import { readBlobAsArrayBuffer } from './es2018Shims';

export type FileShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function isInstalledIosPwa(): boolean {
  if (!isIosBrowser()) return false;
  if (isStandalonePwa()) return true;
  if (typeof navigator !== 'undefined') {
    return (navigator as unknown as { standalone?: boolean }).standalone === true;
  }
  return false;
}

export function isFileShareAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: unknown }).name === 'AbortError';
}

export const OPFS_SCRATCHPAD_THRESHOLD_BYTES = 512 * 1024;
const BLOB_DOWNLOAD_CLEANUP_DELAY_MS = 4000;

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await readBlobAsArrayBuffer(blob);
  return new Uint8Array(buffer);
}

async function payloadToUint8Array(
  payload: string | Uint8Array,
  mimeType: string
): Promise<Uint8Array> {
  if (typeof payload !== 'string') {
    return payload;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(payload);
  }
  return blobToUint8Array(toDirectBlob(payload, mimeType));
}

function toBlobCompatibleUint8Array(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    typeof ArrayBuffer !== 'undefined' &&
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

function toDirectBlob(payload: string | Uint8Array, mimeType: string): Blob {
  if (typeof payload === 'string') {
    const typedMime = mimeType.toLowerCase().includes('charset')
      ? mimeType
      : `${mimeType};charset=utf-8`;
    return new Blob([payload], { type: typedMime });
  }
  return new Blob([toBlobCompatibleUint8Array(payload)], { type: mimeType });
}

function extractSafeExtension(filename: string): string {
  const parts = (filename || '').split('.');
  const raw = parts.length > 1 ? parts[parts.length - 1] : '';
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tmp';
}

async function stagePayloadInOpfsTmp(
  prefix: string,
  filename: string,
  payload: string | Uint8Array
): Promise<{ fileName: string; blob: Blob } | null> {
  if (!isOpfsSupported()) return null;
  let stagedFileName: string | null = null;
  try {
    const ext = extractSafeExtension(filename);
    const staged = await writeTempOpfsFile(prefix, payload, ext, {
      keepActiveAfterWrite: true,
    });
    if (!staged) return null;
    stagedFileName = staged.fileName;
    const opfsFile = await readTempOpfsFileAsBlob(staged.fileName);
    if (!opfsFile) {
      unmarkTempOpfsFileActive(staged.fileName);
      await removeTempOpfsFile(staged.fileName);
      return null;
    }
    return { fileName: staged.fileName, blob: opfsFile };
  } catch {
    if (stagedFileName) {
      unmarkTempOpfsFileActive(stagedFileName);
      await removeTempOpfsFile(stagedFileName);
    }
    return null;
  }
}

type WebShareFileAttempt =
  | { status: 'shared' }
  | { status: 'cancelled' }
  | { status: 'unavailable' | 'unsupported' }
  | { status: 'error'; error: unknown };

async function tryShareFileViaWebShare(
  filename: string,
  blob: Blob,
  fallbackMimeType?: string
): Promise<WebShareFileAttempt> {
  const hasShareApi =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    typeof File !== 'undefined';

  if (!hasShareApi) {
    return { status: 'unavailable' };
  }

  const resolvedMime = blob.type || fallbackMimeType || 'application/octet-stream';
  const file =
    blob instanceof File && blob.name === filename
      ? blob
      : new File([blob], filename, { type: resolvedMime });

  let canShareFiles = false;
  try {
    canShareFiles = navigator.canShare({ files: [file] });
  } catch {
    canShareFiles = false;
  }

  if (!canShareFiles) {
    return { status: 'unsupported' };
  }

  try {
    // Pass only `{ files: [file] }` — iOS Share Sheet rejects or duplicates payloads with extra title/text/url fields
    await navigator.share({ files: [file] });
    return { status: 'shared' };
  } catch (err) {
    if (isFileShareAbortError(err)) {
      return { status: 'cancelled' };
    }
    return { status: 'error', error: err };
  }
}

async function dispatchBlobDownloadAndCleanup(
  filename: string,
  blob: Blob,
  stagedFileName: string | null,
  fallbackMimeType?: string
): Promise<void> {
  if (pedigreeBridge.isNativeWrapper()) {
    try {
      const bytes = await blobToUint8Array(blob);
      const mimeType = blob.type || fallbackMimeType || 'application/octet-stream';
      const res = await pedigreeBridge.exportOrShareBinary({
        filename,
        mimeType,
        mode: 'save',
        bytes,
      });
      if (!res.ok) {
        throw new Error(res.error || `Native export failed for "${filename}".`);
      }
      return;
    } finally {
      if (stagedFileName) {
        unmarkTempOpfsFileActive(stagedFileName);
        await removeTempOpfsFile(stagedFileName);
      }
    }
  }

  if (isInstalledIosPwa()) {
    try {
      const shareResult = await tryShareFileViaWebShare(filename, blob, fallbackMimeType);
      if (shareResult.status === 'shared' || shareResult.status === 'cancelled') {
        return;
      }
      if (shareResult.status === 'error') {
        const msg =
          shareResult.error instanceof Error && shareResult.error.message
            ? shareResult.error.message
            : 'Share sheet failed.';
        logDiagnosticEvent({
          level: 'error',
          category: 'storage',
          message: `iOS standalone PWA file export failed for "${filename}": ${msg}`,
          error: shareResult.error,
        });
        throw new Error(
          `Could not export "${filename}" from the iOS Home Screen app (${msg}). Try opening in Safari or freeing device storage.`
        );
      }
      throw new Error(
        `Could not save "${filename}" because iOS Home Screen file sharing is unavailable here. Open this page in Safari to download or share files.`
      );
    } finally {
      if (stagedFileName) {
        unmarkTempOpfsFileActive(stagedFileName);
        await removeTempOpfsFile(stagedFileName);
      }
    }
  }

  let url: string | null = null;
  let downloadDispatched = false;

  try {
    url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    try {
      anchor.click();
      downloadDispatched = true;
    } finally {
      if (anchor.parentNode) {
        anchor.parentNode.removeChild(anchor);
      }
    }

    const activeUrl = url;
    const activeTempFile = stagedFileName;
    setTimeout(() => {
      try {
        URL.revokeObjectURL(activeUrl);
      } finally {
        if (activeTempFile) {
          unmarkTempOpfsFileActive(activeTempFile);
          void removeTempOpfsFile(activeTempFile);
        }
      }
    }, BLOB_DOWNLOAD_CLEANUP_DELAY_MS);
  } finally {
    if (!downloadDispatched) {
      if (url) {
        URL.revokeObjectURL(url);
      }
      if (stagedFileName) {
        unmarkTempOpfsFileActive(stagedFileName);
        await removeTempOpfsFile(stagedFileName);
      }
    }
  }
}

/**
 * Triggers a browser download directly from an existing `Blob` or OPFS `File` handle
 * without copying the payload through JS strings, byte buffers, or `/tmp`.
 */
export async function downloadBlobDirect(filename: string, blob: Blob): Promise<void> {
  await dispatchBlobDownloadAndCleanup(filename, blob, null);
}

/**
 * Triggers a browser download from an already-staged OPFS `/tmp` file (or fallback `bytes`
 * if OPFS was unavailable) and cleans up the `/tmp` file right after dispatch.
 */
export async function downloadTempOpfsExport(
  filename: string,
  staged: { opfsTempFileName: string | null; blob?: Blob | null; bytes?: Uint8Array },
  mimeType: string = 'application/octet-stream'
): Promise<void> {
  if (staged.opfsTempFileName) {
    markTempOpfsFileActive(staged.opfsTempFileName);
    let blob = staged.blob ?? null;
    if (!blob) {
      blob = await readTempOpfsFileAsBlob(staged.opfsTempFileName);
    }
    if (blob) {
      await dispatchBlobDownloadAndCleanup(filename, blob, staged.opfsTempFileName, mimeType);
      return;
    }
    unmarkTempOpfsFileActive(staged.opfsTempFileName);
    await removeTempOpfsFile(staged.opfsTempFileName);
  }

  if (staged.bytes) {
    await downloadBinaryFile(filename, staged.bytes, mimeType);
    return;
  }

  throw new Error(`Could not read staged export file "${filename}" for download.`);
}

async function triggerBlobDownloadWithOpfsScratchpad(
  filename: string,
  payload: string | Uint8Array,
  mimeType: string
): Promise<void> {
  if (pedigreeBridge.isNativeWrapper()) {
    const bytes = await payloadToUint8Array(payload, mimeType);
    const res = await pedigreeBridge.exportOrShareBinary({
      filename,
      mimeType: mimeType || 'application/octet-stream',
      mode: 'save',
      bytes,
    });
    if (!res.ok) {
      throw new Error(res.error || `Native export failed for "${filename}".`);
    }
    return;
  }

  const staged = await stagePayloadInOpfsTmp('export', filename, payload);
  const blob = staged ? staged.blob : toDirectBlob(payload, mimeType);
  await dispatchBlobDownloadAndCleanup(filename, blob, staged ? staged.fileName : null, mimeType);
}

/**
 * Streams text/binary chunks incrementally into OPFS `/tmp` when OPFS is available
 * (never materializing a monolithic string or `Blob` in JS heap beforehand) and triggers download.
 */
export async function downloadTextChunks(
  filename: string,
  chunks: Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>,
  mimeType: string
): Promise<void> {
  if (isOpfsSupported()) {
    const ext = extractSafeExtension(filename);
    try {
      const staged = await writeTempOpfsFileStreamed(
        'export',
        ext,
        async (writeChunk) => {
          for await (const chunk of chunks) {
            await writeChunk(chunk);
          }
        },
        { keepActiveAfterWrite: true }
      );
      if (staged) {
        await dispatchBlobDownloadAndCleanup(filename, staged.blob, staged.fileName, mimeType);
        return;
      }
    } catch {
      // Fall through to in-memory Blob fallback below if OPFS streaming fails
    }
  }

  const parts: BlobPart[] = [];
  for await (const chunk of chunks) {
    if (typeof chunk === 'string') {
      if (chunk.length > 0) parts.push(chunk);
    } else if (chunk.byteLength > 0) {
      parts.push(toBlobCompatibleUint8Array(chunk));
    }
  }
  const typedMime = mimeType.toLowerCase().includes('charset')
    ? mimeType
    : `${mimeType};charset=utf-8`;
  await downloadBlobDirect(filename, new Blob(parts, { type: typedMime }));
}

export async function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
): Promise<void> {
  await triggerBlobDownloadWithOpfsScratchpad(filename, content, mimeType);
}

async function sharePayloadOrDownload(params: {
  filename: string;
  payload: string | Uint8Array;
  mimeType: string;
  title: string;
  text?: string;
}): Promise<FileShareOutcome> {
  const { filename, payload, mimeType } = params;
  if (pedigreeBridge.isNativeWrapper()) {
    const bytes = await payloadToUint8Array(payload, mimeType);
    const resolvedMime = mimeType || 'application/octet-stream';
    const res = await pedigreeBridge.exportOrShareBinary({
      filename,
      mimeType: resolvedMime,
      mode: 'share',
      bytes,
    });
    if (res.ok) {
      return 'shared';
    }
    const saveRes = await pedigreeBridge.exportOrShareBinary({
      filename,
      mimeType: resolvedMime,
      mode: 'save',
      bytes,
    });
    if (!saveRes.ok) {
      throw new Error(saveRes.error || `Native export failed for "${filename}".`);
    }
    return 'downloaded';
  }

  const iosPwa = isInstalledIosPwa();
  const hasShareApi =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  if (!hasShareApi) {
    if (iosPwa) {
      throw new Error(
        `Native file sharing is unavailable in this iOS Home Screen context for "${filename}". Open this page in Safari to save or share files.`
      );
    }
    await triggerBlobDownloadWithOpfsScratchpad(filename, payload, mimeType);
    return 'downloaded';
  }

  const staged = await stagePayloadInOpfsTmp('share', filename, payload);
  let handedOffToDownload = false;

  try {
    const shareBlob =
      staged && typeof Blob !== 'undefined' && staged.blob instanceof Blob
        ? staged.blob
        : toDirectBlob(payload, mimeType);
    const shareResult = await tryShareFileViaWebShare(filename, shareBlob, mimeType);

    if (shareResult.status === 'shared') {
      return 'shared';
    }
    if (shareResult.status === 'cancelled') {
      return 'cancelled';
    }
    if (shareResult.status === 'error') {
      const msg =
        shareResult.error instanceof Error && shareResult.error.message
          ? shareResult.error.message
          : 'Web Share request failed.';
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Web Share failed for "${filename}": ${msg}`,
        error: shareResult.error,
      });
      if (iosPwa) {
        throw new Error(
          `Could not share "${filename}" from the iOS Home Screen app (${msg}). Open in Safari or try again.`
        );
      }
    } else if (iosPwa) {
      throw new Error(
        `This iOS Home Screen app context cannot share "${filename}" directly. Open this page in Safari to download or share.`
      );
    }

    const downloadBlob = staged ? staged.blob : toDirectBlob(payload, mimeType);
    const stagedName = staged ? staged.fileName : null;
    handedOffToDownload = true;
    await dispatchBlobDownloadAndCleanup(filename, downloadBlob, stagedName, mimeType);
    return 'downloaded';
  } finally {
    if (staged && !handedOffToDownload) {
      unmarkTempOpfsFileActive(staged.fileName);
      await removeTempOpfsFile(staged.fileName);
    }
  }
}

export async function shareTextFileOrDownload(params: {
  filename: string;
  content: string;
  mimeType: string;
  title: string;
  text?: string;
}): Promise<FileShareOutcome> {
  return sharePayloadOrDownload({
    filename: params.filename,
    payload: params.content,
    mimeType: params.mimeType,
    title: params.title,
    text: params.text,
  });
}

export async function downloadBinaryFile(
  filename: string,
  bytes: Uint8Array,
  mimeType: string = 'application/octet-stream'
): Promise<void> {
  await triggerBlobDownloadWithOpfsScratchpad(filename, bytes, mimeType);
}

export async function shareBinaryFileOrDownload(params: {
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
  title: string;
  text?: string;
}): Promise<FileShareOutcome> {
  return sharePayloadOrDownload({
    filename: params.filename,
    payload: params.bytes,
    mimeType: params.mimeType,
    title: params.title,
    text: params.text,
  });
}

export async function copyTextWithFallback(
  text: string
): Promise<'clipboard' | 'execCommand' | 'unsupported'> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      // Fall through to legacy textarea copy attempt
    }
  }

  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) {
        return 'execCommand';
      }
    } catch {
      // Ignore execCommand rejection
    }
  }

  return 'unsupported';
}

```

## `src/utils/webPdfActions.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Raster-to-JPEG & Offline `.PDF` Download Adapter (`src/utils/webPdfActions.ts`).
 *
 * Converts locally stored WebP/PNG/JPEG raster data URLs (animal portrait & breeder logo)
 * into clean baseline JPEG bytes on an offscreen `<canvas>` (with immediate memory cleanup)
 * so `src/core/pdfExporter.ts` can embed them natively via `/DCTDecode` and download a
 * 100% offline `.pdf` file without external PDF libraries or network calls.
 */

import { sanitizeSafeRasterImageDataUrl } from '../core/inputSanitization';
import {
  buildPedigreePdfBytes,
  PedigreePdfExportParams,
  PdfRasterImage,
} from '../core/pdfExporter';
import { enforceCanvasDimensions, releaseCanvas } from '../storage/webImageOptimizer';
import { downloadBinaryFile } from './webFileActions';

function base64DataUrlToBytes(dataUrl: string): Uint8Array | null {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return null;
  const header = dataUrl.slice(0, commaIdx).toLowerCase();
  if (!header.includes(';base64')) return null;
  const base64 = dataUrl.slice(commaIdx + 1);
  if (!base64) return null;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Decodes any safe raster `dataUrl` (`image/webp`, `image/png`, `image/jpeg`) via an
 * offscreen canvas over a crisp white `#FFFFFF` background and encodes baseline JPEG bytes
 * ready for PDF `/DCTDecode` embedding. Returns `undefined` gracefully on decode failure.
 */
export async function rasterDataUrlToPdfJpeg(
  rawDataUrl: string | undefined,
  maxDimension = 420
): Promise<PdfRasterImage | undefined> {
  const safeUrl = sanitizeSafeRasterImageDataUrl(rawDataUrl);
  if (!safeUrl || typeof document === 'undefined' || typeof Image === 'undefined') {
    return undefined;
  }

  return new Promise<PdfRasterImage | undefined>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    const clearImageRef = () => {
      img.onload = null;
      img.onerror = null;
      try {
        img.src = '';
      } catch {
        // Ignore readonly src teardown
      }
    };
    img.onload = () => {
      const srcW = img.naturalWidth || img.width || 0;
      const srcH = img.naturalHeight || img.height || 0;
      if (srcW <= 0 || srcH <= 0) {
        clearImageRef();
        resolve(undefined);
        return;
      }
      const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
      const safeDims = enforceCanvasDimensions(
        Math.max(1, Math.round(srcW * scale)),
        Math.max(1, Math.round(srcH * scale))
      );
      const targetW = safeDims.width;
      const targetH = safeDims.height;

      const canvas = document.createElement('canvas');
      try {
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(undefined);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const jpegUrl = canvas.toDataURL('image/jpeg', 0.88);
        const bytes = base64DataUrlToBytes(jpegUrl);
        if (!bytes || bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
          resolve(undefined);
          return;
        }
        resolve({ bytes, width: targetW, height: targetH });
      } catch {
        resolve(undefined);
      } finally {
        releaseCanvas(canvas);
        clearImageRef();
      }
    };
    img.onerror = () => {
      clearImageRef();
      resolve(undefined);
    };
    img.src = safeUrl;
  });
}

export async function buildAndDownloadPedigreePdf(
  params: Omit<PedigreePdfExportParams, 'subjectPhotoJpeg' | 'breederLogoJpeg'> & {
    pdfFilename: string;
    primaryPhotoDataUrl?: string;
  }
): Promise<void> {
  const showLogo = params.printOptions?.showBreederLogo ?? true;
  const rawLogoUrl = showLogo
    ? params.printOptions?.breederLogoDataUrl !== undefined
      ? params.printOptions.breederLogoDataUrl
      : params.settings.breederLogoDataUrl
    : undefined;

  const subjectPhotoJpeg = params.primaryPhotoDataUrl
    ? await rasterDataUrlToPdfJpeg(params.primaryPhotoDataUrl, 420)
    : undefined;
  const breederLogoJpeg = rawLogoUrl
    ? await rasterDataUrlToPdfJpeg(rawLogoUrl, 360)
    : undefined;

  const pdfBytes = buildPedigreePdfBytes({
    subject: params.subject,
    allAnimals: params.allAnimals,
    speciesProfiles: params.speciesProfiles,
    settings: params.settings,
    generations: params.generations,
    printOptions: params.printOptions,
    subjectPhotoJpeg,
    breederLogoJpeg,
  });

  const safeFilename = params.pdfFilename.toLowerCase().endsWith('.pdf')
    ? params.pdfFilename
    : `${params.pdfFilename.replace(/\.html?$/i, '')}.pdf`;

  await downloadBinaryFile(safeFilename, pdfBytes, 'application/pdf');
}
```

## `src/utils/__tests__/asyncSubmitLock.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createAsyncKeyedLockController,
  createAsyncLockController,
} from '../useAsyncSubmitLock';

describe('createAsyncLockController & createAsyncKeyedLockController — double-submit guards', () => {
  it('blocks synchronous same-frame double-taps and executes the action exactly once', async () => {
    const states: boolean[] = [];
    const controller = createAsyncLockController({
      onLockChange: (locked) => states.push(locked),
    });

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const spy = vi.fn(async () => {
      await firstGate;
      return 'saved-id-1';
    });

    // Two taps 0ms apart (before any React re-render could disable a button)
    const p1 = controller.run(spy);
    const p2 = controller.run(spy);
    expect(controller.isLocked()).toBe(true);

    const secondResult = await p2;
    expect(secondResult).toEqual({ skipped: true });
    expect(spy).toHaveBeenCalledTimes(1);

    releaseFirst();
    const firstResult = await p1;
    expect(firstResult).toEqual({ skipped: false, value: 'saved-id-1' });
    expect(controller.isLocked()).toBe(false);
    expect(states).toEqual([true, false]);

    // Subsequent intentional tap after settle runs normally
    const p3 = await controller.run(() => 'saved-id-2');
    expect(p3).toEqual({ skipped: false, value: 'saved-id-2' });
    expect(spy).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('always releases the lock in finally when the async save rejects', async () => {
    const states: boolean[] = [];
    const controller = createAsyncLockController({
      onLockChange: (locked) => states.push(locked),
    });

    await expect(
      controller.run(async () => {
        throw new Error('QuotaExceededError');
      })
    ).rejects.toThrow('QuotaExceededError');

    expect(controller.isLocked()).toBe(false);
    expect(states).toEqual([true, false]);

    // Confirm recovery tap works immediately after error
    const retry = await controller.run(async () => 'recovered');
    expect(retry).toEqual({ skipped: false, value: 'recovered' });
    controller.dispose();
  });

  it('enforces post-settle cooldown cleanly and stops emitting after dispose()', async () => {
    vi.useFakeTimers();
    try {
      const states: boolean[] = [];
      const controller = createAsyncLockController({
        postSettleCooldownMs: 250,
        onLockChange: (locked) => states.push(locked),
      });

      const res = await controller.run(async () => 42);
      expect(res).toEqual({ skipped: false, value: 42 });
      expect(controller.isLocked()).toBe(true);

      // Bounce tap during cooldown is rejected cleanly
      const bounce = await controller.run(async () => 99);
      expect(bounce).toEqual({ skipped: true });

      vi.advanceTimersByTime(249);
      expect(controller.isLocked()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(controller.isLocked()).toBe(false);
      expect(states).toEqual([true, false]);

      // Disposal cancels any pending state notifications
      expect(controller.isDisposed()).toBe(false);
      await controller.run(async () => 'before-unmount');
      controller.dispose();
      expect(controller.isDisposed()).toBe(true);
      vi.advanceTimersByTime(500);
      expect(states).toEqual([true, false, true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates concurrent inline quick actions per key and never deadlocks unrelated rows', async () => {
    const keyUpdates: string[][] = [];
    const keyed = createAsyncKeyedLockController({
      onKeysChange: (keys) => keyUpdates.push(keys),
    });

    let resolveRowA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      resolveRowA = resolve;
    });

    const rowASpy = vi.fn(async () => {
      await gateA;
      return 'row-a-done';
    });
    const rowBSpy = vi.fn(async () => 'row-b-done');

    const pA1 = keyed.run('task-a', rowASpy);
    const pA2 = keyed.run('task-a', rowASpy);
    const pB = keyed.run('task-b', rowBSpy);

    expect(keyed.isLocked('task-a')).toBe(true);
    expect(await pA2).toEqual({ skipped: true });
    expect(await pB).toEqual({ skipped: false, value: 'row-b-done' });
    expect(rowASpy).toHaveBeenCalledTimes(1);
    expect(rowBSpy).toHaveBeenCalledTimes(1);

    resolveRowA();
    expect(await pA1).toEqual({ skipped: false, value: 'row-a-done' });
    expect(keyed.isLocked('task-a')).toBe(false);
    expect(keyed.getLockedKeys()).toEqual([]);
    expect(keyUpdates.length).toBeGreaterThanOrEqual(4);
    expect(keyed.isDisposed()).toBe(false);
    keyed.dispose();
    expect(keyed.isDisposed()).toBe(true);
  });
});
```

## `src/utils/__tests__/asyncSubmitLockHook.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookRuntime = vi.hoisted(() => {
  interface HookHarnessState {
    cursor: number;
    effectCursor: number;
    states: unknown[];
    refs: Array<{ current: unknown }>;
    callbacks: Array<{ fn: unknown; deps: unknown[] | undefined }>;
    effects: Array<{
      create: () => void | (() => void);
      deps?: unknown[];
      cleanup?: () => void;
    }>;
  }

  const runtime: HookHarnessState = {
    cursor: 0,
    effectCursor: 0,
    states: [],
    refs: [],
    callbacks: [],
    effects: [],
  };

  return {
    runtime,
    reset() {
      runtime.cursor = 0;
      runtime.effectCursor = 0;
      runtime.states = [];
      runtime.refs = [];
      runtime.callbacks = [];
      runtime.effects = [];
    },
    beginRender() {
      runtime.cursor = 0;
      runtime.effectCursor = 0;
    },
    mountEffects() {
      for (const eff of runtime.effects) {
        const cleanup = eff.create();
        eff.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
    },
    cleanupEffects() {
      for (const eff of runtime.effects) {
        eff.cleanup?.();
        eff.cleanup = undefined;
      }
    },
  };
});

vi.mock('react', () => ({
  useState<T>(initial: T | (() => T)) {
    const idx = hookRuntime.runtime.cursor++;
    if (!(idx in hookRuntime.runtime.states)) {
      hookRuntime.runtime.states[idx] =
        typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setState = (next: T | ((prev: T) => T)) => {
      const prev = hookRuntime.runtime.states[idx] as T;
      hookRuntime.runtime.states[idx] =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    };
    return [hookRuntime.runtime.states[idx] as T, setState] as const;
  },
  useRef<T>(initial: T) {
    const idx = hookRuntime.runtime.cursor++;
    if (!(idx in hookRuntime.runtime.refs)) {
      hookRuntime.runtime.refs[idx] = { current: initial };
    }
    return hookRuntime.runtime.refs[idx] as { current: T };
  },
  useCallback<T extends Function>(fn: T, deps: unknown[]) {
    const idx = hookRuntime.runtime.cursor++;
    const existing = hookRuntime.runtime.callbacks[idx];
    if (
      !existing ||
      !existing.deps ||
      existing.deps.length !== deps.length ||
      deps.some((d, i) => !Object.is(d, existing.deps![i]))
    ) {
      hookRuntime.runtime.callbacks[idx] = { fn, deps };
    }
    return hookRuntime.runtime.callbacks[idx].fn as T;
  },
  useEffect(create: () => void | (() => void), deps?: unknown[]) {
    const idx = hookRuntime.runtime.effectCursor++;
    const existing = hookRuntime.runtime.effects[idx];
    if (!existing) {
      hookRuntime.runtime.effects[idx] = { create, deps };
    } else {
      existing.create = create;
      existing.deps = deps;
    }
  },
}));

import { useAsyncKeyedLock, useAsyncSubmitLock } from '../useAsyncSubmitLock';

function mountWithStrictMode<T>(renderHook: () => T): {
  current: () => T;
  rerender: () => T;
  cleanup: () => void;
  remount: () => void;
} {
  let latest: T;
  const render = () => {
    hookRuntime.beginRender();
    latest = renderHook();
    return latest;
  };

  // React.StrictMode double-renders and double-invokes effects (mount -> cleanup -> mount)
  render();
  render();
  hookRuntime.mountEffects();
  hookRuntime.cleanupEffects();
  hookRuntime.mountEffects();

  return {
    current: () => latest,
    rerender: render,
    cleanup: () => hookRuntime.cleanupEffects(),
    remount: () => hookRuntime.mountEffects(),
  };
}

describe('useAsyncSubmitLock & useAsyncKeyedLock — StrictMode and Activity remount resilience', () => {
  beforeEach(() => {
    hookRuntime.reset();
  });

  it('useAsyncSubmitLock does not wedge after React.StrictMode double effect invocation', async () => {
    const harness = mountWithStrictMode(() =>
      useAsyncSubmitLock({ postSettleCooldownMs: 0 })
    );

    const action = vi.fn(async () => 'saved-record');
    const result = await harness.current().runLocked(action);

    expect(result).toEqual({ skipped: false, value: 'saved-record' });
    expect(action).toHaveBeenCalledTimes(1);
    expect(harness.current().isLockedNow()).toBe(false);

    harness.cleanup();
    // Calling after unmount remains safely skipped
    expect(await harness.current().runLocked(action)).toEqual({ skipped: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('useAsyncSubmitLock resets stale lock state across <Activity> hide/show even if an old task settles while hidden', async () => {
    const harness = mountWithStrictMode(() => useAsyncSubmitLock());

    let resolveInFlight!: () => void;
    const inFlightGate = new Promise<void>((resolve) => {
      resolveInFlight = resolve;
    });

    const slowTask = harness.current().runLocked(async () => {
      await inFlightGate;
      return 'stale-finish';
    });

    expect(harness.current().isLockedNow()).toBe(true);
    harness.rerender();
    expect(harness.current().isSubmitting).toBe(true);

    // Simulate <Activity mode="hidden"> cleanup while slowTask is still in flight
    harness.cleanup();
    // Simulate <Activity mode="visible"> remount WITHOUT re-rendering first
    harness.remount();
    harness.rerender();

    expect(harness.current().isSubmitting).toBe(false);
    expect(harness.current().isLockedNow()).toBe(false);

    // Resolving old task must not interfere with the newly remounted controller
    let resolveFresh!: () => void;
    const freshGate = new Promise<void>((resolve) => {
      resolveFresh = resolve;
    });
    const freshAction = vi.fn(async () => {
      await freshGate;
      return 'fresh-save';
    });
    const freshPromise = harness.current().runLocked(freshAction);
    expect(harness.current().isLockedNow()).toBe(true);

    resolveInFlight();
    expect(await slowTask).toEqual({ skipped: false, value: 'stale-finish' });
    // Newly remounted controller is STILL locked until freshPromise resolves
    expect(harness.current().isLockedNow()).toBe(true);

    resolveFresh();
    expect(await freshPromise).toEqual({ skipped: false, value: 'fresh-save' });
    expect(harness.current().isLockedNow()).toBe(false);
    expect(freshAction).toHaveBeenCalledTimes(1);
  });

  it('useAsyncKeyedLock does not wedge after React.StrictMode remount and clears stale keys across <Activity> hide/show', async () => {
    const harness = mountWithStrictMode(() => useAsyncKeyedLock());

    // Works immediately after StrictMode double-effect cycle
    const first = await harness.current().runKeyLocked('row-1', async () => 'done-1');
    expect(first).toEqual({ skipped: false, value: 'done-1' });

    // Start an in-flight keyed action, then simulate <Activity> hide -> remount -> settle old task
    let resolveKey!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveKey = resolve;
    });
    const inFlight = harness.current().runKeyLocked('row-2', async () => {
      await gate;
      return 'stale-key';
    });

    expect(harness.current().isKeyLocked('row-2')).toBe(true);
    harness.rerender();
    expect(harness.current().lockedKeys).toEqual(['row-2']);

    harness.cleanup();
    harness.remount();
    harness.rerender();

    expect(harness.current().lockedKeys).toEqual([]);
    expect(harness.current().isKeyLocked('row-2')).toBe(false);

    // Row 2 is immediately actionable again on re-show, isolated from old disposed controller
    const retry = await harness.current().runKeyLocked('row-2', async () => 'fresh-key');
    expect(retry).toEqual({ skipped: false, value: 'fresh-key' });

    resolveKey();
    expect(await inFlight).toEqual({ skipped: false, value: 'stale-key' });
    expect(harness.current().lockedKeys).toEqual([]);
  });
});
```

## `src/utils/__tests__/comboboxNav.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { clampComboboxIndex, stepEnabledComboboxIndex } from '../comboboxNav';

describe('comboboxNav — WAI-ARIA keyboard stepping', () => {
  it('clamps indices cleanly when option count shrinks or becomes empty', () => {
    expect(clampComboboxIndex(3, 0)).toBe(-1);
    expect(clampComboboxIndex(-1, 5)).toBe(-1);
    expect(clampComboboxIndex(4, 2)).toBe(1);
    expect(clampComboboxIndex(1, 5)).toBe(1);
  });

  it('steps ArrowDown, ArrowUp, Home, and End with wrapping', () => {
    expect(stepEnabledComboboxIndex(-1, 4, 'ArrowDown')).toBe(0);
    expect(stepEnabledComboboxIndex(0, 4, 'ArrowDown')).toBe(1);
    expect(stepEnabledComboboxIndex(3, 4, 'ArrowDown')).toBe(0);

    expect(stepEnabledComboboxIndex(-1, 4, 'ArrowUp')).toBe(3);
    expect(stepEnabledComboboxIndex(0, 4, 'ArrowUp')).toBe(3);
    expect(stepEnabledComboboxIndex(2, 4, 'ArrowUp')).toBe(1);

    expect(stepEnabledComboboxIndex(2, 4, 'Home')).toBe(0);
    expect(stepEnabledComboboxIndex(0, 4, 'End')).toBe(3);
  });

  it('skips disabled options and returns -1 if every option is disabled', () => {
    const isDisabled = (idx: number) => idx === 1 || idx === 2;
    expect(stepEnabledComboboxIndex(0, 4, 'ArrowDown', isDisabled)).toBe(3);
    expect(stepEnabledComboboxIndex(3, 4, 'ArrowUp', isDisabled)).toBe(0);

    const isFirstLastDisabled = (idx: number) => idx === 0 || idx === 3;
    expect(stepEnabledComboboxIndex(-1, 4, 'Home', isFirstLastDisabled)).toBe(1);
    expect(stepEnabledComboboxIndex(-1, 4, 'End', isFirstLastDisabled)).toBe(2);

    expect(stepEnabledComboboxIndex(0, 3, 'ArrowDown', () => true)).toBe(-1);
  });
});
```

## `src/utils/__tests__/lazyGoogleCalendarClient.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseSpies = vi.hoisted(() => {
  const mockSignOut = vi.fn(async () => {});
  const mockUser = { uid: 'user-1', email: 'breeder@example.test' };
  const mockAuth = {
    currentUser: mockUser,
    signOut: mockSignOut,
  };
  let authStateUnsubscribe = vi.fn();
  const mockOnAuthStateChanged = vi.fn(() => authStateUnsubscribe);
  const mockSignInWithPopup = vi.fn(async () => ({ user: mockUser }));
  const mockCredentialFromResult = vi.fn(() => ({ accessToken: 'ya29.mock-token' }));
  const mockAddScope = vi.fn();

  class MockGoogleAuthProvider {
    addScope = mockAddScope;
    static credentialFromResult = mockCredentialFromResult;
  }

  return {
    mockSignOut,
    mockUser,
    mockAuth,
    getUnsubscribe: () => authStateUnsubscribe,
    resetUnsubscribe: () => {
      authStateUnsubscribe = vi.fn();
    },
    mockOnAuthStateChanged,
    mockSignInWithPopup,
    mockCredentialFromResult,
    mockAddScope,
    MockGoogleAuthProvider,
    getApps: vi.fn(() => []),
    getApp: vi.fn(() => ({ name: '[DEFAULT]' })),
    initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
    getAuth: vi.fn(() => mockAuth),
  };
});

vi.mock('firebase/app', () => ({
  getApps: firebaseSpies.getApps,
  getApp: firebaseSpies.getApp,
  initializeApp: firebaseSpies.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: firebaseSpies.getAuth,
  onAuthStateChanged: firebaseSpies.mockOnAuthStateChanged,
  GoogleAuthProvider: firebaseSpies.MockGoogleAuthProvider,
  signInWithPopup: firebaseSpies.mockSignInWithPopup,
}));

describe('googleCalendarClient lazy Firebase loading', () => {
  beforeEach(() => {
    vi.resetModules();
    firebaseSpies.resetUnsubscribe();
    firebaseSpies.getApps.mockClear();
    firebaseSpies.getApp.mockClear();
    firebaseSpies.initializeApp.mockClear();
    firebaseSpies.getAuth.mockClear();
    firebaseSpies.mockOnAuthStateChanged.mockClear();
    firebaseSpies.mockSignInWithPopup.mockClear();
    firebaseSpies.mockCredentialFromResult.mockClear();
    firebaseSpies.mockAddScope.mockClear();
    firebaseSpies.mockSignOut.mockClear();
  });

  it('does not initialize Firebase on import, getCurrentGoogleCalendarUser, or unauthenticated signOut', async () => {
    const client = await import('../googleCalendarClient');

    expect(client.getCurrentGoogleCalendarUser()).toBeNull();
    expect(client.getGoogleCalendarAccessToken()).toBeNull();
    await client.signOutGoogleCalendar();

    expect(firebaseSpies.initializeApp).not.toHaveBeenCalled();
    expect(firebaseSpies.getAuth).not.toHaveBeenCalled();
    expect(firebaseSpies.mockSignOut).not.toHaveBeenCalled();
  });

  it('cancels lazy listener attachment if unsubscribed before dynamic Firebase import settles', async () => {
    const client = await import('../googleCalendarClient');
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const cleanup = client.initGoogleCalendarAuth(onSuccess, onFailure);
    cleanup();

    // Wait for dynamic imports to settle so cancellation is verified post-resolution
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(firebaseSpies.mockOnAuthStateChanged).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('dynamically loads Firebase on signInGoogleCalendar and clears cached token on signOut', async () => {
    const client = await import('../googleCalendarClient');

    const { user, accessToken } = await client.signInGoogleCalendar();
    expect(user).toEqual(firebaseSpies.mockUser);
    expect(accessToken).toBe('ya29.mock-token');
    expect(firebaseSpies.initializeApp).toHaveBeenCalledTimes(1);
    expect(firebaseSpies.getAuth).toHaveBeenCalledTimes(1);
    expect(firebaseSpies.mockAddScope).toHaveBeenCalledTimes(2);
    expect(client.getGoogleCalendarAccessToken()).toBe('ya29.mock-token');
    expect(client.getCurrentGoogleCalendarUser()).toEqual(firebaseSpies.mockUser);

    await client.signOutGoogleCalendar();
    expect(client.getGoogleCalendarAccessToken()).toBeNull();
    expect(firebaseSpies.mockSignOut).toHaveBeenCalledTimes(1);
  });
});
```

## `src/utils/__tests__/lazyRoute.test.ts`

```typescript
import { describe, expect, it, vi } from 'vitest';
import { loadWithSingleRetry } from '../lazyRoute';

describe('lazyRoute chunk loader', () => {
  it('resolves named screen exports into default component wrappers', async () => {
    const DummyScreen = () => null;
    const result = await loadWithSingleRetry(
      async () => ({ DummyScreen }),
      'DummyScreen',
      'Dummy Screen',
      0
    );
    expect(result.default).toBe(DummyScreen);
  });

  it('automatically retries once if an initial chunk load fails transiently', async () => {
    const RecoveredScreen = () => null;
    const loader = vi
      .fn<() => Promise<Record<string, unknown>>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ RecoveredScreen });

    const result = await loadWithSingleRetry(loader, 'RecoveredScreen', 'Recovered Screen', 0);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.default).toBe(RecoveredScreen);
  });

  it('throws a clear error if the retry also fails or export is missing', async () => {
    const failingLoader = vi
      .fn<() => Promise<Record<string, unknown>>>()
      .mockRejectedValue(new Error('ChunkLoadError: Loading chunk 42 failed'));

    await expect(
      loadWithSingleRetry(failingLoader, 'Missing', 'Reports', 0)
    ).rejects.toThrow(/ChunkLoadError/);
    expect(failingLoader).toHaveBeenCalledTimes(2);

    await expect(
      loadWithSingleRetry(async () => ({}), 'ReportsScreen', 'Reports', 0)
    ).rejects.toThrow(/did not export "ReportsScreen"/);
  });
});
```

## `src/utils/__tests__/parentPickerAndMemory.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Animal } from '../../core/models';
import { computeVirtualWindow } from '../useVirtualWindow';

const reactHarness = vi.hoisted(() => {
  interface HookState {
    cursor: number;
    idCounter: number;
    states: unknown[];
    refs: Array<{ current: unknown }>;
    memos: Array<{ value: unknown; deps: unknown[] | undefined }>;
    callbacks: Array<{ fn: unknown; deps: unknown[] | undefined }>;
    effects: Array<{
      create: () => void | (() => void);
      deps: unknown[] | undefined;
      cleanup?: () => void;
    }>;
  }

  const state: HookState = {
    cursor: 0,
    idCounter: 0,
    states: [],
    refs: [],
    memos: [],
    callbacks: [],
    effects: [],
  };

  function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    for (let i = 0; i < next.length; i++) {
      if (!Object.is(prev[i], next[i])) return true;
    }
    return false;
  }

  return {
    state,
    depsChanged,
    reset() {
      state.cursor = 0;
      state.idCounter = 0;
      state.states = [];
      state.refs = [];
      state.memos = [];
      state.callbacks = [];
      state.effects = [];
    },
    beginRender() {
      state.cursor = 0;
      state.idCounter = 0;
    },
    runEffects() {
      for (const eff of state.effects) {
        eff.cleanup?.();
        const cleanup = eff.create();
        eff.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
    },
  };
});

vi.mock('react', () => ({
  default: { Fragment: Symbol.for('react.fragment') },
  Fragment: Symbol.for('react.fragment'),
  useId() {
    return `picker-id-${++reactHarness.state.idCounter}`;
  },
  useState<T>(initial: T | (() => T)) {
    const idx = reactHarness.state.cursor++;
    if (!(idx in reactHarness.state.states)) {
      reactHarness.state.states[idx] =
        typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setState = (next: T | ((prev: T) => T)) => {
      const prev = reactHarness.state.states[idx] as T;
      reactHarness.state.states[idx] =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    };
    return [reactHarness.state.states[idx] as T, setState] as const;
  },
  useRef<T>(initial: T) {
    const idx = reactHarness.state.cursor++;
    if (!(idx in reactHarness.state.refs)) {
      reactHarness.state.refs[idx] = { current: initial };
    }
    return reactHarness.state.refs[idx] as { current: T };
  },
  useMemo<T>(factory: () => T, deps: unknown[] | undefined) {
    const idx = reactHarness.state.cursor++;
    const existing = reactHarness.state.memos[idx];
    if (!existing || reactHarness.depsChanged(existing.deps, deps)) {
      reactHarness.state.memos[idx] = { value: factory(), deps };
    }
    return reactHarness.state.memos[idx].value as T;
  },
  useCallback<T extends Function>(fn: T, deps: unknown[] | undefined) {
    const idx = reactHarness.state.cursor++;
    const existing = reactHarness.state.callbacks[idx];
    if (!existing || reactHarness.depsChanged(existing.deps, deps)) {
      reactHarness.state.callbacks[idx] = { fn, deps };
    }
    return reactHarness.state.callbacks[idx].fn as T;
  },
  useEffect(create: () => void | (() => void), deps?: unknown[]) {
    const idx = reactHarness.state.cursor++;
    const existing = reactHarness.state.effects[idx];
    if (!existing || reactHarness.depsChanged(existing.deps, deps)) {
      reactHarness.state.effects[idx] = {
        create,
        deps,
        cleanup: existing?.cleanup,
      };
    }
  },
}));

vi.mock('react/jsx-runtime', () => {
  const createNode = (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: props ?? {},
    key,
  });
  return {
    Fragment: Symbol.for('react.fragment'),
    jsx: createNode,
    jsxs: createNode,
  };
});

vi.mock('lucide-react', () => ({
  Check: () => null,
  Search: () => null,
  X: () => null,
}));

import { SearchableParentPicker } from '../../components/SearchableParentPicker';

interface VNodeLike {
  type: unknown;
  props: Record<string, unknown>;
}

function collectNodes(
  root: unknown,
  predicate: (node: VNodeLike) => boolean,
  out: VNodeLike[] = []
): VNodeLike[] {
  if (!root || typeof root !== 'object') return out;
  if (Array.isArray(root)) {
    for (const item of root) collectNodes(item, predicate, out);
    return out;
  }
  const node = root as Partial<VNodeLike>;
  if (node.props && typeof node.props === 'object') {
    if ('type' in node && predicate(node as VNodeLike)) {
      out.push(node as VNodeLike);
    }
    if ('children' in node.props) {
      collectNodes(node.props.children, predicate, out);
    }
  }
  return out;
}

function makeCandidates(count: number): Animal[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `cand-${idx}`,
    species: 'Rabbit',
    name: idx === 2499 ? 'Starlight Target' : `Buck ${idx}`,
    tattoo: `T${String(idx).padStart(4, '0')}`,
    breed: idx % 2 === 0 ? 'Holland Lop' : 'Rex',
    variety: idx === 2499 ? 'Blue Tort' : 'Black',
    sex: 'Male',
    birthDateIso: '2024-01-01',
    sireId: '',
    damId: '',
    weightGrams: 1700,
    status: 'Active',
    archived: false,
    needsAttention: false,
    legsCount: 0,
    registrationNumber: idx === 2499 ? 'REG-9988' : '',
    grandChampionNumber: '',
    cageLocation: `C-${idx}`,
    breederName: 'Tester',
    ownerName: 'Tester',
    genotype: [],
    genotypeRaw: '',
    notes: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }));
}

describe('SearchableParentPicker virtualization & constrained memory bounds', () => {
  beforeEach(() => {
    reactHarness.reset();
  });

  it('caps rendered option nodes for 2,500+ candidates in standard and constrained modes and finds deep query matches', () => {
    const candidates = makeCandidates(2500);
    const onChange = vi.fn();

    const renderPicker = (isConstrained: boolean) => {
      reactHarness.beginRender();
      return SearchableParentPicker({
        label: 'Sire',
        value: '',
        candidates,
        unknownLabel: 'Unknown Sire',
        isConstrained,
        onChange,
      });
    };

    // Closed initially -> 0 option nodes rendered
    let tree = renderPicker(false);
    expect(collectNodes(tree, (n) => n.props.role === 'option')).toHaveLength(0);

    // Open combobox via focus
    const input = collectNodes(tree, (n) => n.props.role === 'combobox')[0];
    expect(input).toBeDefined();
    (input.props.onFocus as () => void)();

    // Standard mode: bounded to initialFallbackCount = 16 out of 2,501 options
    tree = renderPicker(false);
    const standardOptions = collectNodes(tree, (n) => n.props.role === 'option');
    expect(standardOptions).toHaveLength(16);

    // Constrained mode: bounded to initialFallbackCount = 10 out of 2,501 options
    tree = renderPicker(true);
    const constrainedOptions = collectNodes(tree, (n) => n.props.role === 'option');
    expect(constrainedOptions).toHaveLength(10);

    // Querying by registration number or tattoo finds deep match #2499
    const openInput = collectNodes(tree, (n) => n.props.role === 'combobox')[0];
    (openInput.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'REG-9988' },
    });
    tree = renderPicker(true);
    const filteredOptions = collectNodes(tree, (n) => n.props.role === 'option');
    // Unknown option + 1 matched animal
    expect(filteredOptions).toHaveLength(2);
    const matchText = JSON.stringify(filteredOptions[1]);
    expect(matchText).toContain('Starlight Target');
  });

  it('bounds HerdScreen virtual windows tightly on constrained vs standard devices', () => {
    const constrained = computeVirtualWindow({
      itemCount: 2200,
      scrollTop: 0,
      viewportHeight: 0,
      estimateSize: 112,
      overscan: 3,
      initialFallbackCount: 20,
    });
    const standard = computeVirtualWindow({
      itemCount: 2200,
      scrollTop: 0,
      viewportHeight: 0,
      estimateSize: 112,
      overscan: 8,
      initialFallbackCount: 50,
    });

    expect(constrained.endIndex - constrained.startIndex + 1).toBe(20);
    expect(standard.endIndex - standard.startIndex + 1).toBe(50);

    const scrolledConstrained = computeVirtualWindow({
      itemCount: 2200,
      scrollTop: 112 * 500,
      viewportHeight: 600,
      estimateSize: 112,
      overscan: 3,
      initialFallbackCount: 20,
    });
    expect(scrolledConstrained.endIndex - scrolledConstrained.startIndex + 1).toBeLessThan(15);
  });
});
```

## `src/utils/__tests__/printPreviewFileActions.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatPrintPreviewFileError,
  isPrintPreviewAbortError,
  runPrintPreviewFileAction,
} from '../../components/PrintPreviewModal';
import {
  getActiveAsyncErrorToasts,
  resetAsyncErrorToastsForTests,
} from '../../storage/crashLogger';

describe('PrintPreviewModal .HTM download & share error surfacing', () => {
  beforeEach(() => {
    resetAsyncErrorToastsForTests();
  });

  it('detects AbortError cancellations cleanly without flagging real failures', () => {
    const abortErr = new Error('User cancelled share');
    abortErr.name = 'AbortError';
    expect(isPrintPreviewAbortError(abortErr)).toBe(true);
    expect(isPrintPreviewAbortError({ name: 'AbortError' })).toBe(true);
    expect(isPrintPreviewAbortError(new Error('Disk full'))).toBe(false);
    expect(isPrintPreviewAbortError(null)).toBe(false);
  });

  it('formats distinct user-facing download and share error notices', () => {
    const dl = formatPrintPreviewFileError(
      'download',
      'clover-pedigree.htm',
      new Error('QuotaExceededError')
    );
    expect(dl.action).toBe('download');
    expect(dl.title).toBe('Could Not Download .HTM File');
    expect(dl.detail).toContain('clover-pedigree.htm');
    expect(dl.detail).toContain('QuotaExceededError');
    expect(dl.detail).toContain('Print / Save PDF');

    const sh = formatPrintPreviewFileError('share', '   ', 'Share target rejected file');
    expect(sh.action).toBe('share');
    expect(sh.title).toBe('Could Not Share .HTM File');
    expect(sh.detail).toContain('document.htm');
    expect(sh.detail).toContain('Share target rejected file');
    expect(sh.detail).toContain('Download .HTM');

    const pdfErr = formatPrintPreviewFileError('pdf', 'clover.pdf', new Error('Canvas failed'));
    expect(pdfErr.action).toBe('pdf');
    expect(pdfErr.title).toBe('Could Not Export .PDF File');
    expect(pdfErr.detail).toContain('clover.pdf');
    expect(pdfErr.detail).toContain('Canvas failed');
  });

  it('surfaces download failure via inline callback and global toast while cleaning up busy state', async () => {
    const onBeforeStart = vi.fn();
    const onError = vi.fn();
    const onFinish = vi.fn();

    const ok = await runPrintPreviewFileAction({
      action: 'download',
      filename: 'buck-pedigree.htm',
      task: async () => {
        throw new Error('Native export failed');
      },
      isMounted: () => true,
      onBeforeStart,
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onBeforeStart).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    const [errPayload, toastId] = onError.mock.calls[0];
    expect(errPayload.action).toBe('download');
    expect(errPayload.title).toBe('Could Not Download .HTM File');
    expect(errPayload.detail).toContain('Native export failed');
    expect(typeof toastId).toBe('string');

    const toasts = getActiveAsyncErrorToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(toastId);
    expect(toasts[0].severity).toBe('error');
    expect(toasts[0].sticky).toBe(true);
  });

  it('surfaces Web Share failure with memory-like classification when QuotaExceeded occurs', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();
    const quotaErr = new Error('NS_ERROR_DOM_QUOTA_REACHED');
    quotaErr.name = 'QuotaExceededError';

    const ok = await runPrintPreviewFileAction({
      action: 'share',
      filename: 'barn-binder.htm',
      task: async () => {
        throw quotaErr;
      },
      isMounted: () => true,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    const toasts = getActiveAsyncErrorToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Could Not Share .HTM File');
    expect(toasts[0].category).toBe('memory');
  });

  it('suppresses AbortError user cancellations without emitting errors or toasts', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();
    const abortErr = new Error('Share sheet dismissed');
    abortErr.name = 'AbortError';

    const ok = await runPrintPreviewFileAction({
      action: 'share',
      filename: 'clover-pedigree.htm',
      task: async () => {
        throw abortErr;
      },
      isMounted: () => true,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);
  });

  it('skips modal state callback when unmounted while still emitting global toast', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();

    const ok = await runPrintPreviewFileAction({
      action: 'download',
      filename: 'late-failure.htm',
      task: async () => {
        throw new Error('Write failed after modal closed');
      },
      isMounted: () => false,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(1);
  });

  it('returns true and leaves zero error notices on success', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();

    const ok = await runPrintPreviewFileAction({
      action: 'download',
      filename: 'clover-pedigree.htm',
      task: async () => undefined,
      isMounted: () => true,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);
  });
});
```

## `src/utils/__tests__/virtualWindow.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { computeVirtualWindow } from '../useVirtualWindow';

describe('ES2018 Window Virtualizer (computeVirtualWindow)', () => {
  it('handles empty lists cleanly', () => {
    expect(
      computeVirtualWindow({
        itemCount: 0,
        scrollTop: 120,
        viewportHeight: 500,
        estimateSize: 60,
      })
    ).toEqual({
      startIndex: 0,
      endIndex: -1,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    });
  });

  it('renders a bounded fallback slice before viewport height is measured', () => {
    const res = computeVirtualWindow({
      itemCount: 1200,
      scrollTop: 0,
      viewportHeight: 0,
      estimateSize: 50,
      initialFallbackCount: 15,
    });
    expect(res.startIndex).toBe(0);
    expect(res.endIndex).toBe(14);
    expect(res.paddingTop).toBe(0);
    expect(res.totalHeight).toBe(1200 * 50);
    expect(res.paddingBottom).toBe((1200 - 15) * 50);
  });

  it('windows mid-list scrolls with overscan and exact padding totals', () => {
    const res = computeVirtualWindow({
      itemCount: 1000,
      scrollTop: 5000, // item 100 at 50px each
      viewportHeight: 400, // 8 visible items: 100..107
      estimateSize: 50,
      overscan: 4,
    });
    expect(res.startIndex).toBe(96);
    expect(res.endIndex).toBe(111);
    expect(res.paddingTop).toBe(96 * 50);
    expect(res.paddingBottom).toBe((1000 - 112) * 50);
    expect(
      res.paddingTop + (res.endIndex - res.startIndex + 1) * 50 + res.paddingBottom
    ).toBe(res.totalHeight);
  });

  it('respects measured variable row heights and clamps overscrolled offsets', () => {
    const measured = new Map<number, number>([
      [0, 120],
      [1, 100],
      [2, 80],
    ]);
    const res = computeVirtualWindow({
      itemCount: 50,
      scrollTop: 999999,
      viewportHeight: 300,
      estimateSize: 60,
      overscan: 2,
      measuredHeights: measured,
    });
    expect(res.endIndex).toBe(49);
    expect(res.paddingBottom).toBe(0);
    // First 3 rows are 120+100+80=300, remaining 47 rows are 60px -> total 3120
    expect(res.totalHeight).toBe(300 + 47 * 60);
  });
});
```

<!-- END OF PART 16 OF 16 (24 files) -->

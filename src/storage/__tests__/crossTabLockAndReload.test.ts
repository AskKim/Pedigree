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
  appendSyncOperationsToIdb,
  DB_WRITE_EPOCH_LS_KEY,
  loadAllSyncOperationsFromIdb,
  publishCrossTabDbCommit,
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
});

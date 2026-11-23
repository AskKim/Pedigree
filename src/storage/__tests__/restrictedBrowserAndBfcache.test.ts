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

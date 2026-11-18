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

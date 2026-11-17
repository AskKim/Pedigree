/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildArchivedAnimalsBundle, migrateAndValidateBackupEnvelope } from '../../core/backupVault';
import { buildFullPredefinedSampleSnapshot } from '../../core/sampleData';
import {
  clearPriorUseSentinel,
  deleteOpfsHerdArchive,
  deleteOpfsVaultBackup,
  detectReturningUserWipedStorage,
  dumpRawRecordsToOpfsRecoveryBackup,
  isOpfsSupported,
  listOpfsHerdArchives,
  listOpfsVaultBackups,
  loadOpfsHerdArchive,
  loadOpfsVaultBackup,
  markPriorUseSentinelFromSnapshot,
  MAX_MONTHLY_OPFS_BACKUPS,
  MAX_PRE_UPGRADE_OPFS_BACKUPS,
  MONTHLY_BACKUP_INTERVAL_MS,
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsWritableStream,
  runOpfsExportCanary,
  saveOpfsHerdArchive,
  saveOpfsVaultBackup,
  setOpfsRootResolverForTest,
  shouldCreateMonthlyOpfsBackup,
  sweepOrphanedOpfsTmpOnBoot,
  writeTempOpfsFile,
} from '../opfsStorage';

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
      let staged: Uint8Array | null = null;
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
          staged = await toUint8(data);
        },
        async close() {
          hook?.spyClose();
          if (staged) {
            entry.bytes = staged;
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
  clearPriorUseSentinel();
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

    // Sanity check legacy migration parser accepts persisted vault file cleanly
    const rawVaultText = await (
      await mock.rootHandle
        .getDirectoryHandle('backups')
        .then((d) => d.getFileHandle(vaultCheck.latestOpfsBackup!.fileName))
        .then((f) => f.getFile())
    ).text();
    const parsed = migrateAndValidateBackupEnvelope(rawVaultText);
    expect(parsed.snapshot.animals.some((a) => a.id === 'user-custom-animal-1')).toBe(true);
  });
});

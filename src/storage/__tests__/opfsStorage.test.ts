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
  OpfsWritableStream,
  readOpfsHerdArchiveBlob,
  readOpfsPruneSyncWarning,
  readOpfsVaultBackupBlob,
  runOpfsExportCanary,
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


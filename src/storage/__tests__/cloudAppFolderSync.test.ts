/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CloudDeltaChunkBundle,
  CloudRemoteFileEntry,
} from '../../core/cloudAppFolderSync';
import { createOutboxOperation, SyncOperation } from '../../core/syncOutbox';
import {
  clearAllCloudSyncState,
  clearCloudSyncMemoryToken,
  CloudSyncTransport,
  CloudSyncTransportError,
  getCloudSyncClientState,
  getCloudSyncMemoryToken,
  hasCloudSyncMemoryToken,
  resetPersistedCloudCircuitBreaker,
  runCloudAppFolderSync,
  setCloudSyncMemoryToken,
  updatePersistedCloudSyncSettings,
} from '../cloudAppFolderSync';
import { makeEmptySnapshot } from '../../core/__tests__/testFixtures';

function createMemoryStorage(): Storage {
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

describe('storage/cloudAppFolderSync — memory-only tokens, chunk checkpoints & 403/507 breaker', () => {
  let memoryLocalStorage: Storage;
  let memorySessionStorage: Storage;

  beforeEach(() => {
    memoryLocalStorage = createMemoryStorage();
    memorySessionStorage = createMemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryLocalStorage,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: memorySessionStorage,
      configurable: true,
    });
    clearAllCloudSyncState();
  });

  afterEach(() => {
    clearAllCloudSyncState();
  });

  it('keeps OAuth access tokens strictly in JS memory and never persists them to storage', () => {
    expect(hasCloudSyncMemoryToken('google_drive')).toBe(false);
    const ok = setCloudSyncMemoryToken('google_drive', 'secret-ya29-token');
    expect(ok).toBe(true);
    expect(getCloudSyncMemoryToken('google_drive')).toBe('secret-ya29-token');

    updatePersistedCloudSyncSettings({ enabled: true, provider: 'google_drive' });
    const serializedLocal = memoryLocalStorage.getItem('pedigree.cloudSyncState.v1') || '';
    expect(serializedLocal).not.toContain('secret-ya29-token');
    expect(memorySessionStorage.length).toBe(0);

    clearCloudSyncMemoryToken('google_drive');
    expect(getCloudSyncMemoryToken('google_drive')).toBeNull();
  });

  it('checkpoints tight-storage chunks and pulls peer remote operations while skipping already-known op_ids', async () => {
    updatePersistedCloudSyncSettings({
      enabled: true,
      provider: 'onedrive',
      autoBackgroundSync: true,
      rollingBackupRetentionCount: 1,
      storageTightThresholdPercent: 75,
    });
    setCloudSyncMemoryToken('onedrive', 'secret-onedrive-token');

    const localOps = Array.from({ length: 30 }, (_, i) =>
      createOutboxOperation({
        entityType: 'animal',
        entityUuid: `a-${i + 1}`,
        deviceId: 'dev-local',
        logicalCounter: i + 1,
        fieldName: 'name',
        newValue: `Rabbit ${i + 1}`,
      })
    );

    const peerOp = createOutboxOperation({
      entityType: 'animal',
      entityUuid: 'peer-animal-1',
      deviceId: 'dev-peer',
      logicalCounter: 1,
      fieldName: 'name',
      newValue: 'Peer Doe',
    });

    const peerBundle: CloudDeltaChunkBundle = {
      format: 'community-pedigree-cloud-delta-chunk-v1',
      deviceId: 'dev-peer',
      chunkIndex: 1,
      totalChunks: 1,
      createdAtIso: '2026-11-23T11:00:00.000Z',
      strategy: 'normal',
      operations: [peerOp, localOps[0]], // includes duplicate local op_id that should be skipped
    };

    const uploadedFiles: Array<{ name: string; text: string }> = [];
    const deletedIds: string[] = [];

    const mockTransport: CloudSyncTransport = {
      provider: 'onedrive',
      async listFiles(): Promise<CloudRemoteFileEntry[]> {
        return [
          { id: 'peer-chunk-1', name: 'cp-delta-dev-peer-20261123T110000Z-c001.json' },
          { id: 'old-rolling-1', name: 'cp-rolling-20261120T100000Z-dev-local.json' },
          { id: 'old-rolling-2', name: 'cp-rolling-20261121T100000Z-dev-local.json' },
        ];
      },
      async downloadFileText(file): Promise<string> {
        if (file.id === 'peer-chunk-1') {
          return JSON.stringify(peerBundle);
        }
        return '{malformed';
      },
      async uploadJsonFile(fileName, jsonText): Promise<CloudRemoteFileEntry> {
        uploadedFiles.push({ name: fileName, text: jsonText });
        return { id: `up-${uploadedFiles.length}`, name: fileName };
      },
      async deleteFile(file): Promise<void> {
        deletedIds.push(file.id);
      },
    };

    const mergedOps: SyncOperation[] = [];
    const result = await runCloudAppFolderSync({
      trigger: 'manual',
      deviceId: 'dev-local',
      transport: mockTransport,
      loadLocalSyncOperations: async () => [...localOps, ...mergedOps],
      getSnapshotForRollingBackup: async () => makeEmptySnapshot(),
      onMergeRemoteOperations: async (ops) => {
        mergedOps.push(...ops);
      },
      getStorageStatus: async () => ({
        supported: true,
        usageBytes: 850,
        quotaBytes: 1000,
        percentUsed: 85,
        persisted: true,
        checkedAtIso: '2026-11-23T12:00:00.000Z',
        isNativeWrapper: false,
        nativeContainerInfo: null,
      }),
      getDeviceTier: () => 3,
      isOnline: () => true,
      isHidden: () => false,
      nowIso: () => '2026-11-23T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.chunkStrategy).toBe('tight_storage_incremental');
    expect(result.pulledOpsCount).toBe(1);
    expect(mergedOps.map((o) => o.op_id)).toEqual([peerOp.op_id]);
    expect(result.uploadedChunksCount).toBe(2); // 30 ops split into 25 + 5
    expect(result.uploadedOpsCount).toBe(30);
    expect(result.uploadedRollingBackupName).toContain('cp-rolling-');
    expect(result.prunedRollingCount).toBe(2); // kept newest 1 rolling backup, deleted 2 old ones
    expect(deletedIds).toEqual(['old-rolling-2', 'old-rolling-1']);
    expect(result.state.uploadedOpIdsByProvider.onedrive).toHaveLength(31);
  });

  it('trips 507/403 quota circuit breaker immediately, prunes rolling backups, preserves partial chunk progress, and pauses auto sync without throwing', async () => {
    updatePersistedCloudSyncSettings({
      enabled: true,
      provider: 'google_drive',
      autoBackgroundSync: true,
      rollingBackupRetentionCount: 3,
    });
    setCloudSyncMemoryToken('google_drive', 'secret-drive-token');

    const localOps = Array.from({ length: 30 }, (_, i) =>
      createOutboxOperation({
        entityType: 'animal',
        entityUuid: `a-${i + 1}`,
        deviceId: 'dev-1',
        logicalCounter: i + 1,
        fieldName: 'name',
        newValue: `Rabbit ${i + 1}`,
      })
    );

    let uploadCallCount = 0;
    const deletedIds: string[] = [];

    const quotaTransport: CloudSyncTransport = {
      provider: 'google_drive',
      async listFiles(): Promise<CloudRemoteFileEntry[]> {
        return [
          { id: 'r1', name: 'cp-rolling-20261119T100000Z-dev-1.json' },
          { id: 'r2', name: 'cp-rolling-20261120T100000Z-dev-1.json' },
          { id: 'r3', name: 'cp-rolling-20261121T100000Z-dev-1.json' },
        ];
      },
      async downloadFileText(): Promise<string> {
        return '';
      },
      async uploadJsonFile(fileName): Promise<CloudRemoteFileEntry> {
        uploadCallCount += 1;
        if (uploadCallCount === 2) {
          throw new CloudSyncTransportError('google_drive', {
            status: 507,
            kind: 'insufficient_storage_507',
            isQuotaBreakerTrigger: true,
            isAuthExpired: false,
            breakerStatusCode: 507,
            reason: 'HTTP 507 Insufficient Storage',
          });
        }
        return { id: `up-${uploadCallCount}`, name: fileName };
      },
      async deleteFile(file): Promise<void> {
        deletedIds.push(file.id);
      },
    };

    const failResult = await runCloudAppFolderSync({
      trigger: 'auto_background',
      deviceId: 'dev-1',
      transport: quotaTransport,
      loadLocalSyncOperations: async () => localOps,
      getSnapshotForRollingBackup: async () => makeEmptySnapshot(),
      onMergeRemoteOperations: async () => {},
      getStorageStatus: async () => ({
        supported: true,
        usageBytes: 900,
        quotaBytes: 1000,
        percentUsed: 90,
        persisted: true,
        checkedAtIso: '2026-11-23T12:15:00.000Z',
        isNativeWrapper: false,
        nativeContainerInfo: null,
      }),
      getDeviceTier: () => 2,
      isOnline: () => true,
      isHidden: () => false,
      nowIso: () => '2026-11-23T12:15:00.000Z',
    });

    expect(failResult.ok).toBe(false);
    expect(failResult.circuitBreakerTripped).toBe(true);
    expect(failResult.prunedRollingCount).toBe(2); // Kept 1 newest rolling backup, pruned 2 oldest
    expect(deletedIds).toEqual(['r2', 'r1']);

    // Partial chunk #1 progress (25 op_ids) must remain persisted!
    const persistedAfter = getCloudSyncClientState();
    expect(persistedAfter.circuitBreaker.tripped).toBe(true);
    expect(persistedAfter.circuitBreaker.statusCode).toBe(507);
    expect(persistedAfter.circuitBreaker.pausedAutomatedSync).toBe(true);
    expect(persistedAfter.uploadedOpIdsByProvider.google_drive).toHaveLength(25);

    // Subsequent automated sync must be skipped immediately without touching transport
    let transportCalledWhileTripped = false;
    const skippedAuto = await runCloudAppFolderSync({
      trigger: 'auto_background',
      deviceId: 'dev-1',
      transport: {
        ...quotaTransport,
        async listFiles() {
          transportCalledWhileTripped = true;
          return [];
        },
      },
      loadLocalSyncOperations: async () => localOps,
      getSnapshotForRollingBackup: async () => makeEmptySnapshot(),
      onMergeRemoteOperations: async () => {},
      isOnline: () => true,
      isHidden: () => false,
    });
    expect(skippedAuto.skipped).toBe(true);
    expect(skippedAuto.circuitBreakerTripped).toBe(true);
    expect(transportCalledWhileTripped).toBe(false);

    // Resetting breaker clears pause and allows remaining 5 ops to sync
    const resetState = resetPersistedCloudCircuitBreaker();
    expect(resetState.circuitBreaker.tripped).toBe(false);

    const retryUploads: string[] = [];
    const retryResult = await runCloudAppFolderSync({
      trigger: 'manual',
      deviceId: 'dev-1',
      transport: {
        provider: 'google_drive',
        async listFiles() {
          return [];
        },
        async downloadFileText() {
          return '';
        },
        async uploadJsonFile(fileName) {
          retryUploads.push(fileName);
          return { id: `retry-${retryUploads.length}`, name: fileName };
        },
        async deleteFile() {},
      },
      loadLocalSyncOperations: async () => localOps,
      getSnapshotForRollingBackup: async () => null,
      onMergeRemoteOperations: async () => {},
      isOnline: () => true,
      isHidden: () => false,
      nowIso: () => '2026-11-23T12:20:00.000Z',
    });

    expect(retryResult.ok).toBe(true);
    expect(retryResult.uploadedOpsCount).toBe(5);
    expect(getCloudSyncClientState().uploadedOpIdsByProvider.google_drive).toHaveLength(30);
  });

  it('clears in-memory token automatically on HTTP 401 expiry', async () => {
    updatePersistedCloudSyncSettings({
      enabled: true,
      provider: 'google_drive',
    });
    setCloudSyncMemoryToken('google_drive', 'expired-token-xyz');

    const res = await runCloudAppFolderSync({
      trigger: 'manual',
      deviceId: 'dev-1',
      transport: {
        provider: 'google_drive',
        async listFiles() {
          throw new CloudSyncTransportError('google_drive', {
            status: 401,
            kind: 'auth_expired_401',
            isQuotaBreakerTrigger: false,
            isAuthExpired: true,
            breakerStatusCode: null,
            reason: 'Expired token',
          });
        },
        async downloadFileText() {
          return '';
        },
        async uploadJsonFile() {
          return { id: '1', name: 'x' };
        },
        async deleteFile() {},
      },
      loadLocalSyncOperations: async () => [],
      getSnapshotForRollingBackup: async () => null,
      onMergeRemoteOperations: async () => {},
      isOnline: () => true,
      isHidden: () => false,
    });

    expect(res.ok).toBe(false);
    expect(res.circuitBreakerTripped).toBe(false);
    expect(hasCloudSyncMemoryToken('google_drive')).toBe(false);
  });
});
